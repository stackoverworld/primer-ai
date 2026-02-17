import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import type { RefactorPolicy } from "../src/core/refactor-policy.js";
import type { RepoRefactorScan } from "../src/core/refactor.js";
import type { FixVerificationPlan } from "../src/commands/fix/verification.js";

const mocks = vi.hoisted(() => ({
  runAiFreeformTask: vi.fn(),
  buildRefactorPolicy: vi.fn(),
  scanRepositoryForRefactor: vi.fn(),
  resolveFixExecutionChoices: vi.fn(),
  buildFixPrompt: vi.fn(() => "fix prompt"),
  buildFixVerificationPlan: vi.fn(),
  runFixVerificationCycle: vi.fn(),
  captureSourceFileSnapshot: vi.fn(() => ({ files: new Map<string, { fingerprint: string }>() })),
  summarizeSourceDiff: vi.fn(() => ({ added: [], modified: [], removed: [] }))
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
  }
}));

vi.mock("../src/core/ai.js", () => ({
  runAiFreeformTask: mocks.runAiFreeformTask
}));

vi.mock("../src/core/refactor-policy.js", () => ({
  buildRefactorPolicy: mocks.buildRefactorPolicy
}));

vi.mock("../src/core/refactor.js", () => ({
  scanRepositoryForRefactor: mocks.scanRepositoryForRefactor
}));

vi.mock("../src/commands/fix/execution-choices.js", () => ({
  resolveFixExecutionChoices: mocks.resolveFixExecutionChoices
}));

vi.mock("../src/commands/fix/prompt.js", () => ({
  buildFixPrompt: mocks.buildFixPrompt
}));

vi.mock("../src/commands/fix/verification.js", () => ({
  buildFixVerificationPlan: mocks.buildFixVerificationPlan,
  runFixVerificationCycle: mocks.runFixVerificationCycle
}));

vi.mock("../src/commands/refactor/change-report.js", () => ({
  captureSourceFileSnapshot: mocks.captureSourceFileSnapshot,
  summarizeSourceDiff: mocks.summarizeSourceDiff
}));

function makeScan(targetDir: string): RepoRefactorScan {
  return {
    targetDir,
    techStack: "TypeScript + Node.js",
    projectShape: "api-service",
    scannedSourceFiles: 100,
    scannedTotalLines: 1000,
    reachedFileCap: false,
    largestFiles: [],
    monolithCandidates: [],
    couplingCandidates: [],
    debtCandidates: [],
    commentCleanupCandidates: []
  };
}

function makePolicy(): RefactorPolicy {
  return {
    baselineSkill: {
      name: "qa-refactoring",
      repository: "https://github.com/example/qa-refactoring",
      purpose: "baseline",
      appliesWhen: "Always",
      installCommand: "n/a"
    },
    stackSkills: [],
    verificationCommands: ["npm run lint"],
    notes: []
  };
}

function makeVerificationPlan(): FixVerificationPlan {
  return {
    packageManager: "npm",
    scripts: new Set<string>(["lint"]),
    commands: ["npm run lint"]
  };
}

function makeActionableFailure(command: string) {
  return {
    command,
    ok: false,
    skipped: false,
    actionableFailure: true,
    reason: "exit code 1",
    stdout: "",
    stderr: `${command} failed`,
    durationMs: 4
  };
}

describe("runFix command", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("short-circuits when baseline verification has no actionable failures", async () => {
    const targetPath = mkdtempSync(join(tmpdir(), "primer-ai-fix-command-clean-"));
    mocks.scanRepositoryForRefactor.mockReturnValue(makeScan(targetPath));
    mocks.buildRefactorPolicy.mockReturnValue(makePolicy());
    mocks.buildFixVerificationPlan.mockReturnValue(makeVerificationPlan());
    mocks.runFixVerificationCycle.mockResolvedValue({
      results: [
        {
          command: "npm run lint",
          ok: true,
          skipped: false,
          actionableFailure: false,
          stdout: "",
          stderr: "",
          durationMs: 1
        }
      ],
      actionableFailures: []
    });

    try {
      const { runFix } = await import("../src/commands/fix.js");
      await runFix(targetPath, { yes: true });

      expect(mocks.runFixVerificationCycle).toHaveBeenCalledTimes(1);
      expect(mocks.resolveFixExecutionChoices).not.toHaveBeenCalled();
      expect(mocks.runAiFreeformTask).not.toHaveBeenCalled();
    } finally {
      rmSync(targetPath, { recursive: true, force: true });
    }
  });

  it("fails fast when AI execution fails during an actionable fix pass", async () => {
    const targetPath = mkdtempSync(join(tmpdir(), "primer-ai-fix-command-fail-"));
    mocks.scanRepositoryForRefactor.mockReturnValue(makeScan(targetPath));
    mocks.buildRefactorPolicy.mockReturnValue(makePolicy());
    mocks.buildFixVerificationPlan.mockReturnValue(makeVerificationPlan());
    mocks.runFixVerificationCycle.mockResolvedValue({
      results: [
        {
          command: "npm run lint",
          ok: false,
          skipped: false,
          actionableFailure: true,
          reason: "exit code 1",
          stdout: "",
          stderr: "lint error",
          durationMs: 4
        }
      ],
      actionableFailures: [
        {
          command: "npm run lint",
          ok: false,
          skipped: false,
          actionableFailure: true,
          reason: "exit code 1",
          stdout: "",
          stderr: "lint error",
          durationMs: 4
        }
      ]
    });
    mocks.resolveFixExecutionChoices.mockResolvedValue({
      provider: "codex",
      targetAgent: "codex",
      model: "gpt-5.3-codex",
      showAiFileOps: false,
      proceed: true
    });
    mocks.runAiFreeformTask.mockResolvedValue({
      ok: false,
      output: "failed",
      warning: "mock ai failure"
    });

    try {
      const { runFix } = await import("../src/commands/fix.js");
      await expect(runFix(targetPath, { yes: true, maxPasses: 2 })).rejects.toThrow("mock ai failure");
      expect(mocks.runFixVerificationCycle).toHaveBeenCalledTimes(1);
      expect(mocks.runAiFreeformTask).toHaveBeenCalledTimes(1);
    } finally {
      rmSync(targetPath, { recursive: true, force: true });
    }
  });

  it("auto-increases pass budget when default cap is reached and failures remain", async () => {
    const targetPath = mkdtempSync(join(tmpdir(), "primer-ai-fix-command-adaptive-"));
    const failure = makeActionableFailure("npm run lint");
    mocks.scanRepositoryForRefactor.mockReturnValue(makeScan(targetPath));
    mocks.buildRefactorPolicy.mockReturnValue(makePolicy());
    mocks.buildFixVerificationPlan.mockReturnValue(makeVerificationPlan());
    mocks.runFixVerificationCycle
      .mockResolvedValueOnce({
        results: [failure],
        actionableFailures: [failure]
      })
      .mockResolvedValueOnce({
        results: [failure],
        actionableFailures: [failure]
      })
      .mockResolvedValueOnce({
        results: [failure],
        actionableFailures: [failure]
      })
      .mockResolvedValueOnce({
        results: [failure],
        actionableFailures: [failure]
      })
      .mockResolvedValueOnce({
        results: [
          {
            command: "npm run lint",
            ok: true,
            skipped: false,
            actionableFailure: false,
            stdout: "",
            stderr: "",
            durationMs: 1
          }
        ],
        actionableFailures: []
      });
    mocks.resolveFixExecutionChoices.mockResolvedValue({
      provider: "codex",
      targetAgent: "codex",
      model: "gpt-5.3-codex",
      showAiFileOps: false,
      proceed: true
    });
    mocks.runAiFreeformTask.mockResolvedValue({
      ok: true,
      output: "PRIMER_REFACTOR_STATUS: CONTINUE"
    });

    try {
      const { runFix } = await import("../src/commands/fix.js");
      await runFix(targetPath, { yes: true });

      expect(mocks.runAiFreeformTask).toHaveBeenCalledTimes(4);
      expect(mocks.runFixVerificationCycle).toHaveBeenCalledTimes(5);
    } finally {
      rmSync(targetPath, { recursive: true, force: true });
    }
  });

  it("keeps explicit max-passes as hard cap without adaptive growth", async () => {
    const targetPath = mkdtempSync(join(tmpdir(), "primer-ai-fix-command-hard-cap-"));
    const failure = makeActionableFailure("npm run lint");
    mocks.scanRepositoryForRefactor.mockReturnValue(makeScan(targetPath));
    mocks.buildRefactorPolicy.mockReturnValue(makePolicy());
    mocks.buildFixVerificationPlan.mockReturnValue(makeVerificationPlan());
    mocks.runFixVerificationCycle
      .mockResolvedValueOnce({
        results: [failure],
        actionableFailures: [failure]
      })
      .mockResolvedValueOnce({
        results: [failure],
        actionableFailures: [failure]
      })
      .mockResolvedValueOnce({
        results: [failure],
        actionableFailures: [failure]
      });
    mocks.resolveFixExecutionChoices.mockResolvedValue({
      provider: "codex",
      targetAgent: "codex",
      model: "gpt-5.3-codex",
      showAiFileOps: false,
      proceed: true
    });
    mocks.runAiFreeformTask.mockResolvedValue({
      ok: true,
      output: "PRIMER_REFACTOR_STATUS: CONTINUE"
    });

    try {
      const { runFix } = await import("../src/commands/fix.js");
      await expect(runFix(targetPath, { yes: true, maxPasses: 2 })).rejects.toThrow(
        "Fix workflow incomplete after 2 pass(es)"
      );
      expect(mocks.runAiFreeformTask).toHaveBeenCalledTimes(2);
      expect(mocks.runFixVerificationCycle).toHaveBeenCalledTimes(3);
    } finally {
      rmSync(targetPath, { recursive: true, force: true });
    }
  });
});
