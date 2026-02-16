import { describe, expect, it } from "vitest";

import { simplifyExecutionStatus } from "../src/commands/refactor/status.js";

describe("refactor status text", () => {
  it("maps waiting states without using finalizing language", () => {
    expect(simplifyExecutionStatus("codex is still processing the refactor request...")).toBe("Waiting for AI response");
    expect(simplifyExecutionStatus("codex is waiting for additional response while edits are in progress...")).toBe(
      "Waiting for AI response"
    );
  });

  it("maps execution progress into actionable phrases", () => {
    expect(simplifyExecutionStatus("Checking availability of codex CLI session...")).toBe("Preparing AI environment");
    expect(simplifyExecutionStatus("Launching codex CLI...")).toBe("Starting AI session");
    expect(simplifyExecutionStatus("codex is generating and applying the requested changes...")).toBe(
      "Applying refactor updates"
    );
    expect(simplifyExecutionStatus("something else")).toBe("Working on refactor request");
  });
});
