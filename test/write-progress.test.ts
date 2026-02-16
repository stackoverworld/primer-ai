import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import type { ScaffoldWriteProgress } from "../src/core/write.js";
import { writeScaffold } from "../src/core/write.js";

describe("writeScaffold progress", () => {
  it("emits progress events for directories and files", async () => {
    const targetDir = await mkdtemp(join(tmpdir(), "primer-ai-write-"));
    const events: ScaffoldWriteProgress[] = [];

    try {
      await writeScaffold(
        targetDir,
        ["docs", "src"],
        [
          { path: "README.md", content: "# Demo" },
          { path: "src/index.ts", content: "export const ok = true;\n" }
        ],
        false,
        {
          onProgress(event) {
            events.push(event);
          }
        }
      );

      const directoryEvents = events.filter((event) => event.stage === "directories");
      const fileEvents = events.filter((event) => event.stage === "files");

      expect(directoryEvents.length).toBe(2);
      expect(directoryEvents[0]?.current).toBe(1);
      expect(directoryEvents[1]?.current).toBe(2);
      expect(directoryEvents[1]?.total).toBe(2);

      expect(fileEvents.length).toBe(2);
      expect(fileEvents[0]?.path).toBe("README.md");
      expect(fileEvents[1]?.path).toBe("src/index.ts");
      expect(fileEvents[1]?.total).toBe(2);

      await access(join(targetDir, "README.md"));
      await access(join(targetDir, "src/index.ts"));
    } finally {
      await rm(targetDir, { recursive: true, force: true });
    }
  });

  it("overwrites only explicitly allowed existing paths when force is disabled", async () => {
    const targetDir = await mkdtemp(join(tmpdir(), "primer-ai-write-"));

    try {
      await writeScaffold(
        targetDir,
        [],
        [{ path: "README.md", content: "# Old\n" }],
        false
      );

      await writeScaffold(
        targetDir,
        [],
        [{ path: "README.md", content: "# New\n" }],
        false,
        { allowOverwritePaths: new Set<string>(["README.md"]) }
      );

      await access(join(targetDir, "README.md"));
      const content = await readFile(join(targetDir, "README.md"), "utf8");
      expect(content).toBe("# New\n");
    } finally {
      await rm(targetDir, { recursive: true, force: true });
    }
  });
});
