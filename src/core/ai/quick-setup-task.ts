import { parseQuickSetupFromOutput } from "../ai-parsing.js";
import { buildQuickSetupPrompt } from "./prompts.js";
import { runStructuredTask, summarizeFailure } from "./providers.js";
import { quickSetupOutputSchema } from "./schemas.js";
import { combineOutput, resolveProviderForTask, runWithLiveStatus } from "./task-shared.js";
import type { InitInput, QuickSetupPreset, AiQuickSetupPlan } from "../types.js";
import type { AiExecutionOptions } from "./task-shared.js";

export interface AiQuickSetupResult {
  plan: AiQuickSetupPlan | null;
  providerUsed?: "codex" | "claude";
  warning?: string;
}

export async function generateAiQuickSetupPlan(
  input: InitInput,
  preset: QuickSetupPreset,
  options: AiExecutionOptions = {}
): Promise<AiQuickSetupResult> {
  if (input.generationMode !== "ai-assisted") {
    return { plan: null };
  }

  const resolved = resolveProviderForTask({
    provider: input.aiProvider,
    targetAgent: input.targetAgent,
    onStatus: options.onStatus,
    warningMessage: "AI quick setup requested, but no compatible `codex` or `claude` binary was found."
  });
  if (!resolved.provider) {
    return {
      plan: null,
      warning: resolved.warning
    };
  }

  const provider = resolved.provider;
  const prompt = buildQuickSetupPrompt(input, preset, options.existingContext ?? []);
  options.onStatus?.(`Launching ${provider}${input.aiModel ? ` (${input.aiModel})` : ""} CLI for quick setup planning...`);

  const commandResult = await runWithLiveStatus(provider, options.onStatus, () =>
    runStructuredTask(provider, prompt, quickSetupOutputSchema, {
      cwd: options.cwd,
      onStatus: options.onStatus,
      model: input.aiModel
    })
  );

  const output = combineOutput(commandResult);
  if (!commandResult.ok || !output) {
    return {
      plan: null,
      providerUsed: provider,
      warning: `Could not get quick setup plan from ${provider} (${summarizeFailure(commandResult)}).`
    };
  }

  const parsed = parseQuickSetupFromOutput(output);
  if (!parsed) {
    return {
      plan: null,
      providerUsed: provider,
      warning: `${provider} responded, but quick setup output was not valid JSON.`
    };
  }

  if (preset !== "node-ts") {
    delete parsed.runtimeProfile;
  } else if (!parsed.runtimeProfile) {
    parsed.runtimeProfile = "bare";
  }

  return {
    plan: parsed,
    providerUsed: provider
  };
}
