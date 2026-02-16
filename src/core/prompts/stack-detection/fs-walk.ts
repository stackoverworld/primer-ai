import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

import { SCAN_SKIP_DIRECTORIES } from "../constants.js";

export async function safeReadFile(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return null;
  }
}

export async function findFiles(
  root: string,
  matcher: (name: string) => boolean,
  maxDepth: number,
  maxResults: number
): Promise<string[]> {
  const results: string[] = [];

  async function walk(currentPath: string, depth: number): Promise<void> {
    if (results.length >= maxResults) return;

    let entries;
    try {
      entries = await readdir(currentPath, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (results.length >= maxResults) return;
      const fullPath = join(currentPath, entry.name);

      if (entry.isDirectory()) {
        if (depth >= maxDepth) continue;
        if (SCAN_SKIP_DIRECTORIES.has(entry.name)) continue;
        await walk(fullPath, depth + 1);
        continue;
      }

      if (entry.isFile() && matcher(entry.name)) {
        results.push(fullPath);
      }
    }
  }

  await walk(root, 0);
  return results;
}

export async function findDirectories(
  root: string,
  matcher: (name: string) => boolean,
  maxDepth: number,
  maxResults: number
): Promise<string[]> {
  const results: string[] = [];

  async function walk(currentPath: string, depth: number): Promise<void> {
    if (results.length >= maxResults) return;

    let entries;
    try {
      entries = await readdir(currentPath, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name === "." || entry.name === "..") continue;

      const fullPath = join(currentPath, entry.name);
      if (matcher(entry.name)) {
        results.push(fullPath);
        if (results.length >= maxResults) return;
      }

      if (depth >= maxDepth) continue;
      if (SCAN_SKIP_DIRECTORIES.has(entry.name)) continue;
      await walk(fullPath, depth + 1);
    }
  }

  await walk(root, 0);
  return results;
}
