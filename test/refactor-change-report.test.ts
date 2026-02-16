import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { captureSourceFileSnapshot, summarizeAiVerificationSignals, summarizeSourceDiff } from "../src/commands/refactor/change-report.js";

describe("refactor change report helpers", () => {
  it("detects added/modified/removed source files between snapshots", () => {
    const targetPath = join(tmpdir(), `primer-ai-change-report-${Date.now()}`);
    mkdirSync(targetPath, { recursive: true });
    const srcDir = join(targetPath, "src");
    mkdirSync(srcDir, { recursive: true });

    const keepFile = join(srcDir, "keep.ts");
    const removeFile = join(srcDir, "remove.ts");
    writeFileSync(keepFile, "export const keep = 1;\n", "utf8");
    writeFileSync(removeFile, "export const remove = 1;\n", "utf8");

    try {
      const before = captureSourceFileSnapshot(targetPath, 1000);

      writeFileSync(keepFile, "export const keep = 2;\n", "utf8");
      rmSync(removeFile, { force: true });
      writeFileSync(join(srcDir, "added.ts"), "export const added = true;\n", "utf8");

      const after = captureSourceFileSnapshot(targetPath, 1000);
      const diff = summarizeSourceDiff(before, after);

      expect(diff.added).toContain("src/added.ts");
      expect(diff.modified).toContain("src/keep.ts");
      expect(diff.removed).toContain("src/remove.ts");
    } finally {
      rmSync(targetPath, { recursive: true, force: true });
    }
  });

  it("extracts verification-related notes from AI output tail", () => {
    const signals = summarizeAiVerificationSignals(
      [
        "Implemented decomposition successfully.",
        "npm run lint: passed",
        "npm run test: missing script",
        "build blocked by lock",
        "PRIMER_REFACTOR_STATUS: COMPLETE"
      ].join("\n")
    );

    expect(signals).toEqual(["npm run lint: passed", "npm run test: missing script", "build blocked by lock"]);
  });
});
