import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import type { RefactorFileInsight, RefactorHotspot, RepoRefactorScan } from "../src/core/refactor.js";

const mocks = vi.hoisted(() => ({
  runAiFreeformTask: vi.fn()
}));

vi.mock("../src/core/ai.js", () => ({
  runAiFreeformTask: mocks.runAiFreeformTask
}));

import { calibrateScanWithAi } from "../src/commands/refactor/ai-scan.js";

function createInsight(path: string, overrides: Partial<RefactorFileInsight> = {}): RefactorFileInsight {
  return {
    path,
    lineCount: 120,
    commentLines: 12,
    lowSignalCommentLines: 4,
    todoCount: 0,
    importCount: 4,
    internalImportCount: 2,
    fanIn: 1,
    exportCount: 3,
    functionCount: 4,
    classCount: 0,
    ...overrides
  };
}

function createHotspot(path: string, overrides: Partial<RefactorHotspot> = {}): RefactorHotspot {
  const base = createInsight(path, overrides);
  return {
    ...base,
    score: 80,
    reasons: ["high fan-in"],
    splitHypothesis: "Split by responsibility",
    ...overrides
  };
}

function createScan(targetDir: string, overrides: Partial<RepoRefactorScan> = {}): RepoRefactorScan {
  return {
    targetDir,
    techStack: "TypeScript + Node.js",
    projectShape: "cli-tool",
    scannedSourceFiles: 20,
    scannedTotalLines: 2500,
    reachedFileCap: false,
    largestFiles: [],
    monolithCandidates: [],
    couplingCandidates: [],
    debtCandidates: [],
    commentCleanupCandidates: [],
    ...overrides
  };
}

describe("ai scan calibration", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("filters monolith false positives using AI classification", async () => {
    const targetDir = mkdtempSync(join(tmpdir(), "primer-ai-ai-scan-"));
    const templateDir = join(targetDir, "src/core/templates");
    mkdirSync(templateDir, { recursive: true });
    writeFileSync(
      join(templateDir, "automation.ts"),
      [
        "export function buildAutomationPrompt(): string {",
        "  return `",
        "### Weekly report",
        "Run checks and summarize changes.",
        "`;",
        "}"
      ].join("\n"),
      "utf8"
    );

    const templateCandidate = createInsight("src/core/templates/automation.ts", {
      lineCount: 518,
      exportCount: 7,
      functionCount: 19
    });
    const couplingCandidate = createHotspot("src/core/refactor/scan.ts", {
      score: 93,
      fanIn: 9,
      internalImportCount: 18
    });
    const scan = createScan(targetDir, {
      largestFiles: [templateCandidate, couplingCandidate],
      monolithCandidates: [templateCandidate],
      couplingCandidates: [couplingCandidate]
    });

    mocks.runAiFreeformTask.mockResolvedValue({
      ok: true,
      output: JSON.stringify({
        monolithPaths: [],
        couplingPaths: ["src/core/refactor/scan.ts"],
        debtPaths: [],
        commentCleanupPaths: []
      }),
      providerUsed: "codex"
    });

    try {
      const result = await calibrateScanWithAi({
        scan,
        provider: "codex",
        targetAgent: "codex",
        model: "gpt-5.3-codex",
        notes: "Preserve generated automation templates unless the issue is structural."
      });

      expect(result.scan.monolithCandidates).toEqual([]);
      expect(result.scan.couplingCandidates.map((entry) => entry.path)).toEqual(["src/core/refactor/scan.ts"]);
      expect(mocks.runAiFreeformTask).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: "codex",
          targetAgent: "codex",
          model: "gpt-5.3-codex",
          cwd: targetDir
        })
      );
      const prompt = String(mocks.runAiFreeformTask.mock.calls[0]?.[0]?.prompt ?? "");
      expect(prompt).toContain("src/core/templates/automation.ts");
      expect(prompt).toContain("Preserve generated automation templates unless the issue is structural.");
    } finally {
      rmSync(targetDir, { recursive: true, force: true });
    }
  });

  it("falls back to deterministic scan when AI output is invalid", async () => {
    const targetDir = mkdtempSync(join(tmpdir(), "primer-ai-ai-scan-fallback-"));
    const candidate = createInsight("src/core/templates/automation.ts", { lineCount: 520 });
    const scan = createScan(targetDir, {
      largestFiles: [candidate],
      monolithCandidates: [candidate]
    });

    mocks.runAiFreeformTask.mockResolvedValue({
      ok: true,
      output: "not-json",
      providerUsed: "codex"
    });

    try {
      const result = await calibrateScanWithAi({
        scan,
        provider: "codex",
        targetAgent: "codex"
      });

      expect(result.scan).toBe(scan);
      expect(result.providerUsed).toBe("codex");
      expect(result.warning).toContain("not valid JSON");
    } finally {
      rmSync(targetDir, { recursive: true, force: true });
    }
  });
});
