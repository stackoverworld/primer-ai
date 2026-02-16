import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { SCAN_SKIP_DIRS, SOURCE_EXTENSIONS } from "../../core/refactor/scan/constants.js";
import { extensionOf, normalizeRelativePath } from "../../core/refactor/scan/path-utils.js";

interface SourceFileSnapshotEntry {
  fingerprint: string;
}

export interface SourceFileSnapshot {
  files: Map<string, SourceFileSnapshotEntry>;
}

export interface SourceDiffSummary {
  added: string[];
  modified: string[];
  removed: string[];
}

export function captureSourceFileSnapshot(targetDir: string, maxFiles: number): SourceFileSnapshot {
  const files = new Map<string, SourceFileSnapshotEntry>();
  const stack = [targetDir];

  while (stack.length > 0 && files.size < maxFiles) {
    const current = stack.pop()!;
    let entries;
    try {
      entries = readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (files.size >= maxFiles) break;

      const absolutePath = join(current, entry.name);
      if (entry.isDirectory()) {
        if (SCAN_SKIP_DIRS.has(entry.name)) continue;
        stack.push(absolutePath);
        continue;
      }

      if (!entry.isFile()) continue;
      if (!SOURCE_EXTENSIONS.has(extensionOf(entry.name))) continue;

      try {
        const stat = statSync(absolutePath);
        const relativePath = normalizeRelativePath(targetDir, absolutePath);
        const fingerprint = `${stat.size}:${Math.round(stat.mtimeMs)}`;
        files.set(relativePath, { fingerprint });
      } catch {
        // Ignore files that disappear during traversal.
      }
    }
  }

  return { files };
}

export function summarizeSourceDiff(before: SourceFileSnapshot, after: SourceFileSnapshot): SourceDiffSummary {
  const added: string[] = [];
  const modified: string[] = [];
  const removed: string[] = [];

  for (const [path, beforeEntry] of before.files) {
    const afterEntry = after.files.get(path);
    if (!afterEntry) {
      removed.push(path);
      continue;
    }
    if (afterEntry.fingerprint !== beforeEntry.fingerprint) {
      modified.push(path);
    }
  }

  for (const path of after.files.keys()) {
    if (!before.files.has(path)) {
      added.push(path);
    }
  }

  added.sort((a, b) => a.localeCompare(b));
  modified.sort((a, b) => a.localeCompare(b));
  removed.sort((a, b) => a.localeCompare(b));
  return { added, modified, removed };
}

export function summarizeAiVerificationSignals(outputTail: string): string[] {
  const lines = outputTail
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const signals = lines.filter((line) =>
    /(lint|test|build|tsc|vitest|vite build|cargo|swift test|pytest|go test|gradle|lock|timeout|missing script)/i.test(line)
  );

  const deduped = Array.from(new Set(signals));
  return deduped.slice(0, 8);
}
