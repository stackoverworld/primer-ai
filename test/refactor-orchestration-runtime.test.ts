import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  runAiFreeformTask: vi.fn()
}));

vi.mock("../src/core/ai.js", () => ({
  runAiFreeformTask: mocks.runAiFreeformTask
}));

describe("codex orchestration runtime", () => {
  beforeEach(() => {
    mocks.runAiFreeformTask.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns complete immediately when planner marks pass as non-actionable", async () => {
    mocks.runAiFreeformTask.mockResolvedValueOnce({
      ok: true,
      providerUsed: "codex",
      output: JSON.stringify({
        refactorNeeded: false,
        summary: "No actionable refactor work remains.",
        tasks: []
      })
    });

    const { runOrchestratedRefactorPrompt } = await import("../src/core/refactor/orchestration.js");
    const result = await runOrchestratedRefactorPrompt({
      prompt: "Refactor mission",
      provider: "codex",
      targetAgent: "codex",
      cwd: process.cwd(),
      maxSubagents: 4
    });

    expect(result).toMatchObject({
      executed: true,
      providerUsed: "codex",
      passStatus: "complete"
    });
    expect(result?.outputTail).toContain("PRIMER_REFACTOR_STATUS: COMPLETE");
    expect(mocks.runAiFreeformTask).toHaveBeenCalledTimes(1);
    expect(mocks.runAiFreeformTask).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gpt-5.3-codex",
        orchestration: false,
        maxSubagents: 1
      })
    );
  });

  it("runs planner, orchestrator, and worker roles with explicit model overrides", async () => {
    mocks.runAiFreeformTask
      .mockResolvedValueOnce({
        ok: true,
        providerUsed: "codex",
        output: JSON.stringify({
          refactorNeeded: true,
          summary: "Execute two independent file tasks.",
          tasks: [
            {
              id: "task-a",
              title: "Extract parser helpers",
              files: ["src/a.ts"],
              instructions: "Extract helper functions."
            },
            {
              id: "task-b",
              title: "Split command wiring",
              files: ["src/b.ts"],
              instructions: "Move wiring to a focused module."
            }
          ]
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        providerUsed: "codex",
        output: JSON.stringify({
          summary: "Wave plan ready.",
          assignments: [
            {
              taskId: "task-a",
              wave: 1,
              files: ["src/a.ts"],
              workerInstructions: "Apply task-a changes."
            },
            {
              taskId: "task-b",
              wave: 1,
              files: ["src/b.ts"],
              workerInstructions: "Apply task-b changes."
            }
          ]
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        providerUsed: "codex",
        output: "done\nPRIMER_REFACTOR_STATUS: COMPLETE"
      })
      .mockResolvedValueOnce({
        ok: true,
        providerUsed: "codex",
        output: "done\nPRIMER_REFACTOR_STATUS: COMPLETE"
      });

    const { runOrchestratedRefactorPrompt } = await import("../src/core/refactor/orchestration.js");
    const result = await runOrchestratedRefactorPrompt({
      prompt: "Refactor mission",
      provider: "codex",
      targetAgent: "codex",
      cwd: process.cwd(),
      plannerModel: "planner-xhigh",
      orchestratorModel: "orchestrator-medium",
      workerModel: "worker-spark",
      maxSubagents: 8
    });

    expect(result).toMatchObject({
      executed: true,
      passStatus: "complete",
      providerUsed: "codex"
    });
    expect(result?.outputTail).toContain("Executed 2 worker task(s) across 1 wave(s).");

    const models = mocks.runAiFreeformTask.mock.calls.map((call) => call[0]?.model);
    expect(models).toEqual(["planner-xhigh", "orchestrator-medium", "worker-spark", "worker-spark"]);
    expect(mocks.runAiFreeformTask).toHaveBeenCalledTimes(4);
    for (const call of mocks.runAiFreeformTask.mock.calls) {
      expect(call[0]).toEqual(expect.objectContaining({ orchestration: false, maxSubagents: 1 }));
    }
    expect(mocks.runAiFreeformTask.mock.calls[2]?.[0]).toEqual(expect.objectContaining({ expectFileWrites: true }));
    expect(mocks.runAiFreeformTask.mock.calls[3]?.[0]).toEqual(expect.objectContaining({ expectFileWrites: true }));
  });

  it("returns null when planner output cannot be parsed into orchestration plan", async () => {
    mocks.runAiFreeformTask.mockResolvedValueOnce({
      ok: true,
      providerUsed: "codex",
      output: "not json"
    });

    const { runOrchestratedRefactorPrompt } = await import("../src/core/refactor/orchestration.js");
    const result = await runOrchestratedRefactorPrompt({
      prompt: "Refactor mission",
      provider: "codex",
      targetAgent: "codex",
      cwd: process.cwd()
    });

    expect(result).toBeNull();
    expect(mocks.runAiFreeformTask).toHaveBeenCalledTimes(1);
  });
});
