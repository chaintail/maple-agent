import { useEffect, useMemo, useState } from 'react';
import { createAllowance, getSnapshot, revokeAllowance, runAgentTask, setupDemo, testSpendAfterRevoke } from './api';
import { formatTime, formatUnits, shortAddress, timeLeft } from './format';
import type { AgentTask, AgentToolCall, AllowanceSnapshot, FixedDelegation, PaidTool, SpendReceipt } from '@maple-agent/types';

const DEFAULT_PROMPT = 'Plan a low-cost Saturday in Toronto for a visiting Solana builder from Vancouver.';

type View = 'mission' | 'receipts' | 'architecture';

export function App() {
  const [view, setView] = useState<View>('mission');
  const [snapshot, setSnapshot] = useState<AllowanceSnapshot>();
  const [task, setTask] = useState<AgentTask>();
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [budget, setBudget] = useState('10');
  const [hours, setHours] = useState(24);
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<string>();
  const [blockedMessage, setBlockedMessage] = useState<string>();

  async function refresh() {
    const next = await getSnapshot();
    setSnapshot(next);
  }

  useEffect(() => {
    refresh().catch(async () => {
      try {
        const boot = await setupDemo();
        setSnapshot(boot.snapshot);
      } catch {
        setError('Start the Agent API with npm run dev, or open preview/maple-agent-preview.html for a static visual preview.');
      }
    });
  }, []);

  async function withBusy(label: string, action: () => Promise<void>) {
    setBusy(label);
    setError(undefined);
    setBlockedMessage(undefined);
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(undefined);
    }
  }

  const allowance = snapshot?.allowance;
  const hasActiveAllowance = allowance?.status === 'active';

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <span className="brand-mark">M</span>
          <div>
            <strong>MapleAgent</strong>
            <span>Budget-capped agent spending on Solana</span>
          </div>
        </div>
        <nav className="nav-tabs" aria-label="Primary">
          <button className={view === 'mission' ? 'active' : ''} onClick={() => setView('mission')}>Mission control</button>
          <button className={view === 'receipts' ? 'active' : ''} onClick={() => setView('receipts')}>Receipts</button>
          <button className={view === 'architecture' ? 'active' : ''} onClick={() => setView('architecture')}>How it works</button>
        </nav>
        <div className="wallet-chip">
          <span className="status-dot" />
          {shortAddress(snapshot?.userWallet.address)}
        </div>
      </header>

      <section className="hero-line">
        <div>
          <p className="eyebrow">Superteam Canada demo</p>
          <h1>Give AI agents a budget, not your wallet.</h1>
        </div>
        <p className="hero-copy">
          Create a capped allowance, let MapleAgent buy paid Canadian tools, watch receipts index live, and revoke access whenever the job is done.
        </p>
      </section>

      {error ? <div className="system-message error">{error}</div> : null}
      {blockedMessage ? <div className="system-message blocked">Spend blocked: {blockedMessage}</div> : null}

      {view === 'mission' && (
        <MissionControl
          snapshot={snapshot}
          task={task}
          prompt={prompt}
          setPrompt={setPrompt}
          budget={budget}
          setBudget={setBudget}
          hours={hours}
          setHours={setHours}
          busy={busy}
          hasActiveAllowance={hasActiveAllowance}
          onSetup={() => withBusy('Resetting demo', async () => setSnapshot((await setupDemo()).snapshot))}
          onCreateAllowance={() => withBusy('Creating allowance', async () => setSnapshot((await createAllowance(budget, hours)).snapshot))}
          onRunAgent={() => withBusy('Running agent', async () => {
            const result = await runAgentTask(prompt);
            setTask(result.task);
            setSnapshot(result.snapshot);
          })}
          onRevoke={() => withBusy('Revoking allowance', async () => setSnapshot((await revokeAllowance(allowance?.delegationPda)).snapshot))}
          onTestBlocked={() => withBusy('Testing blocked spend', async () => {
            const result = await testSpendAfterRevoke();
            setSnapshot(result.snapshot);
            setBlockedMessage(result.result.message);
          })}
        />
      )}

      {view === 'receipts' && <ReceiptsView snapshot={snapshot} />}
      {view === 'architecture' && <ArchitectureView snapshot={snapshot} />}
    </main>
  );
}

function MissionControl(props: {
  snapshot?: AllowanceSnapshot;
  task?: AgentTask;
  prompt: string;
  setPrompt: (value: string) => void;
  budget: string;
  setBudget: (value: string) => void;
  hours: number;
  setHours: (value: number) => void;
  busy?: string;
  hasActiveAllowance: boolean;
  onSetup: () => void;
  onCreateAllowance: () => void;
  onRunAgent: () => void;
  onRevoke: () => void;
  onTestBlocked: () => void;
}) {
  return (
    <div className="mission-grid">
      <section className="workspace-panel">
        <div className="section-heading">
          <p className="eyebrow">Current task</p>
          <h2>Agent run console</h2>
        </div>
        <label className="prompt-box">
          <span>Task prompt</span>
          <textarea value={props.prompt} onChange={(event) => props.setPrompt(event.target.value)} />
        </label>
        <div className="action-row">
          <button className="primary-button" onClick={props.onRunAgent} disabled={!props.hasActiveAllowance || Boolean(props.busy)}>
            {props.busy === 'Running agent' ? 'Running…' : 'Run MapleAgent'}
          </button>
          <button className="plain-button" onClick={props.onSetup} disabled={Boolean(props.busy)}>Reset demo</button>
        </div>
        <AgentTimeline task={props.task} />
        <AgentReport task={props.task} />
      </section>

      <aside className="control-rail">
        <BudgetPanel allowance={props.snapshot?.allowance} busy={props.busy} />
        <section className="rail-section">
          <div className="section-heading compact">
            <p className="eyebrow">Create budget</p>
            <h2>Allowance</h2>
          </div>
          <div className="form-row two-col">
            <label>
              <span>Budget</span>
              <input value={props.budget} onChange={(event) => props.setBudget(event.target.value)} />
            </label>
            <label>
              <span>Hours</span>
              <input type="number" value={props.hours} onChange={(event) => props.setHours(Number(event.target.value))} />
            </label>
          </div>
          <button className="secondary-button full" onClick={props.onCreateAllowance} disabled={Boolean(props.busy)}>
            {props.busy === 'Creating allowance' ? 'Creating…' : 'Create agent budget'}
          </button>
        </section>
        <PolicyGuardrails allowance={props.snapshot?.allowance} />
        <section className="rail-section danger-zone">
          <div>
            <p className="eyebrow">Control</p>
            <h2>Revoke and prove safety</h2>
          </div>
          <button className="danger-button full" onClick={props.onRevoke} disabled={!props.snapshot?.allowance || props.snapshot.allowance.status === 'revoked' || Boolean(props.busy)}>
            Revoke allowance
          </button>
          <button className="plain-button full" onClick={props.onTestBlocked} disabled={!props.snapshot?.allowance || Boolean(props.busy)}>
            Test spend after revoke
          </button>
        </section>
      </aside>

      <section className="full-width-panel">
        <div className="section-heading inline">
          <div>
            <p className="eyebrow">Paid tools</p>
            <h2>Canadian tool market</h2>
          </div>
          <span>{props.snapshot?.tools.length ?? 0} tools available</span>
        </div>
        <ToolMarket tools={props.snapshot?.tools ?? []} task={props.task} />
      </section>

      <section className="full-width-panel">
        <div className="section-heading inline">
          <div>
            <p className="eyebrow">Onchain proof</p>
            <h2>Recent receipts</h2>
          </div>
          <IndexerStatus snapshot={props.snapshot} />
        </div>
        <ReceiptRows receipts={props.snapshot?.receipts.slice(0, 4) ?? []} />
      </section>
    </div>
  );
}

function BudgetPanel({ allowance, busy }: { allowance?: FixedDelegation; busy?: string }) {
  const total = allowance ? BigInt(allowance.allowanceBaseUnits) : 0n;
  const remaining = allowance ? BigInt(allowance.remainingBaseUnits) : 0n;
  const spent = allowance ? BigInt(allowance.spentBaseUnits) : 0n;
  const ratio = total > 0n ? Number((remaining * 10_000n) / total) / 100 : 0;
  const status = allowance?.status ?? 'missing';

  return (
    <section className={`budget-panel status-${status}`}>
      <div className="section-heading compact">
        <p className="eyebrow">Agent budget</p>
        <h2>{allowance ? `${formatUnits(remaining)} mock USDC` : 'No allowance'}</h2>
      </div>
      <div className="meter" aria-label="Allowance remaining">
        <div style={{ width: `${Math.max(0, Math.min(100, ratio))}%` }} />
      </div>
      <div className="budget-stats">
        <div><span>Granted</span><strong>{formatUnits(total)} </strong></div>
        <div><span>Spent</span><strong>{formatUnits(spent)} </strong></div>
        <div><span>Remaining</span><strong>{formatUnits(remaining)} </strong></div>
      </div>
      <div className="budget-meta">
        <span className={`state-pill ${status}`}>{busy ?? status}</span>
        <span>Expires {allowance ? timeLeft(allowance.expiresAt) : '—'}</span>
      </div>
      {allowance ? (
        <details className="technical-details">
          <summary>Technical details</summary>
          <dl>
            <dt>Delegation PDA</dt><dd>{shortAddress(allowance.delegationPda)}</dd>
            <dt>Authority</dt><dd>{shortAddress(allowance.subscriptionAuthority)}</dd>
            <dt>Agent</dt><dd>{shortAddress(allowance.delegateWallet)}</dd>
          </dl>
        </details>
      ) : null}
    </section>
  );
}

function PolicyGuardrails({ allowance }: { allowance?: FixedDelegation }) {
  const rows = [
    ['Max total spend', allowance ? `${formatUnits(allowance.allowanceBaseUnits)} mock USDC` : 'Set by user'],
    ['Expiry', allowance ? formatTime(allowance.expiresAt) : '24h default'],
    ['Agent custody', 'Never receives user key'],
    ['Revocation', 'User can stop agent anytime'],
    ['Overspend', 'Blocked by remaining allowance']
  ];

  return (
    <section className="rail-section">
      <div className="section-heading compact">
        <p className="eyebrow">Policy</p>
        <h2>Guardrails</h2>
      </div>
      <div className="simple-list">
        {rows.map(([label, value]) => (
          <div className="list-row" key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}

function AgentTimeline({ task }: { task?: AgentTask }) {
  const items = useMemo(() => {
    if (!task) {
      return [
        { status: 'idle', title: 'Create an allowance', detail: 'The user sets a capped budget for MapleAgent.' },
        { status: 'idle', title: 'Run the agent', detail: 'The agent plans tool calls and checks policy before every spend.' },
        { status: 'idle', title: 'Receipts appear', detail: 'Each confirmed tool payment is indexed for auditability.' }
      ];
    }

    const start = [{ status: 'done', title: 'Task received', detail: task.prompt }];
    const calls = task.toolCalls.map((call) => ({
      status: call.status === 'confirmed' ? 'done' : call.status === 'blocked' || call.status === 'failed' ? 'blocked' : 'pending',
      title: `${call.toolName} · ${formatUnits(call.costBaseUnits)} mock USDC`,
      detail: call.failureReason ?? call.reason
    }));
    const end = task.finalReport ? [{ status: 'done', title: 'Final report generated', detail: task.finalReport.summary }] : [];
    return [...start, ...calls, ...end];
  }, [task]);

  return (
    <div className="timeline">
      {items.map((item, index) => (
        <div className={`timeline-item ${item.status}`} key={`${item.title}-${index}`}>
          <span className="timeline-dot" />
          <div>
            <strong>{item.title}</strong>
            <p>{item.detail}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function AgentReport({ task }: { task?: AgentTask }) {
  if (!task?.finalReport) return null;
  return (
    <section className="report-block">
      <p className="eyebrow">Agent report</p>
      <h2>{task.finalReport.title}</h2>
      <p>{task.finalReport.summary}</p>
      <ol className="recommendations">
        {task.finalReport.recommendations.map((item) => <li key={item}>{item}</li>)}
      </ol>
      <div className="report-footnote">
        {task.finalReport.sourcesPurchased.length} sources purchased · {formatUnits(task.finalReport.totalSpentBaseUnits)} mock USDC spent · {formatUnits(task.finalReport.remainingBudgetBaseUnits)} remaining
      </div>
    </section>
  );
}

function ToolMarket({ tools, task }: { tools: PaidTool[]; task?: AgentTask }) {
  const used = new Map((task?.toolCalls ?? []).map((call) => [call.toolId, call]));
  return (
    <div className="tool-grid">
      {tools.map((tool) => {
        const call = used.get(tool.id);
        return (
          <div className="tool-row" key={tool.id}>
            <div>
              <strong>{tool.name}</strong>
              <p>{tool.description}</p>
            </div>
            <span>{tool.category}</span>
            <span>{formatUnits(tool.priceBaseUnits)} USDC</span>
            <span className={`state-pill ${call?.status ?? 'unused'}`}>{call?.status ?? 'unused'}</span>
          </div>
        );
      })}
    </div>
  );
}

function ReceiptsView({ snapshot }: { snapshot?: AllowanceSnapshot }) {
  return (
    <section className="wide-panel">
      <div className="section-heading inline">
        <div>
          <p className="eyebrow">Receipt ledger</p>
          <h2>Delegated transfers</h2>
        </div>
        <IndexerStatus snapshot={snapshot} />
      </div>
      <ReceiptRows receipts={snapshot?.receipts ?? []} expanded />
    </section>
  );
}

function ReceiptRows({ receipts, expanded = false }: { receipts: SpendReceipt[]; expanded?: boolean }) {
  if (!receipts.length) {
    return <div className="empty-state">No receipts yet. Run MapleAgent after creating an allowance.</div>;
  }

  return (
    <div className="receipt-list">
      {receipts.map((receipt) => (
        <details className="receipt-row" key={receipt.id} open={expanded}>
          <summary>
            <span>{receipt.toolName}</span>
            <strong>{formatUnits(receipt.amountBaseUnits)} mock USDC</strong>
            <span>{receipt.status}</span>
            <code>{shortAddress(receipt.signature)}</code>
          </summary>
          <dl>
            <dt>Paid by delegate</dt><dd>{shortAddress(receipt.delegateWallet)}</dd>
            <dt>From user</dt><dd>{shortAddress(receipt.payerWallet)}</dd>
            <dt>Merchant</dt><dd>{shortAddress(receipt.merchantWallet)}</dd>
            <dt>Delegation</dt><dd>{shortAddress(receipt.delegationPda)}</dd>
            <dt>Created</dt><dd>{formatTime(receipt.createdAt)}</dd>
          </dl>
        </details>
      ))}
    </div>
  );
}

function IndexerStatus({ snapshot }: { snapshot?: AllowanceSnapshot }) {
  return (
    <span className="indexer-status">
      <span className="status-dot" />
      {snapshot?.indexer.receiptsIndexed ?? 0} receipts indexed · {snapshot?.indexer.lastSyncAt ? formatTime(snapshot.indexer.lastSyncAt) : 'waiting'}
    </span>
  );
}

function ArchitectureView({ snapshot }: { snapshot?: AllowanceSnapshot }) {
  return (
    <section className="wide-panel architecture">
      <div className="section-heading">
        <p className="eyebrow">How it works</p>
        <h2>User budget → agent delegate → paid tools → receipts</h2>
      </div>
      <div className="flow-line" aria-label="Architecture flow">
        <FlowNode label="User wallet" detail={shortAddress(snapshot?.userWallet.address)} />
        <FlowArrow text="fixed allowance" />
        <FlowNode label="MapleAgent" detail={shortAddress(snapshot?.agentWallet.address)} />
        <FlowArrow text="delegated payments" />
        <FlowNode label="Paid tools" detail="Canadian APIs" />
        <FlowArrow text="events" />
        <FlowNode label="Indexer" detail="receipts synced" />
      </div>
      <div className="architecture-copy">
        <p>
          The user signs setup and revoke. MapleAgent signs tool payments as the delegate. Each payment is checked against the fixed allowance before funds move.
        </p>
        <p>
          The production adapter can swap the local ledger for the official Solana Subscriptions SDK while keeping this UI and agent flow unchanged.
        </p>
      </div>
    </section>
  );
}

function FlowNode({ label, detail }: { label: string; detail: string }) {
  return (
    <div className="flow-node">
      <strong>{label}</strong>
      <span>{detail}</span>
    </div>
  );
}

function FlowArrow({ text }: { text: string }) {
  return <div className="flow-arrow"><span>{text}</span></div>;
}
