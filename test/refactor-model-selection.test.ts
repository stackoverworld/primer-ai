import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const promptState = vi.hoisted(() => ({
  selectResponses: [] as string[],
  confirmResponses: [] as boolean[],
  textResponses: [] as string[]
}));

const mocks = vi.hoisted(() => ({
  buildRefactorPolicy: vi.fn(() => ({ baselineSkill: "qa-refactoring" })),
  scanRepositoryForRefactor: vi.fn(),
  buildRefactorPrompt: vi.fn(() => "Refactor prompt"),
  runRefactorPrompt: vi.fn(async () => ({ executed: true, outputTail: "" })),
  calibrateScanWithAi: vi.fn(async ({ scan }: { scan: unknown }) => ({ scan })),
  discoverProviderModels: vi.fn(() => ["gpt-5", "o3"])
}));

vi.mock("@clack/prompts", () => {
  async function select(options: { initialValue?: string; options?: Array<{ value: string }> }) {
    return promptState.selectResponses.shift() ?? options.initialValue ?? options.options?.[0]?.value;
  }

  async function confirm(options: { initialValue?: boolean }) {
    return promptState.confirmResponses.shift() ?? options.initialValue ?? false;
  }

  async function text(options: { validate?: (value: string) => string | undefined }) {
    const value = promptState.textResponses.shift() ?? "";
    const validationError = options.validate?.(value);
    if (validationError) throw new Error(validationError);
    return value;
  }

  return {
    select,
    confirm,
    text,
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
    isCancel: () => false,
    cancel: () => undefined
  };
});

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

vi.mock("../src/core/provider-models.js", () => ({
  discoverProviderModels: mocks.discoverProviderModels
}));

describe("refactor model selection", () => {
  const originalStdoutIsTTY = process.stdout.isTTY;
  const originalStdinIsTTY = process.stdin.isTTY;

  beforeEach(() => {
    promptState.selectResponses = [];
    promptState.confirmResponses = [];
    promptState.textResponses = [];
    vi.clearAllMocks();

    mocks.scanRepositoryForRefactor.mockReturnValue({
      targetDir: ".",
      techStack: "TypeScript + Node.js + Express",
      projectShape: "api-service",
      scannedSourceFiles: 10,
      scannedTotalLines: 1200,
      reachedFileCap: false,
      largestFiles: [],
      monolithCandidates: [],
      couplingCandidates: [],
      debtCandidates: [],
      commentCleanupCandidates: []
    });

    Object.defineProperty(process.stdout, "isTTY", { configurable: true, value: true });
    Object.defineProperty(process.stdin, "isTTY", { configurable: true, value: true });
  });

  afterEach(() => {
    Object.defineProperty(process.stdout, "isTTY", { configurable: true, value: originalStdoutIsTTY });
    Object.defineProperty(process.stdin, "isTTY", { configurable: true, value: originalStdinIsTTY });
  });

  it("prompts for provider-specific model and forwards it to execution", async () => {
    const targetPath = mkdtempSync(join(tmpdir(), "primer-ai-refactor-model-"));
    promptState.selectResponses = ["codex", "gpt-5.3-codex"];
    promptState.confirmResponses = [false, false, true, true];
    promptState.textResponses = ["12"];
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
      .mockReturnValueOnce({
        targetDir: ".",
        techStack: "TypeScript + Node.js + Express",
        projectShape: "api-service",
        scannedSourceFiles: 10,
        scannedTotalLines: 1200,
        reachedFileCap: false,
        largestFiles: [],
        monolithCandidates: [],
        couplingCandidates: [hotspot],
        debtCandidates: [],
        commentCleanupCandidates: []
      })
      .mockReturnValueOnce({
        targetDir: ".",
        techStack: "TypeScript + Node.js + Express",
        projectShape: "api-service",
        scannedSourceFiles: 10,
        scannedTotalLines: 1200,
        reachedFileCap: false,
        largestFiles: [],
        monolithCandidates: [],
        couplingCandidates: [],
        debtCandidates: [],
        commentCleanupCandidates: []
      });

    try {
      const { runRefactor } = await import("../src/commands/refactor.js");
      await runRefactor(targetPath, {});

      expect(mocks.discoverProviderModels).toHaveBeenCalledWith("codex", { cwd: targetPath });
      expect(mocks.runRefactorPrompt).toHaveBeenCalledTimes(1);
      expect(mocks.runRefactorPrompt).toHaveBeenCalledWith(
        expect.objectContaining({
          targetDir: targetPath,
          provider: "codex",
          targetAgent: "codex",
          model: "gpt-5.3-codex",
          showAiFileOps: false,
          orchestration: true,
          maxSubagents: 12
        })
      );
    } finally {
      rmSync(targetPath, { recursive: true, force: true });
    }
  });
});
