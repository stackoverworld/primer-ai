import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  buildAgentContextWorkflow,
  buildCheckAgentContextScript,
  buildCheckDocFreshnessScript,
  buildCheckSkillsScript,
  buildCiWorkflow,
  buildComposeAgentsScript,
  buildDocGardenScript,
  buildDocGardeningWorkflow
} from "../src/core/templates/automation.js";

function normalizeContent(value: string): string {
  return value.replace(/\r\n/g, "\n").trimEnd() + "\n";
}

function expectTemplateMatchesFile(templateContent: string, path: string): void {
  const fileContent = readFileSync(path, "utf8");
  expect(normalizeContent(templateContent)).toBe(normalizeContent(fileContent));
}

describe("template sync", () => {
  it("keeps automation scripts in sync with scaffold templates", () => {
    expectTemplateMatchesFile(buildComposeAgentsScript(), "scripts/compose-agents.mjs");
    expectTemplateMatchesFile(buildCheckAgentContextScript(), "scripts/check-agent-context.mjs");
    expectTemplateMatchesFile(buildCheckDocFreshnessScript(), "scripts/check-doc-freshness.mjs");
    expectTemplateMatchesFile(buildCheckSkillsScript(), "scripts/check-skills.mjs");
    expectTemplateMatchesFile(buildDocGardenScript(), "scripts/doc-garden.mjs");
  });

  it("keeps GitHub workflows in sync with scaffold templates", () => {
    expectTemplateMatchesFile(buildCiWorkflow(), ".github/workflows/ci.yml");
    expectTemplateMatchesFile(buildAgentContextWorkflow(), ".github/workflows/agent-context-checks.yml");
    expectTemplateMatchesFile(buildDocGardeningWorkflow(), ".github/workflows/doc-gardening.yml");
  });
});
