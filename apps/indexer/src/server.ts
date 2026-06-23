import cors from 'cors';
import express from 'express';
import { markIndexerSync } from '@maple-agent/solana';

const app = express();
const port = Number(process.env.INDEXER_PORT ?? 3003);

app.use(cors());
app.use(express.json());

function sync() {
  return markIndexerSync().indexer;
}

setInterval(() => {
  try {
    sync();
  } catch {
    // State may not exist yet. The setup script/API creates it.
  }
}, 2_500);

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'indexer' });
});

app.post('/sync', (_req, res) => {
  res.json({ indexer: sync() });
});

app.get('/status', (_req, res) => {
  res.json({ indexer: sync() });
});

app.listen(port, () => {
  console.log(`[indexer] listening on http://localhost:${port}`);
});
