import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import type { RefactorPolicy } from "../src/core/refactor-policy.js";
import type { RepoRefactorScan } from "../src/core/refactor.js";
import { buildFixVerificationPlan, runFixVerificationCycle } from "../src/commands/fix/verification.js";

function makeScan(targetDir: string): RepoRefactorScan {
  return {
    targetDir,
    techStack: "TypeScript + Node.js",
    projectShape: "api-service",
    scannedSourceFiles: 1,
    scannedTotalLines: 1,
    reachedFileCap: false,
    largestFiles: [],
    monolithCandidates: [],
    couplingCandidates: [],
    debtCandidates: [],
    commentCleanupCandidates: []
  };
}

function makePolicy(commands: string[]): RefactorPolicy {
  return {
    baselineSkill: {
      name: "qa-refactoring",
      repository: "https://github.com/example/qa-refactoring",
      purpose: "Test baseline skill",
      appliesWhen: "Always",
      installCommand: "n/a"
    },
    stackSkills: [],
    verificationCommands: commands,
    notes: []
  };
}

describe("fix verification", () => {
  it("maps npm-run verification commands to the detected package manager", () => {
    const targetPath = mkdtempSync(join(tmpdir(), "primer-ai-fix-plan-"));
    writeFileSync(join(targetPath, "pnpm-lock.yaml"), "lockfileVersion: '9.0'");
    writeFileSync(
      join(targetPath, "package.json"),
      JSON.stringify({ scripts: { lint: "eslint .", test: "vitest run", build: "tsc --noEmit" } }, null, 2)
    );

    try {
      const plan = buildFixVerificationPlan(makeScan(targetPath), makePolicy(["npm run lint", "npm run test", "npm run build"]));
      expect(plan.packageManager).toBe("pnpm");
      expect(plan.commands).toEqual(["pnpm run lint", "pnpm run test", "pnpm run build"]);
    } finally {
      rmSync(targetPath, { recursive: true, force: true });
    }
  });

  it("treats missing script as non-actionable and marks real command failures as actionable", async () => {
    const targetPath = mkdtempSync(join(tmpdir(), "primer-ai-fix-cycle-"));
    writeFileSync(join(targetPath, "package.json"), JSON.stringify({ scripts: {} }, null, 2));

    try {
      const result = await runFixVerificationCycle(
        {
          packageManager: "npm",
          scripts: new Set<string>(),
          commands: [
            "npm run lint",
            "node -e \"console.error('lint error'); process.exit(1)\""
          ]
        },
        { cwd: targetPath, timeoutMs: 30_000 }
      );

      expect(result.results[0]?.skipped).toBe(true);
      expect(result.results[0]?.actionableFailure).toBe(false);

      expect(result.results[1]?.skipped).toBe(false);
      expect(result.results[1]?.actionableFailure).toBe(true);
      expect(result.actionableFailures).toHaveLength(1);
      expect(result.actionableFailures[0]?.command).toContain("node -e");
    } finally {
      rmSync(targetPath, { recursive: true, force: true });
    }
  });

  it("adds tool-aware fallback checks based on installed packages when scripts are missing", () => {
    const targetPath = mkdtempSync(join(tmpdir(), "primer-ai-fix-fallback-"));
    writeFileSync(join(targetPath, "pnpm-lock.yaml"), "lockfileVersion: '9.0'");
    writeFileSync(
      join(targetPath, "package.json"),
      JSON.stringify(
        {
          scripts: {},
          dependencies: {
            next: "14.2.0"
          },
          devDependencies: {
            eslint: "^9.0.0",
            typescript: "^5.0.0",
            vitest: "^4.0.0"
          }
        },
        null,
        2
      )
    );
    writeFileSync(join(targetPath, "tsconfig.json"), "{}");

    try {
      const plan = buildFixVerificationPlan(
        makeScan(targetPath),
        makePolicy(["npm run lint", "npx tsc --noEmit", "vitest run"])
      );

      expect(plan.packageManager).toBe("pnpm");
      expect(plan.commands).toContain("pnpm run lint");
      expect(plan.commands).toContain("pnpm exec tsc --noEmit");
      expect(plan.commands).toContain("pnpm exec vitest run");
      expect(plan.commands).toContain("pnpm exec eslint .");
      expect(plan.commands).toContain("pnpm exec next build");
    } finally {
      rmSync(targetPath, { recursive: true, force: true });
    }
  });

  it("marks timed-out verification commands as non-actionable so the loop does not stall", async () => {
    const targetPath = mkdtempSync(join(tmpdir(), "primer-ai-fix-timeout-"));
    writeFileSync(join(targetPath, "package.json"), JSON.stringify({ scripts: {} }, null, 2));

    try {
      const result = await runFixVerificationCycle(
        {
          packageManager: "npm",
          scripts: new Set<string>(),
          commands: ["node -e \"setInterval(() => {}, 1000)\""]
        },
        { cwd: targetPath, timeoutMs: 100 }
      );

      expect(result.results).toHaveLength(1);
      expect(result.results[0]?.ok).toBe(false);
      expect(result.results[0]?.skipped).toBe(true);
      expect(result.results[0]?.actionableFailure).toBe(false);
      expect(result.actionableFailures).toHaveLength(0);
    } finally {
      rmSync(targetPath, { recursive: true, force: true });
    }
  });

  it("keeps repo ENOENT failures actionable", async () => {
    const targetPath = mkdtempSync(join(tmpdir(), "primer-ai-fix-enoent-actionable-"));
    writeFileSync(join(targetPath, "package.json"), JSON.stringify({ scripts: {} }, null, 2));

    try {
      const result = await runFixVerificationCycle(
        {
          packageManager: "npm",
          scripts: new Set<string>(),
          commands: ["node -e \"console.error('ENOENT: no such file or directory, open ./missing-fixture.json'); process.exit(1)\""]
        },
        { cwd: targetPath, timeoutMs: 30_000 }
      );

      expect(result.results).toHaveLength(1);
      expect(result.results[0]?.skipped).toBe(false);
      expect(result.results[0]?.actionableFailure).toBe(true);
      expect(result.actionableFailures).toHaveLength(1);
    } finally {
      rmSync(targetPath, { recursive: true, force: true });
    }
  });
});
