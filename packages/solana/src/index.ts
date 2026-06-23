import crypto from 'node:crypto';
import { readState, writeState } from '@maple-agent/db';
import { formatUnits, parseUnits } from '@maple-agent/agent-core';
import { SubscriptionsSdkAllowanceProvider } from './subscriptions-sdk-provider';
import type {
  AllowanceSnapshot,
  DemoState,
  FixedDelegation,
  OnchainEvent,
  PaidTool,
  Signature,
  SpendReceipt,
  ToolId,
  WalletAddress
} from '@maple-agent/types';

export { formatUnits, parseUnits } from '@maple-agent/agent-core';

export const MOCK_USDC_MINT = 'MockUSDC1111111111111111111111111111111111';
export const USER_WALLET = 'UserWallet111111111111111111111111111111111';
export const AGENT_WALLET = 'MapleAgentDelegate111111111111111111111111';
export const CLUSTER = process.env.SOLANA_CLUSTER ?? 'localnet';

export type CreateAllowanceParams = {
  amountBaseUnits: bigint;
  expiresAt: Date;
  userWallet?: WalletAddress;
  delegateWallet?: WalletAddress;
};

export type TransferFixedParams = {
  delegationPda: WalletAddress;
  toolId: ToolId;
  toolName: string;
  amountBaseUnits: bigint;
  receiverWallet: WalletAddress;
  taskId?: string;
};

export interface AllowanceProvider {
  seedDemoState(): Promise<DemoState>;
  getSnapshot(): Promise<AllowanceSnapshot>;
  getOrCreateSubscriptionAuthority(userWallet: WalletAddress, mint: WalletAddress): Promise<WalletAddress>;
  createFixedDelegation(params: CreateAllowanceParams): Promise<FixedDelegation>;
  transferFixed(params: TransferFixedParams): Promise<SpendReceipt>;
  revokeDelegation(delegationPda: WalletAddress): Promise<FixedDelegation>;
  trySpendAfterRevoke(toolId?: ToolId): Promise<{ ok: boolean; message: string; receipt?: SpendReceipt }>;
}

export class AllowanceError extends Error {
  constructor(
    message: string,
    public readonly code: 'MISSING' | 'REVOKED' | 'EXPIRED' | 'DEPLETED' | 'INSUFFICIENT_BALANCE' | 'OVERSPEND'
  ) {
    super(message);
    this.name = 'AllowanceError';
  }
}

export class LocalLedgerAllowanceProvider implements AllowanceProvider {
  async seedDemoState(): Promise<DemoState> {
    const state = createInitialState();
    return writeState(state);
  }

  async getSnapshot(): Promise<AllowanceSnapshot> {
    const state = ensureState();
    return {
      tokenMint: state.tokenMint,
      userWallet: state.wallets.user,
      agentWallet: state.wallets.agent,
      allowance: state.currentAllowance,
      tools: state.tools,
      receipts: state.receipts,
      events: state.events,
      indexer: state.indexer
    };
  }

  async getOrCreateSubscriptionAuthority(userWallet: WalletAddress, mint: WalletAddress): Promise<WalletAddress> {
    const state = ensureState();
    const authority = pda('subscription-authority', userWallet, mint);
    if (!state.events.some((event) => event.type === 'subscription_authority_initialized')) {
      state.events.push(event('subscription_authority_initialized', `Subscription Authority initialized for ${short(userWallet)} and mock USDC.`, {
        userWallet,
        tokenMint: mint,
        subscriptionAuthority: authority
      }));
      writeState(state);
    }
    return authority;
  }

  async createFixedDelegation(params: CreateAllowanceParams): Promise<FixedDelegation> {
    let state = ensureState();
    const userWallet = params.userWallet ?? state.wallets.user.address;
    const delegateWallet = params.delegateWallet ?? state.wallets.agent.address;
    const tokenMint = state.tokenMint;
    const subscriptionAuthority = await this.getOrCreateSubscriptionAuthority(userWallet, tokenMint);
    state = ensureState();
    const now = new Date();
    const delegationPda = pda('fixed-delegation', userWallet, delegateWallet, state.tokenMint, String(now.getTime()));
    const txSignature = signature('create-fixed');

    const delegation: FixedDelegation = {
      id: `allowance_${delegationPda.slice(-10)}`,
      subscriptionAuthority,
      delegationPda,
      userWallet,
      delegateWallet,
      tokenMint: state.tokenMint,
      allowanceBaseUnits: params.amountBaseUnits.toString(),
      spentBaseUnits: '0',
      remainingBaseUnits: params.amountBaseUnits.toString(),
      expiresAt: params.expiresAt.toISOString(),
      createdAt: now.toISOString(),
      status: 'active',
      lastSignature: txSignature
    };

    state.currentAllowance = delegation;
    state.events.push(event('fixed_delegation_created', `Fixed delegation created for ${formatUnits(params.amountBaseUnits)} mock USDC.`, {
      signature: txSignature,
      delegationPda,
      delegateWallet,
      userWallet,
      expiresAt: delegation.expiresAt
    }, txSignature, delegationPda));
    return writeState(state).currentAllowance!;
  }

  async transferFixed(params: TransferFixedParams): Promise<SpendReceipt> {
    const state = ensureState();
    const allowance = normalizeAllowanceStatus(state.currentAllowance);
    state.currentAllowance = allowance;

    if (!allowance) {
      const blocked = event('transfer_blocked', 'Spend blocked because no allowance exists.', { reason: 'missing' });
      state.events.push(blocked);
      writeState(state);
      throw new AllowanceError('No active allowance exists.', 'MISSING');
    }

    assertCanSpend(allowance, params.amountBaseUnits, state.wallets.user.balanceBaseUnits);

    const merchant = state.wallets.merchants[params.toolId];
    const signatureValue = signature('transfer-fixed');
    const now = new Date().toISOString();
    const nextSpent = BigInt(allowance.spentBaseUnits) + params.amountBaseUnits;
    const nextRemaining = BigInt(allowance.allowanceBaseUnits) - nextSpent;

    allowance.spentBaseUnits = nextSpent.toString();
    allowance.remainingBaseUnits = nextRemaining.toString();
    allowance.status = nextRemaining === 0n ? 'depleted' : 'active';
    allowance.lastSignature = signatureValue;

    state.wallets.user.balanceBaseUnits = (BigInt(state.wallets.user.balanceBaseUnits) - params.amountBaseUnits).toString();
    merchant.balanceBaseUnits = (BigInt(merchant.balanceBaseUnits) + params.amountBaseUnits).toString();

    const receipt: SpendReceipt = {
      id: `receipt_${signatureValue.slice(-10)}`,
      signature: signatureValue,
      taskId: params.taskId,
      toolId: params.toolId,
      toolName: params.toolName,
      amountBaseUnits: params.amountBaseUnits.toString(),
      payerWallet: allowance.userWallet,
      delegateWallet: allowance.delegateWallet,
      merchantWallet: params.receiverWallet,
      delegationPda: allowance.delegationPda,
      createdAt: now,
      status: 'confirmed',
      explorerUrl: explorerUrl(signatureValue)
    };

    state.receipts.unshift(receipt);
    state.events.push(event('fixed_transfer_submitted', `Transfer submitted for ${params.toolName}.`, {
      signature: signatureValue,
      amountBaseUnits: params.amountBaseUnits.toString(),
      toolId: params.toolId
    }, signatureValue, allowance.delegationPda));
    state.events.push(event('fixed_transfer_confirmed', `${params.toolName} received ${formatUnits(params.amountBaseUnits)} mock USDC.`, {
      signature: signatureValue,
      receiptId: receipt.id,
      remainingBaseUnits: allowance.remainingBaseUnits
    }, signatureValue, allowance.delegationPda));

    writeState(state);
    return receipt;
  }

  async revokeDelegation(delegationPda: WalletAddress): Promise<FixedDelegation> {
    const state = ensureState();
    const allowance = state.currentAllowance;
    if (!allowance || allowance.delegationPda !== delegationPda) {
      throw new AllowanceError('Cannot revoke a missing allowance.', 'MISSING');
    }

    allowance.status = 'revoked';
    allowance.revokedAt = new Date().toISOString();
    allowance.lastSignature = signature('revoke');
    state.events.push(event('delegation_revoked', 'User revoked MapleAgent budget.', {
      signature: allowance.lastSignature,
      delegationPda
    }, allowance.lastSignature, delegationPda));
    return writeState(state).currentAllowance!;
  }

  async trySpendAfterRevoke(toolId: ToolId = 'maple-weather'): Promise<{ ok: boolean; message: string; receipt?: SpendReceipt }> {
    const state = ensureState();
    const tool = state.tools.find((candidate) => candidate.id === toolId);
    if (!tool || !state.currentAllowance) {
      return { ok: false, message: 'No tool or allowance found.' };
    }

    try {
      const receipt = await this.transferFixed({
        delegationPda: state.currentAllowance.delegationPda,
        toolId,
        toolName: tool.name,
        amountBaseUnits: BigInt(tool.priceBaseUnits),
        receiverWallet: tool.merchantWallet
      });
      return { ok: true, message: 'Spend unexpectedly succeeded.', receipt };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const next = ensureState();
      next.events.push(event('transfer_blocked', `Post-revoke spend blocked: ${message}`, { toolId, message }, undefined, next.currentAllowance?.delegationPda));
      writeState(next);
      return { ok: false, message };
    }
  }
}

export function getAllowanceProvider(): AllowanceProvider {
  if (process.env.SOLANA_ALLOWANCE_MODE === 'sdk') {
    return new SubscriptionsSdkAllowanceProvider();
  }
  return new LocalLedgerAllowanceProvider();
}

export function createInitialState(): DemoState {
  const tools = createTools();
  const merchants = Object.fromEntries(
    tools.map((tool) => [tool.id, { label: `${tool.name} Merchant`, address: tool.merchantWallet, balanceBaseUnits: '0' }])
  ) as DemoState['wallets']['merchants'];

  return {
    version: 1,
    tokenMint: MOCK_USDC_MINT,
    wallets: {
      user: {
        label: 'You',
        address: USER_WALLET,
        balanceBaseUnits: parseUnits('25').toString()
      },
      agent: {
        label: 'MapleAgent',
        address: AGENT_WALLET,
        balanceBaseUnits: '0'
      },
      merchants
    },
    tools,
    tasks: [],
    receipts: [],
    events: [],
    indexer: {
      running: false,
      receiptsIndexed: 0,
      eventsIndexed: 0
    }
  };
}

export function createTools(): PaidTool[] {
  const merchant = (id: ToolId) => pda('merchant-wallet', id);
  return [
    {
      id: 'maple-weather',
      name: 'MapleWeather',
      category: 'Weather API',
      description: 'Current practical weather context for major Canadian cities.',
      priceBaseUnits: parseUnits('0.25').toString(),
      merchantWallet: merchant('maple-weather'),
      sampleInput: 'Toronto, ON',
      canadaContext: 'Canadian city weather for travel and builder meetups.'
    },
    {
      id: 'toronto-events',
      name: 'TorontoEvents',
      category: 'Events API',
      description: 'Mock local event feed for Toronto tech, crypto, and community gatherings.',
      priceBaseUnits: parseUnits('0.50').toString(),
      merchantWallet: merchant('toronto-events'),
      sampleInput: 'Solana builder Saturday',
      canadaContext: 'Toronto builder and Superteam-style community programming.'
    },
    {
      id: 'via-planner',
      name: 'VIAPlanner',
      category: 'Travel API',
      description: 'Mock route and cost planning for Canadian intercity travel.',
      priceBaseUnits: parseUnits('1.00').toString(),
      merchantWallet: merchant('via-planner'),
      sampleInput: 'Toronto Union Station',
      canadaContext: 'VIA Rail-inspired travel planning for Canada.'
    },
    {
      id: 'vancouver-transit',
      name: 'VancouverTransit',
      category: 'Transit API',
      description: 'Mock public transit hints for Vancouver builder itineraries.',
      priceBaseUnits: parseUnits('0.50').toString(),
      merchantWallet: merchant('vancouver-transit'),
      sampleInput: 'Waterfront to Mount Pleasant',
      canadaContext: 'Local Vancouver movement patterns.'
    },
    {
      id: 'maple-hotels',
      name: 'MapleHotels',
      category: 'Hotel API',
      description: 'Mock budget lodging comparison for Canadian cities.',
      priceBaseUnits: parseUnits('2.00').toString(),
      merchantWallet: merchant('maple-hotels'),
      sampleInput: 'Downtown Toronto budget stay',
      canadaContext: 'Canadian travel and event attendance planning.'
    },
    {
      id: 'canada-tax-snippet',
      name: 'CanadaTaxSnippet',
      category: 'Business API',
      description: 'Mock Canadian business/tax snippets for builders and freelancers.',
      priceBaseUnits: parseUnits('0.75').toString(),
      merchantWallet: merchant('canada-tax-snippet'),
      sampleInput: 'Ontario sole proprietor HST reminder',
      canadaContext: 'Canadian builder operations context.'
    },
    {
      id: 'hockey-pulse',
      name: 'HockeyPulse',
      category: 'Culture API',
      description: 'Lightweight Canadian hockey context to personalize social recommendations.',
      priceBaseUnits: parseUnits('0.25').toString(),
      merchantWallet: merchant('hockey-pulse'),
      sampleInput: 'Toronto game night vibe',
      canadaContext: 'Fun Canadian culture layer.'
    }
  ];
}

export function getToolData(tool: PaidTool): Record<string, unknown> {
  const payloads: Record<ToolId, Record<string, unknown>> = {
    'maple-weather': {
      city: 'Toronto',
      summary: 'Clear enough for walking between coworking spaces; bring a light layer for the evening.',
      confidence: 'demo'
    },
    'toronto-events': {
      event: 'Mock Solana Builder Coffee at Queen West',
      time: '2:00 PM',
      note: 'Small, practical meetup with Canadian builders and founders.'
    },
    'via-planner': {
      route: 'Union Station anchor point',
      suggestion: 'Keep the itinerary near transit to simplify movement for a visiting builder.',
      estimatedLocalTransitCost: '6.70 CAD'
    },
    'vancouver-transit': {
      route: 'Waterfront → Mount Pleasant',
      suggestion: 'Use SkyTrain plus a short bus hop for the fastest cross-city movement.'
    },
    'maple-hotels': {
      option: 'Budget stay near downtown transit corridor',
      nightlyEstimate: '149 CAD mock estimate',
      rationale: 'Keeps the visitor close to the builder event without premium pricing.'
    },
    'canada-tax-snippet': {
      snippet: 'Demo note: builders selling services in Canada often need to monitor GST/HST thresholds.',
      disclaimer: 'Mock educational data only.'
    },
    'hockey-pulse': {
      vibe: 'Casual hockey bar energy after the meetup',
      note: 'Useful for social recommendations without over-spending on data.'
    }
  };

  return payloads[tool.id];
}

export function normalizeAllowanceStatus(allowance?: FixedDelegation): FixedDelegation | undefined {
  if (!allowance) return undefined;
  if (allowance.status === 'active' && BigInt(allowance.remainingBaseUnits) <= 0n) {
    allowance.status = 'depleted';
  }
  if (allowance.status === 'active' && Date.parse(allowance.expiresAt) <= Date.now()) {
    allowance.status = 'expired';
  }
  return allowance;
}

export function ensureState(): DemoState {
  const state = readState();
  if (!state || !state.version) {
    return writeState(createInitialState());
  }
  state.currentAllowance = normalizeAllowanceStatus(state.currentAllowance);
  return state;
}

export function assertCanSpend(allowance: FixedDelegation, amount: bigint, userBalanceBaseUnits: string): void {
  if (allowance.status === 'revoked') throw new AllowanceError('Allowance has been revoked.', 'REVOKED');
  if (allowance.status === 'expired') throw new AllowanceError('Allowance has expired.', 'EXPIRED');
  if (allowance.status === 'depleted') throw new AllowanceError('Allowance has been depleted.', 'DEPLETED');
  if (Date.parse(allowance.expiresAt) <= Date.now()) throw new AllowanceError('Allowance has expired.', 'EXPIRED');
  if (BigInt(allowance.remainingBaseUnits) < amount) throw new AllowanceError('Requested spend exceeds remaining allowance.', 'OVERSPEND');
  if (BigInt(userBalanceBaseUnits) < amount) throw new AllowanceError('User token balance is insufficient.', 'INSUFFICIENT_BALANCE');
}

export function markIndexerSync(): DemoState {
  const state = ensureState();
  state.indexer = {
    running: true,
    lastSyncAt: new Date().toISOString(),
    receiptsIndexed: state.receipts.length,
    eventsIndexed: state.events.length,
    watchedDelegationPda: state.currentAllowance?.delegationPda
  };
  return writeState(state);
}

export function pda(...seeds: string[]): WalletAddress {
  const hash = crypto.createHash('sha256').update(seeds.join(':')).digest('hex');
  return `PDA${hash.slice(0, 38)}`;
}

export function signature(prefix: string): Signature {
  const hash = crypto.createHash('sha256').update(`${prefix}:${Date.now()}:${crypto.randomUUID()}`).digest('hex');
  return `sig_${hash.slice(0, 48)}`;
}

export function event(
  type: OnchainEvent['type'],
  message: string,
  payload: Record<string, unknown> = {},
  eventSignature?: Signature,
  delegationPda?: WalletAddress
): OnchainEvent {
  return {
    id: `event_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`,
    type,
    signature: eventSignature,
    delegationPda,
    message,
    createdAt: new Date().toISOString(),
    payload
  };
}

export function explorerUrl(sig: Signature): string {
  if (CLUSTER === 'localnet') return `localnet://${sig}`;
  return `https://explorer.solana.com/tx/${sig}?cluster=${CLUSTER}`;
}

export function short(address: string): string {
  if (address.length <= 12) return address;
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

export const SOLANA_SDK_INTEGRATION_NOTES = `
Production adapter sketch:

import { SubscriptionsClient } from '@solana/subscriptions';

Use SOLANA_ALLOWANCE_MODE=sdk to select SubscriptionsSdkAllowanceProvider.

await client.subscriptions.instructions.initSubscriptionAuthority(...);
await client.subscriptions.instructions.createFixedDelegation(...);
await client.subscriptions.instructions.transferFixed(...);
await client.subscriptions.instructions.revokeDelegation(...);

The app-facing AllowanceProvider interface is async so local demo mode and the official program share the same call surface.
`;
