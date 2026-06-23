import cors from 'cors';
import express from 'express';
import { ensureState, formatUnits, getToolData } from '@maple-agent/solana';
import type { SpendReceipt, ToolId } from '@maple-agent/types';

const app = express();
const port = Number(process.env.TOOL_MARKET_PORT ?? 3002);

app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'tool-market' });
});

app.get('/tools', (_req, res) => {
  const state = ensureState();
  res.json({ tools: state.tools });
});

app.get('/tools/:toolId/quote', (req, res) => {
  const state = ensureState();
  const tool = state.tools.find((candidate) => candidate.id === req.params.toolId);
  if (!tool) {
    res.status(404).json({ error: 'Tool not found' });
    return;
  }

  res.json({
    quote: {
      toolId: tool.id,
      toolName: tool.name,
      merchantWallet: tool.merchantWallet,
      amountBaseUnits: tool.priceBaseUnits,
      humanAmount: formatUnits(tool.priceBaseUnits),
      expiresAt: new Date(Date.now() + 60_000).toISOString()
    }
  });
});

app.post('/tools/:toolId/data', (req, res) => {
  const state = ensureState();
  const toolId = req.params.toolId as ToolId;
  const tool = state.tools.find((candidate) => candidate.id === toolId);
  if (!tool) {
    res.status(404).json({ error: 'Tool not found' });
    return;
  }

  const { signature } = req.body as { signature?: string };
  const receipt = state.receipts.find((candidate: SpendReceipt) => candidate.signature === signature && candidate.toolId === toolId);
  if (!receipt) {
    res.status(402).json({ error: 'Payment receipt not found for this tool call.' });
    return;
  }

  res.json({
    tool: {
      id: tool.id,
      name: tool.name,
      category: tool.category
    },
    paid: true,
    receipt,
    data: getToolData(tool)
  });
});

app.listen(port, () => {
  console.log(`[tool-market] listening on http://localhost:${port}`);
});
