import { z } from "zod";

import { parseWithSchema } from "../../core/ai-parsing.js";
import { runAiFreeformTask } from "../../core/ai.js";
import type { RepoRefactorScan } from "../../core/refactor.js";
import type { AgentTarget, AiProvider } from "../../core/types.js";

import {
  MAX_SCAN_CANDIDATES,
  buildHotspotMap,
  buildInsightMap,
  collectCandidates,
  normalizePathSelection,
  selectHotspots,
  selectInsights,
  toPathSet
} from "./ai-scan/candidates.js";
import { buildAiScanCalibrationPrompt } from "./ai-scan/prompt.js";

const aiScanSchema = z.object({
  monolithPaths: z.array(z.string().min(1)).max(MAX_SCAN_CANDIDATES).default([]),
  couplingPaths: z.array(z.string().min(1)).max(MAX_SCAN_CANDIDATES).default([]),
  debtPaths: z.array(z.string().min(1)).max(MAX_SCAN_CANDIDATES).default([]),
  commentCleanupPaths: z.array(z.string().min(1)).max(MAX_SCAN_CANDIDATES).default([])
});

export interface AiScanCalibrationOptions {
  scan: RepoRefactorScan;
  provider: AiProvider;
  targetAgent: AgentTarget;
  model?: string;
  notes?: string;
  aiTimeoutMs?: number;
  onStatus?: (message: string) => void;
}

export interface AiScanCalibrationResult {
  scan: RepoRefactorScan;
  providerUsed?: "codex" | "claude";
  warning?: string;
}

export async function calibrateScanWithAi(options: AiScanCalibrationOptions): Promise<AiScanCalibrationResult> {
  const candidates = collectCandidates(options.scan);
  if (candidates.length === 0) {
    return { scan: options.scan };
  }

  options.onStatus?.(`AI scan calibration across ${candidates.length} candidates...`);
  const prompt = buildAiScanCalibrationPrompt(options.scan, candidates, options.notes);
  const taskResult = await runAiFreeformTask({
    prompt,
    provider: options.provider,
    targetAgent: options.targetAgent,
    sandboxMode: "read-only",
    ...(options.model ? { model: options.model } : {}),
    cwd: options.scan.targetDir,
    ...(typeof options.aiTimeoutMs === "number" ? { aiTimeoutMs: options.aiTimeoutMs } : {}),
    ...(options.onStatus ? { onStatus: options.onStatus } : {})
  });

  if (!taskResult.ok || !taskResult.output) {
    return {
      scan: options.scan,
      ...(taskResult.providerUsed ? { providerUsed: taskResult.providerUsed } : {}),
      warning: taskResult.warning ?? "AI scan calibration failed; using deterministic scan."
    };
  }

  const parsed = parseWithSchema(taskResult.output, aiScanSchema);
  if (!parsed) {
    return {
      scan: options.scan,
      ...(taskResult.providerUsed ? { providerUsed: taskResult.providerUsed } : {}),
      warning: "AI scan output was not valid JSON for calibration; using deterministic scan."
    };
  }

  const insightMap = buildInsightMap(options.scan);
  const hotspotMap = buildHotspotMap(options.scan);
  const candidatePaths = new Set(candidates.map((candidate) => candidate.path));
  const monolithAllowedPaths = new Set(
    [...toPathSet(options.scan.monolithCandidates)].filter((path) => candidatePaths.has(path))
  );
  const couplingAllowedPaths = new Set(
    [...toPathSet(options.scan.couplingCandidates)].filter((path) => candidatePaths.has(path))
  );
  const debtAllowedPaths = new Set([...toPathSet(options.scan.debtCandidates)].filter((path) => candidatePaths.has(path)));
  const commentCleanupAllowedPaths = new Set(
    [...toPathSet(options.scan.commentCleanupCandidates)].filter((path) => candidatePaths.has(path))
  );

  const monolithPaths = normalizePathSelection(parsed.monolithPaths, monolithAllowedPaths);
  const couplingPaths = normalizePathSelection(parsed.couplingPaths, couplingAllowedPaths);
  const debtPaths = normalizePathSelection(parsed.debtPaths, debtAllowedPaths);
  const commentCleanupPaths = normalizePathSelection(parsed.commentCleanupPaths, commentCleanupAllowedPaths);

  return {
    scan: {
      ...options.scan,
      monolithCandidates: selectInsights(monolithPaths, insightMap),
      couplingCandidates: selectHotspots(couplingPaths, hotspotMap),
      debtCandidates: selectHotspots(debtPaths, hotspotMap),
      commentCleanupCandidates: selectInsights(commentCleanupPaths, insightMap)
    },
    ...(taskResult.providerUsed ? { providerUsed: taskResult.providerUsed } : {})
  };
}
