# Demo Script

## 90-second video

**0:00 — Intro**

“This is MapleAgent: give AI agents a budget, not your wallet.”

**0:10 — Create allowance**

Connect the demo wallet and create a 10 mock USDC budget for 24 hours.

**0:25 — Run task**

Run: “Plan a low-cost Saturday in Toronto for a visiting Solana builder.”

**0:40 — Autonomous spending**

Show the agent buying Canadian mock APIs. The user is not signing every tool call. The agent spends as delegate.

**0:55 — Receipts and indexer**

Show receipt rows, transaction-like signatures, remaining budget, and indexer status.

**1:10 — Revoke**

Click revoke. The allowance changes to revoked.

**1:20 — Blocked spend**

Click “Test spend after revoke.” Show the failure state.

**1:30 — Close**

“MapleAgent demonstrates bounded autonomous agent spending using Solana Native Allowances.”

## CLI fallback

```bash
npm run demo:reset
npm run demo:setup
npm run demo:run
npm run demo:revoke
npm run demo:try-spend-after-revoke
```
