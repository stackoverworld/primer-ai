export type {
  RefactorExecutionOptions,
  RefactorExecutionResult,
  RefactorFileInsight,
  RefactorHotspot,
  RepoRefactorScan,
  RunRefactorPromptResult
} from "./refactor/contracts.js";
export { executeAiRefactor, runRefactorPrompt } from "./refactor/execution.js";
export { buildRefactorPrompt } from "./refactor/prompt.js";
export { scanRepositoryForRefactor } from "./refactor/scan.js";

import { buildRefactorPrompt } from "./refactor/prompt.js";
import { clampMaxFiles, scanRepositoryForRefactor } from "./refactor/scan.js";

export const __internal = {
  clampMaxFiles,
  buildRefactorPrompt,
  scanRepositoryForRefactor
};
