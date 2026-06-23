import { getAllowanceProvider } from '@maple-agent/solana';

await getAllowanceProvider().seedDemoState();
console.log('Demo reset complete.');
