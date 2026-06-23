# Threat Model

MapleAgent demonstrates a constrained-spending model for AI agents.

## Assets

- User token balance.
- Fixed delegation/allowance record.
- Agent delegate key.
- Merchant token accounts.
- Receipts and event log.

## Trust assumptions in demo mode

The local ledger is deterministic and file-backed. It is not a blockchain. It exists to make the full demo runnable without deploying infrastructure.

## Production assumptions

In a production Solana implementation:

- The user signs creation and revocation transactions.
- The delegate signs transfer transactions.
- The program enforces remaining allowance, expiry, and delegation validity.
- The app reads onchain state and events.

## Important safety properties

### No wallet custody

The agent does not receive the user’s private key.

### Spend cap

The agent can only spend up to the approved fixed amount.

### Expiry

The allowance naturally closes its useful window after the expiry timestamp.

### Revocation

The user can revoke the delegation and block future spends.

### Auditable action trail

Each delegated spend creates a receipt that can be indexed and displayed.

## Demo failure states

The app intentionally shows failures:

- Overspend attempt.
- Spend after revoke.
- Spend after expiry.
- Disallowed tool.

These are not bugs; they are the safety model.
