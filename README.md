# MapleAgent

**Give AI agents a budget, not your wallet.**

MapleAgent is a Superteam Canada hackathon/demo project showing how an AI agent can spend safely with a capped, expiring allowance. A user creates a budget for the agent, the agent pays Canadian-themed paid tools, the UI indexes receipts, and the user can revoke the budget at any time.

The included implementation has a deterministic local ledger so the full UX can run without external infrastructure. The code is organized around the same concepts used by Solana Native Subscriptions and Allowances: Subscription Authority, Fixed Delegation, delegated transfers, receipts, expiry, and revocation.

## What the demo shows

1. User creates a `10.00 mock USDC` allowance for MapleAgent.
2. MapleAgent receives a task such as: “Plan a low-cost Saturday in Toronto for a visiting Solana builder.”
3. The agent selects paid tools like MapleWeather, TorontoEvents, VIAPlanner, and MapleHotels.
4. Each tool call triggers a delegated transfer from the user budget.
5. Receipts are indexed and shown in the UI.
6. The user revokes the allowance.
7. A post-revoke spend attempt fails.

## Why this maps to Solana Native Allowances

Solana’s Subscriptions Delegation Program lets a user authorize future token transfers with clear limits. In the fixed delegation model, a user pre-authorizes a delegate to pull up to a fixed total amount, optionally until expiry. The delegate signs each transfer, and the program checks remaining allowance before moving funds.

MapleAgent demonstrates that interaction pattern for agentic commerce:

- **User control:** the user sets the cap and expiry.
- **Agent autonomy:** the agent can spend without asking the user to sign each tool call.
- **Bounded risk:** the agent cannot exceed the allowance.
- **Revocability:** the user can stop the agent immediately.
- **Auditability:** every spend produces a receipt.

## Monorepo layout

```txt
maple-agent/
├─ apps/
│  ├─ web/           Clean Vite/React demo UI
│  ├─ agent-api/     Agent runner + allowance endpoints
│  ├─ tool-market/   Canadian-themed paid tool API
│  └─ indexer/       Lightweight event/receipt sync service
├─ packages/
│  ├─ agent-core/    Deterministic planner, policy checks, final report
│  ├─ db/            File-backed demo state store
│  ├─ solana/        Allowance provider interface + local ledger
│  └─ types/         Shared domain types
├─ scripts/          CLI demo scripts
├─ docs/             Architecture, threat model, UI guidelines, demo script
└─ preview/          Static visual preview you can open without installing deps
```

## Quick start

```bash
npm install
cp .env.example .env
npm run demo:setup
npm run dev
```

Then open:

```txt
http://localhost:5173
```

The API services default to:

```txt
Agent API:   http://localhost:3001
Tool Market: http://localhost:3002
Indexer:     http://localhost:3003
```

## CLI-only demo

```bash
npm run demo:reset
npm run demo:setup
npm run demo:run
npm run demo:revoke
npm run demo:try-spend-after-revoke
```

This is useful for judging because it proves the core flow even if a browser demo is not available.

## UI direction

The UI is intentionally restrained:

- Minimal cards.
- No cards inside cards.
- Clear information hierarchy.
- Large budget meter as the hero element.
- Timeline instead of transaction-table overload.
- Receipts and policy checks shown as simple rows and details.
- Only basic button hover affordances.

The demo should be understandable even with the video muted: budget granted → agent spends → receipts appear → budget decreases → user revokes → spend is blocked.

## Demo script

```txt
1. Open MapleAgent.
2. Create a 10 mock USDC allowance for 24 hours.
3. Run the Toronto builder day task.
4. Watch tool calls confirm one by one.
5. Show the receipt ledger and indexer status.
6. Revoke the allowance.
7. Try another spend and show the blocked state.
```

## Real Solana integration notes

The local ledger lives in `packages/solana` and implements the same app-level interface that a production adapter would implement:

```ts
createFixedDelegation(...)
transferFixed(...)
revokeDelegation(...)
getAllowance(...)
listReceipts(...)
```

To wire this to the official SDK, replace the provider implementation with `@solana/subscriptions` calls. The official TypeScript SDK exposes a high-level `SubscriptionsClient` with methods such as `initSubscriptionAuthority`, `createFixedDelegation`, `transferFixed`, `revokeDelegation`, `getDelegationsForWallet`, and `isSubscriptionAuthorityInitialized`.
See `packages/solana/examples/subscriptions-sdk-adapter.example.ts` for a production adapter sketch showing where the official SDK calls fit.


## Canadian context

The paid tools are deliberately Canadian:

- MapleWeather
- TorontoEvents
- VIAPlanner
- VancouverTransit
- MapleHotels
- CanadaTaxSnippet
- HockeyPulse

The default task is built around a visiting Solana builder spending a day in Toronto.

## Security model

MapleAgent is designed to communicate the safety properties of budgeted agent payments:

- The agent never receives the user’s private key.
- The user sets the max spend and expiry.
- Each spend is checked against the remaining allowance.
- Revocation blocks future spends.
- Overspend attempts fail.
- Receipts make agent actions auditable.

See `docs/threat-model.md` for more detail.
