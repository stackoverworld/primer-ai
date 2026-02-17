import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";

import { UserInputError } from "../../core/errors.js";
import type { FixCommandOptions } from "../../core/types.js";

const DEFAULT_MAX_FILES = 20_000;
const MAX_MAX_FILES = 120_000;
const DEFAULT_MAX_PASSES = 3;
const MAX_MAX_PASSES = 12;
const DEFAULT_AI_TIMEOUT_SEC = 1800;
const MIN_AI_TIMEOUT_SEC = 60;
const MAX_AI_TIMEOUT_SEC = 4 * 60 * 60;

export interface PreparedFixWorkflow {
  targetDir: string;
  dryRun: boolean;
  maxFiles: number;
  maxPasses: number;
  explicitMaxPasses: boolean;
  aiTimeoutMs: number;
  notesFromFlags?: string;
}

function normalizeMaxFiles(value: number | string | undefined): number {
  const parsed =
    typeof value === "number" && Number.isFinite(value)
      ? value
      : typeof value === "string"
        ? Number.parseInt(value, 10)
        : Number.NaN;
  if (!Number.isFinite(parsed)) return DEFAULT_MAX_FILES;
  if (parsed < 80) return 80;
  if (parsed > MAX_MAX_FILES) return MAX_MAX_FILES;
  return Math.floor(parsed);
}

function normalizeMaxPasses(value: number | string | undefined): {
  maxPasses: number;
  explicitMaxPasses: boolean;
} {
  if (value === undefined) {
    return {
      maxPasses: DEFAULT_MAX_PASSES,
      explicitMaxPasses: false
    };
  }
  const parsed =
    typeof value === "number" && Number.isFinite(value)
      ? Math.floor(value)
      : typeof value === "string"
        ? Number.parseInt(value, 10)
        : Number.NaN;
  if (!Number.isFinite(parsed)) {
    throw new UserInputError(
      `Invalid --max-passes value "${String(value)}". Expected an integer between 1 and ${MAX_MAX_PASSES}.`
    );
  }
  return {
    maxPasses: Math.min(MAX_MAX_PASSES, Math.max(1, parsed)),
    explicitMaxPasses: true
  };
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
    throw new UserInputError(
      `Invalid --ai-timeout-sec value "${String(value)}". Expected an integer between ${MIN_AI_TIMEOUT_SEC} and ${MAX_AI_TIMEOUT_SEC}.`
    );
  }
  const clamped = Math.min(MAX_AI_TIMEOUT_SEC, Math.max(MIN_AI_TIMEOUT_SEC, parsed));
  return clamped * 1000;
}

function mergeNotes(flagNotes: string | undefined, flagFocus: string | undefined): string | undefined {
  const parts = [flagNotes?.trim(), flagFocus?.trim()].filter((entry): entry is string => Boolean(entry));
  if (!parts.length) return undefined;
  return parts.join("\n");
}

export function prepareFixWorkflow(pathArg: string | undefined, options: FixCommandOptions): PreparedFixWorkflow {
  const targetDir = resolve(process.cwd(), pathArg ?? ".");
  if (!existsSync(targetDir) || !statSync(targetDir).isDirectory()) {
    throw new UserInputError(`Target path is not a directory: ${targetDir}`);
  }
  const notesFromFlags = mergeNotes(options.notes, options.focus);
  const passBudget = normalizeMaxPasses(options.maxPasses);

  return {
    targetDir,
    dryRun: options.dryRun ?? false,
    maxFiles: normalizeMaxFiles(options.maxFiles),
    maxPasses: passBudget.maxPasses,
    explicitMaxPasses: passBudget.explicitMaxPasses,
    aiTimeoutMs: normalizeAiTimeoutMs(options.aiTimeoutSec),
    ...(notesFromFlags ? { notesFromFlags } : {})
  };
}
