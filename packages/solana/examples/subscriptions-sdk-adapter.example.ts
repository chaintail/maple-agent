/**
 * Production adapter sketch for @solana/subscriptions.
 *
 * This file is intentionally kept outside src/ so the local demo remains runnable
 * without Solana keys, a validator, or the official SDK installed. Use it as the
 * starting point when swapping LocalLedgerAllowanceProvider for the real program.
 *
 * Official SDK methods referenced by the current repository/docs:
 * - initSubscriptionAuthority
 * - createFixedDelegation
 * - transferFixed
 * - revokeDelegation
 * - getDelegationsForWallet
 * - isSubscriptionAuthorityInitialized
 */

import type {
  AllowanceProvider,
  CreateAllowanceParams,
  TransferFixedParams
} from '../src/index';
import type { AllowanceSnapshot, FixedDelegation, SpendReceipt, WalletAddress } from '@maple-agent/types';

export class SubscriptionsSdkAllowanceProvider implements AllowanceProvider {
  // private readonly client: SubscriptionsClient;
  // private readonly userSigner: TransactionSigner;
  // private readonly delegateeSigner: TransactionSigner;

  constructor() {
    // this.client = new SubscriptionsClient({ rpc, programId });
  }

  seedDemoState(): never {
    throw new Error('Not supported in production adapter. Seed wallets/mints with Solana tooling.');
  }

  getSnapshot(): AllowanceSnapshot {
    /**
     * Suggested implementation:
     * 1. client.subscriptions.getDelegationsForWallet(userWallet)
     * 2. fetch token balances for user/merchants
     * 3. fetch indexed events/receipts from your indexer
     * 4. normalize into the AllowanceSnapshot used by the UI
     */
    throw new Error('Implement using RPC + @solana/subscriptions query helpers.');
  }

  getOrCreateSubscriptionAuthority(userWallet: WalletAddress, mint: WalletAddress): WalletAddress {
    /**
     * Suggested implementation:
     *
     * const exists = await client.subscriptions.isSubscriptionAuthorityInitialized({
     *   owner: userWallet,
     *   tokenMint: mint
     * });
     *
     * if (!exists) {
     *   await client.subscriptions.instructions.initSubscriptionAuthority({ ... });
     * }
     *
     * return getSubscriptionAuthorityPDA(userWallet, mint);
     */
    void userWallet;
    void mint;
    throw new Error('Implement with initSubscriptionAuthority + PDA helper.');
  }

  createFixedDelegation(params: CreateAllowanceParams): FixedDelegation {
    /**
     * Suggested implementation:
     *
     * await client.subscriptions.instructions.createFixedDelegation({
     *   delegator: userSigner,
     *   delegatee: delegateeAddress,
     *   tokenMint,
     *   amount: params.amountBaseUnits,
     *   expiresAt: params.expiresAt,
     *   ...
     * });
     */
    void params;
    throw new Error('Implement with createFixedDelegation.');
  }

  transferFixed(params: TransferFixedParams): SpendReceipt {
    /**
     * Suggested implementation:
     *
     * await client.subscriptions.instructions.transferFixed({
     *   delegatee: delegateeSigner,
     *   delegator: userAddress,
     *   delegatorAta,
     *   receiverAta,
     *   tokenMint,
     *   delegationPda: params.delegationPda,
     *   amount: params.amountBaseUnits,
     * });
     */
    void params;
    throw new Error('Implement with transferFixed.');
  }

  revokeDelegation(delegationPda: WalletAddress): FixedDelegation {
    /**
     * Suggested implementation:
     *
     * await client.subscriptions.instructions.revokeDelegation({
     *   delegator: userSigner,
     *   delegationPda,
     *   ...
     * });
     */
    void delegationPda;
    throw new Error('Implement with revokeDelegation.');
  }

  trySpendAfterRevoke(): { ok: boolean; message: string; receipt?: SpendReceipt } {
    throw new Error('Use transferFixed and surface the program error.');
  }
}
