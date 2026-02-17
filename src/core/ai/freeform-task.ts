import { runFreeformTask, summarizeFailure } from "./providers.js";
import { combineOutput, resolveProviderForTask, runWithLiveStatus } from "./task-shared.js";
import type { AgentTarget, AiProvider } from "../types.js";
import type { StatusCallback } from "./contracts.js";

export interface AiTaskResult {
  ok: boolean;
  providerUsed?: "codex" | "claude";
  output: string;
  warning?: string;
}

interface RunAiFreeformTaskOptions {
  prompt: string;
  provider: AiProvider;
  targetAgent: AgentTarget;
  model?: string;
  cwd?: string;
  onStatus?: StatusCallback;
  aiTimeoutMs?: number;
  sandboxMode?: "workspace-write" | "read-only";
  showAiFileOps?: boolean;
  orchestration?: boolean;
  maxSubagents?: number;
  expectFileWrites?: boolean;
  stopOnRefactorStatusMarker?: boolean;
}

const WRITE_BLOCK_MARKERS = [
  "workspace is running read-only",
  "outside-write project context",
  "file writes are blocked",
  "blocked on write operations",
  "write access is available",
  "cannot apply any edits",
  "can't apply any edits",
  "can’t apply any edits",
  "non-writable from the sandbox policy"
] as const;

const REFACTOR_STATUS_MARKER = /^\s*PRIMER_REFACTOR_STATUS:\s*(COMPLETE|CONTINUE)\s*$/im;

function hasWriteBlockSignal(output: string): boolean {
  const lower = output.toLowerCase();
  if (WRITE_BLOCK_MARKERS.some((marker) => lower.includes(marker))) {
    return true;
  }
  const hasReadOnlySandbox = lower.includes("sandbox: read-only") || lower.includes("read-only sandbox");
  const hasContinueStatus = lower.includes("primer_refactor_status: continue");
  return hasReadOnlySandbox && hasContinueStatus;
}

function hasTerminalRefactorStatusMarker(output: string): boolean {
  const lines = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (!lines.length) return false;
  const tail = lines.slice(-8).join("\n");
  return REFACTOR_STATUS_MARKER.test(tail);
}

export async function runAiFreeformTask(options: RunAiFreeformTaskOptions): Promise<AiTaskResult> {
  const resolved = resolveProviderForTask({
    provider: options.provider,
    targetAgent: options.targetAgent,
    onStatus: options.onStatus,
    warningMessage: "No compatible `codex` or `claude` binary was found."
  });
  if (!resolved.provider) {
    return {
      ok: false,
      output: "",
      warning: resolved.warning
    };
  }

  const provider = resolved.provider;
  options.onStatus?.(`Launching ${provider}${options.model ? ` (${options.model})` : ""} CLI...`);

  const commandResult = await runWithLiveStatus(provider, options.onStatus, () =>
    runFreeformTask(provider, options.prompt, {
      cwd: options.cwd,
      onStatus: options.onStatus,
      model: options.model,
      timeoutMs: options.aiTimeoutMs,
      sandboxMode: options.sandboxMode,
      showAiFileOps: options.showAiFileOps,
      orchestration: options.orchestration,
      maxSubagents: options.maxSubagents,
      stopOnRefactorStatusMarker: options.stopOnRefactorStatusMarker ?? (options.expectFileWrites ?? false)
    })
  );

  const output = combineOutput(commandResult);
  if (commandResult.ok && options.expectFileWrites && hasWriteBlockSignal(output)) {
    return {
      ok: false,
      providerUsed: provider,
      output,
      warning:
        'AI reported that file writes are blocked in the current Codex sandbox. Re-run with write-enabled Codex sandbox (`--sandbox workspace-write` or `sandbox_mode = "workspace-write"`).'
    };
  }

  if (
    !commandResult.ok &&
    commandResult.reason?.toLowerCase().includes("timeout") &&
    hasTerminalRefactorStatusMarker(output)
  ) {
    return {
      ok: true,
      providerUsed: provider,
      output,
      warning:
        "AI process timed out after emitting PRIMER_REFACTOR_STATUS; accepting this pass result from the reported status marker."
    };
  }

  if (!commandResult.ok) {
    return {
      ok: false,
      providerUsed: provider,
      output,
      warning: `Could not complete AI task with ${provider} (${summarizeFailure(commandResult)}).`
    };
  }

  return {
    ok: true,
    providerUsed: provider,
    output
  };
}
