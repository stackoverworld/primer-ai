import { log, spinner } from "@clack/prompts";

import type { FileArtifact } from "../../core/types.js";
import { ensureGitInit, writeScaffold } from "../../core/write.js";

const BRAND_FRAMES = [
  "[primer-ai    ]",
  "[ primer-ai   ]",
  "[  primer-ai  ]",
  "[   primer-ai ]",
  "[    primer-ai]",
  "[   primer-ai ]",
  "[  primer-ai  ]",
  "[ primer-ai   ]"
];

interface WriteInitScaffoldOptions {
  targetDir: string;
  displayPath: string;
  plannedDirectories: string[];
  filesToWrite: FileArtifact[];
  force: boolean;
  allowOverwritePaths?: ReadonlySet<string>;
  initializeGit: boolean;
}

export async function writeInitScaffold(options: WriteInitScaffoldOptions): Promise<string> {
  const buildSpinner = spinner({
    frames: BRAND_FRAMES,
    delay: 90
  });
  buildSpinner.start(`Building scaffold in \`${options.displayPath}\`...`);

  let gitSummary = "Skipped git initialization.";

  try {
    await writeScaffold(options.targetDir, options.plannedDirectories, options.filesToWrite, options.force, {
      ...(options.allowOverwritePaths ? { allowOverwritePaths: options.allowOverwritePaths } : {}),
      onProgress(event) {
        if (event.stage === "directories") {
          buildSpinner.message(`Creating folders ${event.current}/${event.total}: ${event.path}`);
          return;
        }
        buildSpinner.message(`Writing files ${event.current}/${event.total}: ${event.path}`);
      }
    });

    if (options.initializeGit) {
      buildSpinner.message("Initializing git repository...");
      const gitResult = ensureGitInit(options.targetDir);
      if (gitResult.initialized) {
        gitSummary = "Initialized git repository.";
      } else {
        gitSummary = `Could not initialize git repository (${gitResult.warning ?? "unknown error"}).`;
        log.warn(gitSummary);
      }
    }

    buildSpinner.stop("Scaffold build complete.");
    return gitSummary;
  } catch (error) {
    buildSpinner.error("Scaffold build failed.");
    throw error;
  }
}
