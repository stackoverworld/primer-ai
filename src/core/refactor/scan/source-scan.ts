import { readdirSync } from "node:fs";
import { join } from "node:path";

import { SCAN_SKIP_DIRS, SOURCE_EXTENSIONS } from "./constants.js";
import { analyzeSourceFile } from "./analyze-file.js";
import { extensionOf } from "./path-utils.js";
import type { AnalyzedFile } from "./types.js";

function enrichFanIn(files: AnalyzedFile[]): AnalyzedFile[] {
  const knownModules = new Set(files.map((file) => file.moduleKey));
  const fanIn = new Map<string, number>();

  for (const file of files) {
    const uniqueTargets = new Set<string>();
    for (const target of file.relativeImports) {
      if (!knownModules.has(target)) continue;
      uniqueTargets.add(target);
    }
    for (const target of uniqueTargets) {
      fanIn.set(target, (fanIn.get(target) ?? 0) + 1);
    }
  }

  return files.map((file) => ({
    ...file,
    fanIn: fanIn.get(file.moduleKey) ?? 0
  }));
}

export function scanSourceFiles(root: string, maxFiles: number): {
  files: AnalyzedFile[];
  reachedFileCap: boolean;
} {
  const files: AnalyzedFile[] = [];
  const stack = [root];
  let reachedFileCap = false;

  while (stack.length > 0) {
    const current = stack.pop()!;
    let entries;
    try {
      entries = readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (files.length >= maxFiles) {
        reachedFileCap = true;
        break;
      }

      const absolutePath = join(current, entry.name);
      if (entry.isDirectory()) {
        if (SCAN_SKIP_DIRS.has(entry.name)) continue;
        stack.push(absolutePath);
        continue;
      }

      if (!entry.isFile()) continue;
      if (!SOURCE_EXTENSIONS.has(extensionOf(entry.name))) continue;

      const analyzed = analyzeSourceFile(root, absolutePath);
      if (!analyzed) continue;
      files.push(analyzed);
    }

    if (reachedFileCap) break;
  }

  files.sort((a, b) => a.path.localeCompare(b.path));
  return {
    files: enrichFanIn(files),
    reachedFileCap
  };
}
