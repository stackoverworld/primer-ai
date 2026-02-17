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

  it("uses read-only sandbox + default 30m timeout for codex structured tasks", async () => {
    const { runStructuredTask } = await import("../src/core/ai/providers.js");
    mocks.runCommand.mockResolvedValueOnce({
      ok: true,
      stdout: "{}",
      stderr: ""
    });

    await runStructuredTask("codex", "plan only", {
      type: "object",
      properties: {}
    });

    const firstCall = mocks.runCommand.mock.calls[0] as unknown[] | undefined;
    expect(firstCall?.[0]).toBe("codex");
    const args = (firstCall?.[1] as string[] | undefined) ?? [];
    expect(args.includes("read-only")).toBe(true);
    expect(args.includes("--output-schema")).toBe(true);
    expect(firstCall?.[2]).toEqual({
      cwd: undefined,
      timeoutMs: 1_800_000
    });
  });

  it("forwards explicit structured timeout", async () => {
    const { runStructuredTask } = await import("../src/core/ai/providers.js");
    mocks.runCommand.mockResolvedValueOnce({
      ok: true,
      stdout: "{}",
      stderr: ""
    });

    await runStructuredTask("claude", "plan only", {
      type: "object",
      properties: {}
    }, {
      timeoutMs: 90_000
    });

    const firstCall = mocks.runCommand.mock.calls[0] as unknown[] | undefined;
    expect(firstCall?.[0]).toBe("claude");
    expect(firstCall?.[2]).toEqual({
      cwd: undefined,
      timeoutMs: 90_000
    });
  });

  it("warns before claude fallback without no-session-persistence", async () => {
    const { runFreeformTask } = await import("../src/core/ai/providers.js");
    const onStatus = vi.fn();

    mocks.runCommand
      .mockResolvedValueOnce({
        ok: false,
        stdout: "",
        stderr: "unknown option --no-session-persistence",
        reason: "exit code 1"
      })
      .mockResolvedValueOnce({
        ok: true,
        stdout: "ok",
        stderr: ""
      });

    await runFreeformTask("claude", "refactor now", {
      onStatus
    });

    expect(onStatus).toHaveBeenCalledWith(
      expect.stringContaining("retry will run without --no-session-persistence")
    );
    expect(mocks.runCommand).toHaveBeenNthCalledWith(
      2,
      "claude",
      ["-p", "refactor now"],
      expect.objectContaining({
        cwd: undefined,
        inheritOutput: false,
        onActivity: expect.any(Function)
      })
    );
  });

  it("uses standalone-line matcher for stop-on-refactor-status", async () => {
    const { runFreeformTask } = await import("../src/core/ai/providers.js");

    await runFreeformTask("codex", "refactor now", {
      stopOnRefactorStatusMarker: true
    });

    const options = mocks.runCommand.mock.calls[0]?.[2] as { stopOnOutputPattern?: RegExp } | undefined;
    const pattern = options?.stopOnOutputPattern;
    expect(pattern).toBeInstanceOf(RegExp);
    expect(pattern?.test("PRIMER_REFACTOR_STATUS: COMPLETE")).toBe(true);
    expect(pattern?.test("Final line required: PRIMER_REFACTOR_STATUS: COMPLETE")).toBe(false);
  });
});
