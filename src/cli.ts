#!/usr/bin/env node
/**
 * Blockchain AI Agent CLI. Tools run only if in attested scope
 * (nxtlinq/agent.manifest.json). Use nxtlinq-attest verify in CI for integrity.
 */

import { runTool, getScope } from './agent.js';
import { chat } from './ai.js';
import { TOOL_NAMES } from './tools.js';

const args = process.argv.slice(2);
const cmd = args[0];
const BIN = 'blockchain-ai-agent';

function usage(): void {
  console.log(`
Usage:
  ${BIN} scope                    Print attested scope (from nxtlinq/agent.manifest.json)
  ${BIN} run <tool> [key=val ...] Run a tool if it is in attested scope
  ${BIN} chat <message>            Ask in natural language; AI will call tools as needed (requires OPENAI_API_KEY)

Tools (must be in manifest scope to run): ${TOOL_NAMES.join(', ')}

Example:
  ${BIN} scope
  ${BIN} run GetTokenURI contract=0x... tokenId=1
  ${BIN} run ReadNFTMetadata uri=ipfs://Qm...
  ${BIN} run GetTransaction txHash=0x... chainId=42170
  ${BIN} run FormatAsCSV data='[{"from":"0xa","to":"0xb","value":"1"}]' output=result.csv
  ${BIN} chat "What is the metadata for contract 0xabc token 1?"
  ${BIN} chat "Get this Arbitrum Nova tx and export to CSV"
`);
}

async function main(): Promise<void> {
  if (!cmd || cmd === '--help' || cmd === '-h') {
    usage();
    process.exit(0);
  }

  if (cmd === 'scope') {
    const scope = getScope();
    console.log(JSON.stringify(scope, null, 2));
    process.exit(0);
  }

  if (cmd === 'run') {
    const toolName = args[1];
    if (!toolName) {
      console.error('Error: missing tool name. Usage: ' + BIN + ' run <tool> [key=val ...]');
      process.exit(1);
    }
    const rest = args.slice(2);
    const toolArgs: Record<string, string> = {};
    for (const s of rest) {
      const eq = s.indexOf('=');
      if (eq > 0) {
        toolArgs[s.slice(0, eq)] = s.slice(eq + 1);
      }
    }
    const out = await runTool(toolName, toolArgs);
    if (!out.allowed) {
      console.error('Denied:', out.reason);
      console.error('Attested scope:', out.scope);
      process.exit(1);
    }
    if (out.result?.ok) {
      console.log(out.result.data);
    } else {
      console.error(out.result?.error ?? 'Unknown error');
      process.exit(1);
    }
    process.exit(0);
  }

  if (cmd === 'chat') {
    const message = args.slice(1).join(' ').trim();
    if (!message) {
      console.error('Error: missing message. Usage: ' + BIN + ' chat <your question>');
      process.exit(1);
    }
    const result = await chat(message);
    if (result.ok) {
      console.log(result.message);
      process.exit(0);
    } else {
      console.error(result.error);
      process.exit(1);
    }
  }

  console.error('Unknown command:', cmd);
  usage();
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
