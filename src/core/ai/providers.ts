import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runCommand } from "./process-runner.js";
import type { CommandResult, StatusCallback } from "./contracts.js";
import type { ResolvedAiProvider } from "./provider-selection.js";
import type { ClaudeEffort, CodexReasoningEffort } from "../types.js";

const DEFAULT_CODEX_REASONING_EFFORT = "xhigh";
const DEFAULT_CODEX_FREEFORM_SANDBOX_MODE = "workspace-write";
const DEFAULT_CODEX_STRUCTURED_SANDBOX_MODE = "read-only";
const DEFAULT_STRUCTURED_TIMEOUT_MS = 30 * 60 * 1000;
const REFACTOR_STATUS_MARKER = /^\s*PRIMER_REFACTOR_STATUS:\s*(COMPLETE|CONTINUE)\s*$/im;
let claudeSupportsNoSessionPersistenceFlag: boolean | null = null;
let claudeSupportsToolsFlag: boolean | null = null;
let claudeSupportsEffortFlag: boolean | null = null;
let claudeSupportsSettingsFlag: boolean | null = null;
type CodexSandboxMode = "workspace-write" | "read-only";

interface StructuredTaskOptions {
  cwd?: string | undefined;
  onStatus?: StatusCallback | undefined;
  model?: string | undefined;
  timeoutMs?: number | undefined;
  reasoningEffort?: CodexReasoningEffort | undefined;
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
  reasoningEffort?: CodexReasoningEffort | undefined;
  claudeEffort?: ClaudeEffort | undefined;
  claudeFastMode?: boolean | undefined;
}

function resolveCodexReasoningEffort(value: CodexReasoningEffort | undefined): CodexReasoningEffort {
  return value ?? DEFAULT_CODEX_REASONING_EFFORT;
}

export function summarizeFailure(result: CommandResult): string {
  const reason = result.reason ?? "unknown error";
  const combined = `${result.stderr}\n${result.stdout}`.replace(/\s+/g, " ").trim();
  if (!combined) return reason;
  const snippet = combined.length > 280 ? `${combined.slice(0, 280)}...` : combined;
  return `${reason}: ${snippet}`;
}

export function resetClaudeCliCapabilityCacheForTests(): void {
  claudeSupportsNoSessionPersistenceFlag = null;
  claudeSupportsToolsFlag = null;
  claudeSupportsEffortFlag = null;
  claudeSupportsSettingsFlag = null;
}

function summarizeClaudeFailure(result: CommandResult): string {
  return `${result.reason ?? ""}\n${result.stderr ?? ""}\n${result.stdout ?? ""}`.toLowerCase();
}

function isUnsupportedOptionFailure(result: CommandResult, optionToken: string): boolean {
  const failure = summarizeClaudeFailure(result);
  if (!failure.includes(optionToken.toLowerCase())) return false;
  return /\b(unknown|unrecognized|unsupported|invalid|unexpected|illegal)\b/.test(failure);
}

function buildClaudeArgs(
  prompt: string,
  options: {
    model: string | undefined;
    includeTools: boolean;
    includeNoSession: boolean;
    includeEffort: boolean;
    claudeEffort: ClaudeEffort | undefined;
    includeFastModeSettings: boolean;
  }
): string[] {
  const args = ["-p", prompt];
  if (options.includeTools) {
    args.push("--tools", "");
  }
  if (options.includeNoSession) {
    args.push("--no-session-persistence");
  }
  if (options.model) {
    args.push("--model", options.model);
  }
  if (options.includeEffort && options.claudeEffort) {
    args.push("--effort", options.claudeEffort);
  }
  if (options.includeFastModeSettings) {
    args.push("--settings", "{\"fastMode\":true}");
  }
  return args;
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
    const reasoningEffort = resolveCodexReasoningEffort(options.reasoningEffort);
    options.onStatus?.("Trying codex structured JSON mode...");
    const structuredArgs = [
      "exec",
      "--sandbox",
      DEFAULT_CODEX_STRUCTURED_SANDBOX_MODE,
      "--skip-git-repo-check",
      "-c",
      `model_reasoning_effort="${reasoningEffort}"`
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
      `model_reasoning_effort="${reasoningEffort}"`
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
  const reasoningEffort = resolveCodexReasoningEffort(options.reasoningEffort);
  const args = [
    "exec",
    "--sandbox",
    sandboxMode,
    "--skip-git-repo-check",
    "-c",
    `model_reasoning_effort="${reasoningEffort}"`
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

async function runClaudeCommand(args: string[], options: FreeformTaskOptions): Promise<CommandResult> {
  return runCommand("claude", args, {
    cwd: options.cwd,
    inheritOutput: options.showAiFileOps ?? false,
    ...(options.onStatus ? { onActivity: (message: string) => options.onStatus?.(message) } : {}),
    ...(typeof options.timeoutMs === "number" ? { timeoutMs: options.timeoutMs } : {}),
    ...(options.stopOnRefactorStatusMarker ? { stopOnOutputPattern: REFACTOR_STATUS_MARKER } : {})
  });
}

async function runClaudeFreeform(prompt: string, options: FreeformTaskOptions = {}): Promise<CommandResult> {
  let includeTools = claudeSupportsToolsFlag !== false;
  let includeNoSession = claudeSupportsNoSessionPersistenceFlag !== false;
  let includeEffort = Boolean(options.claudeEffort) && claudeSupportsEffortFlag !== false;
  let includeFastModeSettings = Boolean(options.claudeFastMode) && claudeSupportsSettingsFlag !== false;

  for (;;) {
    const args = buildClaudeArgs(prompt, {
      model: options.model,
      includeTools,
      includeNoSession,
      includeEffort,
      claudeEffort: options.claudeEffort,
      includeFastModeSettings
    });
    const result = await runClaudeCommand(args, options);
    if (result.ok) {
      if (includeTools) claudeSupportsToolsFlag = true;
      if (includeNoSession) claudeSupportsNoSessionPersistenceFlag = true;
      if (includeEffort) claudeSupportsEffortFlag = true;
      if (includeFastModeSettings) claudeSupportsSettingsFlag = true;
      return result;
    }

    if (includeNoSession && isUnsupportedOptionFailure(result, "--no-session-persistence")) {
      claudeSupportsNoSessionPersistenceFlag = false;
      includeNoSession = false;
      options.onStatus?.(
        "Warning: Claude retry will run without --no-session-persistence because your installed CLI rejected the primary invocation."
      );
      continue;
    }

    if (includeTools && isUnsupportedOptionFailure(result, "--tools")) {
      claudeSupportsToolsFlag = false;
      includeTools = false;
      options.onStatus?.("Warning: Claude retry will run without --tools because your installed CLI rejected tool suppression.");
      continue;
    }

    if (includeEffort && isUnsupportedOptionFailure(result, "--effort")) {
      claudeSupportsEffortFlag = false;
      includeEffort = false;
      options.onStatus?.("Warning: Claude retry will run without --effort because your installed CLI rejected effort control.");
      continue;
    }

    if (includeFastModeSettings && isUnsupportedOptionFailure(result, "--settings")) {
      claudeSupportsSettingsFlag = false;
      includeFastModeSettings = false;
      options.onStatus?.(
        "Warning: Claude retry will run without --settings fastMode override because your installed CLI rejected settings injection."
      );
      continue;
    }

    return result;
  }
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
