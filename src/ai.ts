/**
 * AI layer: OpenAI chat with tool use. LLM decides when to call which tool.
 * Tool execution is delegated to agent.runTool so attested scope is enforced.
 */

import OpenAI from 'openai';
import { runTool } from './agent.js';
import { TOOL_NAMES } from './tools.js';

const OPENAI_MODEL = process.env.OPENAI_MODEL ?? 'gpt-4o-mini';

const SYSTEM_PROMPT = `You are a blockchain assistant. You help users query NFT tokenURI/metadata and on-chain transactions.

You have access to these tools:
- GetTokenURI: Get the tokenURI for an NFT given contract address and tokenId. Parameters: contract (Ethereum contract address, e.g. 0x...), tokenId (token ID as string).
- ReadNFTMetadata: Fetch and parse NFT metadata JSON from a URI (e.g. ipfs://..., https://...). Parameters: uri (the metadata URI).
- GetTransaction: Get transaction and receipt by hash. Parameters: txHash (transaction hash, e.g. 0x...), chainId (optional: 1 = Ethereum, 42161 = Arbitrum One, 42170 = Arbitrum Nova; default 42170).
- FormatAsCSV: Convert JSON data to CSV. Parameters: data (JSON string), columns (optional), output (optional: file path to write CSV, e.g. result.csv).

If the user asks about a contract and tokenId, first call GetTokenURI then optionally ReadNFTMetadata. If the user asks about a transaction, use GetTransaction. When the user asks to export or format as CSV (e.g. "export to CSV", "generate csv file"), first get the data, then call FormatAsCSV with data + optional columns; pass output (e.g. tx.csv, result.csv) to write the CSV to a file.
Answer in the same language as the user. Be concise. If a tool fails, explain the error.`;

const OPENAI_TOOLS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'GetTokenURI',
      description: 'Get the tokenURI for an NFT given its contract address and token ID (ERC-721 / ERC-1155).',
      parameters: {
        type: 'object',
        properties: {
          contract: { type: 'string', description: 'Ethereum contract address (e.g. 0x...)' },
          tokenId: { type: 'string', description: 'Token ID' },
        },
        required: ['contract', 'tokenId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'ReadNFTMetadata',
      description: 'Fetch and parse NFT metadata JSON from a URI (IPFS, HTTP, etc.). Returns name, description, image, attributes.',
      parameters: {
        type: 'object',
        properties: {
          uri: { type: 'string', description: 'Metadata URI (e.g. ipfs://Qm..., https://...)' },
        },
        required: ['uri'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'GetTransaction',
      description: 'Get transaction and receipt by transaction hash. Use for Arbitrum Nova, Arbitrum One, or Ethereum.',
      parameters: {
        type: 'object',
        properties: {
          txHash: { type: 'string', description: 'Transaction hash (0x + 64 hex chars)' },
          chainId: { type: 'string', description: 'Chain ID: 1 (Ethereum), 42161 (Arbitrum One), 42170 (Arbitrum Nova). Default 42170.' },
        },
        required: ['txHash'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'FormatAsCSV',
      description: 'Convert JSON data to CSV. Optionally write to a file with output parameter (e.g. result.csv).',
      parameters: {
        type: 'object',
        properties: {
          data: { type: 'string', description: 'JSON string (array of objects or single object) to convert to CSV' },
          columns: { type: 'string', description: 'Optional comma-separated column names for CSV header order (e.g. from,to,value,gas)' },
          output: { type: 'string', description: 'Optional filename or path under output/ to write CSV (e.g. tx.csv -> output/tx.csv). output/ is created if missing.' },
        },
        required: ['data'],
      },
    },
  },
];

export type ChatResult =
  | { ok: true; message: string }
  | { ok: false; error: string };

/**
 * Run one chat turn: send user message to OpenAI, execute any tool calls via runTool, repeat until done.
 */
export async function chat(userMessage: string): Promise<ChatResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return {
      ok: false,
      error: 'OPENAI_API_KEY is not set. Set it in your environment to use the chat command.',
    };
  }

  const client = new OpenAI({ apiKey });

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: userMessage },
  ];

  const maxTurns = 10;
  let turns = 0;

  while (turns < maxTurns) {
    turns += 1;
    const response = await client.chat.completions.create({
      model: OPENAI_MODEL,
      messages,
      tools: OPENAI_TOOLS,
      tool_choice: 'auto',
    });

    const choice = response.choices[0];
    if (!choice) {
      return { ok: false, error: 'No response from OpenAI.' };
    }

    const msg = choice.message;

    if (msg.tool_calls && msg.tool_calls.length > 0) {
      messages.push(msg);

      for (const tc of msg.tool_calls) {
        if (!TOOL_NAMES.includes(tc.function.name as (typeof TOOL_NAMES)[number])) {
          messages.push({
            role: 'tool',
            tool_call_id: tc.id,
            content: JSON.stringify({ error: `Unknown tool: ${tc.function.name}. Allowed: ${TOOL_NAMES.join(', ')}.` }),
          });
          continue;
        }
        let args: Record<string, string> = {};
        try {
          args = JSON.parse(tc.function.arguments ?? '{}') as Record<string, string>;
        } catch {
          args = {};
        }
        const out = await runTool(tc.function.name, args);
        let content: string;
        if (!out.allowed) {
          content = JSON.stringify({ error: out.reason, scope: out.scope });
        } else if (out.result?.ok) {
          content = out.result.data;
        } else {
          content = JSON.stringify({ error: out.result?.error ?? 'Unknown error' });
        }
        messages.push({
          role: 'tool',
          tool_call_id: tc.id,
          content,
        });
      }
      continue;
    }

    const text = msg.content?.trim();
    if (text) {
      return { ok: true, message: text };
    }
  }

  return { ok: false, error: 'Max tool-call turns reached without a final reply.' };
}
