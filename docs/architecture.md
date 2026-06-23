# Architecture

MapleAgent has four runtime pieces and four shared packages.

```txt
User Wallet/UI
    │
    │ create allowance / run task / revoke
    ▼
Agent API ──────────────► Agent Core
    │                         │
    │ transferFixed           │ deterministic plan + policy checks
    ▼                         │
Solana Allowance Provider ◄───┘
    │
    │ writes receipts/events
    ▼
File-backed Demo State ◄──── Indexer
    ▲
    │ quote/data
Tool Market
```

## Runtime apps

### `apps/web`

The main demo surface. It focuses on the live story: create budget, run agent, watch spending, inspect receipts, revoke, and show a blocked spend.

### `apps/agent-api`

Owns the agent delegate identity in local demo mode. It performs policy checks and executes delegated spends through the allowance provider.

### `apps/tool-market`

Serves Canadian-themed paid data tools. The agent obtains a quote, pays the merchant, then requests data with the receipt transaction signature.

### `apps/indexer`

Polls the file-backed event stream and updates an indexer status object. In a production implementation, this becomes the RPC/event indexing layer for onchain events.

## Shared packages

### `packages/solana`

Defines the `AllowanceProvider` interface and implements a deterministic local ledger. The app-level shape mirrors the Solana fixed delegation flow:

1. Create or find subscription authority.
2. Create a fixed delegation.
3. Delegatee transfers from delegation.
4. User revokes delegation.
5. Indexer reads events and receipts.

### `packages/agent-core`

Deterministic planner, policy engine, tool registry, and report builder. It is intentionally deterministic so the demo is reliable.

### `packages/db`

A small JSON state store. It keeps local demo state in `.maple-agent/state.json` by default.

### `packages/types`

Shared domain types for allowances, tools, receipts, tasks, and events.

## Production adapter path

The clean production path is to keep the app and agent APIs unchanged and swap the provider in `packages/solana`:

```txt
LocalLedgerAllowanceProvider  →  SubscriptionsSdkAllowanceProvider
```

The production provider should call the official `@solana/subscriptions` client methods for subscription authority creation, fixed delegation creation, delegated transfer, revocation, and queries.
