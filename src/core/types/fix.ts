import type { AgentTarget, AiProvider } from "./common.js";

export interface FixCommandOptions {
  provider?: AiProvider;
  agent?: AgentTarget;
  model?: string;
  notes?: string;
  focus?: string;
  showAiFileOps?: boolean;
  maxFiles?: number | string;
  maxPasses?: number | string;
  aiTimeoutSec?: number | string;
  dryRun?: boolean;
  format?: string;
  yes?: boolean;
}
