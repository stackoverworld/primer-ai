import { log, spinner } from "@clack/prompts";

import { runAiFreeformTask } from "../core/ai.js";
import { buildRefactorPolicy } from "../core/refactor-policy.js";
import { scanRepositoryForRefactor } from "../core/refactor.js";
import type { FixCommandOptions } from "../core/types.js";

import { captureSourceFileSnapshot, summarizeSourceDiff } from "./refactor/change-report.js";
import { resolveFixExecutionChoices } from "./fix/execution-choices.js";
import { buildFixPrompt } from "./fix/prompt.js";
import { buildFixVerificationPlan, runFixVerificationCycle, type FixVerificationCycleResult } from "./fix/verification.js";
import { prepareFixWorkflow } from "./fix/workflow-setup.js";
import { simplifyExecutionStatus } from "./refactor/status.js";

const MAX_FIX_ADAPTIVE_PASSES = 12;

function formatVerificationSummary(result: FixVerificationCycleResult): string {
  const passed = result.results.filter((entry) => entry.ok).length;
  const skipped = result.results.filter((entry) => entry.skipped).length;
  const failed = result.results.filter((entry) => entry.actionableFailure).length;
  return `${passed} passed, ${failed} actionable-failed, ${skipped} skipped`;
}

function summarizeRemainingFailures(result: FixVerificationCycleResult): string {
  if (!result.actionableFailures.length) return "none";
  return result.actionableFailures.map((failure) => failure.command).join(" | ");
}

function mergeNotes(primary: string | undefined, secondary: string | undefined): string | undefined {
  const merged = Array.from(
    new Set([primary?.trim(), secondary?.trim()].filter((value): value is string => Boolean(value)))
  ).join("\n");
  return merged ? merged : undefined;
}

function deriveAdaptiveFixPassBudget(currentPassBudget: number, actionableFailures: number): number {
  const growth = Math.max(1, Math.min(3, Math.ceil(actionableFailures / 2)));
  return Math.min(MAX_FIX_ADAPTIVE_PASSES, currentPassBudget + growth);
}

async function runVerificationWithSpinner(options: {
  stageLabel: string;
  targetDir: string;
  timeoutMs: number;
  plan: ReturnType<typeof buildFixVerificationPlan>;
}): Promise<FixVerificationCycleResult> {
  const verifySpinner = spinner({ indicator: "dots" });
  verifySpinner.start(`${options.stageLabel}: Running verification commands...`);
  const result = await runFixVerificationCycle(options.plan, {
    cwd: options.targetDir,
    timeoutMs: options.timeoutMs,
    onStatus(message) {
      verifySpinner.message(`${options.stageLabel}: ${message}`);
    }
  });
  verifySpinner.stop(`${options.stageLabel}: Verification complete (${formatVerificationSummary(result)}).`);
  return result;
}

export async function runFix(pathArg: string | undefined, options: FixCommandOptions): Promise<void> {
  const workflow = prepareFixWorkflow(pathArg, options);
  const scan = scanRepositoryForRefactor(workflow.targetDir, workflow.maxFiles);
  const policy = buildRefactorPolicy(scan.techStack, scan.projectShape);
  const verificationPlan = buildFixVerificationPlan(scan, policy);

  log.success("Step 1/4: Scan complete.");
  log.info(
    `Step 1/4: Fix brief ready (${scan.techStack}, ${scan.projectShape}, ${scan.scannedSourceFiles} files).`
  );
  log.info(
    `Step 1/4: Verification plan selected ${verificationPlan.commands.length} command(s) via ${verificationPlan.packageManager}.`
  );

  if (!verificationPlan.commands.length) {
    log.warn("Step 2/4: No verification commands were resolved for this repository.");
    return;
  }

  const sourceSnapshotBefore = captureSourceFileSnapshot(workflow.targetDir, workflow.maxFiles);
  let cycleResult = await runVerificationWithSpinner({
    stageLabel: "Step 2/4",
    targetDir: workflow.targetDir,
    timeoutMs: Math.min(workflow.aiTimeoutMs, 10 * 60 * 1000),
    plan: verificationPlan
  });

  if (!cycleResult.actionableFailures.length) {
    log.success("Step 4/4: No actionable verification failures detected. Nothing to fix.");
    return;
  }

  log.warn(`Step 2/4: Actionable failures found: ${summarizeRemainingFailures(cycleResult)}.`);

  if (workflow.dryRun) {
    log.info("Step 4/4: Dry-run complete. Re-run without --dry-run to apply AI fixes.");
    return;
  }

  const execution = await resolveFixExecutionChoices(options, workflow.targetDir);
  if (!execution) return;
  if (!execution.proceed) {
    log.info("Exited before AI fix execution.");
    return;
  }

  const mergedNotes = mergeNotes(workflow.notesFromFlags, execution.notes);
  const allowAdaptivePassBudgetGrowth = !workflow.explicitMaxPasses;
  let plannedPasses = workflow.maxPasses;

  for (let pass = 1; pass <= plannedPasses; pass += 1) {
    const streamAiFileOps = execution.showAiFileOps;
    const fixSpinner = streamAiFileOps ? null : spinner({ indicator: "dots" });
    if (fixSpinner) {
      fixSpinner.start(`Step 3/4: Pass ${pass}/${plannedPasses} - Applying AI fixes...`);
    } else {
      log.info(`Step 3/4: Pass ${pass}/${plannedPasses} - Applying AI fixes...`);
    }
    let lastExecutionPhase = "";
    let lastNonWaitingStatusAt = Date.now();

    const prompt = buildFixPrompt({
      scan,
      policy,
      verificationCommands: verificationPlan.commands,
      failures: cycleResult.actionableFailures,
      pass,
      totalPasses: plannedPasses,
      ...(mergedNotes ? { notes: mergedNotes } : {})
    });

    const aiResult = await runAiFreeformTask({
      prompt,
      provider: execution.provider,
      targetAgent: execution.targetAgent,
      ...(execution.model ? { model: execution.model } : {}),
      cwd: workflow.targetDir,
      aiTimeoutMs: workflow.aiTimeoutMs,
      showAiFileOps: execution.showAiFileOps,
      expectFileWrites: true,
      onStatus(message) {
        const rawPhase = simplifyExecutionStatus(message);
        const phase = rawPhase === "Applying refactor updates" ? "Applying AI fixes" : rawPhase;
        if (phase === "Waiting for AI response" && lastExecutionPhase && lastExecutionPhase !== phase) {
          const quietForMs = Date.now() - lastNonWaitingStatusAt;
          if (quietForMs < 15_000) {
            return;
          }
        }
        if (phase === lastExecutionPhase) return;
        lastExecutionPhase = phase;
        if (phase !== "Waiting for AI response") {
          lastNonWaitingStatusAt = Date.now();
        }
        if (fixSpinner) {
          fixSpinner.message(`Step 3/4: Pass ${pass}/${plannedPasses} - ${phase}`);
        } else {
          log.info(`Step 3/4: Pass ${pass}/${plannedPasses} - ${phase}`);
        }
      }
    });

    if (!aiResult.ok) {
      if (fixSpinner) {
        fixSpinner.stop(`Step 3/4: Pass ${pass}/${plannedPasses} did not complete.`);
      } else {
        log.error(`Step 3/4: Pass ${pass}/${plannedPasses} did not complete.`);
      }
      throw new Error(aiResult.warning ?? "AI fix execution failed.");
    }

    if (fixSpinner) {
      fixSpinner.stop(`Step 3/4: Pass ${pass}/${plannedPasses} completed.`);
    } else {
      log.success(`Step 3/4: Pass ${pass}/${plannedPasses} completed.`);
    }
    if (aiResult.warning) {
      log.warn(aiResult.warning);
    }

    cycleResult = await runVerificationWithSpinner({
      stageLabel: `Step 4/4 (pass ${pass})`,
      targetDir: workflow.targetDir,
      timeoutMs: Math.min(workflow.aiTimeoutMs, 10 * 60 * 1000),
      plan: verificationPlan
    });

    if (!cycleResult.actionableFailures.length) {
      const sourceSnapshotAfter = captureSourceFileSnapshot(workflow.targetDir, workflow.maxFiles);
      const sourceDiff = summarizeSourceDiff(sourceSnapshotBefore, sourceSnapshotAfter);
      const totalChanged = sourceDiff.added.length + sourceDiff.modified.length + sourceDiff.removed.length;
      log.success(`Step 4/4: Fix workflow complete after ${pass} pass(es).`);
      log.info(
        `Step 4/4: Source changes in this run: ${totalChanged} file(s) (added ${sourceDiff.added.length}, modified ${sourceDiff.modified.length}, removed ${sourceDiff.removed.length}).`
      );
      if (totalChanged > 0) {
        const changedPreview = [...sourceDiff.added, ...sourceDiff.modified, ...sourceDiff.removed].slice(0, 12);
        const suffix = totalChanged > changedPreview.length ? ` (+${totalChanged - changedPreview.length} more)` : "";
        log.info(`Step 4/4: Changed files: ${changedPreview.join(", ")}${suffix}`);
      }
      return;
    }

    if (pass < plannedPasses) {
      log.warn(
        `Step 4/4: Remaining actionable failures after pass ${pass}: ${summarizeRemainingFailures(cycleResult)}.`
      );
      continue;
    }

    if (allowAdaptivePassBudgetGrowth && pass === plannedPasses) {
      const nextPlannedPasses = deriveAdaptiveFixPassBudget(plannedPasses, cycleResult.actionableFailures.length);
      if (nextPlannedPasses > plannedPasses) {
        const previousPlannedPasses = plannedPasses;
        plannedPasses = nextPlannedPasses;
        log.info(
          `Step 4/4: Adaptive fix pass budget increased from ${previousPlannedPasses} to ${plannedPasses} based on remaining actionable failures.`
        );
        continue;
      }
      log.warn(
        `Step 4/4: Adaptive fix pass budget reached safety cap (${MAX_FIX_ADAPTIVE_PASSES}) with remaining actionable failures.`
      );
    }
  }

  throw new Error(
    `Fix workflow incomplete after ${plannedPasses} pass(es). Remaining actionable failures: ${summarizeRemainingFailures(cycleResult)}.`
  );
}
