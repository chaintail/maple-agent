# Solana Subscriptions SDK Devnet Mode

MapleAgent defaults to the deterministic local ledger. Use this flow only when you want the real `@solana/subscriptions` devnet adapter.

## Setup

1. Copy env values as needed:

```sh
SOLANA_ALLOWANCE_MODE=sdk
SOLANA_RPC_URL=https://api.devnet.solana.com
SOLANA_RPC_WS_URL=wss://api.devnet.solana.com
SOLANA_CLUSTER=devnet
SOLANA_DEVNET_CONFIG_PATH=.maple-agent-devnet/config.json
```

2. Create devnet keys, a plain SPL token mint, ATAs, and user test-token funding:

```sh
npm run devnet:setup
```

The script writes keypairs and config under `.maple-agent-devnet/`, which is gitignored. Never commit those files.

If devnet airdrop is rate-limited, fund the printed delegator address manually, then rerun:

```sh
npm run devnet:setup
```

3. Run the SDK smoke:

```sh
npm run devnet:smoke
```

The smoke performs:

```text
create fixed delegation -> transfer fixed -> revoke -> verify post-revoke spend is blocked
```

## Notes

- The on-chain program is `De1egAFMkMWZSN5rYXRj9CAdheBamobVNubTsi9avR44`.
- Amounts are token base units. The setup mint uses 6 decimals to match mock USDC.
- The SDK path uses a plain SPL Token mint via `TOKEN_PROGRAM_ADDRESS`; it does not create Token-2022 mints.
- Do not start the Express demo servers for this smoke. It is CLI-only.
- Mock mode remains the default with `SOLANA_ALLOWANCE_MODE=mock` or when the variable is unset.

## Verified devnet run (2026-06-23)

The full lifecycle was executed on Solana **devnet** against the deployed program
`De1egAFMkMWZSN5rYXRj9CAdheBamobVNubTsi9avR44`. Real, on-chain, explorer-verifiable:

| Step | Result | Transaction |
|---|---|---|
| Create fixed delegation | ✅ | [`Q4whpUGX…LC36`](https://explorer.solana.com/tx/Q4whpUGX3e4i1HqsUzSHbL38KV9675wTp6NjbDUjLdkpbw5Rk8mvaLKZFwDxjy2a2xFjTs5NifC4WHh1kRNLC36?cluster=devnet) |
| Agent spend (transfer to MapleWeather) | ✅ | [`3iXVKEu6…cVzqF`](https://explorer.solana.com/tx/3iXVKEu6wv4m93c5XCb5ErZKtGfDYZ9bTsybqv437uSgrZAhnYZAUZKSNWfX6SYbcUcmizQTAYYS98UD8A7cVzqF?cluster=devnet) |
| Revoke delegation | ✅ | [`2EWc5718…CuTbM`](https://explorer.solana.com/tx/2EWc5718mevZsLWbpVK7uFP3Tm6JJgktUjG9kd7qfcy7zJQoTDA2MGyRtEYdjPspYWasD9vyhwEsr34TwsjCuTbM?cluster=devnet) |
| Post-revoke spend | 🔴 **Blocked by the program** | Transfer rejected on-chain with `Invalid account owner` — the revoked delegation account is closed, so the program itself refuses the pull. Not an app-side check. |

Supporting accounts: SPL mint `E9LDvBuh42FNHZLRuaYMe1hJNqoXioStMFcpU4YhNyRs`, delegation PDA
`HS3NbS7YBJpxs7mRkLjgoQycXRsyVQDEuaqvwuW5woYA`, delegator `Jv15vvGUJMRivQYtdAPhikgeozAbVCVwXboSj4G1Xom`.

This is the core thesis proven on-chain: a capped allowance the agent can spend within, and a revocation the **program** enforces.
