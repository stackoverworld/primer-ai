import type { AgentTarget, AiProvider, GenerationMode, ProjectShape } from "./common.js";

export interface InitInput {
  projectName: string;
  description: string;
  techStack: string;
  existingProject: boolean;
  projectShape: ProjectShape;
  targetAgent: AgentTarget;
  includeCursorRules: boolean;
  generationMode: GenerationMode;
  aiProvider: AiProvider;
  aiModel?: string;
  initializeGit: boolean;
  runAiQuickSetup: boolean;
}

export interface InitCommandOptions {
  description?: string;
  stack?: string;
  projectType?: ProjectShape;
  agent?: AgentTarget;
  mode?: GenerationMode;
  provider?: AiProvider;
  model?: string;
  cursor?: boolean;
  gitInit?: boolean;
  quickSetup?: boolean;
  format?: string;
  yes?: boolean;
  force?: boolean;
}
