import { existsSync } from "node:fs";
import { join } from "node:path";

import { generateAiQuickSetupPlan } from "./ai.js";
import { buildCommandsForPreset } from "./quick-setup/commands.js";
import { isPresetAlreadyConfigured } from "./quick-setup/manifest.js";
import { runCommand } from "./quick-setup/process.js";
import { upsertScripts } from "./quick-setup/scripts.js";
import {
  assessQuickSetupSupport,
  decideQuickSetupPrompt,
  type QuickSetupPromptDecision,
  type QuickSetupSupport
} from "./quick-setup/support.js";
import type { AiProvider, InitInput } from "./types.js";

export type { QuickSetupPromptDecision, QuickSetupSupport };

export interface QuickSetupRunResult {
  executed: boolean;
  executedCommands: number;
  providerUsed?: Exclude<AiProvider, "auto">;
  warning?: string;
  skippedReason?: string;
  notes: string[];
}

export async function runAiQuickSetup(
  input: InitInput,
  targetDir: string,
  options: {
    onStatus?: (message: string) => void;
    existingContext?: string[];
  } = {}
): Promise<QuickSetupRunResult> {
  if (!input.runAiQuickSetup) {
    return {
      executed: false,
      executedCommands: 0,
      skippedReason: "Quick setup not requested.",
      notes: []
    };
  }

  if (input.generationMode !== "ai-assisted") {
    return {
      executed: false,
      executedCommands: 0,
      skippedReason: "Quick setup is available only in AI-assisted mode.",
      notes: []
    };
  }

  const support = assessQuickSetupSupport(input.techStack, input.projectShape);
  if (!support.supported || !support.preset) {
    return {
      executed: false,
      executedCommands: 0,
      skippedReason: support.reason,
      notes: []
    };
  }

  options.onStatus?.(`Requesting AI quick setup policy for ${support.label ?? support.preset}...`);
  const aiPlanOptions: {
    cwd: string;
    onStatus?: (message: string) => void;
    existingContext?: string[];
  } = { cwd: targetDir };
  if (options.onStatus) aiPlanOptions.onStatus = options.onStatus;
  if (options.existingContext) aiPlanOptions.existingContext = options.existingContext;

  const aiPlan = await generateAiQuickSetupPlan(input, support.preset, aiPlanOptions);
  if (!aiPlan.plan) {
    return {
      executed: false,
      executedCommands: 0,
      ...(aiPlan.providerUsed ? { providerUsed: aiPlan.providerUsed } : {}),
      warning: aiPlan.warning ?? "Could not produce AI quick setup policy.",
      notes: []
    };
  }

  const packageJsonPath = join(targetDir, "package.json");
  const tsconfigPath = join(targetDir, "tsconfig.json");
  const commands = buildCommandsForPreset(
    support.preset,
    aiPlan.plan,
    existsSync(packageJsonPath),
    existsSync(tsconfigPath)
  );

  let executedCommands = 0;
  for (const [index, step] of commands.entries()) {
    options.onStatus?.(`Quick setup ${index + 1}/${commands.length}: ${step.label}`);
    const result = await runCommand(step.command, step.args, targetDir);
    if (!result.ok) {
      const stderrSnippet = `${result.stderr}\n${result.stdout}`.replace(/\s+/g, " ").trim();
      const clipped = stderrSnippet.length > 320 ? `${stderrSnippet.slice(0, 320)}...` : stderrSnippet;
      return {
        executed: false,
        executedCommands,
        ...(aiPlan.providerUsed ? { providerUsed: aiPlan.providerUsed } : {}),
        warning: `Quick setup command failed: ${step.command} ${step.args.join(" ")} (${result.reason ?? "unknown"}${clipped ? `: ${clipped}` : ""})`,
        notes: aiPlan.plan.notes
      };
    }
    executedCommands += 1;
  }

  upsertScripts(targetDir, support.preset, aiPlan.plan);

  return {
    executed: true,
    executedCommands,
    ...(aiPlan.providerUsed ? { providerUsed: aiPlan.providerUsed } : {}),
    notes: aiPlan.plan.notes
  };
}

export const __internal = {
  buildCommandsForPreset,
  isPresetAlreadyConfigured,
  upsertScripts
};

export { assessQuickSetupSupport, decideQuickSetupPrompt };
