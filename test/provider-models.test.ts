import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { discoverProviderModels } from "../src/core/provider-models.js";

function createFixture(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

const originalOpenAiModel = process.env.OPENAI_MODEL;
const originalAnthropicModel = process.env.ANTHROPIC_MODEL;

describe("provider model discovery", () => {
  afterEach(() => {
    process.env.OPENAI_MODEL = originalOpenAiModel;
    process.env.ANTHROPIC_MODEL = originalAnthropicModel;
  });

  it("collects codex models from project/home config and env", () => {
    const cwd = createFixture("primer-ai-model-codex-cwd-");
    const home = createFixture("primer-ai-model-codex-home-");
    mkdirSync(join(cwd, ".codex"), { recursive: true });
    mkdirSync(join(home, ".codex"), { recursive: true });

    writeFileSync(
      join(cwd, ".codex", "config.toml"),
      [
        'model = "gpt-5"',
        "[profiles.fast]",
        'model = "o3"',
        "[profiles.safe]",
        'model = "gpt-5"'
      ].join("\n")
    );
    writeFileSync(join(home, ".codex", "config.toml"), 'model = "o4-mini"\n');
    process.env.OPENAI_MODEL = "gpt-4.1";

    try {
      const models = discoverProviderModels("codex", {
        cwd,
        homeDir: home
      });
      expect(models).toEqual(["gpt-5", "o3", "o4-mini", "gpt-4.1"]);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
      rmSync(home, { recursive: true, force: true });
    }
  });

  it("collects claude models from settings JSON and env", () => {
    const cwd = createFixture("primer-ai-model-claude-cwd-");
    const home = createFixture("primer-ai-model-claude-home-");
    mkdirSync(join(cwd, ".claude"), { recursive: true });
    mkdirSync(join(home, ".claude"), { recursive: true });

    writeFileSync(
      join(cwd, ".claude", "settings.json"),
      JSON.stringify(
        {
          model: "sonnet",
          agents: {
            reviewer: {
              model: "opus"
            }
          },
          fallbackModel: "haiku"
        },
        null,
        2
      )
    );
    writeFileSync(join(home, ".claude.json"), JSON.stringify({ defaultModel: "claude-sonnet-4-5-20250929" }, null, 2));
    process.env.ANTHROPIC_MODEL = "claude-opus-4-1";

    try {
      const models = discoverProviderModels("claude", {
        cwd,
        homeDir: home
      });
      expect(models).toEqual([
        "sonnet",
        "opus",
        "haiku",
        "claude-sonnet-4-5-20250929",
        "claude-opus-4-1"
      ]);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
      rmSync(home, { recursive: true, force: true });
    }
  });
});
