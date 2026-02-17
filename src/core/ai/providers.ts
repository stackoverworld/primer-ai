import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runCommand } from "./process-runner.js";
import type { CommandResult, StatusCallback } from "./contracts.js";
import type { ResolvedAiProvider } from "./provider-selection.js";

const DEFAULT_CODEX_REASONING_EFFORT = "xhigh";
const DEFAULT_CODEX_FREEFORM_SANDBOX_MODE = "workspace-write";
const DEFAULT_CODEX_STRUCTURED_SANDBOX_MODE = "read-only";
const DEFAULT_STRUCTURED_TIMEOUT_MS = 30 * 60 * 1000;
const REFACTOR_STATUS_MARKER = /^\s*PRIMER_REFACTOR_STATUS:\s*(COMPLETE|CONTINUE)\s*$/im;
type CodexSandboxMode = "workspace-write" | "read-only";

interface StructuredTaskOptions {
  cwd?: string | undefined;
  onStatus?: StatusCallback | undefined;
  model?: string | undefined;
  timeoutMs?: number | undefined;
}

interface FreeformTaskOptions {
  cwd?: string | undefined;
  onStatus?: StatusCallback | undefined;
  model?: string | undefined;
  timeoutMs?: number | undefined;
  sandboxMode?: CodexSandboxMode | undefined;
  showAiFileOps?: boolean | undefined;
  orchestration?: boolean | undefined;
  maxSubagents?: number | undefined;
  stopOnRefactorStatusMarker?: boolean | undefined;
}

export function summarizeFailure(result: CommandResult): string {
  const reason = result.reason ?? "unknown error";
  const combined = `${result.stderr}\n${result.stdout}`.replace(/\s+/g, " ").trim();
  if (!combined) return reason;
  const snippet = combined.length > 280 ? `${combined.slice(0, 280)}...` : combined;
  return `${reason}: ${snippet}`;
}

async function runCodexStructured(
  prompt: string,
  outputSchema: unknown,
  options: StructuredTaskOptions = {}
): Promise<CommandResult> {
  const tempDir = mkdtempSync(join(tmpdir(), "primer-ai-codex-"));
  const schemaPath = join(tempDir, "output-schema.json");
  writeFileSync(schemaPath, JSON.stringify(outputSchema, null, 2), "utf8");
  const timeoutMs = options.timeoutMs ?? DEFAULT_STRUCTURED_TIMEOUT_MS;

  try {
    options.onStatus?.("Trying codex structured JSON mode...");
    const structuredArgs = [
      "exec",
      "--sandbox",
      DEFAULT_CODEX_STRUCTURED_SANDBOX_MODE,
      "--skip-git-repo-check",
      "-c",
      `model_reasoning_effort="${DEFAULT_CODEX_REASONING_EFFORT}"`
    ];
    if (options.model) {
      structuredArgs.push("--model", options.model);
    }
    structuredArgs.push("--output-schema", schemaPath, prompt);

    const primary = await runCommand("codex", structuredArgs, { cwd: options.cwd, timeoutMs });
    if (primary.ok) return primary;
    options.onStatus?.("Structured mode unavailable, retrying codex standard mode...");

    const fallbackArgs = [
      "exec",
      "--sandbox",
      DEFAULT_CODEX_STRUCTURED_SANDBOX_MODE,
      "--skip-git-repo-check",
      "-c",
      `model_reasoning_effort="${DEFAULT_CODEX_REASONING_EFFORT}"`
    ];
    if (options.model) {
      fallbackArgs.push("--model", options.model);
    }
    fallbackArgs.push(prompt);

    return runCommand("codex", fallbackArgs, { cwd: options.cwd, timeoutMs });
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

async function runClaudeStructured(
  prompt: string,
  outputSchema: unknown,
  options: StructuredTaskOptions = {}
): Promise<CommandResult> {
  const schemaJson = JSON.stringify(outputSchema);
  const timeoutMs = options.timeoutMs ?? DEFAULT_STRUCTURED_TIMEOUT_MS;
  options.onStatus?.("Trying claude JSON schema mode...");

  const primaryArgs = [
    "-p",
    prompt,
    "--output-format",
    "json",
    "--json-schema",
    schemaJson,
    "--tools",
    "",
    "--no-session-persistence"
  ];
  if (options.model) {
    primaryArgs.push("--model", options.model);
  }
  const primary = await runCommand("claude", primaryArgs, { cwd: options.cwd, timeoutMs });
  if (primary.ok) return primary;

  options.onStatus?.("Schema mode failed, retrying claude JSON output mode...");
  const secondaryArgs = [
    "-p",
    prompt,
    "--output-format",
    "json",
    "--tools",
    "",
    "--no-session-persistence"
  ];
  if (options.model) {
    secondaryArgs.push("--model", options.model);
  }
  const secondary = await runCommand("claude", secondaryArgs, { cwd: options.cwd, timeoutMs });
  if (secondary.ok) return secondary;

  options.onStatus?.("JSON output mode failed, retrying plain claude mode...");
  const fallbackArgs = ["-p", prompt, "--tools", "", "--no-session-persistence"];
  if (options.model) {
    fallbackArgs.push("--model", options.model);
  }
  return runCommand("claude", fallbackArgs, { cwd: options.cwd, timeoutMs });
}

async function runCodexFreeform(prompt: string, options: FreeformTaskOptions = {}): Promise<CommandResult> {
  const sandboxMode = options.sandboxMode ?? DEFAULT_CODEX_FREEFORM_SANDBOX_MODE;
  const args = [
    "exec",
    "--sandbox",
    sandboxMode,
    "--skip-git-repo-check",
    "-c",
    `model_reasoning_effort="${DEFAULT_CODEX_REASONING_EFFORT}"`
  ];
  if (options.orchestration !== false && typeof options.maxSubagents === "number") {
    args.push("-c", `agents.max_threads=${options.maxSubagents}`);
  }
  if (options.model) {
    args.push("--model", options.model);
  }
  args.push(prompt);

  return runCommand("codex", args, {
    cwd: options.cwd,
    inheritOutput: options.showAiFileOps ?? false,
    ...(options.onStatus ? { onActivity: (message: string) => options.onStatus?.(message) } : {}),
    ...(typeof options.timeoutMs === "number" ? { timeoutMs: options.timeoutMs } : {}),
    ...(options.stopOnRefactorStatusMarker ? { stopOnOutputPattern: REFACTOR_STATUS_MARKER } : {})
  });
}

async function runClaudeFreeform(prompt: string, options: FreeformTaskOptions = {}): Promise<CommandResult> {
  const primaryArgs = ["-p", prompt, "--no-session-persistence"];
  if (options.model) {
    primaryArgs.push("--model", options.model);
  }

  const primary = await runCommand("claude", primaryArgs, {
    cwd: options.cwd,
    inheritOutput: options.showAiFileOps ?? false,
    ...(options.onStatus ? { onActivity: (message: string) => options.onStatus?.(message) } : {}),
    ...(typeof options.timeoutMs === "number" ? { timeoutMs: options.timeoutMs } : {}),
    ...(options.stopOnRefactorStatusMarker ? { stopOnOutputPattern: REFACTOR_STATUS_MARKER } : {})
  });
  if (primary.ok) return primary;
  options.onStatus?.(
    "Warning: Claude retry will run without --no-session-persistence because your installed CLI rejected the primary invocation."
  );

  const fallbackArgs = ["-p", prompt];
  if (options.model) {
    fallbackArgs.push("--model", options.model);
  }

  return runCommand("claude", fallbackArgs, {
    cwd: options.cwd,
    inheritOutput: options.showAiFileOps ?? false,
    ...(options.onStatus ? { onActivity: (message: string) => options.onStatus?.(message) } : {}),
    ...(typeof options.timeoutMs === "number" ? { timeoutMs: options.timeoutMs } : {}),
    ...(options.stopOnRefactorStatusMarker ? { stopOnOutputPattern: REFACTOR_STATUS_MARKER } : {})
  });
}

export async function runStructuredTask(
  provider: ResolvedAiProvider,
  prompt: string,
  outputSchema: unknown,
  options: StructuredTaskOptions = {}
): Promise<CommandResult> {
  return provider === "codex"
    ? runCodexStructured(prompt, outputSchema, options)
    : runClaudeStructured(prompt, outputSchema, options);
}

export async function runFreeformTask(
  provider: ResolvedAiProvider,
  prompt: string,
  options: FreeformTaskOptions = {}
): Promise<CommandResult> {
  return provider === "codex" ? runCodexFreeform(prompt, options) : runClaudeFreeform(prompt, options);
}
