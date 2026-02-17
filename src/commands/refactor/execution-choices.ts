import { cancel, confirm, isCancel, log, select, text } from "@clack/prompts";

import { discoverProviderModels } from "../../core/provider-models.js";
import type { AgentTarget, AiProvider, RefactorCommandOptions } from "../../core/types.js";

const DEFAULT_MODEL_VALUE = "__primer_ai_default_model__";
const CUSTOM_MODEL_VALUE = "__primer_ai_custom_model__";
const DEFAULT_CODEX_MODEL = "gpt-5.3-codex";
const RECOMMENDED_CODEX_MODELS = ["gpt-5.3-codex", "gpt-5.3-codex-spark"] as const;
const DEFAULT_PLANNER_MODEL = "gpt-5.3-codex";
const DEFAULT_ORCHESTRATOR_MODEL = "gpt-5.3-codex";
const DEFAULT_WORKER_MODEL = "gpt-5.3-codex-spark";
const DEFAULT_MAX_SUBAGENTS = 12;
const MIN_MAX_SUBAGENTS = 1;
const MAX_MAX_SUBAGENTS = 24;

export interface RefactorExecutionChoices {
  provider: AiProvider;
  targetAgent: AgentTarget;
  model?: string;
  plannerModel?: string;
  orchestratorModel?: string;
  workerModel?: string;
  showAiFileOps: boolean;
  notes?: string;
  orchestration: boolean;
  maxSubagents: number;
  proceed: boolean;
}

function normalizeProvider(value: string | undefined): AiProvider {
  if (!value) return "auto";
  const normalized = value.trim().toLowerCase();
  if (normalized === "codex" || normalized === "claude" || normalized === "auto") {
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

function normalizeMaxSubagents(value: number | string | undefined): number {
  if (value === undefined) return DEFAULT_MAX_SUBAGENTS;
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.min(MAX_MAX_SUBAGENTS, Math.max(MIN_MAX_SUBAGENTS, Math.floor(value)));
  }
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) {
      return Math.min(MAX_MAX_SUBAGENTS, Math.max(MIN_MAX_SUBAGENTS, parsed));
    }
  }
  throw new Error(
    `Invalid --max-subagents value "${String(value)}". Expected an integer between ${MIN_MAX_SUBAGENTS} and ${MAX_MAX_SUBAGENTS}.`
  );
}

function mergeNotes(flagNotes: string | undefined, flagFocus: string | undefined): string | undefined {
  const parts = [flagNotes?.trim(), flagFocus?.trim()].filter((entry): entry is string => Boolean(entry));
  if (!parts.length) return undefined;
  return parts.join("\n");
}

function resolveRoleModels(options: RefactorCommandOptions): {
  plannerModel?: string;
  orchestratorModel?: string;
  workerModel?: string;
} {
  const plannerModel = normalizeModel(options.plannerModel) ?? DEFAULT_PLANNER_MODEL;
  const orchestratorModel = normalizeModel(options.orchestratorModel) ?? DEFAULT_ORCHESTRATOR_MODEL;
  const workerModel = normalizeModel(options.workerModel) ?? DEFAULT_WORKER_MODEL;
  return { plannerModel, orchestratorModel, workerModel };
}

function isInteractiveSession(skipPrompts: boolean): boolean {
  if (skipPrompts) return false;
  return Boolean(process.stdout.isTTY) && Boolean(process.stdin.isTTY);
}

function defaultAgentForProvider(provider: AiProvider): AgentTarget {
  if (provider === "codex") return "codex";
  if (provider === "claude") return "claude";
  return "codex";
}

function unwrapPrompt<T>(value: T | symbol): T | null {
  if (isCancel(value)) {
    cancel("Refactor canceled.");
    return null;
  }
  return value as T;
}

function dedupeModelNames(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = value.trim();
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(normalized);
  }
  return result;
}

function codexModelCandidates(targetDir: string): string[] {
  const discoveredModels = dedupeModelNames(discoverProviderModels("codex", { cwd: targetDir }));
  return dedupeModelNames([...RECOMMENDED_CODEX_MODELS, ...discoveredModels]);
}

async function promptForProviderModel(
  provider: Exclude<AiProvider, "auto">,
  targetDir: string
): Promise<string | undefined | null> {
  const providerLabel = provider === "codex" ? "Codex" : "Claude";
  const discoveredModels =
    provider === "codex"
      ? codexModelCandidates(targetDir)
      : dedupeModelNames(discoverProviderModels(provider, { cwd: targetDir }));
  const fallbackModel = provider === "codex" ? DEFAULT_CODEX_MODEL : undefined;
  const initialValue = discoveredModels[0] ?? fallbackModel ?? DEFAULT_MODEL_VALUE;

  const selection = unwrapPrompt<string>(
    await select({
      message: `${providerLabel} model`,
      initialValue,
      options: [
        { value: DEFAULT_MODEL_VALUE, label: "Use CLI default model" },
        ...discoveredModels.map((candidate) => ({ value: candidate, label: candidate })),
        ...(fallbackModel && !discoveredModels.some((candidate) => candidate === fallbackModel)
          ? [{ value: fallbackModel, label: fallbackModel }]
          : []),
        { value: CUSTOM_MODEL_VALUE, label: "Custom model id" }
      ]
    })
  );
  if (!selection) return null;

  if (selection === DEFAULT_MODEL_VALUE) return undefined;
  if (selection === CUSTOM_MODEL_VALUE) {
    const customModel = unwrapPrompt<string>(
      await text({
        message: `${providerLabel} custom model`,
        placeholder: discoveredModels[0] ?? fallbackModel ?? "Enter model id",
        validate(value) {
          if (!value?.trim()) return "Model id is required.";
          return undefined;
        }
      })
    );
    if (!customModel) return null;
    return customModel.trim();
  }
  return selection;
}

export async function resolveExecutionChoices(
  options: RefactorCommandOptions,
  targetDir: string
): Promise<RefactorExecutionChoices | null> {
  const providerFromFlag = options.provider ? normalizeProvider(options.provider) : undefined;
  const agentFromFlag = options.agent ? normalizeTargetAgent(options.agent) : undefined;
  const modelFromFlag = normalizeModel(options.model);
  const roleModelsFromFlags = {
    plannerModel: normalizeModel(options.plannerModel),
    orchestratorModel: normalizeModel(options.orchestratorModel),
    workerModel: normalizeModel(options.workerModel)
  };
  const notesFromFlags = mergeNotes(options.notes, options.focus);
  const maxSubagents = normalizeMaxSubagents(options.maxSubagents);

  if (!isInteractiveSession(options.yes ?? false)) {
    const provider = providerFromFlag ?? "auto";
    const targetAgent =
      provider === "auto"
        ? (agentFromFlag ?? defaultAgentForProvider(provider))
        : defaultAgentForProvider(provider);
    const model = provider === "auto" ? undefined : modelFromFlag ?? (provider === "codex" ? DEFAULT_CODEX_MODEL : undefined);
    const orchestration = options.orchestration ?? true;
    const showAiFileOps = options.showAiFileOps ?? true;
    const roleModels = provider === "codex" && orchestration ? resolveRoleModels(options) : {};

    if (provider !== "auto" && agentFromFlag && agentFromFlag !== targetAgent) {
      log.warn(`Ignoring --agent=${agentFromFlag} because --provider=${provider} is fixed.`);
    }
    if (provider === "auto" && modelFromFlag) {
      log.warn("Ignoring --model because provider is auto. Use --provider codex|claude to pin a model.");
    }
    if (provider !== "codex" && (roleModelsFromFlags.plannerModel || roleModelsFromFlags.orchestratorModel || roleModelsFromFlags.workerModel)) {
      log.warn(
        "Ignoring --planner-model/--orchestrator-model/--worker-model because Codex orchestration is unavailable for this provider selection."
      );
    }

    return {
      provider,
      targetAgent,
      ...(model ? { model } : {}),
      ...roleModels,
      showAiFileOps,
      ...(notesFromFlags ? { notes: notesFromFlags } : {}),
      orchestration,
      maxSubagents,
      proceed: true
    };
  }

  let provider = providerFromFlag;
  if (!provider) {
    const providerSelection = unwrapPrompt<string>(
      await select({
        message: "Choose AI CLI for refactor execution",
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
    if (agentFromFlag && agentFromFlag !== targetAgent) {
      log.warn(`Ignoring --agent=${agentFromFlag} because provider ${provider} is selected.`);
    }
  }

  let model = modelFromFlag;
  if (provider === "auto") {
    if (modelFromFlag) {
      log.warn("Ignoring --model because provider is auto. Use provider codex|claude to pin a model.");
    }
    model = undefined;
  } else if (!modelFromFlag) {
    const selectedModel = await promptForProviderModel(provider, targetDir);
    if (selectedModel === null) return null;
    model = selectedModel;
  }

  let showAiFileOps = options.showAiFileOps ?? true;
  if (options.showAiFileOps === undefined) {
    const showOutputSelection = unwrapPrompt<boolean>(
      await confirm({
        message: "Show AI file edit/create logs in console?",
        initialValue: true
      })
    );
    if (showOutputSelection === null) return null;
    showAiFileOps = showOutputSelection;
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
          message: "Custom notes for this refactor run",
          placeholder: "Example: preserve module X naming and skip generated code under scripts/",
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

  let orchestration = options.orchestration ?? true;
  if (options.orchestration !== false) {
    const orchestrationSelection = unwrapPrompt<boolean>(
      await confirm({
        message: "Use Codex orchestration mode for coordinated subagent execution?",
        initialValue: true
      })
    );
    if (orchestrationSelection === null) return null;
    orchestration = orchestrationSelection;
  }

  let selectedMaxSubagents = maxSubagents;
  if (orchestration && options.maxSubagents === undefined) {
    const maxSubagentsInput = unwrapPrompt<string>(
      await text({
        message: `Max Codex subagents for orchestration (${MIN_MAX_SUBAGENTS}-${MAX_MAX_SUBAGENTS}, Enter = ${DEFAULT_MAX_SUBAGENTS})`,
        placeholder: String(DEFAULT_MAX_SUBAGENTS),
        defaultValue: String(DEFAULT_MAX_SUBAGENTS),
        validate(value) {
          const trimmed = value?.trim() ?? "";
          if (!trimmed) return undefined;
          const parsed = Number.parseInt(trimmed, 10);
          if (!Number.isFinite(parsed)) return "Enter a valid integer.";
          if (parsed < MIN_MAX_SUBAGENTS || parsed > MAX_MAX_SUBAGENTS) {
            return `Value must be between ${MIN_MAX_SUBAGENTS} and ${MAX_MAX_SUBAGENTS}.`;
          }
          return undefined;
        }
      })
    );
    if (maxSubagentsInput === null) return null;
    const normalizedInput = maxSubagentsInput.trim() ? maxSubagentsInput : String(DEFAULT_MAX_SUBAGENTS);
    selectedMaxSubagents = normalizeMaxSubagents(normalizedInput);
  }

  const roleModels = provider === "codex" && orchestration ? resolveRoleModels(options) : {};
  if (provider !== "codex" && (roleModelsFromFlags.plannerModel || roleModelsFromFlags.orchestratorModel || roleModelsFromFlags.workerModel)) {
    log.warn(
      "Ignoring --planner-model/--orchestrator-model/--worker-model because Codex orchestration is unavailable for this provider selection."
    );
  }

  const confirmation = unwrapPrompt<boolean>(
    await confirm({
      message: `Repository scan is complete. Start AI refactor now with ${provider}${model ? ` (${model})` : ""}?`,
      initialValue: true
    })
  );
  if (confirmation === null) return null;

  return {
    provider,
    targetAgent,
    ...(model ? { model } : {}),
    ...roleModels,
    showAiFileOps,
    ...(notes ? { notes } : {}),
    orchestration,
    maxSubagents: selectedMaxSubagents,
    proceed: confirmation
  };
}
