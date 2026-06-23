import { getAllowanceProvider } from '@maple-agent/solana';

const provider = getAllowanceProvider();
const result = provider.trySpendAfterRevoke('maple-weather');

if (result.ok) {
  console.log('Unexpected: spend succeeded.');
  console.log(result.receipt);
  process.exit(1);
}

console.log('Spend blocked as expected.');
console.log(`Reason: ${result.message}`);
