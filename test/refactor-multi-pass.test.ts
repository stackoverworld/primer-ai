import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

const promptState = vi.hoisted(() => ({
  confirmResponses: [] as boolean[]
}));

const mocks = vi.hoisted(() => ({
  buildRefactorPolicy: vi.fn(() => ({ baselineSkill: "qa-refactoring" })),
  scanRepositoryForRefactor: vi.fn(),
  buildRefactorPrompt: vi.fn(() => "Refactor prompt"),
  runRefactorPrompt: vi.fn(),
  calibrateScanWithAi: vi.fn(async ({ scan }: { scan: unknown }) => ({ scan }))
}));

vi.mock("@clack/prompts", () => ({
  spinner: () => ({
    start: () => undefined,
    stop: () => undefined,
    error: () => undefined,
    message: () => undefined
  }),
  log: {
    info: () => undefined,
    warn: () => undefined,
    success: () => undefined,
    error: () => undefined
  },
  select: async () => "codex",
  confirm: async () => promptState.confirmResponses.shift() ?? true,
  text: async () => "",
  isCancel: () => false,
  cancel: () => undefined
}));

vi.mock("../src/core/refactor-policy.js", () => ({
  buildRefactorPolicy: mocks.buildRefactorPolicy
}));

vi.mock("../src/core/refactor.js", () => ({
  scanRepositoryForRefactor: mocks.scanRepositoryForRefactor,
  buildRefactorPrompt: mocks.buildRefactorPrompt,
  runRefactorPrompt: mocks.runRefactorPrompt
}));

vi.mock("../src/commands/refactor/ai-scan.js", () => ({
  calibrateScanWithAi: mocks.calibrateScanWithAi
}));

function createScan(overrides: Partial<ReturnType<typeof baseScan>> = {}) {
  return {
    ...baseScan(),
    ...overrides
  };
}

function baseScan() {
  return {
    targetDir: ".",
    techStack: "TypeScript + Node.js + Express",
    projectShape: "api-service",
    scannedSourceFiles: 12,
    scannedTotalLines: 2500,
    reachedFileCap: false,
    largestFiles: [],
    monolithCandidates: [] as Array<{
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
    }>,
    couplingCandidates: [] as Array<{
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
      score: number;
      reasons: string[];
      splitHypothesis: string;
    }>,
    debtCandidates: [] as Array<{
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
      score: number;
      reasons: string[];
      splitHypothesis: string;
    }>,
    commentCleanupCandidates: [] as Array<{
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
    }>
  };
}

describe("refactor multi-pass loop", () => {
  const originalStdoutIsTTY = process.stdout.isTTY;
  const originalStdinIsTTY = process.stdin.isTTY;

  function setInteractiveTTY(enabled: boolean): void {
    Object.defineProperty(process.stdout, "isTTY", { configurable: true, value: enabled });
    Object.defineProperty(process.stdin, "isTTY", { configurable: true, value: enabled });
  }

  function restoreTTY(): void {
    Object.defineProperty(process.stdout, "isTTY", { configurable: true, value: originalStdoutIsTTY });
    Object.defineProperty(process.stdin, "isTTY", { configurable: true, value: originalStdinIsTTY });
  }

  afterEach(() => {
    vi.clearAllMocks();
    promptState.confirmResponses = [];
    restoreTTY();
  });

  it("stops before pass execution when initial AI calibration clears actionable backlog", async () => {
    const targetPath = mkdtempSync(join(tmpdir(), "primer-ai-refactor-initial-clear-"));
    const hotspot = {
      path: "src/core/refactor.ts",
      lineCount: 800,
      commentLines: 12,
      lowSignalCommentLines: 4,
      todoCount: 0,
      importCount: 30,
      internalImportCount: 20,
      fanIn: 8,
      exportCount: 12,
      functionCount: 28,
      classCount: 0,
      score: 99,
      reasons: ["high fan-in"],
      splitHypothesis: "Split by responsibilities"
    };

    mocks.scanRepositoryForRefactor.mockReturnValueOnce(createScan({ couplingCandidates: [hotspot] }));
    mocks.calibrateScanWithAi.mockResolvedValueOnce({ scan: createScan() });

    try {
      const { runRefactor } = await import("../src/commands/refactor.js");
      await runRefactor(targetPath, {
        yes: true,
        provider: "codex",
        model: "gpt-5.3-codex",
        maxPasses: 4
      });

      expect(mocks.runRefactorPrompt).toHaveBeenCalledTimes(0);
      expect(mocks.scanRepositoryForRefactor).toHaveBeenCalledTimes(1);
    } finally {
      rmSync(targetPath, { recursive: true, force: true });
    }
  });

  it("continues across passes until rescans clear remaining backlog", async () => {
    const targetPath = mkdtempSync(join(tmpdir(), "primer-ai-refactor-loop-"));

    const hotspot = {
      path: "src/core/refactor.ts",
      lineCount: 800,
      commentLines: 12,
      lowSignalCommentLines: 4,
      todoCount: 0,
      importCount: 30,
      internalImportCount: 20,
      fanIn: 8,
      exportCount: 12,
      functionCount: 28,
      classCount: 0,
      score: 99,
      reasons: ["high fan-in"],
      splitHypothesis: "Split by responsibilities"
    };

    mocks.scanRepositoryForRefactor
      .mockReturnValueOnce(createScan({ couplingCandidates: [hotspot] }))
      .mockReturnValueOnce(createScan({ couplingCandidates: [hotspot] }))
      .mockReturnValueOnce(createScan());

    mocks.runRefactorPrompt
      .mockResolvedValueOnce({ executed: true, outputTail: "pass1", passStatus: "continue" })
      .mockResolvedValueOnce({ executed: true, outputTail: "pass2", passStatus: "complete" });

    try {
      const { runRefactor } = await import("../src/commands/refactor.js");
      await runRefactor(targetPath, {
        yes: true,
        provider: "codex",
        model: "gpt-5.3-codex",
        maxPasses: 4
      });

      expect(mocks.runRefactorPrompt).toHaveBeenCalledTimes(2);
      expect(mocks.scanRepositoryForRefactor).toHaveBeenCalledTimes(3);
    } finally {
      rmSync(targetPath, { recursive: true, force: true });
    }
  });

  it("fails when backlog remains after max pass cap", async () => {
    const targetPath = mkdtempSync(join(tmpdir(), "primer-ai-refactor-loop-cap-"));
    const hotspot = {
      path: "src/core/refactor.ts",
      lineCount: 800,
      commentLines: 12,
      lowSignalCommentLines: 4,
      todoCount: 0,
      importCount: 30,
      internalImportCount: 20,
      fanIn: 8,
      exportCount: 12,
      functionCount: 28,
      classCount: 0,
      score: 99,
      reasons: ["high fan-in"],
      splitHypothesis: "Split by responsibilities"
    };

    mocks.scanRepositoryForRefactor.mockReturnValue(createScan({ couplingCandidates: [hotspot] }));
    mocks.runRefactorPrompt.mockResolvedValue({ executed: true, outputTail: "pass", passStatus: "continue" });

    try {
      const { runRefactor } = await import("../src/commands/refactor.js");
      await expect(
        runRefactor(targetPath, {
          yes: true,
          provider: "codex",
          model: "gpt-5.3-codex",
          maxPasses: 2
        })
      ).rejects.toThrow("Refactor incomplete after 2 passes");
      expect(mocks.runRefactorPrompt).toHaveBeenCalledTimes(2);
    } finally {
      rmSync(targetPath, { recursive: true, force: true });
    }
  });

  it("extends adaptive budget by default before stopping on repeated stagnant backlog", async () => {
    const targetPath = mkdtempSync(join(tmpdir(), "primer-ai-refactor-adaptive-pass-budget-"));
    const hotspot = {
      path: "src/core/refactor.ts",
      lineCount: 800,
      commentLines: 12,
      lowSignalCommentLines: 4,
      todoCount: 0,
      importCount: 30,
      internalImportCount: 20,
      fanIn: 8,
      exportCount: 12,
      functionCount: 28,
      classCount: 0,
      score: 99,
      reasons: ["high fan-in"],
      splitHypothesis: "Split by responsibilities"
    };

    mocks.scanRepositoryForRefactor.mockReturnValue(createScan({ couplingCandidates: [hotspot] }));
    mocks.runRefactorPrompt.mockResolvedValue({ executed: true, outputTail: "pass", passStatus: "continue" });

    try {
      const { runRefactor } = await import("../src/commands/refactor.js");
      await expect(
        runRefactor(targetPath, {
          yes: true,
          provider: "codex",
          model: "gpt-5.3-codex"
        })
      ).rejects.toThrow("Refactor stalled after pass 2");
      expect(mocks.runRefactorPrompt).toHaveBeenCalledTimes(2);
    } finally {
      rmSync(targetPath, { recursive: true, force: true });
    }
  });

  it("raises adaptive pass budget when rescans reveal larger remaining backlog", async () => {
    const targetPath = mkdtempSync(join(tmpdir(), "primer-ai-refactor-adaptive-pass-growth-"));

    const initialHotspot = {
      path: "src/core/refactor.ts",
      lineCount: 800,
      commentLines: 12,
      lowSignalCommentLines: 4,
      todoCount: 0,
      importCount: 30,
      internalImportCount: 20,
      fanIn: 8,
      exportCount: 12,
      functionCount: 28,
      classCount: 0,
      score: 99,
      reasons: ["high fan-in"],
      splitHypothesis: "Split by responsibilities"
    };

    const monolithA = {
      path: "src/legacy/a.ts",
      lineCount: 900,
      commentLines: 20,
      lowSignalCommentLines: 6,
      todoCount: 1,
      importCount: 30,
      internalImportCount: 22,
      fanIn: 7,
      exportCount: 10,
      functionCount: 32,
      classCount: 1
    };
    const monolithB = {
      ...monolithA,
      path: "src/legacy/b.ts"
    };
    const monolithC = {
      ...monolithA,
      path: "src/legacy/c.ts"
    };

    mocks.scanRepositoryForRefactor
      .mockReturnValueOnce(createScan({ couplingCandidates: [initialHotspot] }))
      .mockReturnValueOnce(createScan({ monolithCandidates: [monolithA, monolithB, monolithC] }))
      .mockReturnValueOnce(createScan());

    mocks.runRefactorPrompt
      .mockResolvedValueOnce({ executed: true, outputTail: "pass1", passStatus: "continue" })
      .mockResolvedValueOnce({ executed: true, outputTail: "pass2", passStatus: "complete" });

    try {
      const { runRefactor } = await import("../src/commands/refactor.js");
      await runRefactor(targetPath, {
        yes: true,
        provider: "codex",
        model: "gpt-5.3-codex"
      });

      expect(mocks.runRefactorPrompt).toHaveBeenCalledTimes(2);
      expect(mocks.scanRepositoryForRefactor).toHaveBeenCalledTimes(3);
    } finally {
      rmSync(targetPath, { recursive: true, force: true });
    }
  });

  it("continues automatically beyond 12 adaptive passes when backlog remains actionable", async () => {
    const targetPath = mkdtempSync(join(tmpdir(), "primer-ai-refactor-adaptive-beyond-12-"));
    const makeHotspot = (index: number) => ({
      path: `src/core/refactor-${index}.ts`,
      lineCount: 800,
      commentLines: 12,
      lowSignalCommentLines: 4,
      todoCount: 0,
      importCount: 30,
      internalImportCount: 20,
      fanIn: 8,
      exportCount: 12,
      functionCount: 28,
      classCount: 0,
      score: 99,
      reasons: ["high fan-in"],
      splitHypothesis: "Split by responsibilities"
    });

    const scanSequence = [
      createScan({ couplingCandidates: [makeHotspot(0)] }),
      ...Array.from({ length: 12 }, (_, index) => createScan({ couplingCandidates: [makeHotspot(index + 1)] })),
      createScan()
    ];

    const runSequence = [
      ...Array.from({ length: 12 }, (_, index) => ({
        executed: true,
        outputTail: `pass${index + 1}`,
        passStatus: "continue" as const
      })),
      { executed: true, outputTail: "pass13", passStatus: "complete" as const }
    ];

    mocks.scanRepositoryForRefactor.mockImplementation(() => scanSequence.shift() ?? createScan());
    mocks.runRefactorPrompt.mockImplementation(async () => runSequence.shift() ?? { executed: true, outputTail: "done", passStatus: "complete" });

    try {
      const { runRefactor } = await import("../src/commands/refactor.js");
      await runRefactor(targetPath, {
        yes: true,
        provider: "codex",
        model: "gpt-5.3-codex"
      });

      expect(mocks.runRefactorPrompt).toHaveBeenCalledTimes(13);
      expect(mocks.scanRepositoryForRefactor).toHaveBeenCalledTimes(14);
    } finally {
      rmSync(targetPath, { recursive: true, force: true });
    }
  });

  it("auto-expands scan coverage by default when initial scan hits file cap", async () => {
    const targetPath = mkdtempSync(join(tmpdir(), "primer-ai-refactor-auto-scan-"));

    mocks.scanRepositoryForRefactor
      .mockReturnValueOnce(createScan({ reachedFileCap: true }))
      .mockReturnValueOnce(createScan({ reachedFileCap: false }));

    try {
      const { runRefactor } = await import("../src/commands/refactor.js");
      await runRefactor(targetPath, {
        dryRun: true
      });

      expect(mocks.scanRepositoryForRefactor).toHaveBeenCalledTimes(2);
      expect(mocks.scanRepositoryForRefactor).toHaveBeenNthCalledWith(1, targetPath, 20000);
      expect(mocks.scanRepositoryForRefactor).toHaveBeenNthCalledWith(2, targetPath, 40000);
    } finally {
      rmSync(targetPath, { recursive: true, force: true });
    }
  });

  it("stops after a pass when remaining backlog is non-actionable facade/barrel signal", async () => {
    const targetPath = mkdtempSync(join(tmpdir(), "primer-ai-refactor-non-actionable-stop-"));

    const actionableHotspot = {
      path: "src/core/refactor.ts",
      lineCount: 800,
      commentLines: 12,
      lowSignalCommentLines: 4,
      todoCount: 0,
      importCount: 30,
      internalImportCount: 20,
      fanIn: 8,
      exportCount: 12,
      functionCount: 28,
      classCount: 0,
      score: 99,
      reasons: ["high fan-in"],
      splitHypothesis: "Split by responsibilities"
    };

    const nonActionableFacadeHotspot = {
      path: "src/core/types.ts",
      lineCount: 120,
      commentLines: 0,
      lowSignalCommentLines: 0,
      todoCount: 0,
      importCount: 0,
      internalImportCount: 0,
      fanIn: 51,
      exportCount: 10,
      functionCount: 0,
      classCount: 0,
      score: 137.47,
      reasons: ["fan-in 51", "10 exports"],
      splitHypothesis: "Split into contracts/types, orchestration flow, and helper utilities."
    };

    mocks.scanRepositoryForRefactor
      .mockReturnValueOnce(createScan({ couplingCandidates: [actionableHotspot] }))
      .mockReturnValueOnce(createScan({ couplingCandidates: [nonActionableFacadeHotspot] }));
    mocks.runRefactorPrompt.mockResolvedValueOnce({ executed: true, outputTail: "pass1", passStatus: "complete" });

    try {
      const { runRefactor } = await import("../src/commands/refactor.js");
      await runRefactor(targetPath, {
        yes: true,
        provider: "codex",
        model: "gpt-5.3-codex",
        maxPasses: 4
      });

      expect(mocks.runRefactorPrompt).toHaveBeenCalledTimes(1);
      expect(mocks.scanRepositoryForRefactor).toHaveBeenCalledTimes(2);
    } finally {
      rmSync(targetPath, { recursive: true, force: true });
    }
  });

  it("stops when AI requests CONTINUE but rescan backlog is clear", async () => {
    const targetPath = mkdtempSync(join(tmpdir(), "primer-ai-refactor-continue-clear-stop-"));
    const actionableHotspot = {
      path: "src/core/refactor.ts",
      lineCount: 800,
      commentLines: 12,
      lowSignalCommentLines: 4,
      todoCount: 0,
      importCount: 30,
      internalImportCount: 20,
      fanIn: 8,
      exportCount: 12,
      functionCount: 28,
      classCount: 0,
      score: 99,
      reasons: ["high fan-in"],
      splitHypothesis: "Split by responsibilities"
    };

    mocks.scanRepositoryForRefactor
      .mockReturnValueOnce(createScan({ couplingCandidates: [actionableHotspot] }))
      .mockReturnValueOnce(createScan());
    mocks.runRefactorPrompt.mockResolvedValueOnce({ executed: true, outputTail: "pass1", passStatus: "continue" });

    try {
      const { runRefactor } = await import("../src/commands/refactor.js");
      await runRefactor(targetPath, {
        yes: true,
        provider: "codex",
        model: "gpt-5.3-codex",
        maxPasses: 4
      });

      expect(mocks.runRefactorPrompt).toHaveBeenCalledTimes(1);
      expect(mocks.scanRepositoryForRefactor).toHaveBeenCalledTimes(2);
    } finally {
      rmSync(targetPath, { recursive: true, force: true });
    }
  });

  it("resumes from the saved checkpoint after an interrupted run", async () => {
    const targetPath = mkdtempSync(join(tmpdir(), "primer-ai-refactor-resume-"));
    const hotspot = {
      path: "src/core/refactor.ts",
      lineCount: 800,
      commentLines: 12,
      lowSignalCommentLines: 4,
      todoCount: 0,
      importCount: 30,
      internalImportCount: 20,
      fanIn: 8,
      exportCount: 12,
      functionCount: 28,
      classCount: 0,
      score: 99,
      reasons: ["high fan-in"],
      splitHypothesis: "Split by responsibilities"
    };

    mocks.scanRepositoryForRefactor
      .mockReturnValueOnce(createScan({ couplingCandidates: [hotspot] }))
      .mockReturnValueOnce(createScan({ couplingCandidates: [hotspot] }))
      .mockReturnValueOnce(createScan({ couplingCandidates: [hotspot] }))
      .mockReturnValueOnce(createScan());

    mocks.runRefactorPrompt
      .mockResolvedValueOnce({ executed: true, outputTail: "pass1", passStatus: "continue" })
      .mockResolvedValueOnce({ executed: false, outputTail: "timeout", warning: "timeout while waiting for AI" })
      .mockResolvedValueOnce({ executed: true, outputTail: "pass2", passStatus: "complete" });

    const checkpointPath = join(targetPath, ".primer-ai", "refactor-resume.json");

    try {
      const { runRefactor } = await import("../src/commands/refactor.js");
      await expect(
        runRefactor(targetPath, {
          yes: true,
          provider: "codex",
          model: "gpt-5.3-codex",
          showAiFileOps: true,
          notes: "Keep UI behavior unchanged.",
          orchestration: true,
          maxSubagents: 6,
          maxPasses: 3
        })
      ).rejects.toThrow("timeout while waiting for AI");

      expect(mocks.runRefactorPrompt).toHaveBeenCalledTimes(2);
      expect(existsSync(checkpointPath)).toBe(true);
      const savedCheckpoint = JSON.parse(readFileSync(checkpointPath, "utf8")) as {
        nextPass: number;
        plannedPasses: number;
        execution?: { provider?: string; model?: string; showAiFileOps?: boolean; maxSubagents?: number; notes?: string };
      };
      expect(savedCheckpoint.nextPass).toBe(2);
      expect(savedCheckpoint.plannedPasses).toBe(3);
      expect(savedCheckpoint.execution?.provider).toBe("codex");
      expect(savedCheckpoint.execution?.model).toBe("gpt-5.3-codex");
      expect(savedCheckpoint.execution?.showAiFileOps).toBe(true);
      expect(savedCheckpoint.execution?.maxSubagents).toBe(6);
      expect(savedCheckpoint.execution?.notes).toContain("Keep UI behavior unchanged.");

      await runRefactor(targetPath, {
        yes: true,
        provider: "claude",
        model: "claude-3-7-sonnet",
        showAiFileOps: false,
        notes: "This should not replace saved resume settings.",
        maxPasses: 3
      });

      expect(mocks.runRefactorPrompt).toHaveBeenCalledTimes(3);
      const resumeCall = mocks.runRefactorPrompt.mock.calls[2]?.[0] as {
        provider: string;
        model?: string;
        showAiFileOps: boolean;
        maxSubagents: number;
      };
      expect(resumeCall.provider).toBe("codex");
      expect(resumeCall.model).toBe("gpt-5.3-codex");
      expect(resumeCall.showAiFileOps).toBe(true);
      expect(resumeCall.maxSubagents).toBe(6);
      expect(existsSync(checkpointPath)).toBe(false);
    } finally {
      rmSync(targetPath, { recursive: true, force: true });
    }
  });

  it("reuses saved execution settings even when the first pass fails before checkpoint-on-pass", async () => {
    const targetPath = mkdtempSync(join(tmpdir(), "primer-ai-refactor-resume-first-pass-fail-"));
    const hotspot = {
      path: "src/core/refactor.ts",
      lineCount: 800,
      commentLines: 12,
      lowSignalCommentLines: 4,
      todoCount: 0,
      importCount: 30,
      internalImportCount: 20,
      fanIn: 8,
      exportCount: 12,
      functionCount: 28,
      classCount: 0,
      score: 99,
      reasons: ["high fan-in"],
      splitHypothesis: "Split by responsibilities"
    };

    mocks.scanRepositoryForRefactor
      .mockReturnValueOnce(createScan({ couplingCandidates: [hotspot] }))
      .mockReturnValueOnce(createScan({ couplingCandidates: [hotspot] }))
      .mockReturnValueOnce(createScan());

    mocks.runRefactorPrompt
      .mockResolvedValueOnce({ executed: false, outputTail: "timeout", warning: "timeout while waiting for AI" })
      .mockResolvedValueOnce({ executed: true, outputTail: "pass1", passStatus: "complete" });

    const checkpointPath = join(targetPath, ".primer-ai", "refactor-resume.json");

    try {
      const { runRefactor } = await import("../src/commands/refactor.js");
      await expect(
        runRefactor(targetPath, {
          yes: true,
          provider: "codex",
          model: "gpt-5.3-codex",
          showAiFileOps: true,
          notes: "Keep UI behavior unchanged.",
          orchestration: true,
          maxSubagents: 6,
          maxPasses: 2
        })
      ).rejects.toThrow("timeout while waiting for AI");

      expect(existsSync(checkpointPath)).toBe(true);
      const savedCheckpoint = JSON.parse(readFileSync(checkpointPath, "utf8")) as {
        nextPass: number;
        plannedPasses: number;
        execution?: { provider?: string; model?: string; showAiFileOps?: boolean; maxSubagents?: number };
      };
      expect(savedCheckpoint.nextPass).toBe(1);
      expect(savedCheckpoint.plannedPasses).toBe(2);
      expect(savedCheckpoint.execution?.provider).toBe("codex");
      expect(savedCheckpoint.execution?.model).toBe("gpt-5.3-codex");
      expect(savedCheckpoint.execution?.showAiFileOps).toBe(true);
      expect(savedCheckpoint.execution?.maxSubagents).toBe(6);

      await runRefactor(targetPath, {
        yes: true,
        provider: "claude",
        model: "claude-3-7-sonnet",
        showAiFileOps: false,
        notes: "This should not replace saved resume settings.",
        maxPasses: 2
      });

      expect(mocks.runRefactorPrompt).toHaveBeenCalledTimes(2);
      const resumeCall = mocks.runRefactorPrompt.mock.calls[1]?.[0] as {
        provider: string;
        model?: string;
        showAiFileOps: boolean;
        maxSubagents: number;
      };
      expect(resumeCall.provider).toBe("codex");
      expect(resumeCall.model).toBe("gpt-5.3-codex");
      expect(resumeCall.showAiFileOps).toBe(true);
      expect(resumeCall.maxSubagents).toBe(6);
      expect(existsSync(checkpointPath)).toBe(false);
    } finally {
      rmSync(targetPath, { recursive: true, force: true });
    }
  });

  it("extends adaptive pass budget on resume when checkpoint next pass exceeds planned passes", async () => {
    const targetPath = mkdtempSync(join(tmpdir(), "primer-ai-refactor-resume-adaptive-extend-"));
    const checkpointPath = join(targetPath, ".primer-ai", "refactor-resume.json");
    const hotspot = {
      path: "src/core/refactor.ts",
      lineCount: 800,
      commentLines: 12,
      lowSignalCommentLines: 4,
      todoCount: 0,
      importCount: 30,
      internalImportCount: 20,
      fanIn: 8,
      exportCount: 12,
      functionCount: 28,
      classCount: 0,
      score: 99,
      reasons: ["high fan-in"],
      splitHypothesis: "Split by responsibilities"
    };

    mocks.scanRepositoryForRefactor
      .mockReturnValueOnce(createScan({ couplingCandidates: [hotspot] }))
      .mockReturnValueOnce(createScan());
    mocks.runRefactorPrompt.mockResolvedValueOnce({ executed: true, outputTail: "pass13", passStatus: "complete" });

    const checkpointPayload = {
      version: 1,
      targetDir: targetPath,
      plannedPasses: 12,
      nextPass: 13,
      maxFiles: 20_000,
      scan: createScan({ couplingCandidates: [hotspot] }),
      backlog: {
        monolithCount: 0,
        couplingCount: 1,
        debtCount: 0,
        commentCount: 0
      },
      execution: {
        provider: "codex",
        targetAgent: "codex",
        model: "gpt-5.3-codex",
        showAiFileOps: true,
        orchestration: true,
        maxSubagents: 6
      },
      updatedAt: new Date().toISOString()
    };

    try {
      const fs = await import("node:fs/promises");
      await fs.mkdir(join(targetPath, ".primer-ai"), { recursive: true });
      await fs.writeFile(checkpointPath, `${JSON.stringify(checkpointPayload, null, 2)}\n`, "utf8");

      const { runRefactor } = await import("../src/commands/refactor.js");
      await runRefactor(targetPath, {
        yes: true
      });

      expect(mocks.runRefactorPrompt).toHaveBeenCalledTimes(1);
      expect(mocks.scanRepositoryForRefactor).toHaveBeenCalledTimes(2);
      expect(existsSync(checkpointPath)).toBe(false);
    } finally {
      rmSync(targetPath, { recursive: true, force: true });
    }
  });

  it("asks whether to continue previous session and starts fresh when user selects no", async () => {
    const targetPath = mkdtempSync(join(tmpdir(), "primer-ai-refactor-resume-decline-"));
    const checkpointPath = join(targetPath, ".primer-ai", "refactor-resume.json");
    const hotspot = {
      path: "src/core/refactor.ts",
      lineCount: 800,
      commentLines: 12,
      lowSignalCommentLines: 4,
      todoCount: 0,
      importCount: 30,
      internalImportCount: 20,
      fanIn: 8,
      exportCount: 12,
      functionCount: 28,
      classCount: 0,
      score: 99,
      reasons: ["high fan-in"],
      splitHypothesis: "Split by responsibilities"
    };

    mocks.scanRepositoryForRefactor
      .mockReturnValueOnce(createScan({ couplingCandidates: [hotspot] }))
      .mockReturnValueOnce(createScan());
    mocks.runRefactorPrompt.mockResolvedValueOnce({ executed: true, outputTail: "pass1", passStatus: "complete" });

    try {
      const { runRefactor } = await import("../src/commands/refactor.js");
      await runRefactor(targetPath, {
        yes: true,
        provider: "codex",
        model: "gpt-5.3-codex",
        maxPasses: 1
      });

      expect(existsSync(checkpointPath)).toBe(false);

      const checkpointPayload = {
        version: 1,
        targetDir: targetPath,
        plannedPasses: 2,
        nextPass: 1,
        maxFiles: 20_000,
        scan: createScan({ couplingCandidates: [hotspot] }),
        backlog: {
          monolithCount: 0,
          couplingCount: 1,
          debtCount: 0,
          commentCount: 0
        },
        execution: {
          provider: "codex",
          targetAgent: "codex",
          model: "gpt-5.3-codex",
          showAiFileOps: true,
          orchestration: true,
          maxSubagents: 6
        },
        updatedAt: new Date().toISOString()
      };
      const fs = await import("node:fs/promises");
      await fs.mkdir(join(targetPath, ".primer-ai"), { recursive: true });
      await fs.writeFile(checkpointPath, `${JSON.stringify(checkpointPayload, null, 2)}\n`, "utf8");

      setInteractiveTTY(true);
      promptState.confirmResponses = [false, false, false, true, true];
      mocks.scanRepositoryForRefactor
        .mockReturnValueOnce(createScan({ couplingCandidates: [hotspot] }))
        .mockReturnValueOnce(createScan());
      mocks.runRefactorPrompt.mockResolvedValueOnce({ executed: true, outputTail: "pass1", passStatus: "complete" });

      await runRefactor(targetPath, {
        provider: "codex",
        model: "gpt-5.3-codex",
        maxPasses: 1
      });

      expect(existsSync(checkpointPath)).toBe(false);
      const secondRunCall = mocks.runRefactorPrompt.mock.calls.at(-1)?.[0] as { showAiFileOps: boolean };
      expect(secondRunCall.showAiFileOps).toBe(false);
    } finally {
      rmSync(targetPath, { recursive: true, force: true });
    }
  });
});
