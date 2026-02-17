import { log, spinner } from "@clack/prompts";

import type { AgentTarget, AiProvider } from "../../core/types.js";

import { calibrateScanWithAi } from "./ai-scan.js";
import { formatBacklogCompact, sameBacklog } from "./backlog.js";
import { formatError, writePromptSnapshot } from "./prompt-snapshot.js";
import { deriveRefactorState, type RefactorPromptOptions, type RefactorWorkflowState } from "./state.js";

interface CalibrateInitialBacklogOptions {
  targetDir: string;
  currentState: RefactorWorkflowState;
  promptOptions: RefactorPromptOptions;
  provider: AiProvider;
  targetAgent: AgentTarget;
  model?: string;
  notes?: string;
  aiTimeoutMs: number;
}

export async function calibrateInitialBacklog(options: CalibrateInitialBacklogOptions): Promise<RefactorWorkflowState> {
  const initialHeuristicBacklog = options.currentState.backlog;
  const calibrationSpinner = spinner({ indicator: "dots" });
  calibrationSpinner.start("Step 2/4: Calibrating backlog signals with AI...");

  try {
    const calibrated = await calibrateScanWithAi({
      scan: options.currentState.scan,
      provider: options.provider,
      targetAgent: options.targetAgent,
      ...(options.model ? { model: options.model } : {}),
      ...(options.notes ? { notes: options.notes } : {}),
      aiTimeoutMs: options.aiTimeoutMs
    });
    calibrationSpinner.stop("Step 2/4: AI scan calibration complete.");
    if (calibrated.warning) {
      log.warn(`Step 2/4: ${calibrated.warning}`);
    }

    const calibratedState = deriveRefactorState(calibrated.scan, options.promptOptions);
    const calibratedPromptPath = await writePromptSnapshot(options.targetDir, calibratedState.prompt, 1);
    if (!sameBacklog(initialHeuristicBacklog, calibratedState.backlog)) {
      log.info(
        `Step 2/4: AI calibration adjusted backlog from ${formatBacklogCompact(initialHeuristicBacklog)} to ${formatBacklogCompact(calibratedState.backlog)}.`
      );
    } else {
      log.info(`Step 2/4: AI-calibrated backlog: ${formatBacklogCompact(calibratedState.backlog)}.`);
    }
    log.info(`Step 2/4: Updated prompt snapshot saved at \`${calibratedPromptPath}\`.`);
    return calibratedState;
  } catch (error) {
    calibrationSpinner.stop("Step 2/4: AI scan calibration skipped.");
    log.warn(`Step 2/4: AI scan calibration failed (${formatError(error)}); using heuristic backlog.`);
    return options.currentState;
  }
}
