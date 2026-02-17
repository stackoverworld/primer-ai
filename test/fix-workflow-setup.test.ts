import { describe, expect, it } from "vitest";

import { prepareFixWorkflow } from "../src/commands/fix/workflow-setup.js";
import { UserInputError } from "../src/core/errors.js";

describe("prepareFixWorkflow", () => {
  it("uses default max-passes and ai-timeout when flags are omitted", () => {
    const workflow = prepareFixWorkflow(undefined, {});
    expect(workflow.maxPasses).toBe(3);
    expect(workflow.explicitMaxPasses).toBe(false);
    expect(workflow.aiTimeoutMs).toBe(1_800_000);
  });

  it("clamps ai-timeout and max-passes", () => {
    const workflow = prepareFixWorkflow(undefined, {
      aiTimeoutSec: 20,
      maxPasses: 99
    });
    expect(workflow.aiTimeoutMs).toBe(60_000);
    expect(workflow.maxPasses).toBe(12);
    expect(workflow.explicitMaxPasses).toBe(true);
  });

  it("rejects invalid max-passes", () => {
    expect(() => prepareFixWorkflow(undefined, { maxPasses: "abc" })).toThrow(
      'Invalid --max-passes value "abc". Expected an integer between 1 and 12.'
    );
    expect(() => prepareFixWorkflow(undefined, { maxPasses: "abc" })).toThrow(UserInputError);
  });

  it("maps invalid fix path to user input error", () => {
    expect(() => prepareFixWorkflow("/definitely/not/a/real/path", {})).toThrow(UserInputError);
  });
});
