import type { AgentTarget, InitInput } from "../types.js";

export function includesClaude(target: AgentTarget): boolean {
  return target === "claude" || target === "both";
}

export function includesCodex(target: AgentTarget): boolean {
  return target === "codex" || target === "both";
}

export function normalizePath(path: string): string {
  return path.replaceAll("\\", "/");
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function isLandingPageProject(input: InitInput): boolean {
  if (input.projectShape !== "web-app") return false;
  const description = input.description.toLowerCase();
  const landingSignals = [
    "landing",
    "marketing",
    "promo",
    "storefront",
    "local store",
    "one-page",
    "brochure"
  ];
  return landingSignals.some((signal) => description.includes(signal));
}
