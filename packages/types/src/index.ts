export type WalletAddress = string;
export type Signature = string;
export type BaseUnits = string;
export type ToolId =
  | 'maple-weather'
  | 'toronto-events'
  | 'via-planner'
  | 'vancouver-transit'
  | 'maple-hotels'
  | 'canada-tax-snippet'
  | 'hockey-pulse';

export type AllowanceStatus = 'missing' | 'active' | 'revoked' | 'expired' | 'depleted';
export type ToolCallStatus = 'queued' | 'quoted' | 'policy-approved' | 'paid' | 'confirmed' | 'blocked' | 'failed';
export type TaskStatus = 'idle' | 'running' | 'completed' | 'blocked' | 'failed';

export type DemoWallet = {
  label: string;
  address: WalletAddress;
  balanceBaseUnits: BaseUnits;
};

export type FixedDelegation = {
  id: string;
  subscriptionAuthority: WalletAddress;
  delegationPda: WalletAddress;
  userWallet: WalletAddress;
  delegateWallet: WalletAddress;
  tokenMint: WalletAddress;
  allowanceBaseUnits: BaseUnits;
  spentBaseUnits: BaseUnits;
  remainingBaseUnits: BaseUnits;
  expiresAt: string;
  createdAt: string;
  status: AllowanceStatus;
  revokedAt?: string;
  lastSignature?: Signature;
};

export type PaidTool = {
  id: ToolId;
  name: string;
  category: string;
  description: string;
  priceBaseUnits: BaseUnits;
  merchantWallet: WalletAddress;
  sampleInput: string;
  canadaContext: string;
};

export type ToolQuote = {
  toolId: ToolId;
  toolName: string;
  merchantWallet: WalletAddress;
  amountBaseUnits: BaseUnits;
  expiresAt: string;
};

export type ToolCallPlan = {
  id: string;
  toolId: ToolId;
  reason: string;
  estimatedCostBaseUnits: BaseUnits;
};

export type PolicyCheck = {
  label: string;
  passed: boolean;
  detail: string;
};

export type SpendReceipt = {
  id: string;
  signature: Signature;
  taskId?: string;
  toolId: ToolId;
  toolName: string;
  amountBaseUnits: BaseUnits;
  payerWallet: WalletAddress;
  delegateWallet: WalletAddress;
  merchantWallet: WalletAddress;
  delegationPda: WalletAddress;
  createdAt: string;
  status: 'pending' | 'confirmed' | 'failed';
  explorerUrl?: string;
};

export type AgentPolicy = {
  maxSpendBaseUnits: BaseUnits;
  maxToolCalls: number;
  maxSingleToolSpendBaseUnits: BaseUnits;
  allowedToolIds: ToolId[];
  requireReceipts: boolean;
};

export type AgentTask = {
  id: string;
  prompt: string;
  status: TaskStatus;
  plan: ToolCallPlan[];
  toolCalls: AgentToolCall[];
  finalReport?: AgentReport;
  createdAt: string;
  completedAt?: string;
  failureReason?: string;
};

export type AgentToolCall = {
  id: string;
  toolId: ToolId;
  toolName: string;
  reason: string;
  status: ToolCallStatus;
  costBaseUnits: BaseUnits;
  quote?: ToolQuote;
  receipt?: SpendReceipt;
  policyChecks: PolicyCheck[];
  data?: Record<string, unknown>;
  failureReason?: string;
  createdAt: string;
  completedAt?: string;
};

export type AgentReport = {
  title: string;
  summary: string;
  totalSpentBaseUnits: BaseUnits;
  remainingBudgetBaseUnits: BaseUnits;
  recommendations: string[];
  sourcesPurchased: string[];
};

export type OnchainEventType =
  | 'subscription_authority_initialized'
  | 'fixed_delegation_created'
  | 'fixed_transfer_submitted'
  | 'fixed_transfer_confirmed'
  | 'delegation_revoked'
  | 'transfer_blocked';

export type OnchainEvent = {
  id: string;
  type: OnchainEventType;
  signature?: Signature;
  delegationPda?: WalletAddress;
  message: string;
  createdAt: string;
  payload?: Record<string, unknown>;
};

export type IndexerStatus = {
  running: boolean;
  lastSyncAt?: string;
  receiptsIndexed: number;
  eventsIndexed: number;
  watchedDelegationPda?: WalletAddress;
};

export type DemoState = {
  version: number;
  tokenMint: WalletAddress;
  wallets: {
    user: DemoWallet;
    agent: DemoWallet;
    merchants: Record<ToolId, DemoWallet>;
  };
  tools: PaidTool[];
  currentAllowance?: FixedDelegation;
  tasks: AgentTask[];
  receipts: SpendReceipt[];
  events: OnchainEvent[];
  indexer: IndexerStatus;
};

export type AllowanceSnapshot = {
  tokenMint: WalletAddress;
  userWallet: DemoWallet;
  agentWallet: DemoWallet;
  allowance?: FixedDelegation;
  tools: PaidTool[];
  receipts: SpendReceipt[];
  events: OnchainEvent[];
  indexer: IndexerStatus;
};
