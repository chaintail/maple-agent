import { getAllowanceProvider, parseUnits } from '@maple-agent/solana';

process.env.SOLANA_ALLOWANCE_MODE = 'sdk';
process.env.SOLANA_CLUSTER = process.env.SOLANA_CLUSTER || 'devnet';

const provider = getAllowanceProvider();
const snapshot = await provider.getSnapshot();
const tool = snapshot.tools.find((candidate) => candidate.id === 'maple-weather') ?? snapshot.tools[0];

if (!tool) {
  throw new Error('No paid tools are configured.');
}

console.log('Creating fixed delegation...');
const allowance = await provider.createFixedDelegation({
  amountBaseUnits: parseUnits('5'),
  expiresAt: new Date(Date.now() + 60 * 60 * 1000)
});
console.log(`Delegation: ${allowance.delegationPda}`);
console.log(`Create tx:  ${allowance.lastSignature}`);

console.log(`Transferring ${tool.priceBaseUnits} base units to ${tool.name}...`);
const receipt = await provider.transferFixed({
  delegationPda: allowance.delegationPda,
  toolId: tool.id,
  toolName: tool.name,
  amountBaseUnits: BigInt(tool.priceBaseUnits),
  receiverWallet: tool.merchantWallet
});
console.log(`Transfer tx: ${receipt.signature}`);

console.log('Revoking delegation...');
const revoked = await provider.revokeDelegation(allowance.delegationPda);
console.log(`Revoke tx: ${revoked.lastSignature}`);
console.log(`Status:    ${revoked.status}`);

console.log('Trying post-revoke spend...');
try {
  await provider.transferFixed({
    delegationPda: allowance.delegationPda,
    toolId: tool.id,
    toolName: tool.name,
    amountBaseUnits: BigInt(tool.priceBaseUnits),
    receiverWallet: tool.merchantWallet
  });
  console.error('Unexpected: post-revoke spend succeeded.');
  process.exit(1);
} catch (error) {
  console.log('Post-revoke spend blocked as expected.');
  console.log(`Reason: ${error instanceof Error ? error.message : String(error)}`);
}
