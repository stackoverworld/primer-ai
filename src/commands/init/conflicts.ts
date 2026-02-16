import { existsSync } from "node:fs";
import { join, posix } from "node:path";

import type { FileArtifact } from "../../core/types.js";

function toGeneratedVariantPath(filePath: string, targetDir: string, reserved: Set<string>): string {
  const parsed = posix.parse(filePath);
  const baseName = parsed.ext ? parsed.name : parsed.base;
  const extension = parsed.ext;

  let index = 1;
  for (;;) {
    const suffix = index === 1 ? "" : `.${index}`;
    const candidateName = `${baseName}.primer-ai.generated${suffix}${extension}`;
    const candidatePath = parsed.dir ? `${parsed.dir}/${candidateName}` : candidateName;
    if (!reserved.has(candidatePath) && !existsSync(join(targetDir, candidatePath))) {
      return candidatePath;
    }
    index += 1;
  }
}

export function remapConflictingFiles(
  targetDir: string,
  files: FileArtifact[],
  allowOverwritePaths: Set<string> = new Set<string>()
): {
  files: FileArtifact[];
  collisions: Array<{ original: string; generated: string }>;
} {
  const reserved = new Set<string>();
  const collisions: Array<{ original: string; generated: string }> = [];
  const remapped = files.map((file) => {
    let nextPath = file.path;
    const absolutePath = join(targetDir, file.path);
    if (existsSync(absolutePath) && !allowOverwritePaths.has(file.path)) {
      nextPath = toGeneratedVariantPath(file.path, targetDir, reserved);
      collisions.push({ original: file.path, generated: nextPath });
    }
    reserved.add(nextPath);
    return { ...file, path: nextPath };
  });

  return { files: remapped, collisions };
}
