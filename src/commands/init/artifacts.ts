import { createScaffoldFiles } from "../../core/templates.js";
import type { AIDraft, AiProvider, FileArtifact, InitInput, ProjectPlan } from "../../core/types.js";

import { remapConflictingFiles } from "./conflicts.js";
import { buildExistingContextImportDoc, type ExistingContextSnippet } from "./context.js";
import { mergeReadmeArtifact } from "./readme-merge.js";

export interface InitArtifactsResult {
  generatedFiles: FileArtifact[];
  filesToWrite: FileArtifact[];
  collisions: Array<{ original: string; generated: string }>;
  mergedReadme: boolean;
}

interface PrepareInitArtifactsOptions {
  targetDir: string;
  input: InitInput;
  plan: ProjectPlan;
  draft: AIDraft | null;
  providerUsed?: Exclude<AiProvider, "auto">;
  existingContextSnippets: ExistingContextSnippet[];
}

export function prepareInitArtifacts(options: PrepareInitArtifactsOptions): InitArtifactsResult {
  const generatedFiles = createScaffoldFiles(options.input, options.plan, options.draft, options.providerUsed);
  let filesToWrite = generatedFiles;

  if (options.input.existingProject && options.existingContextSnippets.length > 0) {
    filesToWrite = [
      ...filesToWrite,
      {
        path: "docs/migration/existing-context-import.md",
        content: buildExistingContextImportDoc(options.existingContextSnippets)
      }
    ];
  }

  let collisions: Array<{ original: string; generated: string }> = [];
  let mergedReadme = false;

  if (options.input.existingProject) {
    const merged = mergeReadmeArtifact(options.targetDir, filesToWrite);
    filesToWrite = merged.files;
    mergedReadme = merged.merged;
    const allowOverwritePaths = mergedReadme ? new Set<string>(["README.md"]) : new Set<string>();
    const remapped = remapConflictingFiles(options.targetDir, filesToWrite, allowOverwritePaths);
    filesToWrite = remapped.files;
    collisions = remapped.collisions;
  }

  return { generatedFiles, filesToWrite, collisions, mergedReadme };
}
