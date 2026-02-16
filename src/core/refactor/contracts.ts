import type { RefactorPolicy } from "../refactor-policy.js";
import type { AgentTarget, AiProvider, ProjectShape } from "../types.js";

export interface RefactorFileInsight {
  path: string;
  lineCount: number;
  commentLines: number;
  lowSignalCommentLines: number;
  todoCount: number;
  importCount: number;
  internalImportCount: number;
  fanIn: number;
  exportCount: number;
  functionCount: number;
  classCount: number;
}

export interface RefactorHotspot extends RefactorFileInsight {
  score: number;
  reasons: string[];
  splitHypothesis: string;
}

export interface RepoRefactorScan {
  targetDir: string;
  techStack: string;
  projectShape: ProjectShape;
  scannedSourceFiles: number;
  scannedTotalLines: number;
  reachedFileCap: boolean;
  largestFiles: RefactorFileInsight[];
  monolithCandidates: RefactorFileInsight[];
  couplingCandidates: RefactorHotspot[];
  debtCandidates: RefactorHotspot[];
  commentCleanupCandidates: RefactorFileInsight[];
}

export interface RefactorExecutionOptions {
  provider: AiProvider;
  targetAgent: AgentTarget;
  model?: string;
  plannerModel?: string;
  orchestratorModel?: string;
  workerModel?: string;
  dryRun: boolean;
  maxFiles: number;
  notes?: string;
  focus?: string;
  showAiFileOps?: boolean;
  orchestration?: boolean;
  maxSubagents?: number;
  aiTimeoutMs?: number;
  onStatus?: (message: string) => void;
}

export interface RefactorExecutionResult {
  executed: boolean;
  providerUsed?: Exclude<AiProvider, "auto">;
  warning?: string;
  outputTail: string;
  prompt: string;
  scan: RepoRefactorScan;
  policy: RefactorPolicy;
}

export interface RunRefactorPromptResult {
  executed: boolean;
  providerUsed?: Exclude<AiProvider, "auto">;
  warning?: string;
  outputTail: string;
  passStatus?: "complete" | "continue" | "unknown";
}
