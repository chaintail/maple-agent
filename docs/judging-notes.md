# Judging Notes

## Originality

MapleAgent applies fixed token allowances to AI agent commerce. The user grants a capped, expiring budget; the agent autonomously buys data/tools; the UI makes every spend visible and revocable.

## Code quality

The code is split into explicit apps and packages:

- UI
- Agent API
- Tool market
- Indexer
- Solana allowance provider
- Agent planning and policy
- Shared types
- File-backed demo state

## Usefulness

This pattern is practical for paid APIs, data sources, model calls, research tasks, procurement, and any AI workflow where a human wants bounded autonomy.

## Execution

The local demo supports:

- Create allowance.
- Spend from allowance.
- Receipt creation.
- Remaining budget updates.
- Indexer status.
- Revocation.
- Blocked post-revoke spend.

## Community interest

The project is easy to understand and easy to share: “Give AI agents a budget, not your wallet.”

## Canadian context

The tool marketplace uses Canadian data/service themes: Toronto events, VIA planning, MapleWeather, Vancouver transit, HockeyPulse, and CanadaTaxSnippet.
