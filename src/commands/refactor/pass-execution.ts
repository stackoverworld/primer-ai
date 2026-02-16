import { spinner } from "@clack/prompts";

import { runRefactorPrompt } from "../../core/refactor.js";
import type { AgentTarget, AiProvider } from "../../core/types.js";

import { simplifyExecutionStatus } from "./status.js";

interface RunRefactorPassOptions {
  pass: number;
  totalPasses: number;
  targetDir: string;
  prompt: string;
  provider: AiProvider;
  targetAgent: AgentTarget;
  model?: string;
  plannerModel?: string;
  orchestratorModel?: string;
  workerModel?: string;
  showAiFileOps: boolean;
  orchestration: boolean;
  maxSubagents: number;
  aiTimeoutMs: number;
}

export interface RunRefactorPassResult {
  passStatus: string;
  outputTail: string;
  providerUsed?: "codex" | "claude";
  warning?: string;
}

export async function runRefactorPass(options: RunRefactorPassOptions): Promise<RunRefactorPassResult> {
  const passStart = Date.now();
  const refactorSpinner = spinner({ indicator: "dots" });
  refactorSpinner.start(`Step 3/4: Running AI pass ${options.pass}/${options.totalPasses}...`);
  let lastExecutionPhase = "";

  const runResult = await runRefactorPrompt({
    targetDir: options.targetDir,
    prompt: options.prompt,
    provider: options.provider,
    targetAgent: options.targetAgent,
    ...(options.model ? { model: options.model } : {}),
    ...(options.plannerModel ? { plannerModel: options.plannerModel } : {}),
    ...(options.orchestratorModel ? { orchestratorModel: options.orchestratorModel } : {}),
    ...(options.workerModel ? { workerModel: options.workerModel } : {}),
    showAiFileOps: options.showAiFileOps,
    orchestration: options.orchestration,
    maxSubagents: options.maxSubagents,
    aiTimeoutMs: options.aiTimeoutMs,
    onStatus(message) {
      const phase = simplifyExecutionStatus(message);
      if (phase !== lastExecutionPhase) {
        lastExecutionPhase = phase;
        refactorSpinner.message(`Step 3/4: Pass ${options.pass}/${options.totalPasses} - ${phase}`);
      }
    }
  });

  const passElapsedMs = Date.now() - passStart;
  const passElapsedSeconds = Math.max(1, Math.round(passElapsedMs / 1000));
  const passDurationSuffix = `(${passElapsedSeconds}s elapsed)`;

  if (!runResult.executed) {
    refactorSpinner.stop(`Step 3/4: Pass ${options.pass}/${options.totalPasses} did not complete ${passDurationSuffix}.`);
    throw new Error(runResult.warning ?? "AI refactor execution failed.");
  }

  refactorSpinner.stop(`Step 3/4: Pass ${options.pass}/${options.totalPasses} completed ${passDurationSuffix}.`);
  return {
    passStatus: runResult.passStatus ?? "unknown",
    outputTail: runResult.outputTail,
    ...(runResult.providerUsed ? { providerUsed: runResult.providerUsed } : {}),
    ...(runResult.warning ? { warning: runResult.warning } : {})
  };
}
