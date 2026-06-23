import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { findAssociatedTokenPda, fetchMaybeToken, TOKEN_PROGRAM_ADDRESS } from '@solana-program/token';
import {
  fetchDelegationsByDelegator,
  fetchFixedDelegation,
  fetchMaybeSubscriptionAuthority,
  findFixedDelegationPda,
  findSubscriptionAuthorityPda,
  getCreateFixedDelegationInstruction,
  getInitSubscriptionAuthorityInstruction,
  getRevokeDelegationInstruction,
  getSubscriptionsErrorMessage,
  getTransferFixedInstruction,
  isSubscriptionsError,
  SUBSCRIPTIONS_PROGRAM_ADDRESS,
  type Delegation,
  type FixedDelegation as SdkFixedDelegation
} from '@solana/subscriptions';
import {
  address,
  appendTransactionMessageInstructions,
  createKeyPairSignerFromBytes,
  createSolanaRpc,
  createSolanaRpcSubscriptions,
  createTransactionMessage,
  devnet,
  getSignatureFromTransaction,
  sendAndConfirmTransactionFactory,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
  type Address,
  type Instruction,
  type KeyPairSigner,
  type Rpc,
  type TransactionSigner
} from '@solana/kit';
import { parseUnits } from '@maple-agent/agent-core';
import type {
  AllowanceSnapshot,
  DemoWallet,
  FixedDelegation as DomainFixedDelegation,
  OnchainEvent,
  PaidTool,
  SpendReceipt,
  ToolId,
  WalletAddress
} from '@maple-agent/types';
import type { AllowanceProvider, CreateAllowanceParams, TransferFixedParams } from './index';
import { AllowanceError, createTools, event, explorerUrl, normalizeAllowanceStatus, short } from './index';

type SdkConfig = {
  tokenMint?: string;
  delegatorKeypairPath?: string;
  delegateeKeypairPath?: string;
  merchants?: Partial<Record<ToolId, string>>;
};

const DEFAULT_RPC_URL = 'https://api.devnet.solana.com';
const DEFAULT_WS_URL = 'wss://api.devnet.solana.com';
const DEFAULT_DEVNET_CONFIG_PATH = '.maple-agent-devnet/config.json';

export class SubscriptionsSdkAllowanceProvider implements AllowanceProvider {
  private readonly rpcUrl: string;
  private readonly wsUrl: string;
  private readonly rpc: Rpc<any>;
  private readonly sendAndConfirmTransaction: ReturnType<typeof sendAndConfirmTransactionFactory>;
  private readonly config: SdkConfig;
  private readonly receipts: SpendReceipt[] = [];
  private readonly events: OnchainEvent[] = [];
  private readonly createdCaps = new Map<string, bigint>();
  private readonly revokedDelegations = new Map<string, SdkFixedDelegation>();
  private delegatorSigner?: Promise<KeyPairSigner>;
  private delegateeSigner?: Promise<KeyPairSigner>;
  private lastCreatedDelegationPda?: string;
  private lastRevokedDelegationPda?: string;

  constructor() {
    this.rpcUrl = process.env.SOLANA_RPC_URL || DEFAULT_RPC_URL;
    this.wsUrl = process.env.SOLANA_RPC_WS_URL || toWsUrl(this.rpcUrl);
    this.rpc = createSolanaRpc(devnet(this.rpcUrl)) as Rpc<any>;
    const rpcSubscriptions = createSolanaRpcSubscriptions(devnet(this.wsUrl || DEFAULT_WS_URL));
    this.sendAndConfirmTransaction = sendAndConfirmTransactionFactory({ rpc: this.rpc as any, rpcSubscriptions });
    this.config = readSdkConfig();
  }

  async seedDemoState(): Promise<never> {
    throw new Error('SDK mode does not seed local demo state. Run scripts/setup-devnet.ts instead.');
  }

  async getSnapshot(): Promise<AllowanceSnapshot> {
    const delegator = await this.getDelegatorSigner();
    const delegatee = await this.getDelegateeSigner();
    const tokenMint = this.getTokenMint();
    const tools = this.getTools();
    const userAta = await this.getAta(delegator.address, tokenMint);
    const agentAta = await this.getAta(delegatee.address, tokenMint);
    const delegations = await fetchDelegationsByDelegator(this.rpc as any, delegator.address, SUBSCRIPTIONS_PROGRAM_ADDRESS);
    const fixedDelegations = delegations
      .filter(
      (delegation): delegation is Extract<Delegation, { kind: 'fixed' }> =>
        delegation.kind === 'fixed' && String(delegation.data.mint) === String(tokenMint)
      )
      .sort((left, right) => this.compareDelegations(left, right));
    const activeFixed = fixedDelegations[0];
    const allowance = activeFixed ? normalizeAllowanceStatus(this.toDomainDelegation(activeFixed.address, activeFixed.data)) : undefined;

    return {
      tokenMint: String(tokenMint),
      userWallet: {
        label: 'You',
        address: String(delegator.address),
        balanceBaseUnits: await this.getTokenBalance(userAta)
      },
      agentWallet: {
        label: 'MapleAgent',
        address: String(delegatee.address),
        balanceBaseUnits: await this.getTokenBalance(agentAta)
      },
      allowance,
      tools,
      receipts: this.receipts,
      events: this.events,
      indexer: {
        running: true,
        lastSyncAt: new Date().toISOString(),
        receiptsIndexed: this.receipts.length,
        eventsIndexed: this.events.length,
        watchedDelegationPda: allowance?.delegationPda
      }
    };
  }

  async getOrCreateSubscriptionAuthority(userWallet: WalletAddress, mint: WalletAddress): Promise<WalletAddress> {
    const delegator = await this.getDelegatorSigner();
    const tokenMint = address(mint);
    if (userWallet !== String(delegator.address)) {
      throw new Error(`SDK mode can only initialize authority for configured delegator ${delegator.address}.`);
    }

    const [subscriptionAuthority] = await findSubscriptionAuthorityPda(
      { user: delegator.address, tokenMint },
      { programAddress: SUBSCRIPTIONS_PROGRAM_ADDRESS }
    );
    const existing = await fetchMaybeSubscriptionAuthority(this.rpc as any, subscriptionAuthority);
    if (existing.exists) return String(subscriptionAuthority);

    const userAta = await this.getAta(delegator.address, tokenMint);
    const instruction = getInitSubscriptionAuthorityInstruction(
      {
        owner: delegator,
        subscriptionAuthority,
        tokenMint,
        userAta,
        tokenProgram: TOKEN_PROGRAM_ADDRESS
      },
      { programAddress: SUBSCRIPTIONS_PROGRAM_ADDRESS }
    );
    const signature = await this.sendInstructions([instruction], delegator);
    this.events.push(event('subscription_authority_initialized', `Subscription Authority initialized for ${short(userWallet)}.`, {
      signature,
      userWallet,
      tokenMint: mint,
      subscriptionAuthority: String(subscriptionAuthority)
    }, signature, String(subscriptionAuthority)));
    return String(subscriptionAuthority);
  }

  async createFixedDelegation(params: CreateAllowanceParams): Promise<DomainFixedDelegation> {
    const delegator = await this.getDelegatorSigner();
    const delegatee = await this.getDelegateeSigner();
    const tokenMint = this.getTokenMint();
    const subscriptionAuthority = address(await this.getOrCreateSubscriptionAuthority(String(delegator.address), String(tokenMint)));
    const authority = await fetchMaybeSubscriptionAuthority(this.rpc as any, subscriptionAuthority);
    const nonce = BigInt(Date.now());
    const [delegationPda] = await findFixedDelegationPda(
      { subscriptionAuthority, delegator: delegator.address, delegatee: delegatee.address, nonce },
      { programAddress: SUBSCRIPTIONS_PROGRAM_ADDRESS }
    );
    const instruction = getCreateFixedDelegationInstruction(
      {
        delegator,
        subscriptionAuthority,
        delegationAccount: delegationPda,
        delegatee: delegatee.address,
        fixedDelegation: {
          nonce,
          amount: params.amountBaseUnits,
          expiryTs: BigInt(Math.floor(params.expiresAt.getTime() / 1000)),
          expectedSubscriptionAuthorityInitId: authority.exists ? authority.data.initId : 0n
        }
      },
      { programAddress: SUBSCRIPTIONS_PROGRAM_ADDRESS }
    );
    const signature = await this.sendInstructions([instruction], delegator);
    const account = await fetchFixedDelegation(this.rpc as any, delegationPda);
    this.createdCaps.set(String(delegationPda), params.amountBaseUnits);
    this.lastCreatedDelegationPda = String(delegationPda);
    const allowance = this.toDomainDelegation(account.address, account.data, signature);
    this.events.push(event('fixed_delegation_created', `Fixed delegation created for ${params.amountBaseUnits.toString()} base units.`, {
      signature,
      delegationPda: String(delegationPda),
      delegateWallet: String(delegatee.address),
      userWallet: String(delegator.address),
      expiresAt: allowance.expiresAt
    }, signature, String(delegationPda)));
    return allowance;
  }

  async transferFixed(params: TransferFixedParams): Promise<SpendReceipt> {
    const delegator = await this.getDelegatorSigner();
    const delegatee = await this.getDelegateeSigner();
    const delegationAddress = address(params.delegationPda);
    const delegation = await this.getFixedDelegationForTransfer(delegationAddress);
    const userAta = await this.getAta(delegation.header.delegator, delegation.mint);
    const receiverAta = await this.getAta(address(params.receiverWallet), delegation.mint);
    const instruction = getTransferFixedInstruction(
      {
        delegationPda: delegationAddress,
        subscriptionAuthority: delegation.subscriptionAuthority,
        delegatorAta: userAta,
        receiverAta,
        tokenMint: delegation.mint,
        tokenProgram: TOKEN_PROGRAM_ADDRESS,
        delegatee,
        transferData: {
          amount: params.amountBaseUnits,
          delegator: delegation.header.delegator,
          mint: delegation.mint
        }
      },
      { programAddress: SUBSCRIPTIONS_PROGRAM_ADDRESS }
    );
    // The generated transfer instruction marks delegatee as the required signer,
    // but fee payer is independent; use delegator for fees so setup need not fund the agent wallet.
    const signature = await this.sendInstructions([instruction], delegator);
    const receipt: SpendReceipt = {
      id: `receipt_${signature.slice(-10)}`,
      signature,
      taskId: params.taskId,
      toolId: params.toolId,
      toolName: params.toolName,
      amountBaseUnits: params.amountBaseUnits.toString(),
      payerWallet: String(delegation.header.delegator),
      delegateWallet: String(delegatee.address),
      merchantWallet: params.receiverWallet,
      delegationPda: String(delegationAddress),
      createdAt: new Date().toISOString(),
      status: 'confirmed',
      explorerUrl: explorerUrl(signature)
    };
    this.receipts.unshift(receipt);
    this.events.push(event('fixed_transfer_confirmed', `${params.toolName} received ${params.amountBaseUnits.toString()} base units.`, {
      signature,
      amountBaseUnits: params.amountBaseUnits.toString(),
      toolId: params.toolId
    }, signature, String(delegationAddress)));
    return receipt;
  }

  async revokeDelegation(delegationPda: WalletAddress): Promise<DomainFixedDelegation> {
    const delegator = await this.getDelegatorSigner();
    const before = await fetchFixedDelegation(this.rpc as any, address(delegationPda));
    const instruction = getRevokeDelegationInstruction(
      {
        authority: delegator,
        delegationAccount: before.address
      },
      { programAddress: SUBSCRIPTIONS_PROGRAM_ADDRESS }
    );
    const signature = await this.sendInstructions([instruction], delegator);
    const allowance = this.toDomainDelegation(before.address, before.data, signature);
    allowance.status = 'revoked';
    allowance.revokedAt = new Date().toISOString();
    this.lastRevokedDelegationPda = delegationPda;
    this.revokedDelegations.set(delegationPda, before.data);
    this.events.push(event('delegation_revoked', 'User revoked MapleAgent budget.', {
      signature,
      delegationPda
    }, signature, delegationPda));
    return allowance;
  }

  async trySpendAfterRevoke(toolId: ToolId = 'maple-weather'): Promise<{ ok: boolean; message: string; receipt?: SpendReceipt }> {
    const snapshot = await this.getSnapshot();
    const tool = snapshot.tools.find((candidate) => candidate.id === toolId);
    const delegationPda = this.lastRevokedDelegationPda ?? snapshot.allowance?.delegationPda;
    if (!tool || !delegationPda) return { ok: false, message: 'No tool or allowance found.' };
    try {
      const receipt = await this.transferFixed({
        delegationPda,
        toolId,
        toolName: tool.name,
        amountBaseUnits: BigInt(tool.priceBaseUnits),
        receiverWallet: tool.merchantWallet
      });
      return { ok: true, message: 'Spend unexpectedly succeeded.', receipt };
    } catch (error) {
      const message = this.humanError(error);
      this.events.push(event('transfer_blocked', `Post-revoke spend blocked: ${message}`, { toolId, message }, undefined, delegationPda));
      return { ok: false, message };
    }
  }

  private async sendInstructions(instructions: Instruction[], feePayer: TransactionSigner): Promise<string> {
    const { value: latestBlockhash } = await (this.rpc as any).getLatestBlockhash({ commitment: 'confirmed' }).send();
    const transactionMessage = appendTransactionMessageInstructions(
      instructions,
      setTransactionMessageLifetimeUsingBlockhash(
        latestBlockhash,
        setTransactionMessageFeePayerSigner(feePayer, createTransactionMessage({ version: 0 }))
      )
    );
    const transaction = await signTransactionMessageWithSigners(transactionMessage);
    try {
      await this.sendAndConfirmTransaction(transaction as Parameters<typeof this.sendAndConfirmTransaction>[0], { commitment: 'confirmed' });
    } catch (error) {
      throw this.decodeInstructionError(error, instructions);
    }
    return String(getSignatureFromTransaction(transaction));
  }

  private toDomainDelegation(addressValue: Address, delegation: SdkFixedDelegation, lastSignature?: string): DomainFixedDelegation {
    const delegationPda = String(addressValue);
    // SDK docs describe fixed delegation `amount` as the one-time allowance cap.
    // For delegations created in this process, preserve that original cap and derive spending from receipts.
    const cap = this.createdCaps.get(delegationPda) ?? delegation.amount;
    const spent = this.receipts
      .filter((receipt) => receipt.delegationPda === delegationPda && receipt.status === 'confirmed')
      .reduce((total, receipt) => total + BigInt(receipt.amountBaseUnits), 0n);
    const remaining = cap > spent ? cap - spent : 0n;
    return {
      id: `allowance_${delegationPda.slice(-10)}`,
      subscriptionAuthority: String(delegation.subscriptionAuthority),
      delegationPda,
      userWallet: String(delegation.header.delegator),
      delegateWallet: String(delegation.header.delegatee),
      tokenMint: String(delegation.mint),
      allowanceBaseUnits: cap.toString(),
      spentBaseUnits: spent.toString(),
      remainingBaseUnits: remaining.toString(),
      expiresAt: new Date(Number(delegation.expiryTs) * 1000).toISOString(),
      createdAt: new Date(Number(delegation.header.initId || 0n) * 1000 || Date.now()).toISOString(),
      status: remaining <= 0n ? 'depleted' : 'active',
      lastSignature
    };
  }

  private async getTokenBalance(ata: Address): Promise<string> {
    const token = await fetchMaybeToken(this.rpc as any, ata);
    return token.exists ? token.data.amount.toString() : '0';
  }

  private async getAta(owner: Address, mint: Address): Promise<Address> {
    const [ata] = await findAssociatedTokenPda({ owner, mint, tokenProgram: TOKEN_PROGRAM_ADDRESS });
    return ata;
  }

  private async getFixedDelegationForTransfer(delegationPda: Address): Promise<SdkFixedDelegation> {
    const archived = this.revokedDelegations.get(String(delegationPda));
    if (archived) return archived;
    return (await fetchFixedDelegation(this.rpc as any, delegationPda)).data;
  }

  private getTokenMint(): Address {
    const tokenMint = process.env.SOLANA_TOKEN_MINT || this.config.tokenMint;
    if (!tokenMint) throw new Error('SDK mode requires SOLANA_TOKEN_MINT or scripts/setup-devnet.ts config.');
    return address(tokenMint);
  }

  private async getDelegatorSigner(): Promise<KeyPairSigner> {
    this.delegatorSigner ??= loadSigner(process.env.SOLANA_DELEGATOR_KEYPAIR_PATH || this.config.delegatorKeypairPath, 'SOLANA_DELEGATOR_KEYPAIR_PATH');
    return this.delegatorSigner;
  }

  private async getDelegateeSigner(): Promise<KeyPairSigner> {
    this.delegateeSigner ??= loadSigner(process.env.SOLANA_DELEGATEE_KEYPAIR_PATH || this.config.delegateeKeypairPath, 'SOLANA_DELEGATEE_KEYPAIR_PATH');
    return this.delegateeSigner;
  }

  private getTools(): PaidTool[] {
    const merchants = parseMerchantEnv(this.config.merchants);
    return createTools().map((tool) => {
      const merchantWallet = merchants[tool.id];
      if (!merchantWallet) {
        throw new Error(`SDK mode requires a real merchant wallet for ${tool.id}. Run scripts/setup-devnet.ts or set SOLANA_MERCHANT_${tool.id.toUpperCase().replace(/-/g, '_')}_WALLET.`);
      }
      address(merchantWallet);
      return {
        ...tool,
        merchantWallet
      };
    });
  }

  private humanError(error: unknown): string {
    if (error instanceof AllowanceError) return error.message;
    return error instanceof Error ? error.message : String(error);
  }

  private decodeInstructionError(error: unknown, instructions: Instruction[]): Error {
    const transactionMessage = {
      instructions: Object.fromEntries(instructions.map((instruction, index) => [index, { programAddress: instruction.programAddress }]))
    };
    if (isSubscriptionsError(error, transactionMessage)) {
      return new Error(getSubscriptionsErrorMessage(error.context.code), { cause: error });
    }
    return error instanceof Error ? error : new Error(String(error));
  }

  private compareDelegations(left: Extract<Delegation, { kind: 'fixed' }>, right: Extract<Delegation, { kind: 'fixed' }>): number {
    if (String(left.address) === this.lastCreatedDelegationPda) return -1;
    if (String(right.address) === this.lastCreatedDelegationPda) return 1;
    return Number(right.data.header.initId - left.data.header.initId);
  }
}

async function loadSigner(filePath: string | undefined, envName: string): Promise<KeyPairSigner> {
  if (!filePath) throw new Error(`SDK mode requires ${envName}. Run scripts/setup-devnet.ts first.`);
  const bytes = new Uint8Array(JSON.parse(readFileSync(path.resolve(filePath), 'utf8')) as number[]);
  return createKeyPairSignerFromBytes(bytes, true);
}

function readSdkConfig(): SdkConfig {
  const configPath = process.env.SOLANA_DEVNET_CONFIG_PATH || DEFAULT_DEVNET_CONFIG_PATH;
  if (!existsSync(configPath)) return {};
  return JSON.parse(readFileSync(configPath, 'utf8')) as SdkConfig;
}

function parseMerchantEnv(configMerchants: SdkConfig['merchants'] = {}): Partial<Record<ToolId, string>> {
  const merchants = { ...configMerchants };
  for (const tool of createTools()) {
    const envName = `SOLANA_MERCHANT_${tool.id.toUpperCase().replace(/-/g, '_')}_WALLET`;
    merchants[tool.id] = process.env[envName] || merchants[tool.id];
  }
  return merchants;
}

function toWsUrl(rpcUrl: string): string {
  if (process.env.SOLANA_RPC_WS_URL) return process.env.SOLANA_RPC_WS_URL;
  if (rpcUrl.startsWith('https://')) return `wss://${rpcUrl.slice('https://'.length)}`;
  if (rpcUrl.startsWith('http://')) return `ws://${rpcUrl.slice('http://'.length)}`;
  return DEFAULT_WS_URL;
}

export function sdkExplorerUrl(signature: string): string {
  return explorerUrl(signature);
}
