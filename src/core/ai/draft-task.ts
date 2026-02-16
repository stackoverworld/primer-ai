import { parseDraftFromOutput } from "../ai-parsing.js";
import { buildDraftPrompt } from "./prompts.js";
import { runStructuredTask, summarizeFailure } from "./providers.js";
import { draftOutputSchema } from "./schemas.js";
import { combineOutput, resolveProviderForTask, runWithLiveStatus } from "./task-shared.js";
import type { AIDraft, InitInput, ProjectPlan } from "../types.js";
import type { AiExecutionOptions } from "./task-shared.js";

export interface AiDraftResult {
  draft: AIDraft | null;
  providerUsed?: "codex" | "claude";
  warning?: string;
}

export async function generateAiDraft(input: InitInput, plan: ProjectPlan, options: AiExecutionOptions = {}): Promise<AiDraftResult> {
  if (input.generationMode !== "ai-assisted") {
    return { draft: null };
  }

  const resolved = resolveProviderForTask({
    provider: input.aiProvider,
    targetAgent: input.targetAgent,
    onStatus: options.onStatus,
    warningMessage: "AI-assisted mode requested, but no compatible `codex` or `claude` binary was found. Using templates."
  });
  if (!resolved.provider) {
    return {
      draft: null,
      warning: resolved.warning
    };
  }

  const provider = resolved.provider;
  options.onStatus?.(`Using ${provider}${input.aiModel ? ` (${input.aiModel})` : ""} for architecture draft...`);
  options.onStatus?.("Building AI prompt...");
  const prompt = buildDraftPrompt(input, plan, options.existingContext ?? []);
  options.onStatus?.(`Launching ${provider} CLI...`);

  const commandResult = await runWithLiveStatus(provider, options.onStatus, () =>
    runStructuredTask(provider, prompt, draftOutputSchema, {
      cwd: options.cwd,
      onStatus: options.onStatus,
      model: input.aiModel
    })
  );

  const output = combineOutput(commandResult);

  if (!commandResult.ok || !output) {
    return {
      draft: null,
      providerUsed: provider,
      warning: `Could not get usable output from ${provider} (${summarizeFailure(commandResult)}). Using templates.`
    };
  }

  options.onStatus?.("AI response received. Validating JSON...");
  const parsed = parseDraftFromOutput(output);
  if (!parsed) {
    return {
      draft: null,
      providerUsed: provider,
      warning: `${provider} responded, but output was not valid JSON for scaffold drafting. Using templates.`
    };
  }

  return {
    draft: parsed,
    providerUsed: provider
  };
}
