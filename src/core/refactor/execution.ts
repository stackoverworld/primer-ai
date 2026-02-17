import { resolve } from "node:path";

import { runAiFreeformTask } from "../ai.js";
import { chooseProvider } from "../ai/provider-selection.js";
import { buildRefactorPolicy } from "../refactor-policy.js";
import type { AgentTarget, AiProvider } from "../types.js";
import type { RefactorExecutionOptions, RefactorExecutionResult, RunRefactorPromptResult } from "./contracts.js";
import { runOrchestratedRefactorPrompt } from "./orchestration.js";
import { buildRefactorPrompt } from "./prompt.js";
import { scanRepositoryForRefactor } from "./scan.js";

function tailLines(output: string, maxLines = 16): string {
  const lines = output
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0);
  if (lines.length <= maxLines) return lines.join("\n");
  return lines.slice(lines.length - maxLines).join("\n");
}

function parsePassStatus(output: string): "complete" | "continue" | "unknown" {
  const matches = Array.from(output.matchAll(/^\s*PRIMER_REFACTOR_STATUS:\s*(COMPLETE|CONTINUE)\s*$/gim));
  const last = matches.at(-1);
  if (!last?.[1]) return "unknown";
  return last[1].toUpperCase() === "COMPLETE" ? "complete" : "continue";
}

export async function executeAiRefactor(
  targetDir: string,
  options: RefactorExecutionOptions
): Promise<RefactorExecutionResult> {
  const scan = scanRepositoryForRefactor(targetDir, options.maxFiles);
  const policy = buildRefactorPolicy(scan.techStack, scan.projectShape);
  const notes = [options.notes?.trim(), options.focus?.trim()].filter((entry): entry is string => Boolean(entry)).join("\n");
  const promptOptions: { dryRun: boolean; notes?: string; orchestration?: boolean; maxSubagents?: number } = {
    dryRun: options.dryRun,
    ...(notes ? { notes } : {}),
    ...(typeof options.orchestration === "boolean" ? { orchestration: options.orchestration } : {}),
    ...(typeof options.maxSubagents === "number" ? { maxSubagents: options.maxSubagents } : {})
  };
  const prompt = buildRefactorPrompt(scan, policy, promptOptions);

  if (options.dryRun) {
    return {
      executed: false,
      outputTail: "Dry run requested. No AI execution performed.",
      prompt,
      scan,
      policy
    };
  }

  const taskOptions: {
    prompt: string;
    provider: AiProvider;
    targetAgent: AgentTarget;
    model?: string;
    cwd: string;
    aiTimeoutMs?: number;
    showAiFileOps?: boolean;
    orchestration?: boolean;
    maxSubagents?: number;
    expectFileWrites?: boolean;
    onStatus?: (message: string) => void;
  } = {
    prompt,
    provider: options.provider,
    targetAgent: options.targetAgent,
    cwd: resolve(targetDir),
    ...(options.model ? { model: options.model } : {}),
    ...(typeof options.aiTimeoutMs === "number" ? { aiTimeoutMs: options.aiTimeoutMs } : {}),
    ...(typeof options.showAiFileOps === "boolean" ? { showAiFileOps: options.showAiFileOps } : {}),
    ...(typeof options.orchestration === "boolean" ? { orchestration: options.orchestration } : {}),
    ...(typeof options.maxSubagents === "number" ? { maxSubagents: options.maxSubagents } : {}),
    expectFileWrites: true
  };
  if (options.onStatus) {
    taskOptions.onStatus = options.onStatus;
  }
  const taskResult = await runAiFreeformTask(taskOptions);

  const result: RefactorExecutionResult = {
    executed: taskResult.ok,
    outputTail: tailLines(taskResult.output),
    prompt,
    scan,
    policy
  };
  if (taskResult.providerUsed) {
    result.providerUsed = taskResult.providerUsed;
  }
  if (taskResult.warning) {
    result.warning = taskResult.warning;
  }
  return result;
}

export async function runRefactorPrompt(options: {
  targetDir: string;
  prompt: string;
  provider: AiProvider;
  targetAgent: AgentTarget;
  model?: string;
  plannerModel?: string;
  orchestratorModel?: string;
  workerModel?: string;
  onStatus?: (message: string) => void;
  showAiFileOps?: boolean;
  orchestration?: boolean;
  maxSubagents?: number;
  aiTimeoutMs?: number;
}): Promise<RunRefactorPromptResult> {
  const canUseCodexOrchestration =
    options.orchestration && chooseProvider(options.provider, options.targetAgent) === "codex";

  if (canUseCodexOrchestration) {
    const orchestratedResult = await runOrchestratedRefactorPrompt({
      prompt: options.prompt,
      provider: options.provider,
      targetAgent: options.targetAgent,
      cwd: resolve(options.targetDir),
      ...(options.plannerModel ? { plannerModel: options.plannerModel } : {}),
      ...(options.orchestratorModel ? { orchestratorModel: options.orchestratorModel } : {}),
      ...(options.workerModel ? { workerModel: options.workerModel } : {}),
      ...(typeof options.showAiFileOps === "boolean" ? { showAiFileOps: options.showAiFileOps } : {}),
      ...(typeof options.maxSubagents === "number" ? { maxSubagents: options.maxSubagents } : {}),
      ...(typeof options.aiTimeoutMs === "number" ? { aiTimeoutMs: options.aiTimeoutMs } : {}),
      ...(options.onStatus ? { onStatus: options.onStatus } : {})
    });

    if (orchestratedResult) {
      return orchestratedResult;
    }

    options.onStatus?.("Retrying fallback mode...");
  }

  const taskOptions: {
    prompt: string;
    provider: AiProvider;
    targetAgent: AgentTarget;
    model?: string;
    cwd: string;
    aiTimeoutMs?: number;
    showAiFileOps?: boolean;
    orchestration?: boolean;
    maxSubagents?: number;
    expectFileWrites?: boolean;
    onStatus?: (message: string) => void;
  } = {
    prompt: options.prompt,
    provider: options.provider,
    targetAgent: options.targetAgent,
    cwd: resolve(options.targetDir),
    ...(options.model ? { model: options.model } : {}),
    ...(typeof options.aiTimeoutMs === "number" ? { aiTimeoutMs: options.aiTimeoutMs } : {}),
    ...(typeof options.showAiFileOps === "boolean" ? { showAiFileOps: options.showAiFileOps } : {}),
    ...(typeof options.orchestration === "boolean" ? { orchestration: options.orchestration } : {}),
    ...(typeof options.maxSubagents === "number" ? { maxSubagents: options.maxSubagents } : {}),
    expectFileWrites: true
  };
  if (options.onStatus) {
    taskOptions.onStatus = options.onStatus;
  }

  const taskResult = await runAiFreeformTask(taskOptions);
  const result: RunRefactorPromptResult = {
    executed: taskResult.ok,
    outputTail: tailLines(taskResult.output),
    passStatus: parsePassStatus(taskResult.output)
  };
  if (taskResult.providerUsed) {
    result.providerUsed = taskResult.providerUsed;
  }
  if (taskResult.warning) {
    result.warning = taskResult.warning;
  }
  return result;
}
