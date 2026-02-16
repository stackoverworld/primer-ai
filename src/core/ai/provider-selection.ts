import { spawnSync } from "node:child_process";

import type { AgentTarget, AiProvider } from "../types.js";

export type ResolvedAiProvider = Exclude<AiProvider, "auto">;

function hasBinary(command: string): boolean {
  const locator = process.platform === "win32" ? "where" : "which";
  const probe = spawnSync(locator, [command], { encoding: "utf8" });
  return probe.status === 0;
}

export function chooseProvider(requested: AiProvider, target: AgentTarget): ResolvedAiProvider | null {
  if (requested === "codex") return hasBinary("codex") ? "codex" : null;
  if (requested === "claude") return hasBinary("claude") ? "claude" : null;

  const preference: ResolvedAiProvider[] =
    target === "codex" ? ["codex", "claude"] : target === "claude" ? ["claude", "codex"] : ["codex", "claude"];

  for (const candidate of preference) {
    if (hasBinary(candidate)) return candidate;
  }

  return null;
}
