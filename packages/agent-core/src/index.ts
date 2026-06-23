import crypto from 'node:crypto';
import type {
  AgentPolicy,
  AgentReport,
  AgentTask,
  AgentToolCall,
  FixedDelegation,
  PaidTool,
  PolicyCheck,
  ToolCallPlan,
  ToolId
} from '@maple-agent/types';

export const TOKEN_DECIMALS = 6;

export function parseUnits(amount: string | number, decimals = TOKEN_DECIMALS): bigint {
  const raw = String(amount).trim();
  if (!/^\d+(\.\d+)?$/.test(raw)) throw new Error(`Invalid token amount: ${amount}`);
  const [whole, fraction = ''] = raw.split('.');
  const padded = `${fraction}${'0'.repeat(decimals)}`.slice(0, decimals);
  return BigInt(whole) * 10n ** BigInt(decimals) + BigInt(padded || '0');
}

export function formatUnits(baseUnits: string | bigint, decimals = TOKEN_DECIMALS): string {
  const value = typeof baseUnits === 'bigint' ? baseUnits : BigInt(baseUnits);
  const divisor = 10n ** BigInt(decimals);
  const whole = value / divisor;
  const fraction = value % divisor;
  const fractionText = fraction.toString().padStart(decimals, '0').replace(/0+$/, '');
  return fractionText ? `${whole}.${fractionText}` : whole.toString();
}

export function createId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
}

export function buildDefaultPolicy(tools: PaidTool[]): AgentPolicy {
  return {
    maxSpendBaseUnits: parseUnits('10').toString(),
    maxToolCalls: 5,
    maxSingleToolSpendBaseUnits: parseUnits('2.5').toString(),
    allowedToolIds: tools.map((tool) => tool.id),
    requireReceipts: true
  };
}

export function planToolCalls(prompt: string, tools: PaidTool[], policy: AgentPolicy): ToolCallPlan[] {
  const normalized = prompt.toLowerCase();
  const selected: ToolId[] = [];

  if (normalized.includes('toronto') || normalized.includes('builder') || normalized.includes('saturday')) {
    selected.push('maple-weather', 'toronto-events', 'via-planner', 'maple-hotels');
  } else if (normalized.includes('vancouver')) {
    selected.push('maple-weather', 'vancouver-transit', 'hockey-pulse');
  } else if (normalized.includes('tax') || normalized.includes('business')) {
    selected.push('canada-tax-snippet', 'maple-weather');
  } else {
    selected.push('maple-weather', 'toronto-events', 'hockey-pulse');
  }

  const deduped = [...new Set(selected)]
    .filter((toolId) => policy.allowedToolIds.includes(toolId))
    .slice(0, policy.maxToolCalls);

  return deduped.map((toolId) => {
    const tool = tools.find((candidate) => candidate.id === toolId);
    if (!tool) throw new Error(`Unknown tool ${toolId}`);
    return {
      id: createId('plan'),
      toolId,
      estimatedCostBaseUnits: tool.priceBaseUnits,
      reason: reasonForTool(toolId, prompt)
    };
  });
}

export function reasonForTool(toolId: ToolId, prompt: string): string {
  const reasons: Record<ToolId, string> = {
    'maple-weather': 'Check practical conditions before recommending outdoor movement between stops.',
    'toronto-events': 'Find a Canadian builder/community event that makes the itinerary feel local.',
    'via-planner': 'Estimate intercity or regional movement options for a visiting builder.',
    'vancouver-transit': 'Use transit context for Vancouver-oriented routes and local movement.',
    'maple-hotels': 'Find a realistic budget accommodation anchor for the itinerary.',
    'canada-tax-snippet': 'Add Canadian business/tax context for builder operations.',
    'hockey-pulse': 'Add a lightweight Canadian culture signal to personalize the result.'
  };
  void prompt;
  return reasons[toolId];
}

export function checkToolPolicy(params: {
  plan: ToolCallPlan;
  tool: PaidTool;
  policy: AgentPolicy;
  allowance?: FixedDelegation;
}): PolicyCheck[] {
  const { plan, tool, policy, allowance } = params;
  const remaining = allowance ? BigInt(allowance.remainingBaseUnits) : 0n;
  const cost = BigInt(tool.priceBaseUnits);

  return [
    {
      label: 'Tool is allowed',
      passed: policy.allowedToolIds.includes(plan.toolId),
      detail: policy.allowedToolIds.includes(plan.toolId) ? `${tool.name} is on the allowlist.` : `${tool.name} is not on the allowlist.`
    },
    {
      label: 'Single-call cap',
      passed: cost <= BigInt(policy.maxSingleToolSpendBaseUnits),
      detail: `${formatUnits(cost)} <= ${formatUnits(policy.maxSingleToolSpendBaseUnits)} mock USDC.`
    },
    {
      label: 'Allowance is active',
      passed: allowance?.status === 'active',
      detail: allowance?.status === 'active' ? 'Delegation is active.' : `Delegation status is ${allowance?.status ?? 'missing'}.`
    },
    {
      label: 'Budget remaining is sufficient',
      passed: remaining >= cost,
      detail: `${formatUnits(remaining)} remaining; ${formatUnits(cost)} requested.`
    },
    {
      label: 'Allowance has not expired',
      passed: allowance ? Date.parse(allowance.expiresAt) > Date.now() : false,
      detail: allowance ? `Expires at ${allowance.expiresAt}.` : 'No allowance found.'
    }
  ];
}

export function policyPassed(checks: PolicyCheck[]): boolean {
  return checks.every((check) => check.passed);
}

export function emptyTask(prompt: string, tools: PaidTool[], policy: AgentPolicy): AgentTask {
  return {
    id: createId('task'),
    prompt,
    status: 'running',
    plan: planToolCalls(prompt, tools, policy),
    toolCalls: [],
    createdAt: new Date().toISOString()
  };
}

export function createToolCall(params: {
  plan: ToolCallPlan;
  tool: PaidTool;
  checks: PolicyCheck[];
}): AgentToolCall {
  return {
    id: createId('call'),
    toolId: params.tool.id,
    toolName: params.tool.name,
    reason: params.plan.reason,
    status: policyPassed(params.checks) ? 'policy-approved' : 'blocked',
    costBaseUnits: params.tool.priceBaseUnits,
    policyChecks: params.checks,
    createdAt: new Date().toISOString()
  };
}

export function buildAgentReport(params: {
  task: AgentTask;
  allowance?: FixedDelegation;
}): AgentReport {
  const paidCalls = params.task.toolCalls.filter((call) => call.receipt?.status === 'confirmed');
  const spent = paidCalls.reduce((sum, call) => sum + BigInt(call.costBaseUnits), 0n);
  const sources = paidCalls.map((call) => call.toolName);

  const recommendations = [
    'Start downtown with a flexible work block near transit so the visitor can settle in without burning time.',
    'Use the builder event as the anchor of the day; it gives the trip a real Superteam Canada/community touchpoint.',
    'Keep the paid-data spend below half the allowance and preserve the remaining budget for follow-up tool calls.',
    'Revoke the allowance after the task is complete if the agent should not continue buying data.'
  ];

  return {
    title: 'Toronto builder day plan',
    summary: `MapleAgent purchased ${sources.length} tool${sources.length === 1 ? '' : 's'} and spent ${formatUnits(spent)} mock USDC to produce a bounded itinerary recommendation.`,
    totalSpentBaseUnits: spent.toString(),
    remainingBudgetBaseUnits: params.allowance?.remainingBaseUnits ?? '0',
    recommendations,
    sourcesPurchased: sources
  };
}
