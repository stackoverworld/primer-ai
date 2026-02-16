import type { AgentTarget, AiProvider, GenerationMode, ProjectShape } from "../types.js";
import { POPULAR_STACKS, type StackChoice } from "./constants.js";

function normalizeShape(value: string | undefined): ProjectShape | undefined {
  if (!value) return undefined;
  const allowed = new Set<ProjectShape>(["web-app", "api-service", "library", "cli-tool", "monorepo", "custom"]);
  return allowed.has(value as ProjectShape) ? (value as ProjectShape) : undefined;
}

function normalizeTarget(value: string | undefined): AgentTarget | undefined {
  if (!value) return undefined;
  const allowed = new Set<AgentTarget>(["codex", "claude", "both"]);
  return allowed.has(value as AgentTarget) ? (value as AgentTarget) : undefined;
}

function normalizeMode(value: string | undefined): GenerationMode | undefined {
  if (!value) return undefined;
  const allowed = new Set<GenerationMode>(["template", "ai-assisted"]);
  return allowed.has(value as GenerationMode) ? (value as GenerationMode) : undefined;
}

function normalizeProvider(value: string | undefined): AiProvider | undefined {
  if (!value) return undefined;
  const allowed = new Set<AiProvider>(["auto", "codex", "claude"]);
  return allowed.has(value as AiProvider) ? (value as AiProvider) : undefined;
}

function normalizeModel(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function normalizeStackChoice(value: string): StackChoice {
  const normalized = value.trim().toLowerCase();
  const preset = POPULAR_STACKS.find((stack) => stack.toLowerCase() === normalized);
  return preset ?? "other";
}

function inferProviderFromTarget(targetAgent: AgentTarget): AiProvider {
  if (targetAgent === "codex") return "codex";
  if (targetAgent === "claude") return "claude";
  return "codex";
}

export {
  inferProviderFromTarget,
  normalizeMode,
  normalizeModel,
  normalizeProvider,
  normalizeShape,
  normalizeStackChoice,
  normalizeTarget
};
