import {
  buildAgentReport,
  buildDefaultPolicy,
  checkToolPolicy,
  createToolCall,
  emptyTask,
  formatUnits,
  parseUnits,
  policyPassed
} from '@maple-agent/agent-core';
import { writeState } from '@maple-agent/db';
import { ensureState, getAllowanceProvider, getToolData, markIndexerSync } from '@maple-agent/solana';
import type { AgentTask } from '@maple-agent/types';

const provider = getAllowanceProvider();
let state = ensureState();

if (!state.currentAllowance) {
  console.log('No allowance found. Creating a 10 mock USDC / 24h budget first.');
  provider.createFixedDelegation({ amountBaseUnits: parseUnits('10'), expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) });
  state = ensureState();
}

const prompt = process.argv.slice(2).join(' ') || 'Plan a low-cost Saturday in Toronto for a visiting Solana builder from Vancouver.';
const policy = buildDefaultPolicy(state.tools);
const task: AgentTask = emptyTask(prompt, state.tools, policy);

console.log(`\nTask: ${prompt}`);
console.log(`Starting budget: ${formatUnits(state.currentAllowance!.remainingBaseUnits)} mock USDC\n`);

for (const plan of task.plan) {
  const fresh = ensureState();
  const tool = fresh.tools.find((candidate) => candidate.id === plan.toolId)!;
  const checks = checkToolPolicy({ plan, tool, policy, allowance: fresh.currentAllowance });
  const call = createToolCall({ plan, tool, checks });
  task.toolCalls.push(call);

  if (!policyPassed(checks)) {
    call.status = 'blocked';
    call.failureReason = 'Policy check failed.';
    console.log(`BLOCKED ${tool.name}: ${call.failureReason}`);
    continue;
  }

  const receipt = provider.transferFixed({
    delegationPda: fresh.currentAllowance!.delegationPda,
    taskId: task.id,
    toolId: tool.id,
    toolName: tool.name,
    amountBaseUnits: BigInt(tool.priceBaseUnits),
    receiverWallet: tool.merchantWallet
  });
  call.status = 'confirmed';
  call.receipt = receipt;
  call.data = getToolData(tool);
  call.completedAt = new Date().toISOString();
  console.log(`PAID    ${tool.name.padEnd(16)} ${formatUnits(tool.priceBaseUnits)} mock USDC · ${receipt.signature}`);
}

const refreshed = ensureState();
task.status = 'completed';
task.completedAt = new Date().toISOString();
task.finalReport = buildAgentReport({ task, allowance: refreshed.currentAllowance });
refreshed.tasks.unshift(task);
writeState(refreshed);
markIndexerSync();

const finalState = ensureState();
console.log(`\nTotal spent: ${formatUnits(task.finalReport.totalSpentBaseUnits)} mock USDC`);
console.log(`Remaining:   ${formatUnits(finalState.currentAllowance?.remainingBaseUnits ?? '0')} mock USDC`);
console.log(`Receipts:    ${finalState.receipts.length}`);
console.log('\nReport:');
console.log(task.finalReport.summary);
