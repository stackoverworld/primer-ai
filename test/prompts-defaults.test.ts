import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { InitCommandOptions } from "../src/core/types.js";
import { toKebabCase } from "../src/core/text.js";

const promptState = vi.hoisted(() => ({
  textResponses: [] as string[],
  selectResponses: [] as string[],
  confirmResponses: [] as boolean[]
}));

vi.mock("@clack/prompts", () => {
  async function text(options: { validate?: (value: string) => string | undefined }) {
    const value = promptState.textResponses.shift() ?? "";
    const validationError = options.validate?.(value);
    if (validationError) throw new Error(validationError);
    return value;
  }

  async function select(options: {
    initialValue?: string;
    options?: Array<{ value: string }>;
  }) {
    return (
      promptState.selectResponses.shift() ??
      options.initialValue ??
      options.options?.[0]?.value
    );
  }

  async function confirm(options: { initialValue?: boolean }) {
    return promptState.confirmResponses.shift() ?? options.initialValue ?? false;
  }

  return {
    text,
    select,
    confirm,
    log: {
      info: () => undefined,
      warn: () => undefined,
      error: () => undefined,
      success: () => undefined
    },
    isCancel: () => false,
    cancel: () => undefined,
    outro: () => undefined
  };
});

vi.mock("../src/core/provider-models.js", () => ({
  discoverProviderModels: () => ["sonnet", "opus"]
}));

describe("collectInitInput defaults", () => {
  beforeEach(() => {
    promptState.textResponses = [];
    promptState.selectResponses = [];
    promptState.confirmResponses = [];
  });

  function createExistingProjectDir(prefix: string): string {
    const dir = mkdtempSync(join(tmpdir(), prefix));
    writeFileSync(join(dir, "README.md"), "existing project");
    return dir;
  }

  async function runCollectInput(
    targetPath: string,
    options: InitCommandOptions = {}
  ) {
    const { collectInitInput } = await import("../src/core/prompts.js");
    return collectInitInput(targetPath, options);
  }

  it("accepts empty project-name input by falling back to detected folder name", async () => {
    const targetPath = createExistingProjectDir("billing-project-");
    const expectedDefaultName = toKebabCase(basename(targetPath)) || "new-project";

    promptState.textResponses = ["", ""];
    promptState.selectResponses = [
      "api-service",
      "claude",
      "claude"
    ];
    promptState.confirmResponses = [false, false, false];

    try {
      const input = await runCollectInput(targetPath);
      expect(input.existingProject).toBe(true);
      expect(input.projectName).toBe(expectedDefaultName);
      expect(input.description.length).toBeGreaterThanOrEqual(12);
    } finally {
      rmSync(targetPath, { recursive: true, force: true });
    }
  });

  it("accepts empty custom-stack input by falling back to provided stack default", async () => {
    const targetPath = createExistingProjectDir("custom-stack-");
    const customStack = "Elixir + Phoenix";

    promptState.textResponses = ["", ""];
    promptState.selectResponses = ["api-service", "codex", "codex"];
    promptState.confirmResponses = [false, false, false];

    try {
      const input = await runCollectInput(targetPath, { stack: customStack });
      expect(input.techStack).toBe(customStack);
    } finally {
      rmSync(targetPath, { recursive: true, force: true });
    }
  });

  it("captures selected provider model when AI provider is fixed", async () => {
    const targetPath = createExistingProjectDir("provider-model-");

    promptState.textResponses = ["", ""];
    promptState.selectResponses = ["api-service", "claude", "claude", "opus"];
    promptState.confirmResponses = [false, false, false];

    try {
      const input = await runCollectInput(targetPath);
      expect(input.aiProvider).toBe("claude");
      expect(input.aiModel).toBe("opus");
    } finally {
      rmSync(targetPath, { recursive: true, force: true });
    }
  });

  it("ignores explicit model when provider is auto", async () => {
    const targetPath = createExistingProjectDir("provider-auto-model-");

    try {
      const input = await runCollectInput(targetPath, { yes: true, provider: "auto", model: "sonnet" });
      expect(input.aiProvider).toBe("auto");
      expect(input.aiModel).toBeUndefined();
    } finally {
      rmSync(targetPath, { recursive: true, force: true });
    }
  });

  it("uses codex-first defaults in --yes mode", async () => {
    const targetPath = createExistingProjectDir("codex-defaults-");

    try {
      const input = await runCollectInput(targetPath, { yes: true });
      expect(input.targetAgent).toBe("codex");
      expect(input.aiProvider).toBe("codex");
    } finally {
      rmSync(targetPath, { recursive: true, force: true });
    }
  });
});
