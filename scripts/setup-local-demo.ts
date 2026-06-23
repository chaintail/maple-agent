import { getAllowanceProvider } from '@maple-agent/solana';
import { formatUnits } from '@maple-agent/agent-core';

const provider = getAllowanceProvider();
const state = provider.seedDemoState();

console.log('MapleAgent demo state initialized.');
console.log(`User wallet:  ${state.wallets.user.address}`);
console.log(`Agent wallet: ${state.wallets.agent.address}`);
console.log(`Mock USDC:    ${formatUnits(state.wallets.user.balanceBaseUnits)}`);
console.log(`Tools seeded: ${state.tools.length}`);
console.log('\nNext: npm run demo:run or npm run dev');
