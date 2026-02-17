import { describe, expect, it } from "vitest";

import { runCommand } from "../src/core/ai/process-runner.js";

describe("runCommand stop-on-output pattern", () => {
  it("stops early when output marker is emitted", async () => {
    const startedAt = Date.now();
    const result = await runCommand(
      process.execPath,
      ["-e", "console.log('boot'); console.log('PRIMER_REFACTOR_STATUS: COMPLETE'); setInterval(() => {}, 1000);"],
      {
        timeoutMs: 5000,
        stopOnOutputPattern: /PRIMER_REFACTOR_STATUS:\s*(COMPLETE|CONTINUE)/i
      }
    );
    const elapsedMs = Date.now() - startedAt;

    expect(result.ok).toBe(true);
    expect(result.stdout).toContain("PRIMER_REFACTOR_STATUS: COMPLETE");
    expect(elapsedMs).toBeLessThan(3000);
  });

  it("still times out when marker is never emitted", async () => {
    const result = await runCommand(process.execPath, ["-e", "setInterval(() => {}, 1000);"], {
      timeoutMs: 250,
      stopOnOutputPattern: /PRIMER_REFACTOR_STATUS:\s*(COMPLETE|CONTINUE)/i
    });

    expect(result.ok).toBe(false);
    expect(result.reason).toContain("timeout after");
  });

  it("keeps only output tail instead of killing noisy processes", async () => {
    const result = await runCommand(
      process.execPath,
      ["-e", "const chunk='x'.repeat(2048); for (let i = 0; i < 128; i += 1) process.stdout.write(chunk);"],
      {
        timeoutMs: 5000,
        maxBufferBytes: 4096
      }
    );

    expect(result.ok).toBe(true);
    expect(Buffer.byteLength(result.stdout, "utf8")).toBeLessThanOrEqual(4096);
  });

  it("adds truncation notice for failing commands with oversized output", async () => {
    const result = await runCommand(
      process.execPath,
      [
        "-e",
        "const chunk='y'.repeat(2048); for (let i = 0; i < 128; i += 1) process.stderr.write(chunk); process.exit(7);"
      ],
      {
        timeoutMs: 5000,
        maxBufferBytes: 4096
      }
    );

    expect(result.ok).toBe(false);
    expect(result.reason).toContain("exit code 7");
    expect(result.reason).toContain("output truncated to last 4096 bytes per stream");
  });

  it("emits parsed AI activity updates from process output lines", async () => {
    const activityLog: string[] = [];
    const result = await runCommand(
      process.execPath,
      [
        "-e",
        [
          "console.log('thinking');",
          "console.log('Read file \"src/app.ts\"');",
          "console.log('diff --git a/src/app.ts b/src/app.ts');",
          "console.log('npm run lint');",
          "console.log('PRIMER_REFACTOR_STATUS: COMPLETE');"
        ].join(" ")
      ],
      {
        timeoutMs: 5000,
        onActivity(message) {
          activityLog.push(message);
        }
      }
    );

    expect(result.ok).toBe(true);
    expect(activityLog).toEqual([
      "AI activity: planning changes",
      "AI activity: reading project files",
      "AI activity: editing project files",
      "AI activity: running verification checks",
      "AI activity: preparing completion report"
    ]);
  });
});
