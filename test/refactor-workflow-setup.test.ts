import { describe, expect, it } from "vitest";

import { prepareRefactorWorkflow } from "../src/commands/refactor/workflow-setup.js";

describe("prepareRefactorWorkflow", () => {
  it("uses resume and ai-timeout defaults when flags are omitted", () => {
    const workflow = prepareRefactorWorkflow(undefined, {});
    expect(workflow.resume).toBe(true);
    expect(workflow.aiTimeoutMs).toBe(1_800_000);
  });

  it("supports explicit resume disable and clamps ai-timeout range", () => {
    const workflow = prepareRefactorWorkflow(undefined, {
      resume: false,
      aiTimeoutSec: 15
    });

    expect(workflow.resume).toBe(false);
    expect(workflow.aiTimeoutMs).toBe(60_000);
  });

  it("rejects non-numeric ai-timeout values", () => {
    expect(() => prepareRefactorWorkflow(undefined, { aiTimeoutSec: "abc" })).toThrow(
      'Invalid --ai-timeout-sec value "abc".'
    );
  });
});
