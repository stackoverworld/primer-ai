import type { AgentTarget, AiProvider } from "./common.js";

export interface GenerateLogsCommandOptions {
  from?: string;
  to?: string;
  fromVersion?: string;
  toVersion?: string;
  output?: string;
  thanks?: string;
  stdout?: boolean;
  uncommitted?: boolean;
  provider?: AiProvider;
  agent?: AgentTarget;
  model?: string;
  aiTimeoutSec?: number | string;
  showAiFileOps?: boolean;
  format?: string;
}
