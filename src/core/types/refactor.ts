import type { AgentTarget, AiProvider } from "./common.js";

export interface RefactorCommandOptions {
  provider?: AiProvider;
  agent?: AgentTarget;
  model?: string;
  plannerModel?: string;
  orchestratorModel?: string;
  workerModel?: string;
  dryRun?: boolean;
  maxFiles?: number | string;
  maxPasses?: number | string;
  aiTimeoutSec?: number | string;
  notes?: string;
  focus?: string;
  showAiFileOps?: boolean;
  orchestration?: boolean;
  maxSubagents?: number | string;
  format?: string;
  resume?: boolean;
  yes?: boolean;
}
