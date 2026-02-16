import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  runCommand: vi.fn()
}));

vi.mock("../src/core/ai/process-runner.js", () => ({
  runCommand: mocks.runCommand
}));

describe("ai provider command wiring", () => {
  beforeEach(() => {
    mocks.runCommand.mockReset();
    mocks.runCommand.mockResolvedValue({
      ok: true,
      stdout: "ok",
      stderr: ""
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("adds codex subagent thread override when orchestration is enabled", async () => {
    const { runFreeformTask } = await import("../src/core/ai/providers.js");

    await runFreeformTask("codex", "refactor now", {
      cwd: "/tmp/project",
      model: "gpt-5.3-codex",
      orchestration: true,
      maxSubagents: 12,
      showAiFileOps: false
    });

    expect(mocks.runCommand).toHaveBeenCalledWith(
      "codex",
      [
        "exec",
        "--sandbox",
        "workspace-write",
        "--skip-git-repo-check",
        "-c",
        'model_reasoning_effort="xhigh"',
        "-c",
        "agents.max_threads=12",
        "--model",
        "gpt-5.3-codex",
        "refactor now"
      ],
      {
        cwd: "/tmp/project",
        inheritOutput: false
      }
    );
  });

  it("omits codex subagent thread override when orchestration is disabled", async () => {
    const { runFreeformTask } = await import("../src/core/ai/providers.js");

    await runFreeformTask("codex", "refactor now", {
      orchestration: false,
      maxSubagents: 12
    });

    const codexArgs = mocks.runCommand.mock.calls[0]?.[1] as string[] | undefined;
    expect(codexArgs).toBeDefined();
    expect(codexArgs?.includes("workspace-write")).toBe(true);
    expect(codexArgs?.includes("agents.max_threads=12")).toBe(false);
  });

  it("keeps claude output streaming disabled by default", async () => {
    const { runFreeformTask } = await import("../src/core/ai/providers.js");

    await runFreeformTask("claude", "refactor now", {
      showAiFileOps: false
    });

    expect(mocks.runCommand).toHaveBeenCalledWith(
      "claude",
      ["-p", "refactor now", "--no-session-persistence"],
      {
        cwd: undefined,
        inheritOutput: false
      }
    );
  });

  it("forwards custom timeout to provider command execution", async () => {
    const { runFreeformTask } = await import("../src/core/ai/providers.js");

    await runFreeformTask("codex", "refactor now", {
      timeoutMs: 1_800_000,
      showAiFileOps: false
    });

    expect(mocks.runCommand).toHaveBeenCalledWith(
      "codex",
      [
        "exec",
        "--sandbox",
        "workspace-write",
        "--skip-git-repo-check",
        "-c",
        'model_reasoning_effort="xhigh"',
        "refactor now"
      ],
      {
        cwd: undefined,
        inheritOutput: false,
        timeoutMs: 1_800_000
      }
    );
  });
});
