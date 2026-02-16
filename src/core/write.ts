import { spawnSync } from "node:child_process";
import { mkdir, readdir, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import type { FileArtifact } from "./types.js";

function normalize(path: string): string {
  return path.replaceAll("\\", "/");
}

export type ScaffoldWriteStage = "directories" | "files";

export interface ScaffoldWriteProgress {
  stage: ScaffoldWriteStage;
  current: number;
  total: number;
  path: string;
}

export interface WriteScaffoldOptions {
  onProgress?: (event: ScaffoldWriteProgress) => void;
  allowOverwritePaths?: ReadonlySet<string>;
}

export async function prepareTargetDirectory(targetDir: string, force: boolean, allowNonEmpty = false): Promise<void> {
  await mkdir(targetDir, { recursive: true });
  const targetStats = await stat(targetDir);
  if (!targetStats.isDirectory()) {
    throw new Error(`Target path is not a directory: ${targetDir}`);
  }

  const entries = await readdir(targetDir);
  const meaningfulEntries = entries.filter((entry) => ![".git", ".DS_Store"].includes(entry));

  if (meaningfulEntries.length > 0 && !force && !allowNonEmpty) {
    throw new Error(
      `Target directory is not empty (${meaningfulEntries.length} entries). Use --force to scaffold anyway.`
    );
  }
}

export async function writeScaffold(
  targetDir: string,
  plannedDirectories: string[],
  files: FileArtifact[],
  force: boolean,
  options: WriteScaffoldOptions = {}
): Promise<void> {
  const directories = new Set<string>();
  for (const directory of plannedDirectories) {
    directories.add(normalize(directory));
  }
  for (const file of files) {
    directories.add(normalize(dirname(file.path)));
  }

  const normalizedDirectories = Array.from(directories).filter((directory) => directory !== "." && directory !== "");
  let writtenDirectories = 0;
  for (const directory of normalizedDirectories) {
    await mkdir(join(targetDir, directory), { recursive: true });
    writtenDirectories += 1;
    options.onProgress?.({
      stage: "directories",
      current: writtenDirectories,
      total: normalizedDirectories.length,
      path: directory
    });
  }

  let writtenFiles = 0;
  for (const file of files) {
    const absolutePath = join(targetDir, file.path);
    const shouldOverwrite = force || options.allowOverwritePaths?.has(file.path) === true;
    await writeFile(absolutePath, file.content, { encoding: "utf8", flag: shouldOverwrite ? "w" : "wx" });
    writtenFiles += 1;
    options.onProgress?.({
      stage: "files",
      current: writtenFiles,
      total: files.length,
      path: file.path
    });
  }
}

export function ensureGitInit(targetDir: string): { initialized: boolean; warning?: string } {
  const result = spawnSync("git", ["init"], {
    cwd: targetDir,
    encoding: "utf8"
  });

  if (result.error) {
    return { initialized: false, warning: result.error.message };
  }

  if (result.status !== 0) {
    return {
      initialized: false,
      warning: (result.stderr || result.stdout || "git init failed").trim()
    };
  }

  return { initialized: true };
}
