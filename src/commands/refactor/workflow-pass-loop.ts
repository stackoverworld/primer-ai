import { log } from "@clack/prompts";

import type { RepoRefactorScan } from "../../core/refactor.js";
import type { AgentTarget, AiProvider } from "../../core/types.js";

import { formatBacklogCompact, hasActionableScanBacklog, hasPendingBacklog, sameBacklog } from "./backlog.js";
import { runRefactorPass } from "./pass-execution.js";
import { rescanAfterPass } from "./pass-rescan.js";
import { writePromptSnapshot } from "./prompt-snapshot.js";
import { deriveRefactorState, type RefactorPromptOptions, type RefactorWorkflowState } from "./state.js";
import type { RefactorBacklog } from "./backlog.js";

interface ExecuteRefactorPassLoopOptions {
  targetDir: string;
  currentState: RefactorWorkflowState;
  maxFiles: number;
  explicitMaxFiles: boolean;
  startPass: number;
  plannedPasses: number;
  aiTimeoutMs: number;
  promptOptions: RefactorPromptOptions;
  provider: AiProvider;
  targetAgent: AgentTarget;
  model?: string;
  plannerModel?: string;
  orchestratorModel?: string;
  workerModel?: string;
  showAiFileOps: boolean;
  orchestration: boolean;
  maxSubagents: number;
  onPassCheckpoint?: (checkpoint: {
    nextPass: number;
    plannedPasses: number;
    maxFiles: number;
    scan: RepoRefactorScan;
    backlog: RefactorBacklog;
  }) => Promise<void> | void;
}

export interface ExecuteRefactorPassLoopResult {
  completedPasses: number;
  totalElapsedSeconds: number;
  finalBacklog: RefactorBacklog;
  finalPassStatus: string;
  finalOutputTail: string;
  passReports: Array<{
    pass: number;
    passStatus: string;
    outputTail: string;
  }>;
}

export async function executeRefactorPassLoop(options: ExecuteRefactorPassLoopOptions): Promise<ExecuteRefactorPassLoopResult> {
  const refactorStart = Date.now();
  let currentState = options.currentState;
  let maxFiles = options.maxFiles;
  let stagnantPasses = 0;
  let orchestrationIgnoredWarningLogged = false;
  const passReports: Array<{
    pass: number;
    passStatus: string;
    outputTail: string;
  }> = [];

  for (let pass = options.startPass; pass <= options.plannedPasses; pass += 1) {
    if (pass > options.startPass) {
      currentState = deriveRefactorState(currentState.scan, options.promptOptions);
      const passPromptPath = await writePromptSnapshot(options.targetDir, currentState.prompt, pass);
      log.info(`Step 2/4: Prompt snapshot for pass ${pass} saved at \`${passPromptPath}\`.`);
    }

    const runResult = await runRefactorPass({
      pass,
      totalPasses: options.plannedPasses,
      targetDir: options.targetDir,
      prompt: currentState.prompt,
      provider: options.provider,
      targetAgent: options.targetAgent,
      ...(options.model ? { model: options.model } : {}),
      ...(options.plannerModel ? { plannerModel: options.plannerModel } : {}),
      ...(options.orchestratorModel ? { orchestratorModel: options.orchestratorModel } : {}),
      ...(options.workerModel ? { workerModel: options.workerModel } : {}),
      showAiFileOps: options.showAiFileOps,
      orchestration: options.orchestration,
      maxSubagents: options.maxSubagents,
      aiTimeoutMs: options.aiTimeoutMs
    });

    if (options.orchestration && runResult.providerUsed === "claude" && !orchestrationIgnoredWarningLogged) {
      orchestrationIgnoredWarningLogged = true;
      log.warn("Codex orchestration is ignored because Claude provider handled this pass.");
    }

    if (runResult.warning) {
      log.warn(runResult.warning);
    }

    passReports.push({
      pass,
      passStatus: runResult.passStatus,
      outputTail: runResult.outputTail
    });

    const rescanResult = await rescanAfterPass({
      targetDir: options.targetDir,
      pass,
      totalPasses: options.plannedPasses,
      maxFiles,
      explicitMaxFiles: options.explicitMaxFiles,
      provider: options.provider,
      targetAgent: options.targetAgent,
      ...(options.model ? { model: options.model } : {}),
      ...(options.promptOptions.notes ? { notes: options.promptOptions.notes } : {}),
      aiTimeoutMs: options.aiTimeoutMs
    });
    maxFiles = rescanResult.maxFiles;

    log.info(
      `Step 4/4: Pass ${pass} status ${runResult.passStatus.toUpperCase()}, backlog ${formatBacklogCompact(rescanResult.backlog)}.`
    );

    if (options.onPassCheckpoint) {
      try {
        await options.onPassCheckpoint({
          nextPass: Math.min(options.plannedPasses, pass + 1),
          plannedPasses: options.plannedPasses,
          maxFiles,
          scan: rescanResult.scan,
          backlog: rescanResult.backlog
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        log.warn(`Step 4/4: Could not update resume checkpoint (${message}).`);
      }
    }

    const hasPending = hasPendingBacklog(rescanResult.backlog);
    const hasActionablePending = hasActionableScanBacklog(rescanResult.scan);
    const aiRequestsContinue = runResult.passStatus === "continue";
    const shouldContinue = hasActionablePending || (aiRequestsContinue && hasPending);
    if (!shouldContinue) {
      if (hasPending) {
        log.info("Step 4/4: Remaining backlog is non-actionable (facade/barrel signal); stopping loop.");
      }
      const totalElapsedMs = Date.now() - refactorStart;
      const totalElapsedSeconds = Math.max(1, Math.round(totalElapsedMs / 1000));
      log.success(`Refactor workflow finished in ${totalElapsedSeconds}s across ${pass} pass(es).`);
      return {
        completedPasses: passReports.length,
        totalElapsedSeconds,
        finalBacklog: rescanResult.backlog,
        finalPassStatus: runResult.passStatus,
        finalOutputTail: runResult.outputTail,
        passReports
      };
    }

    if (pass === options.plannedPasses) {
      throw new Error(
        `Refactor incomplete after ${options.plannedPasses} passes. Remaining backlog: ${formatBacklogCompact(rescanResult.backlog)}`
      );
    }

    if (sameBacklog(currentState.backlog, rescanResult.backlog)) {
      stagnantPasses += 1;
    } else {
      stagnantPasses = 0;
    }

    if (stagnantPasses >= 2) {
      throw new Error(
        `Refactor stalled after pass ${pass}. Remaining backlog is unchanged: ${formatBacklogCompact(rescanResult.backlog)}`
      );
    }

    const reason =
      hasActionablePending && aiRequestsContinue
        ? "backlog remains and AI requested CONTINUE"
        : hasActionablePending
          ? "backlog remains"
          : "AI requested CONTINUE";
    log.info(`Step 4/4: Continuing to pass ${pass + 1}/${options.plannedPasses} (${reason}).`);

    currentState = {
      ...currentState,
      scan: rescanResult.scan,
      backlog: rescanResult.backlog
    };
  }

  throw new Error("Refactor pass loop exited without terminal status.");
}
