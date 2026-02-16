import { select, text } from "@clack/prompts";

import { discoverProviderModels } from "../provider-models.js";
import type { AiProvider } from "../types.js";
import { CUSTOM_MODEL_VALUE, DEFAULT_MODEL_VALUE } from "./constants.js";
import { unwrapPrompt } from "./interaction.js";

async function promptForProviderModel(
  provider: Exclude<AiProvider, "auto">,
  cwd: string
): Promise<string | undefined> {
  const providerLabel = provider === "codex" ? "Codex" : "Claude";
  const discoveredModels = discoverProviderModels(provider, { cwd });
  const initialValue = discoveredModels[0] ?? DEFAULT_MODEL_VALUE;

  const selection = unwrapPrompt<string>(
    await select({
      message: `${providerLabel} model`,
      initialValue,
      options: [
        { value: DEFAULT_MODEL_VALUE, label: "Use CLI default model" },
        ...discoveredModels.map((model) => ({ value: model, label: model })),
        { value: CUSTOM_MODEL_VALUE, label: "Custom model id" }
      ]
    })
  );

  if (selection === DEFAULT_MODEL_VALUE) return undefined;
  if (selection === CUSTOM_MODEL_VALUE) {
    const customModel = unwrapPrompt<string>(
      await text({
        message: `${providerLabel} custom model`,
        placeholder: discoveredModels[0] ?? "Enter model id",
        validate(value) {
          if (!value?.trim()) return "Model id is required.";
          return undefined;
        }
      })
    );
    return customModel.trim();
  }

  return selection;
}

export { promptForProviderModel };
