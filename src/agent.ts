/**
 * Agent runner: executes tools only if they are in the attested scope.
 * Uses nxtlinq-attest runtime API to enforce scope from nxtlinq/agent.manifest.json.
 */

import { getAttestScope, isToolInAttestScope } from '@nxtlinq/attest';
import type { ToolDef, ToolResult } from './tools.js';
import { TOOLS, type ToolName } from './tools.js';

const cwd = process.cwd();

export interface RunToolResult {
  allowed: boolean;
  reason?: string;
  scope?: string[];
  result?: ToolResult;
}

/**
 * Run a tool by name with given args. Returns 403-style result if tool is not in attested scope.
 */
export async function runTool(
  toolName: string,
  args: Record<string, string>
): Promise<RunToolResult> {
  const scope = getAttestScope(cwd);

  if (!isToolInAttestScope(toolName, cwd)) {
    return {
      allowed: false,
      reason: `Tool "${toolName}" is not in the attested scope. Only tools listed in nxtlinq/agent.manifest.json may run.`,
      scope,
    };
  }

  const tool = TOOLS[toolName as ToolName];
  if (!tool) {
    return {
      allowed: true,
      result: { ok: false, error: `Unknown tool: ${toolName}` },
    };
  }

  const result = await tool.run(args);
  return { allowed: true, result, scope };
}

/**
 * Get the current attested scope (for display or debugging).
 */
export function getScope(): string[] {
  return getAttestScope(cwd);
}
