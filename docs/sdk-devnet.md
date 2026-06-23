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
