import { log, spinner } from "@clack/prompts";

import { formatBacklogCompact } from "./backlog.js";
import { writePromptSnapshot } from "./prompt-snapshot.js";
import { resolveScanWithCoverage } from "./scan.js";
import { deriveRefactorState, type RefactorPromptOptions, type RefactorWorkflowState } from "./state.js";

interface InitializeRefactorWorkflowOptions {
  targetDir: string;
  maxFiles: number;
  explicitMaxFiles: boolean;
  promptOptions: RefactorPromptOptions;
}

export interface InitializeRefactorWorkflowResult {
  currentState: RefactorWorkflowState;
  maxFiles: number;
}

export async function initializeRefactorWorkflow(
  options: InitializeRefactorWorkflowOptions
): Promise<InitializeRefactorWorkflowResult> {
  const scanSpinner = spinner({ indicator: "dots" });
  scanSpinner.start(`Step 1/4: Scanning repository in \`${options.targetDir}\`...`);
  const initialScanResult = resolveScanWithCoverage(options.targetDir, options.maxFiles, options.explicitMaxFiles);
  const currentState = deriveRefactorState(initialScanResult.scan, options.promptOptions);
  const maxFiles = initialScanResult.maxFilesUsed;
  scanSpinner.stop("Step 1/4: Scan complete.");

  const promptPath = await writePromptSnapshot(options.targetDir, currentState.prompt, 1);
  log.info(
    `Step 2/4: Refactor brief ready (${currentState.scan.techStack}, ${currentState.scan.projectShape}, ${currentState.scan.scannedSourceFiles} files).`
  );
  log.info(`Step 2/4: Heuristic backlog: ${formatBacklogCompact(currentState.backlog)}.`);
  if (!options.explicitMaxFiles && initialScanResult.expanded) {
    log.info(`Step 2/4: Auto-expanded source scan limit to ${maxFiles} files for default full coverage.`);
  }
  if (currentState.scan.reachedFileCap) {
    if (options.explicitMaxFiles) {
      log.warn("Step 2/4: Source scan reached file cap; rerun with a higher --max-files value for broader coverage.");
    } else {
      log.warn(`Step 2/4: Source scan reached automatic cap at ${maxFiles} files; coverage may still be partial.`);
    }
  }
  log.info(`Step 2/4: Prompt snapshot saved at \`${promptPath}\`.`);

  return { currentState, maxFiles };
}
