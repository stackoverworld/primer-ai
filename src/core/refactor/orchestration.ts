import { z } from "zod";

import { parseWithSchema } from "../ai-parsing.js";
import { runAiFreeformTask } from "../ai.js";
import type { AgentTarget, AiProvider } from "../types.js";
import type { RunRefactorPromptResult } from "./contracts.js";

const DEFAULT_PLANNER_MODEL = "gpt-5.3-codex";
const DEFAULT_ORCHESTRATOR_MODEL = "gpt-5.3-codex";
const DEFAULT_WORKER_MODEL = "gpt-5.3-codex-spark";

interface PlannerTask {
  id: string;
  title: string;
  files: string[];
  instructions: string;
}

interface WorkerTask extends PlannerTask {
  wave: number;
}

const plannerTaskSchema = z.object({
  id: z.string().min(1).max(120),
  title: z.string().min(1).max(240),
  files: z.array(z.string().min(1).max(280)).min(1).max(80),
  instructions: z.string().min(1).max(12_000)
});

const plannerSchema = z.object({
  refactorNeeded: z.boolean(),
  summary: z.string().min(1).max(2000).optional(),
  tasks: z.array(plannerTaskSchema).max(120).default([])
});

const orchestrationAssignmentSchema = z.object({
  taskId: z.string().min(1).max(120),
  wave: z.number().int().min(1).max(400),
  files: z.array(z.string().min(1).max(280)).min(1).max(80),
  workerInstructions: z.string().min(1).max(12_000)
});

const orchestrationSchema = z.object({
  summary: z.string().min(1).max(2000).optional(),
  assignments: z.array(orchestrationAssignmentSchema).max(240).default([])
});

interface RunOrchestratedRefactorOptions {
  prompt: string;
  provider: AiProvider;
  targetAgent: AgentTarget;
  cwd: string;
  aiTimeoutMs?: number;
  onStatus?: (message: string) => void;
  showAiFileOps?: boolean;
  maxSubagents?: number;
  plannerModel?: string;
  orchestratorModel?: string;
  workerModel?: string;
}

function normalizePath(value: string): string {
  return value.trim().replaceAll("\\", "/").replace(/^\.\/+/, "").replace(/\/+/g, "/");
}

function withStatusMarker(message: string, status: "COMPLETE" | "CONTINUE"): string {
  return `${message}\nPRIMER_REFACTOR_STATUS: ${status}`;
}

function buildPlannerPrompt(mainPrompt: string, maxSubagents: number): string {
  return [
    "You are the lead planner for a safe refactor orchestration run.",
    "Analyze the mission and produce only JSON matching this exact shape:",
    "{",
    '  "refactorNeeded": boolean,',
    '  "summary": string,',
    '  "tasks": [',
    "    {",
    '      "id": string,',
    '      "title": string,',
    '      "files": string[],',
    '      "instructions": string',
    "    }",
    "  ]",
    "}",
    "",
    "Rules:",
    "- Set refactorNeeded=false when the mission has no actionable engineering edits.",
    "- Keep tasks behavior-preserving and deterministic.",
    `- Design for parallel worker execution up to ${maxSubagents} workers.`,
    "- Do not request directory deletions.",
    "- Do not request worker-spawned subagents.",
    "",
    "Mission prompt:",
    mainPrompt
  ].join("\n");
}

function buildOrchestratorPrompt(
  plannerSummary: string | undefined,
  tasks: PlannerTask[],
  maxSubagents: number
): string {
  return [
    "You are the execution orchestrator.",
    "Transform planner tasks into wave assignments and output only JSON matching this exact shape:",
    "{",
    '  "summary": string,',
    '  "assignments": [',
    "    {",
    '      "taskId": string,',
    '      "wave": number,',
    '      "files": string[],',
    '      "workerInstructions": string',
    "    }",
    "  ]",
    "}",
    "",
    "Constraints:",
    `- A wave can run up to ${maxSubagents} workers.`,
    "- Avoid overlapping files inside the same wave.",
    "- Keep worker instructions precise and file-scoped.",
    "- No directory deletion.",
    "- No nested worker spawning.",
    "",
    plannerSummary ? `Planner summary: ${plannerSummary}` : "Planner summary: n/a",
    "Planner tasks JSON:",
    JSON.stringify(tasks, null, 2)
  ].join("\n");
}

function buildWorkerPrompt(mainPrompt: string, task: WorkerTask): string {
  const fileList = task.files.map((file) => `- ${file}`).join("\n");
  return [
    "You are an implementation worker in a coordinated refactor run.",
    `Task id: ${task.id}`,
    `Task title: ${task.title}`,
    `Wave: ${task.wave}`,
    "",
    "Owned files (edit only these files):",
    fileList,
    "",
    "Worker rules:",
    "- Edit only owned files listed above.",
    "- Do not delete directories.",
    "- Do not spawn subagents.",
    "- Keep behavior-preserving changes only.",
    "- Do not alter user-visible UI/UX behavior or visual design.",
    "- Keep business logic outcomes and side effects unchanged.",
    "- Use only one-shot verification commands (no dev servers, no watch mode).",
    "- If verification hangs or lock contention occurs, stop and report it; do not block the session.",
    "",
    "Task instructions:",
    task.instructions,
    "",
    "Global mission context:",
    mainPrompt,
    "",
    "Return a concise completion note.",
    "Final line required: PRIMER_REFACTOR_STATUS: COMPLETE"
  ].join("\n");
}

function buildDeterministicWaves(tasks: PlannerTask[], maxSubagents: number): WorkerTask[][] {
  const waves: WorkerTask[][] = [];

  for (const task of tasks) {
    const normalizedFiles = task.files.map(normalizePath).filter(Boolean);
    if (!normalizedFiles.length) continue;

    let placed = false;
    for (let index = 0; index < waves.length; index += 1) {
      const wave = waves[index];
      if (!wave || wave.length >= maxSubagents) continue;

      const occupied = new Set<string>();
      for (const existing of wave) {
        for (const file of existing.files) {
          occupied.add(file);
        }
      }

      if (normalizedFiles.some((file) => occupied.has(file))) continue;
      wave.push({ ...task, files: normalizedFiles, wave: index + 1 });
      placed = true;
      break;
    }

    if (!placed) {
      waves.push([{ ...task, files: normalizedFiles, wave: waves.length + 1 }]);
    }
  }

  return waves;
}

function buildWavesFromAssignments(
  plannerTasks: PlannerTask[],
  assignments: Array<{ taskId: string; wave: number; files: string[]; workerInstructions: string }>,
  maxSubagents: number
): WorkerTask[][] {
  if (!assignments.length) {
    return buildDeterministicWaves(plannerTasks, maxSubagents);
  }

  const taskById = new Map<string, PlannerTask>();
  for (const task of plannerTasks) {
    taskById.set(task.id, task);
  }

  const sortedAssignments = [...assignments].sort((left, right) => left.wave - right.wave);
  const syntheticTasks: PlannerTask[] = [];

  for (const assignment of sortedAssignments) {
    const source = taskById.get(assignment.taskId);
    if (!source) continue;
    const normalizedFiles = assignment.files.map(normalizePath).filter(Boolean);
    if (!normalizedFiles.length) continue;
    syntheticTasks.push({
      id: source.id,
      title: source.title,
      files: normalizedFiles,
      instructions: assignment.workerInstructions
    });
  }

  if (!syntheticTasks.length) {
    return buildDeterministicWaves(plannerTasks, maxSubagents);
  }

  return buildDeterministicWaves(syntheticTasks, maxSubagents);
}

export async function runOrchestratedRefactorPrompt(
  options: RunOrchestratedRefactorOptions
): Promise<RunRefactorPromptResult | null> {
  const maxSubagents = Math.max(1, options.maxSubagents ?? 12);
  const plannerModel = options.plannerModel?.trim() || DEFAULT_PLANNER_MODEL;
  const orchestratorModel = options.orchestratorModel?.trim() || DEFAULT_ORCHESTRATOR_MODEL;
  const workerModel = options.workerModel?.trim() || DEFAULT_WORKER_MODEL;

  options.onStatus?.("Launching planner model...");
  const plannerPrompt = buildPlannerPrompt(options.prompt, maxSubagents);
  const plannerResult = await runAiFreeformTask({
    prompt: plannerPrompt,
    provider: options.provider,
    targetAgent: options.targetAgent,
    sandboxMode: "read-only",
    model: plannerModel,
    cwd: options.cwd,
    ...(typeof options.aiTimeoutMs === "number" ? { aiTimeoutMs: options.aiTimeoutMs } : {}),
    orchestration: false,
    maxSubagents: 1,
    ...(typeof options.showAiFileOps === "boolean" ? { showAiFileOps: options.showAiFileOps } : {}),
    ...(options.onStatus ? { onStatus: options.onStatus } : {})
  });

  if (!plannerResult.ok) {
    return {
      executed: false,
      outputTail: plannerResult.output.trim(),
      passStatus: "unknown",
      ...(plannerResult.providerUsed ? { providerUsed: plannerResult.providerUsed } : {}),
      ...(plannerResult.warning ? { warning: plannerResult.warning } : {})
    };
  }

  if (plannerResult.providerUsed !== "codex") {
    return null;
  }

  const plannerPlan = parseWithSchema(plannerResult.output, plannerSchema);
  if (!plannerPlan) {
    return null;
  }

  if (!plannerPlan.refactorNeeded || plannerPlan.tasks.length === 0) {
    return {
      executed: true,
      providerUsed: plannerResult.providerUsed,
      outputTail: withStatusMarker(
        plannerPlan.summary?.trim() || "Planner marked this pass as non-actionable.",
        "COMPLETE"
      ),
      passStatus: "complete"
    };
  }

  options.onStatus?.("Launching orchestration planner...");
  const orchestratorPrompt = buildOrchestratorPrompt(plannerPlan.summary, plannerPlan.tasks, maxSubagents);
  const orchestratorResult = await runAiFreeformTask({
    prompt: orchestratorPrompt,
    provider: options.provider,
    targetAgent: options.targetAgent,
    sandboxMode: "read-only",
    model: orchestratorModel,
    cwd: options.cwd,
    ...(typeof options.aiTimeoutMs === "number" ? { aiTimeoutMs: options.aiTimeoutMs } : {}),
    orchestration: false,
    maxSubagents: 1,
    ...(typeof options.showAiFileOps === "boolean" ? { showAiFileOps: options.showAiFileOps } : {}),
    ...(options.onStatus ? { onStatus: options.onStatus } : {})
  });

  if (!orchestratorResult.ok) {
    return {
      executed: false,
      outputTail: orchestratorResult.output.trim(),
      passStatus: "unknown",
      ...(orchestratorResult.providerUsed ? { providerUsed: orchestratorResult.providerUsed } : {}),
      ...(orchestratorResult.warning ? { warning: orchestratorResult.warning } : {})
    };
  }

  const orchestratorPlan = parseWithSchema(orchestratorResult.output, orchestrationSchema);
  const waves = buildWavesFromAssignments(plannerPlan.tasks, orchestratorPlan?.assignments ?? [], maxSubagents);
  if (!waves.length) {
    return {
      executed: true,
      providerUsed: orchestratorResult.providerUsed ?? plannerResult.providerUsed,
      outputTail: withStatusMarker("No executable worker waves were produced for this pass.", "COMPLETE"),
      passStatus: "complete"
    };
  }

  let completedTasks = 0;
  let providerUsed: "codex" | "claude" | undefined = orchestratorResult.providerUsed ?? plannerResult.providerUsed;
  for (let waveIndex = 0; waveIndex < waves.length; waveIndex += 1) {
    const wave = waves[waveIndex];
    if (!wave?.length) continue;
    options.onStatus?.(`Launching worker wave ${waveIndex + 1}/${waves.length}...`);

    const waveResults = await Promise.all(
      wave.map(async (task) => {
        const workerPrompt = buildWorkerPrompt(options.prompt, task);
        const workerResult = await runAiFreeformTask({
          prompt: workerPrompt,
          provider: options.provider,
          targetAgent: options.targetAgent,
          sandboxMode: "workspace-write",
          model: workerModel,
          cwd: options.cwd,
          ...(typeof options.aiTimeoutMs === "number" ? { aiTimeoutMs: options.aiTimeoutMs } : {}),
          orchestration: false,
          maxSubagents: 1,
          expectFileWrites: true,
          ...(typeof options.showAiFileOps === "boolean" ? { showAiFileOps: options.showAiFileOps } : {}),
          ...(options.onStatus ? { onStatus: options.onStatus } : {})
        });

        return { task, workerResult };
      })
    );

    for (const { task, workerResult } of waveResults) {
      if (workerResult.providerUsed) {
        providerUsed = workerResult.providerUsed;
      }

      if (!workerResult.ok) {
        return {
          executed: false,
          outputTail: workerResult.output.trim(),
          passStatus: "unknown",
          ...(providerUsed ? { providerUsed } : {}),
          warning: workerResult.warning ?? `Worker task ${task.id} failed in wave ${waveIndex + 1}.`
        };
      }

      completedTasks += 1;
    }
  }

  const summary = orchestratorPlan?.summary?.trim() || plannerPlan.summary?.trim() || "Orchestrated refactor pass completed.";
  const outputTail = withStatusMarker(`${summary} Executed ${completedTasks} worker task(s) across ${waves.length} wave(s).`, "COMPLETE");

  return {
    executed: true,
    passStatus: "complete",
    outputTail,
    ...(providerUsed ? { providerUsed } : {})
  };
}
