import cors from 'cors';
import express from 'express';
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
import { readState, writeState } from '@maple-agent/db';
import { AllowanceError, ensureState, getAllowanceProvider, getToolData, markIndexerSync } from '@maple-agent/solana';
import type { AgentTask, PaidTool, ToolId, ToolQuote } from '@maple-agent/types';

const app = express();
const port = Number(process.env.PORT ?? 3001);
const toolMarketUrl = process.env.TOOL_MARKET_URL ?? 'http://localhost:3002';
const provider = getAllowanceProvider();

app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'agent-api' });
});

app.post('/demo/setup', (_req, res) => {
  const state = provider.seedDemoState();
  res.json({ ok: true, snapshot: provider.getSnapshot(), statePathExists: Boolean(state) });
});

app.get('/snapshot', (_req, res) => {
  res.json(provider.getSnapshot());
});

app.post('/allowance/create', (req, res) => {
  const amount = String(req.body?.amount ?? '10');
  const hours = Number(req.body?.hours ?? 24);
  const amountBaseUnits = parseUnits(amount);
  const expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000);
  const allowance = provider.createFixedDelegation({ amountBaseUnits, expiresAt });
  markIndexerSync();
  res.json({ allowance, snapshot: provider.getSnapshot() });
});

app.post('/allowance/revoke', (req, res) => {
  try {
    const snapshot = provider.getSnapshot();
    const delegationPda = String(req.body?.delegationPda ?? snapshot.allowance?.delegationPda ?? '');
    const allowance = provider.revokeDelegation(delegationPda);
    markIndexerSync();
    res.json({ allowance, snapshot: provider.getSnapshot() });
  } catch (error) {
    res.status(400).json(errorPayload(error));
  }
});

app.post('/agent/run-task', async (req, res) => {
  const prompt = String(req.body?.prompt ?? 'Plan a low-cost Saturday in Toronto for a visiting Solana builder.');
  try {
    const result = await runAgentTask(prompt);
    res.json({ task: result, snapshot: provider.getSnapshot() });
  } catch (error) {
    res.status(400).json(errorPayload(error));
  }
});

app.post('/agent/test-spend-after-revoke', (_req, res) => {
  const result = provider.trySpendAfterRevoke('maple-weather');
  markIndexerSync();
  res.status(result.ok ? 200 : 409).json({ result, snapshot: provider.getSnapshot() });
});

app.get('/tasks', (_req, res) => {
  res.json({ tasks: ensureState().tasks });
});

app.get('/receipts', (_req, res) => {
  res.json({ receipts: ensureState().receipts });
});

async function runAgentTask(prompt: string): Promise<AgentTask> {
  const state = ensureState();
  if (!state.currentAllowance) {
    throw new AllowanceError('Create an allowance before running MapleAgent.', 'MISSING');
  }

  const policy = buildDefaultPolicy(state.tools);
  const task = emptyTask(prompt, state.tools, policy);
  persistTask(task);

  for (const plan of task.plan) {
    const latest = ensureState();
    const tool = latest.tools.find((candidate) => candidate.id === plan.toolId);
    if (!tool) continue;

    const quote = await getToolQuote(tool);
    const checks = checkToolPolicy({ plan, tool, policy, allowance: latest.currentAllowance });
    const call = createToolCall({ plan, tool, checks });
    call.quote = quote;
    task.toolCalls.push(call);

    if (!policyPassed(checks)) {
      call.status = 'blocked';
      call.failureReason = 'Policy check failed before payment.';
      task.status = 'blocked';
      persistTask(task);
      continue;
    }

    try {
      const receipt = provider.transferFixed({
        delegationPda: latest.currentAllowance!.delegationPda,
        taskId: task.id,
        toolId: tool.id,
        toolName: tool.name,
        amountBaseUnits: BigInt(tool.priceBaseUnits),
        receiverWallet: tool.merchantWallet
      });
      call.status = 'paid';
      call.receipt = receipt;
      call.data = await getPaidToolData(tool, receipt.signature);
      call.status = 'confirmed';
      call.completedAt = new Date().toISOString();
      persistTask(task);
    } catch (error) {
      call.status = 'failed';
      call.failureReason = error instanceof Error ? error.message : String(error);
      task.status = 'failed';
      task.failureReason = call.failureReason;
      persistTask(task);
      break;
    }
  }

  const refreshed = ensureState();
  task.status = task.toolCalls.some((call) => call.status === 'failed') ? 'failed' : 'completed';
  task.completedAt = new Date().toISOString();
  task.finalReport = buildAgentReport({ task, allowance: refreshed.currentAllowance });
  persistTask(task);
  markIndexerSync();
  return task;
}

async function getToolQuote(tool: PaidTool): Promise<ToolQuote> {
  try {
    const response = await fetch(`${toolMarketUrl}/tools/${tool.id}/quote`);
    if (!response.ok) throw new Error(`Quote request failed: ${response.status}`);
    const payload = (await response.json()) as { quote: ToolQuote };
    return payload.quote;
  } catch {
    return {
      toolId: tool.id,
      toolName: tool.name,
      merchantWallet: tool.merchantWallet,
      amountBaseUnits: tool.priceBaseUnits,
      expiresAt: new Date(Date.now() + 60_000).toISOString()
    };
  }
}

async function getPaidToolData(tool: PaidTool, signature: string): Promise<Record<string, unknown>> {
  try {
    const response = await fetch(`${toolMarketUrl}/tools/${tool.id}/data`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ signature })
    });
    if (!response.ok) throw new Error(`Data request failed: ${response.status}`);
    const payload = (await response.json()) as { data: Record<string, unknown> };
    return payload.data;
  } catch {
    return getToolData(tool);
  }
}

function persistTask(task: AgentTask): void {
  const state = ensureState();
  const existing = state.tasks.findIndex((candidate) => candidate.id === task.id);
  if (existing >= 0) state.tasks[existing] = task;
  else state.tasks.unshift(task);
  writeState(state);
}

function errorPayload(error: unknown): { error: string; code?: string; human?: string } {
  if (error instanceof AllowanceError) {
    return { error: error.message, code: error.code, human: error.message };
  }
  const message = error instanceof Error ? error.message : String(error);
  return { error: message, human: message.includes('allowance') ? message : `MapleAgent failed: ${message}` };
}

app.listen(port, () => {
  const state = readState();
  const amount = state?.currentAllowance ? formatUnits(state.currentAllowance.remainingBaseUnits) : 'no allowance';
  console.log(`[agent-api] listening on http://localhost:${port} · remaining budget: ${amount}`);
});
