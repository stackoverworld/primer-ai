import type { ProjectShape } from "../types.js";

import type { StackSignals } from "./contracts.js";

function escapeRegex(source: string): string {
  return source.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function includesAny(source: string, terms: string[]): boolean {
  return terms.some((term) => source.includes(term));
}

function includesWord(source: string, term: string): boolean {
  return new RegExp(`\\b${escapeRegex(term)}\\b`).test(source);
}

function includesAnyWord(source: string, terms: string[]): boolean {
  return terms.some((term) => includesWord(source, term));
}

function isNodeBackendShape(projectShape: ProjectShape): boolean {
  return projectShape === "api-service";
}

export function detectSignals(techStack: string): StackSignals {
  const stack = techStack.toLowerCase();
  const hasTypescript = includesAny(stack, ["typescript"]) || includesAnyWord(stack, ["ts"]);
  const hasNodeMention = includesAny(stack, ["node.js"]) || includesWord(stack, "node");
  const hasExpressOrFastify = includesAnyWord(stack, ["express", "fastify"]);
  const hasNext = includesAny(stack, ["next.js"]) || includesWord(stack, "next");
  const hasReact = includesWord(stack, "react");
  const hasVite = includesWord(stack, "vite");
  const hasNodeRuntime = hasNodeMention || hasExpressOrFastify || hasNext || hasVite;

  return {
    hasTypescript,
    hasNodeMention,
    hasNodeRuntime,
    hasNext,
    hasReact,
    hasVite,
    hasRust: includesWord(stack, "rust"),
    hasPython: includesWord(stack, "python"),
    hasGo: includesAnyWord(stack, ["go", "golang"]),
    hasJavaOrKotlin: includesAnyWord(stack, ["java", "kotlin"]),
    hasSwift: includesAnyWord(stack, ["swift", "xcode", "ios"]),
    hasExpressOrFastify
  };
}

export function isLikelyNodeBackend(signals: StackSignals, projectShape: ProjectShape): boolean {
  if (signals.hasExpressOrFastify) return true;
  if (!isNodeBackendShape(projectShape)) return false;

  if (signals.hasRust || signals.hasPython || signals.hasGo || signals.hasJavaOrKotlin || signals.hasSwift) {
    return false;
  }

  if (signals.hasNext || (signals.hasReact && signals.hasVite)) {
    return false;
  }

  return signals.hasNodeRuntime || signals.hasTypescript;
}
