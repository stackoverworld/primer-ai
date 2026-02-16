import { log, spinner } from "@clack/prompts";

import type { RepoRefactorScan } from "../../core/refactor.js";
import type { AgentTarget, AiProvider } from "../../core/types.js";

import { calibrateScanWithAi } from "./ai-scan.js";
import { formatBacklogCompact, sameBacklog, summarizeBacklog, type RefactorBacklog } from "./backlog.js";
import { formatError } from "./prompt-snapshot.js";
import { resolveScanWithCoverage } from "./scan.js";

interface RescanAfterPassOptions {
  targetDir: string;
  pass: number;
  totalPasses: number;
  maxFiles: number;
  explicitMaxFiles: boolean;
  provider: AiProvider;
  targetAgent: AgentTarget;
  model?: string;
  notes?: string;
  aiTimeoutMs: number;
}

export interface RescanAfterPassResult {
  scan: RepoRefactorScan;
  backlog: RefactorBacklog;
  maxFiles: number;
}

export async function rescanAfterPass(options: RescanAfterPassOptions): Promise<RescanAfterPassResult> {
  const rescanSpinner = spinner({ indicator: "dots" });
  rescanSpinner.start(`Step 4/4: Rescanning after pass ${options.pass}/${options.totalPasses}...`);
  const rescanResult = resolveScanWithCoverage(options.targetDir, options.maxFiles, options.explicitMaxFiles);
  const heuristicScan = rescanResult.scan;
  let maxFiles = options.maxFiles;
  if (!options.explicitMaxFiles && rescanResult.maxFilesUsed > maxFiles) {
    maxFiles = rescanResult.maxFilesUsed;
    log.info(`Step 4/4: Auto-expanded source scan limit to ${maxFiles} files after pass ${options.pass}.`);
  }
  rescanSpinner.stop(`Step 4/4: Rescan complete after pass ${options.pass}/${options.totalPasses}.`);
  if (heuristicScan.reachedFileCap) {
    if (options.explicitMaxFiles) {
      log.warn("Step 4/4: Rescan reached file cap; rerun with a higher --max-files value for broader coverage.");
    } else {
      log.warn(`Step 4/4: Rescan reached automatic cap at ${maxFiles} files; coverage may still be partial.`);
    }
  }

  const heuristicBacklog = summarizeBacklog(heuristicScan);
  let nextScan = heuristicScan;
  let nextBacklog = heuristicBacklog;
  const calibrationSpinner = spinner({ indicator: "dots" });
  calibrationSpinner.start(`Step 4/4: Calibrating backlog signals after pass ${options.pass}/${options.totalPasses}...`);

  try {
    const calibrated = await calibrateScanWithAi({
      scan: heuristicScan,
      provider: options.provider,
      targetAgent: options.targetAgent,
      ...(options.model ? { model: options.model } : {}),
      ...(options.notes ? { notes: options.notes } : {}),
      aiTimeoutMs: options.aiTimeoutMs,
      onStatus(message) {
        calibrationSpinner.message(`Step 4/4: ${message}`);
      }
    });
    calibrationSpinner.stop(`Step 4/4: AI scan calibration complete after pass ${options.pass}/${options.totalPasses}.`);
    if (calibrated.warning) {
      log.warn(`Step 4/4: ${calibrated.warning}`);
    }
    nextScan = calibrated.scan;
    nextBacklog = summarizeBacklog(nextScan);
    if (!sameBacklog(heuristicBacklog, nextBacklog)) {
      log.info(
        `Step 4/4: Pass ${options.pass} AI calibration adjusted backlog from ${formatBacklogCompact(heuristicBacklog)} to ${formatBacklogCompact(nextBacklog)}.`
      );
    }
  } catch (error) {
    calibrationSpinner.stop(`Step 4/4: AI scan calibration skipped after pass ${options.pass}/${options.totalPasses}.`);
    log.warn(`Step 4/4: AI scan calibration failed (${formatError(error)}); using heuristic backlog.`);
  }

  return {
    scan: nextScan,
    backlog: nextBacklog,
    maxFiles
  };
}
