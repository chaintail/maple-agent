#!/bin/bash
# Run the three MapleAgent backend services for the live demo.
set -u
cd /home/claude/code/maple-agent
export PORT=3001
export TOOL_MARKET_PORT=3002
export INDEXER_PORT=3003
export TOOL_MARKET_URL=http://localhost:3002
export INDEXER_URL=http://localhost:3003
TSX=node_modules/.bin/tsx
echo "[maple] starting tool-market (3002)…"
$TSX apps/tool-market/src/server.ts >/tmp/maple-tool-market.log 2>&1 &
echo "[maple] starting indexer (3003)…"
$TSX apps/indexer/src/server.ts   >/tmp/maple-indexer.log 2>&1 &
echo "[maple] starting agent-api (3001)…"
$TSX apps/agent-api/src/server.ts >/tmp/maple-agent-api.log 2>&1 &
wait
