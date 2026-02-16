import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const promptState = vi.hoisted(() => ({
  selectResponses: [] as string[],
  confirmResponses: [] as boolean[],
  textResponses: [] as string[]
}));

const mocks = vi.hoisted(() => ({
  discoverProviderModels: vi.fn(() => [] as string[])
}));

vi.mock("@clack/prompts", () => {
  async function select(options: { initialValue?: string; options?: Array<{ value: string }> }) {
    return promptState.selectResponses.shift() ?? options.initialValue ?? options.options?.[0]?.value;
  }

  async function confirm(options: { initialValue?: boolean }) {
    return promptState.confirmResponses.shift() ?? options.initialValue ?? false;
  }

  async function text(options: { defaultValue?: string; validate?: (value: string) => string | undefined }) {
    const value = promptState.textResponses.shift() ?? options.defaultValue ?? "";
    const validationError = options.validate?.(value);
    if (validationError) throw new Error(validationError);
    return value;
  }

  return {
    select,
    confirm,
    text,
    isCancel: () => false,
    cancel: () => undefined,
    log: {
      warn: () => undefined,
      info: () => undefined,
      error: () => undefined,
      success: () => undefined
    }
  };
});

vi.mock("../src/core/provider-models.js", () => ({
  discoverProviderModels: mocks.discoverProviderModels
}));

describe("resolveExecutionChoices", () => {
  const originalStdoutIsTTY = process.stdout.isTTY;
  const originalStdinIsTTY = process.stdin.isTTY;

  beforeEach(() => {
    promptState.selectResponses = [];
    promptState.confirmResponses = [];
    promptState.textResponses = [];
    mocks.discoverProviderModels.mockReset();
    mocks.discoverProviderModels.mockReturnValue([]);
    Object.defineProperty(process.stdout, "isTTY", { configurable: true, value: true });
    Object.defineProperty(process.stdin, "isTTY", { configurable: true, value: true });
  });

  afterEach(() => {
    Object.defineProperty(process.stdout, "isTTY", { configurable: true, value: originalStdoutIsTTY });
    Object.defineProperty(process.stdin, "isTTY", { configurable: true, value: originalStdinIsTTY });
  });

  it("uses interactive Codex-first defaults", async () => {
    const { resolveExecutionChoices } = await import("../src/commands/refactor/execution-choices.js");
    const result = await resolveExecutionChoices({}, process.cwd());

    expect(result).toMatchObject({
      provider: "codex",
      targetAgent: "codex",
      model: "gpt-5.3-codex",
      plannerModel: "gpt-5.3-codex",
      orchestratorModel: "gpt-5.3-codex",
      workerModel: "gpt-5.3-codex-spark",
      showAiFileOps: false,
      orchestration: true,
      maxSubagents: 12,
      proceed: true
    });
    expect(mocks.discoverProviderModels).toHaveBeenCalledWith("codex", { cwd: process.cwd() });
  });

  it("accepts Enter on max-subagents prompt and keeps default", async () => {
    promptState.textResponses = [""];
    const { resolveExecutionChoices } = await import("../src/commands/refactor/execution-choices.js");
    const result = await resolveExecutionChoices({}, process.cwd());

    expect(result?.maxSubagents).toBe(12);
    expect(result?.orchestration).toBe(true);
  });

  it("uses non-interactive defaults with codex-first target preference", async () => {
    const { resolveExecutionChoices } = await import("../src/commands/refactor/execution-choices.js");
    const result = await resolveExecutionChoices({ yes: true }, process.cwd());

    expect(result).toMatchObject({
      provider: "auto",
      targetAgent: "codex",
      showAiFileOps: false,
      orchestration: true,
      maxSubagents: 12,
      proceed: true
    });
    expect(result?.model).toBeUndefined();
  });

  it("accepts custom codex model ids without allowlist restrictions", async () => {
    const { resolveExecutionChoices } = await import("../src/commands/refactor/execution-choices.js");
    const result = await resolveExecutionChoices(
      {
        yes: true,
        provider: "codex",
        model: "gpt-5.2-spark-xhigh"
      },
      process.cwd()
    );

    expect(result).toMatchObject({
      provider: "codex",
      targetAgent: "codex",
      model: "gpt-5.2-spark-xhigh",
      proceed: true
    });
  });

  it("merges --notes and --focus into the execution notes channel", async () => {
    const { resolveExecutionChoices } = await import("../src/commands/refactor/execution-choices.js");
    const result = await resolveExecutionChoices(
      {
        yes: true,
        notes: "Preserve import ordering policy.",
        focus: "Avoid edits in generated files."
      },
      process.cwd()
    );

    expect(result?.notes).toBe("Preserve import ordering policy.\nAvoid edits in generated files.");
  });

  it("passes explicit role models for codex orchestration", async () => {
    const { resolveExecutionChoices } = await import("../src/commands/refactor/execution-choices.js");
    const result = await resolveExecutionChoices(
      {
        yes: true,
        provider: "codex",
        plannerModel: "gpt-5.3-codex",
        orchestratorModel: "gpt-5.3-codex",
        workerModel: "gpt-5.3-codex-spark"
      },
      process.cwd()
    );

    expect(result).toMatchObject({
      provider: "codex",
      plannerModel: "gpt-5.3-codex",
      orchestratorModel: "gpt-5.3-codex",
      workerModel: "gpt-5.3-codex-spark"
    });
  });
});
