import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  runAiFreeformTask: vi.fn()
}));

vi.mock("@clack/prompts", () => ({
  spinner: () => ({
    start: () => undefined,
    stop: () => undefined,
    message: () => undefined,
    error: () => undefined
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

function runGit(cwd: string, args: string[]): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  }).trim();
}

function createRepo(prefix: string): { root: string; remote: string } {
  const root = mkdtempSync(join(tmpdir(), `${prefix}-repo-`));
  const remote = mkdtempSync(join(tmpdir(), `${prefix}-remote-`));

  execFileSync("git", ["init", "--bare", remote], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });

  runGit(root, ["init"]);
  runGit(root, ["config", "user.name", "Test User"]);
  runGit(root, ["config", "user.email", "test@example.com"]);
  runGit(root, ["remote", "add", "origin", remote]);

  return { root, remote };
}

function pushHeadAndTags(root: string): void {
  runGit(root, ["push", "-u", "origin", "HEAD"]);
  runGit(root, ["push", "--tags", "origin"]);
}

function topSection(content: string): string {
  const normalized = content.replace(/\r\n/g, "\n").trim();
  const parts = normalized.split(/\n(?=##\s+)/g);
  return (parts[0] ?? "").trim();
}

describe("runGenerateLogs (AI mode)", () => {
  const tempRoots: string[] = [];

  afterEach(() => {
    vi.clearAllMocks();
    while (tempRoots.length > 0) {
      const dir = tempRoots.pop();
      if (!dir) continue;
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("generates sectioned markdown using AI output", async () => {
    mocks.runAiFreeformTask.mockResolvedValue({
      ok: true,
      output: JSON.stringify({
        changes: ["CLI: add AI-based release log generation."],
        fixes: ["Validation: improve release range checks."]
      })
    });

    const { root, remote } = createRepo("primer-ai-generate-logs-ai");
    tempRoots.push(root, remote);

    writeFileSync(join(root, "README.md"), "# baseline\n", "utf8");
    runGit(root, ["add", "README.md"]);
    runGit(root, ["commit", "-m", "chore: baseline"]);
    runGit(root, ["tag", "v0.1.0"]);

    writeFileSync(join(root, "CHANGE.txt"), "new changes\n", "utf8");
    runGit(root, ["add", "CHANGE.txt"]);
    runGit(root, ["commit", "-m", "feat: add release log input"]);

    pushHeadAndTags(root);

    const { runGenerateLogs } = await import("../src/commands/generate-logs.js");
    await runGenerateLogs(root, {
      output: "RELEASE_LOG.md"
    });

    const generated = readFileSync(join(root, "RELEASE_LOG.md"), "utf8");
    expect(generated).toContain("## v0.1.0 -> HEAD");
    expect(generated).toContain("### Changes");
    expect(generated).toContain("### Fixes");
    expect(generated).toContain("CLI: add AI-based release log generation.");
    expect(generated).toContain("Validation: improve release range checks.");
    expect(mocks.runAiFreeformTask).toHaveBeenCalledTimes(1);
  });

  it("supports strict version-to-version generation from GitHub tags", async () => {
    mocks.runAiFreeformTask.mockResolvedValue({
      ok: true,
      output: JSON.stringify({
        changes: ["Release: ship 0.1.79 updates."],
        fixes: []
      })
    });

    const { root, remote } = createRepo("primer-ai-generate-logs-range");
    tempRoots.push(root, remote);

    writeFileSync(join(root, "package.json"), '{"name":"demo","version":"0.1.59-beta"}\n', "utf8");
    runGit(root, ["add", "package.json"]);
    runGit(root, ["commit", "-m", "chore: start 0.1.59-beta"]);
    runGit(root, ["tag", "v0.1.59-beta"]);

    writeFileSync(join(root, "package.json"), '{"name":"demo","version":"0.1.79"}\n', "utf8");
    runGit(root, ["add", "package.json"]);
    runGit(root, ["commit", "-m", "feat: release 0.1.79"]);
    runGit(root, ["tag", "v0.1.79"]);

    writeFileSync(join(root, "AFTER.txt"), "post release\n", "utf8");
    runGit(root, ["add", "AFTER.txt"]);
    runGit(root, ["commit", "-m", "docs: post 0.1.79"]);

    pushHeadAndTags(root);

    const { runGenerateLogs } = await import("../src/commands/generate-logs.js");
    await runGenerateLogs(root, {
      fromVersion: "0.1.59",
      toVersion: "0.1.79",
      output: "RELEASE_RANGE.md"
    });

    const generated = readFileSync(join(root, "RELEASE_RANGE.md"), "utf8");
    expect(generated).toContain("## 0.1.59 -> 0.1.79");
    expect(generated).toContain("Release: ship 0.1.79 updates.");
    expect(topSection(generated)).not.toContain("### Fixes");
  });

  it("uses latest RELEASE_LOG to-version as default base", async () => {
    mocks.runAiFreeformTask.mockResolvedValue({
      ok: true,
      output: JSON.stringify({
        changes: ["Runtime: add next-range release notes."],
        fixes: []
      })
    });

    const { root, remote } = createRepo("primer-ai-generate-logs-latest");
    tempRoots.push(root, remote);

    writeFileSync(join(root, "README.md"), "# baseline\n", "utf8");
    runGit(root, ["add", "README.md"]);
    runGit(root, ["commit", "-m", "chore: baseline"]);
    runGit(root, ["tag", "v0.1.79"]);

    writeFileSync(join(root, "README.md"), "# next\n", "utf8");
    runGit(root, ["add", "README.md"]);
    runGit(root, ["commit", "-m", "feat: continue"]);
    runGit(root, ["tag", "v0.1.80"]);

    writeFileSync(
      join(root, "RELEASE_LOG.md"),
      "## 0.1.79 -> 0.1.80\n\n### Changes\n- Previous release.\n\n### Fixes\n- Previous fix.\n",
      "utf8"
    );

    writeFileSync(join(root, "NEW.txt"), "new head delta\n", "utf8");
    runGit(root, ["add", "NEW.txt"]);
    runGit(root, ["commit", "-m", "feat: new head work"]);

    pushHeadAndTags(root);

    const { runGenerateLogs } = await import("../src/commands/generate-logs.js");
    await runGenerateLogs(root, {
      output: "RELEASE_LOG.md"
    });

    const generated = readFileSync(join(root, "RELEASE_LOG.md"), "utf8");
    expect(generated).toContain("## 0.1.80 -> HEAD");
    expect(generated).toContain("## 0.1.79 -> 0.1.80");
    expect(topSection(generated)).not.toContain("### Fixes");
  });

  it("fails when requested to-version does not exist on GitHub tags", async () => {
    mocks.runAiFreeformTask.mockResolvedValue({
      ok: true,
      output: JSON.stringify({
        changes: ["Should not be used."],
        fixes: []
      })
    });

    const { root, remote } = createRepo("primer-ai-generate-logs-missing-tag");
    tempRoots.push(root, remote);

    writeFileSync(join(root, "README.md"), "# baseline\n", "utf8");
    runGit(root, ["add", "README.md"]);
    runGit(root, ["commit", "-m", "chore: baseline"]);
    runGit(root, ["tag", "v0.1.59"]);
    pushHeadAndTags(root);

    const { runGenerateLogs } = await import("../src/commands/generate-logs.js");
    await expect(
      runGenerateLogs(root, {
        fromVersion: "0.1.59",
        toVersion: "0.1.79",
        output: "RELEASE_FAIL.md"
      })
    ).rejects.toThrow('was not found on GitHub tags (origin)');
  });

  it("prepends new sections and upserts repeated ranges", async () => {
    mocks.runAiFreeformTask.mockImplementation(async (input: { prompt: string }) => {
      const rangeMatch = input.prompt.match(/Range:\s*([^\n]+)/);
      const range = rangeMatch?.[1] ?? "unknown";
      return {
        ok: true,
        output: JSON.stringify({
          changes: [`Range: ${range}.`],
          fixes: []
        })
      };
    });

    const { root, remote } = createRepo("primer-ai-generate-logs-upsert");
    tempRoots.push(root, remote);

    writeFileSync(join(root, "package.json"), '{"name":"demo","version":"0.1.58"}\n', "utf8");
    runGit(root, ["add", "package.json"]);
    runGit(root, ["commit", "-m", "chore: 0.1.58"]);
    runGit(root, ["tag", "v0.1.58"]);

    writeFileSync(join(root, "package.json"), '{"name":"demo","version":"0.1.59"}\n', "utf8");
    runGit(root, ["add", "package.json"]);
    runGit(root, ["commit", "-m", "feat: 0.1.59"]);
    runGit(root, ["tag", "v0.1.59"]);

    writeFileSync(join(root, "package.json"), '{"name":"demo","version":"0.1.60"}\n', "utf8");
    runGit(root, ["add", "package.json"]);
    runGit(root, ["commit", "-m", "feat: 0.1.60"]);
    runGit(root, ["tag", "v0.1.60"]);

    pushHeadAndTags(root);

    const { runGenerateLogs } = await import("../src/commands/generate-logs.js");
    await runGenerateLogs(root, {
      fromVersion: "0.1.58",
      toVersion: "0.1.59",
      output: "RELEASE_MULTI.md"
    });
    await runGenerateLogs(root, {
      fromVersion: "0.1.59",
      toVersion: "0.1.60",
      output: "RELEASE_MULTI.md"
    });
    await runGenerateLogs(root, {
      fromVersion: "0.1.59",
      toVersion: "0.1.60",
      output: "RELEASE_MULTI.md"
    });

    const generated = readFileSync(join(root, "RELEASE_MULTI.md"), "utf8");
    const newerIndex = generated.indexOf("## 0.1.59 -> 0.1.60");
    const olderIndex = generated.indexOf("## 0.1.58 -> 0.1.59");
    expect(newerIndex).toBeGreaterThanOrEqual(0);
    expect(olderIndex).toBeGreaterThanOrEqual(0);
    expect(newerIndex).toBeLessThan(olderIndex);
    expect(generated.match(/## 0\.1\.59 -> 0\.1\.60/g)?.length).toBe(1);
    expect(topSection(generated)).not.toContain("### Fixes");
  });

  it("does not update release file when AI returns no changes and no fixes", async () => {
    mocks.runAiFreeformTask.mockResolvedValue({
      ok: true,
      output: JSON.stringify({
        changes: [],
        fixes: []
      })
    });

    const { root, remote } = createRepo("primer-ai-generate-logs-empty");
    tempRoots.push(root, remote);

    writeFileSync(join(root, "README.md"), "# baseline\n", "utf8");
    runGit(root, ["add", "README.md"]);
    runGit(root, ["commit", "-m", "chore: baseline"]);
    runGit(root, ["tag", "v0.1.0"]);
    pushHeadAndTags(root);

    const existing = "## 0.0.9 -> 0.1.0\n\n### Changes\n- Previous.\n";
    writeFileSync(join(root, "RELEASE_LOG.md"), existing, "utf8");

    const { runGenerateLogs } = await import("../src/commands/generate-logs.js");
    await runGenerateLogs(root, {
      output: "RELEASE_LOG.md"
    });

    const generated = readFileSync(join(root, "RELEASE_LOG.md"), "utf8");
    expect(generated).toBe(existing);
  });
});
