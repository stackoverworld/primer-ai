import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import type { AiProvider } from "./types.js";

type FixedProvider = Exclude<AiProvider, "auto">;

export interface DiscoverProviderModelsOptions {
  cwd?: string;
  homeDir?: string;
}

const TOML_MODEL_PATTERN = /\bmodel\s*=\s*(?:"([^"]+)"|'([^']+)')/gi;

const ENV_MODEL_KEYS: Record<FixedProvider, string[]> = {
  codex: ["CODEX_MODEL", "OPENAI_MODEL"],
  claude: ["CLAUDE_MODEL", "ANTHROPIC_MODEL"]
};

function normalizeCandidate(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.includes("\n") || trimmed.includes("\r")) return null;
  return trimmed;
}

function appendModels(target: string[], seen: Set<string>, values: Iterable<string>): void {
  for (const rawValue of values) {
    const normalized = normalizeCandidate(rawValue);
    if (!normalized) continue;
    const dedupeKey = normalized.toLowerCase();
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    target.push(normalized);
  }
}

function readFileIfPresent(path: string): string | null {
  if (!existsSync(path)) return null;
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}

function parseTomlModels(raw: string): string[] {
  const results: string[] = [];
  for (const match of raw.matchAll(TOML_MODEL_PATTERN)) {
    const value = match[1] ?? match[2];
    if (value) results.push(value);
  }
  return results;
}

function parseJsonModels(raw: string): string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return [];
  }

  const results: string[] = [];

  function walk(value: unknown): void {
    if (!value) return;
    if (Array.isArray(value)) {
      for (const entry of value) walk(entry);
      return;
    }
    if (typeof value !== "object") return;

    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      const normalizedKey = key.toLowerCase();
      if (typeof child === "string" && (normalizedKey === "model" || normalizedKey.endsWith("model"))) {
        results.push(child);
        continue;
      }
      walk(child);
    }
  }

  walk(parsed);
  return results;
}

function collectConfigModels(provider: FixedProvider, cwd: string, home: string): string[] {
  const paths =
    provider === "codex"
      ? [join(cwd, ".codex", "config.toml"), join(home, ".codex", "config.toml")]
      : [
          join(cwd, ".claude", "settings.json"),
          join(cwd, ".claude.json"),
          join(home, ".claude", "settings.json"),
          join(home, ".claude.json")
        ];

  const values: string[] = [];
  for (const configPath of paths) {
    const raw = readFileIfPresent(configPath);
    if (!raw) continue;
    if (provider === "codex") {
      values.push(...parseTomlModels(raw));
      continue;
    }
    values.push(...parseJsonModels(raw));
  }
  return values;
}

function collectEnvironmentModels(provider: FixedProvider): string[] {
  const keys = ENV_MODEL_KEYS[provider];
  const values: string[] = [];
  for (const key of keys) {
    const value = process.env[key];
    if (value) values.push(value);
  }
  return values;
}

export function discoverProviderModels(
  provider: FixedProvider,
  options: DiscoverProviderModelsOptions = {}
): string[] {
  const cwd = options.cwd ?? process.cwd();
  const home = options.homeDir ?? homedir();

  const models: string[] = [];
  const seen = new Set<string>();

  appendModels(models, seen, collectConfigModels(provider, cwd, home));
  appendModels(models, seen, collectEnvironmentModels(provider));
  return models;
}
