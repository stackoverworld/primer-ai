import { log, spinner } from "@clack/prompts";

import { generateAiDraft } from "../../core/ai.js";
import type { AIDraft, AiProvider, InitInput, ProjectPlan } from "../../core/types.js";

export interface InitDraftResult {
  draft: AIDraft | null;
  providerUsed?: Exclude<AiProvider, "auto">;
  warning?: string;
}

export async function prepareInitDraft(
  input: InitInput,
  plan: ProjectPlan,
  targetDir: string,
  existingContextForPrompt: string[]
): Promise<InitDraftResult> {
  const generationSpinner = spinner({ indicator: "dots" });

  if (input.generationMode !== "ai-assisted") {
    generationSpinner.start("Preparing deterministic scaffold templates...");
    generationSpinner.stop("Template context ready.");
    return { draft: null };
  }

  generationSpinner.start("Preparing AI-assisted generation...");
  const aiResult = await generateAiDraft(input, plan, {
    cwd: targetDir,
    existingContext: existingContextForPrompt,
    onStatus(message) {
      generationSpinner.message(message);
    }
  });

  if (aiResult.draft) {
    generationSpinner.stop(`AI draft captured via ${aiResult.providerUsed}.`);
  } else if (input.existingProject) {
    generationSpinner.stop("AI draft required for existing-project migration.");
    throw new Error(
      aiResult.warning ??
        "Existing project migration requires configured Codex CLI or Claude Code (installed + authenticated)."
    );
  } else {
    generationSpinner.stop("Using deterministic templates.");
    if (aiResult.warning) {
      log.warn(aiResult.warning);
    }
  }

  return aiResult;
}
