import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { buildRefactorPolicy } from "../src/core/refactor-policy.js";
import { buildRefactorPrompt, scanRepositoryForRefactor } from "../src/core/refactor.js";

function createFixture(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

function makeMonolithFile(lineCount: number): string {
  return Array.from({ length: lineCount }, (_, index) => `export const line${index + 1} = ${index + 1};`).join("\n");
}

describe("refactor command core", () => {
  it("detects monolith and comment cleanup candidates for node backend stacks", () => {
    const targetPath = createFixture("primer-ai-refactor-");
    writeFileSync(
      join(targetPath, "package.json"),
      JSON.stringify(
        {
          name: "sample-api",
          private: true,
          dependencies: { express: "^5.0.0" },
          devDependencies: { typescript: "^5.0.0" }
        },
        null,
        2
      )
    );
    writeFileSync(join(targetPath, "tsconfig.json"), "{}");
    mkdirSync(join(targetPath, "src"), { recursive: true });
    writeFileSync(join(targetPath, "src", "api.ts"), makeMonolithFile(420), { flag: "w" });
    writeFileSync(
      join(targetPath, "src", "notes.ts"),
      [
        "// this function is simply obvious",
        "// this file is ai-generated placeholder text",
        "// just a helper comment",
        "// basically this function does one thing",
        "// self-explanatory helper",
        "// this function is just boilerplate",
        "export const value = 1;"
      ].join("\n"),
      { flag: "w" }
    );

    try {
      const scan = scanRepositoryForRefactor(targetPath, 200);
      expect(scan.techStack).toBe("TypeScript + Node.js + Express");
      expect(scan.projectShape).toBe("api-service");
      expect(scan.monolithCandidates.some((entry) => entry.path === "src/api.ts")).toBe(true);
      expect(scan.commentCleanupCandidates.some((entry) => entry.path === "src/notes.ts")).toBe(true);
    } finally {
      rmSync(targetPath, { recursive: true, force: true });
    }
  });

  it("builds dry-run prompt with baseline skill and user focus", () => {
    const targetPath = createFixture("primer-ai-refactor-prompt-");
    writeFileSync(join(targetPath, "package.json"), JSON.stringify({ dependencies: { fastify: "^5.0.0" } }, null, 2));
    writeFileSync(join(targetPath, "tsconfig.json"), "{}");
    mkdirSync(join(targetPath, "src"), { recursive: true });
    writeFileSync(join(targetPath, "src", "server.ts"), makeMonolithFile(90), { flag: "w" });

    try {
      const scan = scanRepositoryForRefactor(targetPath, 200);
      const policy = buildRefactorPolicy(scan.techStack, scan.projectShape);
      const prompt = buildRefactorPrompt(scan, policy, {
        dryRun: true,
        focus: "Split monolith command handlers into cohesive modules."
      });

      expect(prompt).toContain("Mode: DRY-RUN");
      expect(prompt).toContain("Baseline skill: qa-refactoring");
      expect(prompt).toContain("Split monolith command handlers into cohesive modules.");
      expect(prompt).toContain("Verification commands");
    } finally {
      rmSync(targetPath, { recursive: true, force: true });
    }
  });

  it("does not flag a large cohesive file as a monolith candidate", () => {
    const targetPath = createFixture("primer-ai-refactor-cohesive-");
    writeFileSync(
      join(targetPath, "package.json"),
      JSON.stringify(
        {
          name: "cohesive-lib",
          private: true,
          devDependencies: { typescript: "^5.0.0" }
        },
        null,
        2
      )
    );
    writeFileSync(join(targetPath, "tsconfig.json"), "{}");
    mkdirSync(join(targetPath, "src"), { recursive: true });

    const cohesiveLines = ["export class DomainCatalog {"];
    for (let index = 0; index < 980; index += 1) {
      cohesiveLines.push(`  readonly field${index + 1} = ${index + 1};`);
    }
    cohesiveLines.push("}");
    writeFileSync(join(targetPath, "src", "catalog.ts"), cohesiveLines.join("\n"), { flag: "w" });

    try {
      const scan = scanRepositoryForRefactor(targetPath, 200);
      expect(scan.monolithCandidates.some((entry) => entry.path === "src/catalog.ts")).toBe(false);
    } finally {
      rmSync(targetPath, { recursive: true, force: true });
    }
  });
});
