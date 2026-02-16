import { log, spinner } from "@clack/prompts";

import { runAiQuickSetup } from "../../core/quick-setup.js";
import type { InitInput } from "../../core/types.js";

export async function runInitQuickSetup(
  input: InitInput,
  targetDir: string,
  existingContextForPrompt: string[]
): Promise<string | null> {
  if (!input.runAiQuickSetup) {
    return null;
  }

  const quickSetupSpinner = spinner({ indicator: "dots" });
  quickSetupSpinner.start("Preparing AI quick setup...");
  const quickSetupResult = await runAiQuickSetup(input, targetDir, {
    existingContext: existingContextForPrompt,
    onStatus(message) {
      quickSetupSpinner.message(message);
    }
  });

  if (quickSetupResult.executed) {
    quickSetupSpinner.stop(`AI quick setup complete (${quickSetupResult.executedCommands} commands).`);
    const summary = `AI quick setup executed ${quickSetupResult.executedCommands} commands${
      quickSetupResult.providerUsed ? ` via ${quickSetupResult.providerUsed}` : ""
    }.`;
    for (const note of quickSetupResult.notes) {
      log.info(`Quick setup note: ${note}`);
    }
    return summary;
  }

  quickSetupSpinner.stop("AI quick setup skipped.");
  if (quickSetupResult.warning) {
    log.warn(quickSetupResult.warning);
  } else if (quickSetupResult.skippedReason) {
    log.info(`Quick setup skipped: ${quickSetupResult.skippedReason}`);
  }
  return null;
}
