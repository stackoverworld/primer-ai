import { cancel, confirm, isCancel, select, text } from "@clack/prompts";

import { promptForProviderModel } from "../../core/prompts/provider-model-prompt.js";
import type { AgentTarget, AiProvider, FixCommandOptions } from "../../core/types.js";

const DEFAULT_CODEX_MODEL = "gpt-5.3-codex";

export interface FixExecutionChoices {
  provider: AiProvider;
  targetAgent: AgentTarget;
  model?: string;
  showAiFileOps: boolean;
  notes?: string;
  proceed: boolean;
}

function normalizeProvider(value: string | undefined): AiProvider {
  if (!value) return "auto";
  const normalized = value.trim().toLowerCase();
  if (normalized === "auto" || normalized === "codex" || normalized === "claude") {
    return normalized;
  }
  throw new Error(`Invalid provider "${value}". Expected: auto | codex | claude.`);
}

function normalizeTargetAgent(value: string | undefined): AgentTarget {
  if (!value) return "codex";
  const normalized = value.trim().toLowerCase();
  if (normalized === "codex" || normalized === "claude" || normalized === "both") {
    return normalized;
  }
  throw new Error(`Invalid agent target "${value}". Expected: codex | claude | both.`);
}

function normalizeModel(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function defaultAgentForProvider(provider: AiProvider): AgentTarget {
  if (provider === "claude") return "claude";
  return "codex";
}

function mergeNotes(flagNotes: string | undefined, flagFocus: string | undefined): string | undefined {
  const parts = [flagNotes?.trim(), flagFocus?.trim()].filter((entry): entry is string => Boolean(entry));
  if (!parts.length) return undefined;
  return parts.join("\n");
}

function isInteractiveSession(skipPrompts: boolean): boolean {
  if (skipPrompts) return false;
  return Boolean(process.stdout.isTTY) && Boolean(process.stdin.isTTY);
}

function unwrapPrompt<T>(value: T | symbol): T | null {
  if (isCancel(value)) {
    cancel("Fix canceled.");
    return null;
  }
  return value as T;
}

export async function resolveFixExecutionChoices(
  options: FixCommandOptions,
  targetDir: string
): Promise<FixExecutionChoices | null> {
  const providerFromFlag = options.provider ? normalizeProvider(options.provider) : undefined;
  const agentFromFlag = options.agent ? normalizeTargetAgent(options.agent) : undefined;
  const modelFromFlag = normalizeModel(options.model);
  const notesFromFlags = mergeNotes(options.notes, options.focus);

  if (!isInteractiveSession(options.yes ?? false)) {
    const provider = providerFromFlag ?? "auto";
    const targetAgent =
      provider === "auto"
        ? (agentFromFlag ?? defaultAgentForProvider(provider))
        : defaultAgentForProvider(provider);
    const model = provider === "auto" ? undefined : modelFromFlag ?? (provider === "codex" ? DEFAULT_CODEX_MODEL : undefined);
    return {
      provider,
      targetAgent,
      ...(model ? { model } : {}),
      showAiFileOps: options.showAiFileOps ?? true,
      ...(notesFromFlags ? { notes: notesFromFlags } : {}),
      proceed: true
    };
  }

  let provider = providerFromFlag;
  if (!provider) {
    const providerSelection = unwrapPrompt<string>(
      await select({
        message: "Choose AI CLI for fix execution",
        initialValue: "codex",
        options: [
          { value: "codex", label: "Codex (Recommended)" },
          { value: "auto", label: "Auto (prefer Codex, fallback Claude)" },
          { value: "claude", label: "Claude Code" }
        ]
      })
    );
    if (!providerSelection) return null;
    provider = normalizeProvider(providerSelection);
  }

  let targetAgent: AgentTarget;
  if (provider === "auto") {
    targetAgent = agentFromFlag ?? defaultAgentForProvider(provider);
    if (!agentFromFlag) {
      const agentSelection = unwrapPrompt<string>(
        await select({
          message: "Choose preferred agent target",
          initialValue: targetAgent,
          options: [
            { value: "codex", label: "Codex (Recommended)" },
            { value: "both", label: "Both (auto preference)" },
            { value: "claude", label: "Claude" }
          ]
        })
      );
      if (!agentSelection) return null;
      targetAgent = normalizeTargetAgent(agentSelection);
    }
  } else {
    targetAgent = defaultAgentForProvider(provider);
  }

  let model = modelFromFlag;
  if (provider === "auto") {
    model = undefined;
  } else if (!modelFromFlag) {
    const providerModel = await promptForProviderModel(provider, targetDir);
    if (providerModel === null) return null;
    model = providerModel ?? (provider === "codex" ? DEFAULT_CODEX_MODEL : undefined);
  }

  let showAiFileOps = options.showAiFileOps ?? true;
  if (options.showAiFileOps === undefined) {
    const showLogs = unwrapPrompt<boolean>(
      await confirm({
        message: "Show AI file edit/create logs in console?",
        initialValue: true
      })
    );
    if (showLogs === null) return null;
    showAiFileOps = showLogs;
  }

  let notes = notesFromFlags;
  if (!notesFromFlags) {
    const includeNotes = unwrapPrompt<boolean>(
      await confirm({
        message: "Add custom notes AI should consider?",
        initialValue: false
      })
    );
    if (includeNotes === null) return null;
    if (includeNotes) {
      const customNotes = unwrapPrompt<string>(
        await text({
          message: "Custom notes for this fix run",
          placeholder: "Example: preserve UI behavior and avoid changing API contracts.",
          validate(value) {
            if (!value?.trim()) return "Notes cannot be empty when enabled.";
            return undefined;
          }
        })
      );
      if (!customNotes) return null;
      notes = customNotes.trim();
    }
  }

  const confirmation = unwrapPrompt<boolean>(
    await confirm({
      message: `Baseline checks are complete. Start AI fix now with ${provider}${model ? ` (${model})` : ""}?`,
      initialValue: true
    })
  );
  if (confirmation === null) return null;

  return {
    provider,
    targetAgent,
    ...(model ? { model } : {}),
    showAiFileOps,
    ...(notes ? { notes } : {}),
    proceed: confirmation
  };
}
