/**
 * Blockchain AI Agent — tool definitions.
 * Each tool must be listed in nxtlinq/agent.manifest.json scope for nxtlinq-attest to allow execution at runtime.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

export type ToolResult = { ok: true; data: string } | { ok: false; error: string };

const CHAIN_RPC: Record<string, string> = {
  '1': 'https://eth.llamarpc.com',
  '42161': 'https://arb1.arbitrum.io/rpc',
  '42170': 'https://nova.arbitrum.io/rpc',
};

export const TOOL_NAMES = ['GetTokenURI', 'ReadNFTMetadata', 'GetTransaction', 'FormatAsCSV'] as const;
export type ToolName = (typeof TOOL_NAMES)[number];

export interface ToolDef {
  name: ToolName;
  description: string;
  run(args: Record<string, string>): Promise<ToolResult>;
}

/**
 * Get tokenURI for a given contract address and tokenId (ERC-721 / ERC-1155).
 * In production: call contract.tokenURI(tokenId) via RPC.
 */
async function getTokenURI(args: Record<string, string>): Promise<ToolResult> {
  const contract = args.contract ?? '';
  const tokenId = args.tokenId ?? '';
  if (!contract || !tokenId) {
    return { ok: false, error: 'Missing arguments: contract, tokenId' };
  }
  // Mock: in production would use ethers/viem to call tokenURI(tokenId)
  const mockUri = `https://example.com/metadata/${contract}/${tokenId}.json`;
  return {
    ok: true,
    data: JSON.stringify({ contract, tokenId, tokenURI: mockUri }, null, 2),
  };
}

/**
 * Fetch and parse NFT metadata from a URI (IPFS, HTTP, etc.).
 * In production: fetch(uri), parse JSON, return name, description, image, attributes.
 */
async function readNFTMetadata(args: Record<string, string>): Promise<ToolResult> {
  const uri = args.uri ?? '';
  if (!uri) return { ok: false, error: 'Missing argument: uri' };
  // Mock: in production would fetch(uri) and parse JSON
  const mockMetadata = {
    name: 'Mock NFT #1',
    description: 'Sample metadata (mock; no fetch in demo)',
    image: 'ipfs://QmExample...',
    attributes: [
      { trait_type: 'Background', value: 'Blue' },
      { trait_type: 'Rarity', value: 'Common' },
    ],
  };
  return {
    ok: true,
    data: JSON.stringify({ uri, metadata: mockMetadata }, null, 2),
  };
}

/**
 * Fetch transaction and receipt by txHash via chain RPC (eth_getTransactionByHash, eth_getTransactionReceipt).
 * chainId: 1 = Ethereum, 42161 = Arbitrum One, 42170 = Arbitrum Nova (default).
 */
async function getTransaction(args: Record<string, string>): Promise<ToolResult> {
  const txHash = (args.txHash ?? args.tx ?? '').trim();
  const chainId = (args.chainId ?? args.chain ?? '42170').trim();

  if (!txHash) {
    return { ok: false, error: 'Missing argument: txHash (transaction hash, e.g. 0x...)' };
  }
  if (!/^0x[a-fA-F0-9]{64}$/.test(txHash)) {
    return { ok: false, error: 'Invalid txHash: must be 0x followed by 64 hex characters.' };
  }

  const rpcUrl = CHAIN_RPC[chainId];
  if (!rpcUrl) {
    return {
      ok: false,
      error: `Unknown chainId: ${chainId}. Supported: 1 (Ethereum), 42161 (Arbitrum One), 42170 (Arbitrum Nova).`,
    };
  }

  const id = 1;
  const body = (method: string, params: string[]) =>
    JSON.stringify({ jsonrpc: '2.0', method, params, id });

  try {
    const [txRes, receiptRes] = await Promise.all([
      fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body('eth_getTransactionByHash', [txHash]),
      }),
      fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body('eth_getTransactionReceipt', [txHash]),
      }),
    ]);

    const txJson = (await txRes.json()) as { result?: unknown; error?: { message: string } };
    const receiptJson = (await receiptRes.json()) as { result?: unknown; error?: { message: string } };

    if (txJson.error) {
      return { ok: false, error: `RPC error (tx): ${txJson.error.message ?? 'Unknown'}` };
    }
    if (receiptJson.error) {
      return { ok: false, error: `RPC error (receipt): ${receiptJson.error.message ?? 'Unknown'}` };
    }

    const tx = txJson.result;
    const receipt = receiptJson.result;

    if (tx == null) {
      return { ok: false, error: 'Transaction not found. Check txHash and chainId.' };
    }

    const out = {
      chainId,
      txHash,
      transaction: tx,
      receipt: receipt ?? null,
    };
    return {
      ok: true,
      data: JSON.stringify(out, null, 2),
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Failed to fetch transaction: ${msg}` };
  }
}

/**
 * Flatten nested object to one level with dotted keys (e.g. transaction.from, receipt.status).
 * Arrays are JSON-stringified into a single cell.
 */
function flattenObject(obj: Record<string, unknown>, prefix = ''): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v === null || v === undefined) {
      out[key] = v;
    } else if (Array.isArray(v)) {
      out[key] = v.length === 0 ? '' : JSON.stringify(v);
    } else if (typeof v === 'object' && v !== null && Object.getPrototypeOf(v) === Object.prototype) {
      Object.assign(out, flattenObject(v as Record<string, unknown>, key));
    } else {
      out[key] = v;
    }
  }
  return out;
}

/**
 * Field names that should be shown as decimal (Blockscout-style).
 * Addresses, hashes, input, data, topics, r/s/v stay as hex.
 */
const NUMERIC_CSV_KEYS = new Set([
  'blockNumber', 'nonce', 'value', 'gas', 'gasPrice', 'maxFeePerGas', 'maxPriorityFeePerGas',
  'gasUsed', 'effectiveGasPrice', 'cumulativeGasUsed', 'transactionIndex', 'status',
  'chainId', 'l1BlockNumber', 'blockTimestamp', 'logIndex', 'gasUsedForL1', 'type', 'yParity',
]);

/**
 * Format value for CSV per Blockscout-style: numeric fields as decimal, status as Success/Failed, rest keep hex.
 */
function formatCsvCell(key: string, value: unknown): unknown {
  const baseKey = key.includes('.') ? key.split('.').pop()! : key;
  const isNumeric = NUMERIC_CSV_KEYS.has(baseKey);

  if (value === null || value === undefined) return value;
  if (typeof value !== 'string') return value;

  if (baseKey === 'status' && /^0x[0-9a-fA-F]+$/i.test(value)) {
    const n = BigInt(value);
    return n === 1n ? 'Success' : n === 0n ? 'Failed' : String(n);
  }
  if (isNumeric && /^0x[0-9a-fA-F]+$/i.test(value)) {
    try {
      return BigInt(value).toString();
    } catch {
      return value;
    }
  }
  return value;
}

/**
 * Escape a CSV field: wrap in double quotes if needed and escape " as "".
 */
function escapeCsvField(value: unknown): string {
  const s =
    value === null || value === undefined
      ? ''
      : typeof value === 'object'
        ? JSON.stringify(value)
        : String(value);
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * Convert JSON data (array of objects or single object) to CSV.
 * data: JSON string. columns: optional comma-separated column names. output: optional file path to write CSV.
 */
async function formatAsCSV(args: Record<string, string>): Promise<ToolResult> {
  const dataRaw = args.data ?? args.json ?? '';
  const columnsStr = (args.columns ?? '').trim();
  const outputPath = (args.output ?? args.file ?? '').trim();

  if (!dataRaw) {
    return { ok: false, error: 'Missing argument: data (JSON string, e.g. array of objects or single object)' };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(dataRaw);
  } catch {
    return { ok: false, error: 'Invalid JSON in data.' };
  }

  const rows: Record<string, unknown>[] = Array.isArray(parsed)
    ? parsed.filter((r): r is Record<string, unknown> => r != null && typeof r === 'object' && !Array.isArray(r))
    : parsed != null && typeof parsed === 'object' && !Array.isArray(parsed)
      ? [parsed as Record<string, unknown>]
      : [];

  if (rows.length === 0) {
    return { ok: false, error: 'No rows to convert. data must be a non-empty array of objects or a single object.' };
  }

  const flattenedRows = rows.map((r) => flattenObject(r));
  const allKeys = new Set<string>();
  for (const row of flattenedRows) {
    for (const k of Object.keys(row)) allKeys.add(k);
  }
  const headers = columnsStr
    ? columnsStr.split(',').map((c) => c.trim()).filter(Boolean)
    : Object.keys(flattenedRows[0]!);
  const orderedHeaders = headers.length > 0 ? headers : [...allKeys].sort();

  const lines: string[] = [];
  lines.push(orderedHeaders.map(escapeCsvField).join(','));
  for (const row of flattenedRows) {
    lines.push(
      orderedHeaders.map((h) => escapeCsvField(formatCsvCell(h, row[h]))).join(',')
    );
  }

  const csv = lines.join('\n');

  if (outputPath) {
    const cwd = process.cwd();
    const pathUnderOutput = outputPath.replace(/^output[/\\]/, '');
    const resolved = resolve(cwd, 'output', pathUnderOutput);
    if (!resolved.startsWith(cwd)) {
      return { ok: false, error: 'output path must be under the current working directory.' };
    }
    try {
      await mkdir(dirname(resolved), { recursive: true });
      await writeFile(resolved, csv, 'utf8');
      return {
        ok: true,
        data: `CSV written to ${resolved}\n\n${csv}`,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, error: `Failed to write file: ${msg}` };
    }
  }

  return { ok: true, data: csv };
}

export const TOOLS: Record<ToolName, ToolDef> = {
  GetTokenURI: {
    name: 'GetTokenURI',
    description: 'Get tokenURI for contract + tokenId. Args: contract, tokenId',
    run: getTokenURI,
  },
  ReadNFTMetadata: {
    name: 'ReadNFTMetadata',
    description: 'Fetch and parse NFT metadata from URI (IPFS/HTTP). Args: uri',
    run: readNFTMetadata,
  },
  GetTransaction: {
    name: 'GetTransaction',
    description: 'Get transaction and receipt by hash. Args: txHash, chainId (optional, default 42170 = Arbitrum Nova)',
    run: getTransaction,
  },
  FormatAsCSV: {
    name: 'FormatAsCSV',
    description: 'Convert JSON data to CSV. Args: data (JSON string), columns (optional), output (optional: filename or path under output/, e.g. result.csv writes to output/result.csv; creates output/ if missing)',
    run: formatAsCSV,
  },
};
