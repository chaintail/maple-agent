import { ensureState, getAllowanceProvider } from '@maple-agent/solana';

const provider = getAllowanceProvider();
const state = ensureState();

if (!state.currentAllowance) {
  console.log('No allowance exists to revoke.');
  process.exit(0);
}

const allowance = await provider.revokeDelegation(state.currentAllowance.delegationPda);
console.log('Allowance revoked.');
console.log(`Delegation PDA: ${allowance.delegationPda}`);
console.log(`Status:         ${allowance.status}`);
console.log(`Signature:      ${allowance.lastSignature}`);
