import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  findAssociatedTokenPda,
  fetchMaybeMint,
  getCreateAssociatedTokenIdempotentInstructionAsync,
  getCreateMintInstructionPlan,
  getMintToInstruction,
  TOKEN_PROGRAM_ADDRESS
} from '@solana-program/token';
import {
  address,
  airdropFactory,
  appendTransactionMessageInstructionPlan,
  appendTransactionMessageInstructions,
  createKeyPairSignerFromBytes,
  createSolanaRpc,
  createSolanaRpcSubscriptions,
  createTransactionMessage,
  devnet,
  generateKeyPairSigner,
  getSignatureFromTransaction,
  lamports,
  sendAndConfirmTransactionFactory,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
  writeKeyPairSigner,
  type Address,
  type Instruction,
  type InstructionPlan,
  type KeyPairSigner,
  type TransactionSigner
} from '@solana/kit';
import { parseUnits } from '@maple-agent/agent-core';
import { createTools } from '@maple-agent/solana';
import type { ToolId } from '@maple-agent/types';

const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
const wsUrl = process.env.SOLANA_RPC_WS_URL || toWsUrl(rpcUrl);
const keyDir = process.env.SOLANA_DEVNET_KEYPAIR_DIR || '.maple-agent-devnet';
const configPath = process.env.SOLANA_DEVNET_CONFIG_PATH || path.join(keyDir, 'config.json');
const decimals = 6;

mkdirSync(keyDir, { recursive: true });
mkdirSync(path.dirname(configPath), { recursive: true });

const rpc = createSolanaRpc(devnet(rpcUrl)) as any;
const rpcSubscriptions = createSolanaRpcSubscriptions(devnet(wsUrl));
const sendAndConfirmTransaction = sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions });

const delegator = await loadOrCreateSigner(process.env.SOLANA_DELEGATOR_KEYPAIR_PATH || path.join(keyDir, 'delegator.json'), 'delegator');
const delegatee = await loadOrCreateSigner(process.env.SOLANA_DELEGATEE_KEYPAIR_PATH || path.join(keyDir, 'delegatee.json'), 'delegatee');
const mint = await loadOrCreateSigner(process.env.SOLANA_TEST_MINT_KEYPAIR_PATH || path.join(keyDir, 'mock-usdc-mint.json'), 'mint');
const merchantSigners = Object.fromEntries(
  await Promise.all(
    createTools().map(async (tool) => {
      const signer = await loadOrCreateSigner(path.join(keyDir, `merchant-${tool.id}.json`), `merchant ${tool.id}`);
      return [tool.id, signer] as const;
    })
  )
) as Record<ToolId, KeyPairSigner>;

await maybeAirdrop(delegator.address, 'delegator');

const mintPlan = getCreateMintInstructionPlan({
  payer: delegator,
  newMint: mint,
  decimals,
  mintAuthority: delegator.address,
  freezeAuthority: null
});
const existingMint = await fetchMaybeMint(rpc, mint.address);
if (existingMint.exists) {
  console.log(`SPL mint already exists: ${mint.address}`);
} else {
  await sendPlan(mintPlan, delegator, 'create SPL mint');
}

const owners = [delegator.address, ...Object.values(merchantSigners).map((signer) => signer.address)];
await sendInstructions(
  await Promise.all(
    owners.map((owner) =>
      getCreateAssociatedTokenIdempotentInstructionAsync({
        payer: delegator,
        owner,
        mint: mint.address,
        tokenProgram: TOKEN_PROGRAM_ADDRESS
      })
    )
  ),
  delegator,
  'create ATAs'
);

const [delegatorAta] = await findAssociatedTokenPda({
  owner: delegator.address,
  mint: mint.address,
  tokenProgram: TOKEN_PROGRAM_ADDRESS
});
await sendInstructions(
  [
    getMintToInstruction({
      mint: mint.address,
      token: delegatorAta,
      mintAuthority: delegator,
      amount: parseUnits(process.env.SOLANA_TEST_TOKEN_AMOUNT || '25')
    })
  ],
  delegator,
  'mint test tokens'
);

const merchants = Object.fromEntries(Object.entries(merchantSigners).map(([toolId, signer]) => [toolId, String(signer.address)]));
writeFileSync(
  configPath,
  `${JSON.stringify(
    {
      rpcUrl,
      tokenMint: String(mint.address),
      delegatorKeypairPath: process.env.SOLANA_DELEGATOR_KEYPAIR_PATH || path.join(keyDir, 'delegator.json'),
      delegateeKeypairPath: process.env.SOLANA_DELEGATEE_KEYPAIR_PATH || path.join(keyDir, 'delegatee.json'),
      merchants
    },
    null,
    2
  )}\n`,
  'utf8'
);

console.log('Devnet config written.');
console.log(`Config:     ${configPath}`);
console.log(`RPC:        ${rpcUrl}`);
console.log(`Mint:       ${mint.address}`);
console.log(`Delegator:  ${delegator.address}`);
console.log(`Delegatee:  ${delegatee.address}`);
console.log('\nUse:');
console.log('  SOLANA_ALLOWANCE_MODE=sdk');
console.log(`  SOLANA_DEVNET_CONFIG_PATH=${configPath}`);
console.log(`  SOLANA_TOKEN_MINT=${mint.address}`);

async function loadOrCreateSigner(filePath: string, label: string): Promise<KeyPairSigner> {
  if (existsSync(filePath)) {
    const bytes = new Uint8Array(JSON.parse(readFileSync(filePath, 'utf8')) as number[]);
    return createKeyPairSignerFromBytes(bytes, true);
  }
  const signer = await generateKeyPairSigner(true);
  await writeKeyPairSigner(signer, filePath);
  console.log(`Created ${label} keypair: ${filePath}`);
  return signer;
}

async function maybeAirdrop(recipientAddress: Address, label: string): Promise<void> {
  try {
    const airdrop = airdropFactory({ rpc, rpcSubscriptions });
    const signature = await airdrop({
      commitment: 'confirmed',
      recipientAddress,
      lamports: lamports(BigInt(process.env.SOLANA_AIRDROP_LAMPORTS || '2000000000'))
    });
    console.log(`Airdropped SOL to ${label}: ${signature}`);
  } catch (error) {
    console.log(`Airdrop skipped/failed for ${label}. Fund ${recipientAddress} manually on devnet.`);
    console.log(error instanceof Error ? error.message : String(error));
  }
}

async function sendPlan(plan: InstructionPlan, feePayer: TransactionSigner, label: string): Promise<void> {
  const { value: latestBlockhash } = await rpc.getLatestBlockhash({ commitment: 'confirmed' }).send();
  const message = appendTransactionMessageInstructionPlan(
    plan,
    setTransactionMessageLifetimeUsingBlockhash(
      latestBlockhash,
      setTransactionMessageFeePayerSigner(feePayer, createTransactionMessage({ version: 0 }))
    )
  );
  const transaction = await signTransactionMessageWithSigners(message);
  await sendAndConfirmTransaction(transaction as Parameters<typeof sendAndConfirmTransaction>[0], { commitment: 'confirmed' });
  console.log(`${label}: ${getSignatureFromTransaction(transaction)}`);
}

async function sendInstructions(instructions: Instruction[], feePayer: TransactionSigner, label: string): Promise<void> {
  const { value: latestBlockhash } = await rpc.getLatestBlockhash({ commitment: 'confirmed' }).send();
  const message = appendTransactionMessageInstructions(
    instructions,
    setTransactionMessageLifetimeUsingBlockhash(
      latestBlockhash,
      setTransactionMessageFeePayerSigner(feePayer, createTransactionMessage({ version: 0 }))
    )
  );
  const transaction = await signTransactionMessageWithSigners(message);
  await sendAndConfirmTransaction(transaction as Parameters<typeof sendAndConfirmTransaction>[0], { commitment: 'confirmed' });
  console.log(`${label}: ${getSignatureFromTransaction(transaction)}`);
}

function toWsUrl(url: string): string {
  if (url.startsWith('https://')) return `wss://${url.slice('https://'.length)}`;
  if (url.startsWith('http://')) return `ws://${url.slice('http://'.length)}`;
  return 'wss://api.devnet.solana.com';
}
