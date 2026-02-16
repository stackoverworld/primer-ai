import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  runFreeformTask: vi.fn(),
  summarizeFailure: vi.fn(() => "failure summary"),
  resolveProviderForTask: vi.fn(),
  runWithLiveStatus: vi.fn(),
  combineOutput: vi.fn()
}));

vi.mock("../src/core/ai/providers.js", () => ({
  runFreeformTask: mocks.runFreeformTask,
  summarizeFailure: mocks.summarizeFailure
}));

vi.mock("../src/core/ai/task-shared.js", () => ({
  resolveProviderForTask: mocks.resolveProviderForTask,
  runWithLiveStatus: mocks.runWithLiveStatus,
  combineOutput: mocks.combineOutput
}));

describe("runAiFreeformTask write access guard", () => {
  beforeEach(() => {
    mocks.resolveProviderForTask.mockReset();
    mocks.runWithLiveStatus.mockReset();
    mocks.runFreeformTask.mockReset();
    mocks.combineOutput.mockReset();
    mocks.summarizeFailure.mockReset();

    mocks.resolveProviderForTask.mockReturnValue({ provider: "codex" });
    mocks.runWithLiveStatus.mockImplementation(async (_provider, _onStatus, runTask) => runTask());
    mocks.combineOutput.mockImplementation((result: { stdout: string; stderr: string }) =>
      `${result.stdout}\n${result.stderr}`.trim()
    );
    mocks.summarizeFailure.mockReturnValue("failure summary");
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("fails when codex output reports write-blocked sandbox and file writes are required", async () => {
    mocks.runFreeformTask.mockResolvedValue({
      ok: true,
      stdout: "Workspace is running read-only. PRIMER_REFACTOR_STATUS: CONTINUE",
      stderr: ""
    });

    const { runAiFreeformTask } = await import("../src/core/ai/freeform-task.js");
    const result = await runAiFreeformTask({
      prompt: "Apply refactor now",
      provider: "codex",
      targetAgent: "codex",
      expectFileWrites: true
    });

    expect(result.ok).toBe(false);
    expect(result.providerUsed).toBe("codex");
    expect(result.warning).toContain("write-enabled Codex sandbox");
  });

  it("does not fail on write-block hints when file writes are not required", async () => {
    mocks.runFreeformTask.mockResolvedValue({
      ok: true,
      stdout: "Workspace is running read-only. PRIMER_REFACTOR_STATUS: CONTINUE",
      stderr: ""
    });

    const { runAiFreeformTask } = await import("../src/core/ai/freeform-task.js");
    const result = await runAiFreeformTask({
      prompt: "Draft a plan only",
      provider: "codex",
      targetAgent: "codex",
      expectFileWrites: false
    });

    expect(result.ok).toBe(true);
    expect(result.warning).toBeUndefined();
  });

  it("accepts timeout when terminal PRIMER_REFACTOR_STATUS marker is present", async () => {
    mocks.runFreeformTask.mockResolvedValue({
      ok: false,
      stdout: "Refactor summary\nPRIMER_REFACTOR_STATUS: COMPLETE",
      stderr: "",
      reason: "timeout after 1800s"
    });

    const { runAiFreeformTask } = await import("../src/core/ai/freeform-task.js");
    const result = await runAiFreeformTask({
      prompt: "Apply refactor now",
      provider: "codex",
      targetAgent: "codex",
      expectFileWrites: true
    });

    expect(result.ok).toBe(true);
    expect(result.providerUsed).toBe("codex");
    expect(result.warning).toContain("timed out after emitting PRIMER_REFACTOR_STATUS");
  });

  it("keeps timeout as failure when PRIMER_REFACTOR_STATUS marker is missing", async () => {
    mocks.runFreeformTask.mockResolvedValue({
      ok: false,
      stdout: "still working",
      stderr: "",
      reason: "timeout after 1800s"
    });

    const { runAiFreeformTask } = await import("../src/core/ai/freeform-task.js");
    const result = await runAiFreeformTask({
      prompt: "Apply refactor now",
      provider: "codex",
      targetAgent: "codex",
      expectFileWrites: true
    });

    expect(result.ok).toBe(false);
    expect(result.warning).toContain("Could not complete AI task");
  });
});
