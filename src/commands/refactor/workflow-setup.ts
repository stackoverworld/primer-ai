import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";

import type { RefactorCommandOptions } from "../../core/types.js";

import { normalizeMaxFiles, normalizeMaxPasses } from "./scan.js";
import type { RefactorPromptOptions } from "./state.js";

const DEFAULT_MAX_SUBAGENTS = 12;
const MIN_MAX_SUBAGENTS = 1;
const MAX_MAX_SUBAGENTS = 24;
const DEFAULT_AI_TIMEOUT_SEC = 1800;
const MIN_AI_TIMEOUT_SEC = 60;
const MAX_AI_TIMEOUT_SEC = 4 * 60 * 60;

export interface PreparedRefactorWorkflow {
  targetDir: string;
  dryRun: boolean;
  resume: boolean;
  explicitMaxFiles: boolean;
  explicitMaxPasses: boolean;
  maxFiles: number;
  maxPasses?: number;
  aiTimeoutMs: number;
  promptOptions: RefactorPromptOptions;
  showAiFileOps: boolean;
  orchestration: boolean;
  maxSubagents: number;
}

function normalizeMaxSubagents(value: number | string | undefined): number {
  if (value === undefined) return DEFAULT_MAX_SUBAGENTS;
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.min(MAX_MAX_SUBAGENTS, Math.max(MIN_MAX_SUBAGENTS, Math.floor(value)));
  }
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) {
      return Math.min(MAX_MAX_SUBAGENTS, Math.max(MIN_MAX_SUBAGENTS, parsed));
    }
  }
  throw new Error(
    `Invalid --max-subagents value "${String(value)}". Expected an integer between ${MIN_MAX_SUBAGENTS} and ${MAX_MAX_SUBAGENTS}.`
  );
}

function normalizeAiTimeoutMs(value: number | string | undefined): number {
  if (value === undefined) return DEFAULT_AI_TIMEOUT_SEC * 1000;
  const parsed =
    typeof value === "number" && Number.isFinite(value)
      ? Math.floor(value)
      : typeof value === "string"
        ? Number.parseInt(value, 10)
        : Number.NaN;
  if (!Number.isFinite(parsed)) {
    throw new Error(
      `Invalid --ai-timeout-sec value "${String(value)}". Expected an integer between ${MIN_AI_TIMEOUT_SEC} and ${MAX_AI_TIMEOUT_SEC}.`
    );
  }
  const clamped = Math.min(MAX_AI_TIMEOUT_SEC, Math.max(MIN_AI_TIMEOUT_SEC, parsed));
  return clamped * 1000;
}

export function prepareRefactorWorkflow(
  pathArg: string | undefined,
  options: RefactorCommandOptions
): PreparedRefactorWorkflow {
  const targetDir = resolve(process.cwd(), pathArg ?? ".");
  if (!existsSync(targetDir) || !statSync(targetDir).isDirectory()) {
    throw new Error(`Target path is not a directory: ${targetDir}`);
  }

  const dryRun = options.dryRun ?? false;
  const resume = options.resume ?? true;
  const explicitMaxFiles = options.maxFiles !== undefined;
  const explicitMaxPasses = options.maxPasses !== undefined;
  const maxFiles = normalizeMaxFiles(options.maxFiles);
  const maxPasses = normalizeMaxPasses(options.maxPasses);
  const aiTimeoutMs = normalizeAiTimeoutMs(options.aiTimeoutSec);
  const notes = [options.notes?.trim(), options.focus?.trim()].filter((entry): entry is string => Boolean(entry));
  const promptOptions: RefactorPromptOptions = { dryRun };
  if (notes.length > 0) {
    promptOptions.notes = notes.join("\n");
  }
  const showAiFileOps = options.showAiFileOps ?? false;
  const orchestration = options.orchestration ?? true;
  const maxSubagents = normalizeMaxSubagents(options.maxSubagents);
  promptOptions.orchestration = orchestration;
  promptOptions.maxSubagents = maxSubagents;

  return {
    targetDir,
    dryRun,
    resume,
    explicitMaxFiles,
    explicitMaxPasses,
    maxFiles,
    ...(maxPasses !== undefined ? { maxPasses } : {}),
    aiTimeoutMs,
    promptOptions,
    showAiFileOps,
    orchestration,
    maxSubagents
  };
}
