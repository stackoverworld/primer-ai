import { cancel, confirm, isCancel, log } from "@clack/prompts";

import type { RefactorCommandOptions } from "../core/types.js";
import { resolveExecutionChoices } from "./refactor/execution-choices.js";
import { hasActionableScanBacklog } from "./refactor/backlog.js";
import { captureSourceFileSnapshot, summarizeAiVerificationSignals, summarizeSourceDiff } from "./refactor/change-report.js";
import { deriveAdaptivePassCount } from "./refactor/scan.js";
import {
  clearRefactorResumeCheckpoint,
  loadRefactorResumeCheckpoint,
  saveRefactorResumeCheckpoint,
  type LoadedRefactorResumeCheckpoint,
  type RefactorResumeExecutionSettings
} from "./refactor/resume.js";
import { deriveRefactorState } from "./refactor/state.js";
import { calibrateInitialBacklog } from "./refactor/workflow-calibration.js";
import { initializeRefactorWorkflow } from "./refactor/workflow-initialization.js";
import { executeRefactorPassLoop } from "./refactor/workflow-pass-loop.js";
import { prepareRefactorWorkflow } from "./refactor/workflow-setup.js";

function isInteractiveSession(skipPrompts: boolean): boolean {
  if (skipPrompts) return false;
  return Boolean(process.stdout.isTTY) && Boolean(process.stdin.isTTY);
}

async function resolveResumeCheckpointSelection(options: {
  targetDir: string;
  checkpoint: LoadedRefactorResumeCheckpoint | null;
  interactive: boolean;
}): Promise<LoadedRefactorResumeCheckpoint | null | undefined> {
  const { checkpoint } = options;
  if (!checkpoint) return null;
  if (!options.interactive) return checkpoint;

  const decision = await confirm({
    message: `Found an unfinished refactor session at pass ${checkpoint.nextPass}/${checkpoint.plannedPasses}. Continue it?`,
    initialValue: true
  });
  if (isCancel(decision)) {
    cancel("Refactor canceled.");
    return undefined;
  }
  if (decision) return checkpoint;

  await clearRefactorResumeCheckpoint(options.targetDir);
  log.info("Step 2/4: Starting a new refactor session; previous checkpoint was skipped.");
  return null;
}

export async function runRefactor(pathArg: string | undefined, options: RefactorCommandOptions): Promise<void> {
  const workflow = prepareRefactorWorkflow(pathArg, options);
  if (!workflow.resume) {
    await clearRefactorResumeCheckpoint(workflow.targetDir);
  }
  const interactive = isInteractiveSession(options.yes ?? false);
  const resumeCheckpointSelection = await resolveResumeCheckpointSelection({
    targetDir: workflow.targetDir,
    checkpoint: workflow.resume ? await loadRefactorResumeCheckpoint(workflow.targetDir) : null,
    interactive
  });
  if (resumeCheckpointSelection === undefined) return;
  const resumeCheckpoint = resumeCheckpointSelection;
  const initialized = await initializeRefactorWorkflow({
    targetDir: workflow.targetDir,
    maxFiles: workflow.maxFiles,
    explicitMaxFiles: workflow.explicitMaxFiles,
    promptOptions: workflow.promptOptions
  });

  if (workflow.dryRun) {
    log.success("Step 3/3: Dry-run complete. Review the prompt snapshot and run when ready.");
    return;
  }

  const selected = resumeCheckpoint?.execution
    ? { ...resumeCheckpoint.execution, proceed: true }
    : resumeCheckpoint
      ? await resolveExecutionChoices({ ...options, yes: true }, workflow.targetDir)
      : await resolveExecutionChoices(options, workflow.targetDir);
  if (!selected) return;
  if (!selected.proceed) {
    log.info("Exited before refactor execution.");
    return;
  }
  if (resumeCheckpoint?.execution) {
    log.info("Step 2/4: Reusing saved execution settings from checkpoint.");
  } else if (resumeCheckpoint) {
    log.warn("Step 2/4: Resume checkpoint is missing saved execution settings; using CLI/default non-interactive settings.");
  }

  const selectedNotes = Array.from(
    new Set(
      [workflow.promptOptions.notes, selected.notes]
        .map((entry) => entry?.trim())
        .filter((entry): entry is string => Boolean(entry))
    )
  ).join("\n");
  const runtimePromptOptions = {
    ...workflow.promptOptions,
    ...(selectedNotes ? { notes: selectedNotes } : {}),
    orchestration: selected.orchestration,
    maxSubagents: selected.maxSubagents
  };

  let currentState = initialized.currentState;
  let startPass = 1;
  let plannedPasses = 1;
  let maxFiles = initialized.maxFiles;

  if (resumeCheckpoint) {
    currentState = deriveRefactorState(resumeCheckpoint.scan, runtimePromptOptions);
    startPass = resumeCheckpoint.nextPass;
    maxFiles = workflow.explicitMaxFiles ? workflow.maxFiles : resumeCheckpoint.maxFiles;
    plannedPasses = workflow.explicitMaxPasses ? (workflow.maxPasses ?? 1) : resumeCheckpoint.plannedPasses;

    if (startPass > plannedPasses) {
      throw new Error(
        `Saved checkpoint expects pass ${startPass}, but current pass budget is ${plannedPasses}. Increase --max-passes or rerun with --no-resume.`
      );
    }

    log.info(`Step 2/4: Resuming interrupted refactor from pass ${startPass}/${plannedPasses}.`);
  } else {
    currentState = await calibrateInitialBacklog({
      targetDir: workflow.targetDir,
      currentState: initialized.currentState,
      promptOptions: runtimePromptOptions,
      provider: selected.provider,
      targetAgent: selected.targetAgent,
      ...(selected.model ? { model: selected.model } : {}),
      ...(selectedNotes ? { notes: selectedNotes } : {}),
      aiTimeoutMs: workflow.aiTimeoutMs
    });

    if (!hasActionableScanBacklog(currentState.scan)) {
      if (workflow.resume) {
        await clearRefactorResumeCheckpoint(workflow.targetDir);
      }
      log.success("Step 4/4: No actionable backlog remains after AI calibration. Refactor complete.");
      return;
    }

    plannedPasses = workflow.explicitMaxPasses ? (workflow.maxPasses ?? 1) : deriveAdaptivePassCount(currentState.backlog);
    if (!workflow.explicitMaxPasses) {
      log.info(`Step 2/4: Adaptive pass budget set to ${plannedPasses} based on calibrated backlog.`);
    }
  }

  if (!hasActionableScanBacklog(currentState.scan)) {
    if (workflow.resume) {
      await clearRefactorResumeCheckpoint(workflow.targetDir);
    }
    log.success("Step 4/4: No actionable backlog remains. Refactor complete.");
    return;
  }

  if (selected.orchestration && selected.provider === "claude") {
    log.warn("Codex orchestration is ignored when --provider claude is selected.");
  }

  const executionSettings: RefactorResumeExecutionSettings = {
    provider: selected.provider,
    targetAgent: selected.targetAgent,
    ...(selected.model ? { model: selected.model } : {}),
    ...(selected.plannerModel ? { plannerModel: selected.plannerModel } : {}),
    ...(selected.orchestratorModel ? { orchestratorModel: selected.orchestratorModel } : {}),
    ...(selected.workerModel ? { workerModel: selected.workerModel } : {}),
    showAiFileOps: selected.showAiFileOps,
    ...(selectedNotes ? { notes: selectedNotes } : {}),
    orchestration: selected.orchestration,
    maxSubagents: selected.maxSubagents
  };

  if (workflow.resume) {
    await saveRefactorResumeCheckpoint({
      targetDir: workflow.targetDir,
      plannedPasses,
      nextPass: startPass,
      maxFiles,
      scan: currentState.scan,
      backlog: currentState.backlog,
      execution: executionSettings
    });
  }

  const sourceSnapshotBefore = captureSourceFileSnapshot(workflow.targetDir, maxFiles);
  log.info(`Step 3/4: Starting ${selected.provider} handoff${selected.model ? ` (${selected.model})` : ""}...`);
  const loopResult = await executeRefactorPassLoop({
    targetDir: workflow.targetDir,
    currentState,
    maxFiles,
    explicitMaxFiles: workflow.explicitMaxFiles,
    startPass,
    plannedPasses,
    aiTimeoutMs: workflow.aiTimeoutMs,
    promptOptions: runtimePromptOptions,
    provider: selected.provider,
    targetAgent: selected.targetAgent,
    ...(selected.model ? { model: selected.model } : {}),
    ...(selected.plannerModel ? { plannerModel: selected.plannerModel } : {}),
    ...(selected.orchestratorModel ? { orchestratorModel: selected.orchestratorModel } : {}),
    ...(selected.workerModel ? { workerModel: selected.workerModel } : {}),
    showAiFileOps: selected.showAiFileOps,
    orchestration: selected.orchestration,
    maxSubagents: selected.maxSubagents,
    ...(workflow.resume
      ? {
          onPassCheckpoint: async (checkpoint: {
            nextPass: number;
            plannedPasses: number;
            maxFiles: number;
            scan: typeof currentState.scan;
            backlog: typeof currentState.backlog;
          }) => {
            await saveRefactorResumeCheckpoint({
              targetDir: workflow.targetDir,
              plannedPasses: checkpoint.plannedPasses,
              nextPass: checkpoint.nextPass,
              maxFiles: checkpoint.maxFiles,
              scan: checkpoint.scan,
              backlog: checkpoint.backlog,
              execution: executionSettings
            });
          }
        }
      : {})
  });

  const sourceSnapshotAfter = captureSourceFileSnapshot(workflow.targetDir, maxFiles);
  const sourceDiff = summarizeSourceDiff(sourceSnapshotBefore, sourceSnapshotAfter);
  const totalChangedFiles = sourceDiff.added.length + sourceDiff.modified.length + sourceDiff.removed.length;
  const changedFilePreview = [...sourceDiff.added, ...sourceDiff.modified, ...sourceDiff.removed].slice(0, 12);
  const verificationSignals = summarizeAiVerificationSignals(loopResult.finalOutputTail);

  log.info(
    `Step 4/4: Refactor run summary: ${loopResult.completedPasses} pass(es), final backlog ${loopResult.finalBacklog.monolithCount} monolith, ${loopResult.finalBacklog.couplingCount} coupling, ${loopResult.finalBacklog.debtCount} debt, ${loopResult.finalBacklog.commentCount} comment-cleanup.`
  );
  log.info(
    `Step 4/4: Source changes in this run: ${totalChangedFiles} file(s) (added ${sourceDiff.added.length}, modified ${sourceDiff.modified.length}, removed ${sourceDiff.removed.length}).`
  );
  if (changedFilePreview.length > 0) {
    const suffix = totalChangedFiles > changedFilePreview.length ? ` (+${totalChangedFiles - changedFilePreview.length} more)` : "";
    log.info(`Step 4/4: Changed files: ${changedFilePreview.join(", ")}${suffix}`);
  }
  if (verificationSignals.length > 0) {
    log.info(`Step 4/4: AI-reported verification notes: ${verificationSignals.join(" | ")}`);
  }

  if (workflow.resume) {
    await clearRefactorResumeCheckpoint(workflow.targetDir);
  }
}
