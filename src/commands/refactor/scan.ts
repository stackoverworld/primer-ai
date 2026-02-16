import { scanRepositoryForRefactor } from "../../core/refactor.js";
import type { RepoRefactorScan } from "../../core/refactor.js";
import type { RefactorBacklog } from "./backlog.js";

const DEFAULT_MAX_FILES = 20_000;
const MAX_MAX_FILES = 120_000;
const MAX_MAX_PASSES = 80;
const MAX_ADAPTIVE_PASSES = 12;
const AUTO_SCAN_LIMITS = [20_000, 40_000, 80_000, 120_000] as const;

export function normalizeMaxFiles(value: number | string | undefined): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) return parsed;
  }
  return DEFAULT_MAX_FILES;
}

export function normalizeMaxPasses(value: number | string | undefined): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.min(MAX_MAX_PASSES, Math.max(1, Math.floor(value)));
  }
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) {
      return Math.min(MAX_MAX_PASSES, Math.max(1, parsed));
    }
  }
  throw new Error(`Invalid --max-passes value "${String(value)}". Expected an integer between 1 and ${MAX_MAX_PASSES}.`);
}

export function deriveAdaptivePassCount(backlog: RefactorBacklog): number {
  const score = backlog.monolithCount * 3 + backlog.couplingCount * 2 + backlog.debtCount + backlog.commentCount;
  return Math.min(MAX_ADAPTIVE_PASSES, Math.max(1, Math.ceil(score / 4)));
}

function clampMaxFiles(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_MAX_FILES;
  if (value < 80) return 80;
  if (value > MAX_MAX_FILES) return MAX_MAX_FILES;
  return Math.floor(value);
}

export function resolveScanWithCoverage(
  targetDir: string,
  requestedMaxFiles: number,
  explicitMaxFiles: boolean
): { scan: RepoRefactorScan; maxFilesUsed: number; expanded: boolean } {
  if (explicitMaxFiles) {
    const maxFilesUsed = clampMaxFiles(requestedMaxFiles);
    return {
      scan: scanRepositoryForRefactor(targetDir, maxFilesUsed),
      maxFilesUsed,
      expanded: false
    };
  }

  const initialLimit = clampMaxFiles(requestedMaxFiles);
  const candidateLimits = [initialLimit, ...AUTO_SCAN_LIMITS.filter((limit) => limit > initialLimit)];
  let maxFilesUsed = candidateLimits[0] ?? initialLimit;
  let scan = scanRepositoryForRefactor(targetDir, maxFilesUsed);

  for (let index = 1; scan.reachedFileCap && index < candidateLimits.length; index += 1) {
    maxFilesUsed = candidateLimits[index] ?? maxFilesUsed;
    scan = scanRepositoryForRefactor(targetDir, maxFilesUsed);
  }

  return {
    scan,
    maxFilesUsed,
    expanded: maxFilesUsed > initialLimit
  };
}
