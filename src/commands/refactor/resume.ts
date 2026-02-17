import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import type { RepoRefactorScan } from "../../core/refactor.js";
import type { AgentTarget, AiProvider } from "../../core/types.js";

import type { RefactorBacklog } from "./backlog.js";

const CHECKPOINT_VERSION = 1;
const CHECKPOINT_DIR = ".primer-ai";
const CHECKPOINT_FILE = "refactor-resume.json";

export interface RefactorResumeExecutionSettings {
  provider: AiProvider;
  targetAgent: AgentTarget;
  model?: string;
  plannerModel?: string;
  orchestratorModel?: string;
  workerModel?: string;
  showAiFileOps: boolean;
  notes?: string;
  orchestration: boolean;
  maxSubagents: number;
}

interface RefactorResumeCheckpointShape {
  version: number;
  targetDir: string;
  plannedPasses: number;
  nextPass: number;
  maxFiles: number;
  scan: RepoRefactorScan;
  backlog: RefactorBacklog;
  execution?: RefactorResumeExecutionSettings;
  updatedAt: string;
}

export interface SaveRefactorResumeCheckpointOptions {
  targetDir: string;
  plannedPasses: number;
  nextPass: number;
  maxFiles: number;
  scan: RepoRefactorScan;
  backlog: RefactorBacklog;
  execution?: RefactorResumeExecutionSettings;
}

export interface LoadedRefactorResumeCheckpoint {
  targetDir: string;
  plannedPasses: number;
  nextPass: number;
  maxFiles: number;
  scan: RepoRefactorScan;
  backlog: RefactorBacklog;
  execution?: RefactorResumeExecutionSettings;
}

export function resolveRefactorResumeCheckpointPath(targetDir: string): string {
  return join(targetDir, CHECKPOINT_DIR, CHECKPOINT_FILE);
}

function isValidExecutionSettings(value: unknown): value is RefactorResumeExecutionSettings {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<RefactorResumeExecutionSettings>;
  const providerValid =
    candidate.provider === "auto" || candidate.provider === "codex" || candidate.provider === "claude";
  const targetAgentValid =
    candidate.targetAgent === "codex" || candidate.targetAgent === "claude" || candidate.targetAgent === "both";
  return (
    providerValid &&
    targetAgentValid &&
    typeof candidate.showAiFileOps === "boolean" &&
    typeof candidate.orchestration === "boolean" &&
    typeof candidate.maxSubagents === "number" &&
    Number.isFinite(candidate.maxSubagents) &&
    candidate.maxSubagents >= 1
  );
}

function isValidCheckpointShape(value: unknown): value is RefactorResumeCheckpointShape {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<RefactorResumeCheckpointShape>;
  return (
    candidate.version === CHECKPOINT_VERSION &&
    typeof candidate.targetDir === "string" &&
    typeof candidate.plannedPasses === "number" &&
    Number.isFinite(candidate.plannedPasses) &&
    candidate.plannedPasses >= 1 &&
    typeof candidate.nextPass === "number" &&
    Number.isFinite(candidate.nextPass) &&
    candidate.nextPass >= 1 &&
    candidate.nextPass <= candidate.plannedPasses + 1 &&
    typeof candidate.maxFiles === "number" &&
    Number.isFinite(candidate.maxFiles) &&
    candidate.maxFiles >= 1 &&
    Boolean(candidate.scan && typeof candidate.scan === "object") &&
    Boolean(candidate.backlog && typeof candidate.backlog === "object") &&
    (candidate.execution === undefined || isValidExecutionSettings(candidate.execution))
  );
}

export async function loadRefactorResumeCheckpoint(targetDir: string): Promise<LoadedRefactorResumeCheckpoint | null> {
  const checkpointPath = resolveRefactorResumeCheckpointPath(targetDir);
  try {
    const content = await readFile(checkpointPath, "utf8");
    const parsed = JSON.parse(content) as unknown;
    if (!isValidCheckpointShape(parsed)) {
      return null;
    }
    if (resolve(parsed.targetDir) !== resolve(targetDir)) {
      return null;
    }
    return {
      targetDir: parsed.targetDir,
      plannedPasses: parsed.plannedPasses,
      nextPass: parsed.nextPass,
      maxFiles: parsed.maxFiles,
      scan: parsed.scan,
      backlog: parsed.backlog,
      ...(parsed.execution ? { execution: parsed.execution } : {})
    };
  } catch {
    return null;
  }
}

export async function saveRefactorResumeCheckpoint(options: SaveRefactorResumeCheckpointOptions): Promise<void> {
  const checkpointPath = resolveRefactorResumeCheckpointPath(options.targetDir);
  await mkdir(join(options.targetDir, CHECKPOINT_DIR), { recursive: true });
  const payload: RefactorResumeCheckpointShape = {
    version: CHECKPOINT_VERSION,
    targetDir: resolve(options.targetDir),
    plannedPasses: options.plannedPasses,
    nextPass: options.nextPass,
    maxFiles: options.maxFiles,
    scan: options.scan,
    backlog: options.backlog,
    ...(options.execution ? { execution: options.execution } : {}),
    updatedAt: new Date().toISOString()
  };
  await writeFile(checkpointPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

export async function clearRefactorResumeCheckpoint(targetDir: string): Promise<void> {
  const checkpointPath = resolveRefactorResumeCheckpointPath(targetDir);
  try {
    await unlink(checkpointPath);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") {
      throw error;
    }
  }
}
