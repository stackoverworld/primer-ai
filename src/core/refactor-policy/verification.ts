import type { ProjectShape } from "../types.js";

import type { StackSignals } from "./contracts.js";
import { detectSignals, isLikelyNodeBackend } from "./signals.js";

function uniqueCommands(commands: string[]): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];

  for (const command of commands) {
    if (seen.has(command)) continue;
    seen.add(command);
    unique.push(command);
  }

  return unique;
}

export function inferStackVerificationCommands(signals: StackSignals, projectShape: ProjectShape): string[] {
  if (signals.hasRust) {
    return ["cargo fmt", "cargo clippy --fix", "cargo test"];
  }

  if (signals.hasSwift) {
    return ["swift format lint .", "swift test"];
  }

  if (signals.hasVite && signals.hasTypescript) {
    return ["npx tsc --noEmit", "vitest run", "vite build"];
  }

  if (signals.hasNext && signals.hasTypescript) {
    return ["npx tsc --noEmit", "npm run lint", "npm run test"];
  }

  if (signals.hasPython) {
    return ["ruff check .", "ruff format --check .", "pytest -q"];
  }

  if (signals.hasGo) {
    return ["go test ./...", "golangci-lint run"];
  }

  if (signals.hasJavaOrKotlin) {
    return ["./gradlew test", "./gradlew check"];
  }

  if (signals.hasTypescript && isLikelyNodeBackend(signals, projectShape)) {
    return ["npx tsc --noEmit", "npm run test", "npm run build"];
  }

  return ["npm run lint", "npm run test", "npm run build"];
}

export function inferVerificationCommands(techStack: string, projectShape: ProjectShape): string[] {
  const signals = detectSignals(techStack);
  return uniqueCommands(inferStackVerificationCommands(signals, projectShape));
}

export function dedupeVerificationCommands(commands: string[]): string[] {
  return uniqueCommands(commands);
}
