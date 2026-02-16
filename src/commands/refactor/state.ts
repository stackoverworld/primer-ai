import { buildRefactorPolicy } from "../../core/refactor-policy.js";
import { buildRefactorPrompt } from "../../core/refactor.js";
import type { RepoRefactorScan } from "../../core/refactor.js";

import { summarizeBacklog, type RefactorBacklog } from "./backlog.js";

export interface RefactorPromptOptions {
  dryRun: boolean;
  notes?: string;
  orchestration?: boolean;
  maxSubagents?: number;
}

export interface RefactorWorkflowState {
  scan: RepoRefactorScan;
  prompt: string;
  backlog: RefactorBacklog;
}

export function deriveRefactorState(scan: RepoRefactorScan, promptOptions: RefactorPromptOptions): RefactorWorkflowState {
  const policy = buildRefactorPolicy(scan.techStack, scan.projectShape);
  const prompt = buildRefactorPrompt(scan, policy, promptOptions);
  const backlog = summarizeBacklog(scan);
  return { scan, prompt, backlog };
}
