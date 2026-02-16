import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runCommand } from "./process-runner.js";
import type { CommandResult, StatusCallback } from "./contracts.js";
import type { ResolvedAiProvider } from "./provider-selection.js";

const DEFAULT_CODEX_REASONING_EFFORT = "xhigh";
const DEFAULT_CODEX_SANDBOX_MODE = "workspace-write";

interface StructuredTaskOptions {
  cwd?: string | undefined;
  onStatus?: StatusCallback | undefined;
  model?: string | undefined;
}

interface FreeformTaskOptions {
  cwd?: string | undefined;
  model?: string | undefined;
  timeoutMs?: number | undefined;
  showAiFileOps?: boolean | undefined;
  orchestration?: boolean | undefined;
  maxSubagents?: number | undefined;
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

  try {
    options.onStatus?.("Trying codex structured JSON mode...");
    const structuredArgs = [
      "exec",
      "--sandbox",
      DEFAULT_CODEX_SANDBOX_MODE,
      "--skip-git-repo-check",
      "-c",
      `model_reasoning_effort="${DEFAULT_CODEX_REASONING_EFFORT}"`
    ];
    if (options.model) {
      structuredArgs.push("--model", options.model);
    }
    structuredArgs.push("--output-schema", schemaPath, prompt);

    const primary = await runCommand("codex", structuredArgs, { cwd: options.cwd });
    if (primary.ok) return primary;
    options.onStatus?.("Structured mode unavailable, retrying codex standard mode...");

    const fallbackArgs = [
      "exec",
      "--sandbox",
      DEFAULT_CODEX_SANDBOX_MODE,
      "--skip-git-repo-check",
      "-c",
      `model_reasoning_effort="${DEFAULT_CODEX_REASONING_EFFORT}"`
    ];
    if (options.model) {
      fallbackArgs.push("--model", options.model);
    }
    fallbackArgs.push(prompt);

    return runCommand("codex", fallbackArgs, { cwd: options.cwd });
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
  const primary = await runCommand("claude", primaryArgs, { cwd: options.cwd });
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
  const secondary = await runCommand("claude", secondaryArgs, { cwd: options.cwd });
  if (secondary.ok) return secondary;

  options.onStatus?.("JSON output mode failed, retrying plain claude mode...");
  const fallbackArgs = ["-p", prompt, "--tools", "", "--no-session-persistence"];
  if (options.model) {
    fallbackArgs.push("--model", options.model);
  }
  return runCommand("claude", fallbackArgs, { cwd: options.cwd });
}

async function runCodexFreeform(prompt: string, options: FreeformTaskOptions = {}): Promise<CommandResult> {
  const args = [
    "exec",
    "--sandbox",
    DEFAULT_CODEX_SANDBOX_MODE,
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
    ...(typeof options.timeoutMs === "number" ? { timeoutMs: options.timeoutMs } : {})
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
    ...(typeof options.timeoutMs === "number" ? { timeoutMs: options.timeoutMs } : {})
  });
  if (primary.ok) return primary;

  const fallbackArgs = ["-p", prompt];
  if (options.model) {
    fallbackArgs.push("--model", options.model);
  }

  return runCommand("claude", fallbackArgs, {
    cwd: options.cwd,
    inheritOutput: options.showAiFileOps ?? false,
    ...(typeof options.timeoutMs === "number" ? { timeoutMs: options.timeoutMs } : {})
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
