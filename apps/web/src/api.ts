import type { AgentTask, AllowanceSnapshot } from '@maple-agent/types';

const API_BASE = import.meta.env.VITE_AGENT_API_URL ?? 'http://localhost:3001';

export async function setupDemo(): Promise<{ snapshot: AllowanceSnapshot }> {
  return request('/demo/setup', { method: 'POST' });
}

export async function getSnapshot(): Promise<AllowanceSnapshot> {
  return request('/snapshot');
}

export async function createAllowance(amount: string, hours: number): Promise<{ snapshot: AllowanceSnapshot }> {
  return request('/allowance/create', {
    method: 'POST',
    body: JSON.stringify({ amount, hours })
  });
}

export async function runAgentTask(prompt: string): Promise<{ task: AgentTask; snapshot: AllowanceSnapshot }> {
  return request('/agent/run-task', {
    method: 'POST',
    body: JSON.stringify({ prompt })
  });
}

export async function revokeAllowance(delegationPda?: string): Promise<{ snapshot: AllowanceSnapshot }> {
  return request('/allowance/revoke', {
    method: 'POST',
    body: JSON.stringify({ delegationPda })
  });
}

export async function testSpendAfterRevoke(): Promise<{ result: { ok: boolean; message: string }; snapshot: AllowanceSnapshot }> {
  return request('/agent/test-spend-after-revoke', { method: 'POST' }, true);
}

async function request<T>(path: string, init: RequestInit = {}, allowErrorPayload = false): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(init.headers ?? {})
    }
  });

  const payload = (await response.json().catch(() => ({}))) as T & { error?: string; human?: string };
  if (!response.ok && !allowErrorPayload) {
    throw new Error(payload.human ?? payload.error ?? `Request failed: ${response.status}`);
  }
  return payload;
}
