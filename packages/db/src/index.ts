import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { DemoState } from '@maple-agent/types';

export function findRepoRoot(start = process.cwd()): string {
  let current = start;
  while (current !== path.dirname(current)) {
    const pkg = path.join(current, 'package.json');
    if (existsSync(pkg)) {
      try {
        const parsed = JSON.parse(readFileSync(pkg, 'utf8')) as { name?: string; workspaces?: unknown };
        if (parsed.name === 'maple-agent' || parsed.workspaces) return current;
      } catch {
        // keep walking
      }
    }
    current = path.dirname(current);
  }
  return process.cwd();
}

export function getStatePath(): string {
  if (process.env.MAPLE_AGENT_STATE_PATH) {
    return process.env.MAPLE_AGENT_STATE_PATH;
  }

  const root = findRepoRoot();
  if (root && root !== os.homedir()) {
    return path.join(root, '.maple-agent', 'state.json');
  }

  return path.join(os.tmpdir(), 'maple-agent-state.json');
}

export function ensureStateDir(filePath = getStatePath()): void {
  mkdirSync(path.dirname(filePath), { recursive: true });
}

export function readState(): DemoState | undefined {
  const filePath = getStatePath();
  if (!existsSync(filePath)) return undefined;
  return JSON.parse(readFileSync(filePath, 'utf8')) as DemoState;
}

export function writeState(state: DemoState): DemoState {
  const filePath = getStatePath();
  ensureStateDir(filePath);
  writeFileSync(filePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  return state;
}

export function updateState(mutator: (state: DemoState) => DemoState): DemoState {
  const state = readState();
  if (!state) {
    throw new Error(`MapleAgent demo state is missing. Run npm run demo:setup first.`);
  }
  return writeState(mutator(state));
}

export function resetState(): void {
  const filePath = getStatePath();
  ensureStateDir(filePath);
  writeFileSync(filePath, '', 'utf8');
}
