import { describe, expect, it } from "vitest";

import { buildProjectPlan } from "../src/core/plan.js";
import { createScaffoldFiles, rootAgentsLineCount } from "../src/core/templates.js";
import type { InitInput } from "../src/core/types.js";

function baseInput(overrides: Partial<InitInput> = {}): InitInput {
  return {
    projectName: "demo-project",
    description: "Build a production-ready API service with clear contracts.",
    techStack: "TypeScript + Node.js",
    existingProject: false,
    projectShape: "api-service",
    targetAgent: "both",
    includeCursorRules: true,
    generationMode: "template",
    aiProvider: "auto",
    initializeGit: true,
    runAiQuickSetup: false,
    ...overrides
  };
}

describe("scaffold generation", () => {
  it("keeps root AGENTS.md inside the 60-150 line budget", () => {
    const input = baseInput();
    const plan = buildProjectPlan(input);
    const files = createScaffoldFiles(input, plan, null);
    const lines = rootAgentsLineCount(files);

    expect(lines).toBeGreaterThanOrEqual(60);
    expect(lines).toBeLessThanOrEqual(150);
  });

  it("creates Claude adapter files when Claude workflow is selected", () => {
    const input = baseInput({ targetAgent: "claude" });
    const plan = buildProjectPlan(input);
    const files = createScaffoldFiles(input, plan, null);
    const paths = new Set(files.map((file) => file.path));

    expect(paths.has("CLAUDE.md")).toBe(true);
    expect(paths.has(".claude/rules/testing.md")).toBe(true);
    expect(paths.has(".claude/rules/security.md")).toBe(true);
    expect(paths.has(".claude/rules/api.md")).toBe(true);
    expect(paths.has(".claude/settings.json")).toBe(true);
    expect(paths.has("scripts/claude-hooks/pre-tool-use.mjs")).toBe(true);
    expect(paths.has("scripts/claude-hooks/stop.mjs")).toBe(true);
  });

  it("does not create Claude adapter files when Codex-only workflow is selected", () => {
    const input = baseInput({ targetAgent: "codex" });
    const plan = buildProjectPlan(input);
    const files = createScaffoldFiles(input, plan, null);
    const paths = new Set(files.map((file) => file.path));

    expect(paths.has("CLAUDE.md")).toBe(false);
    expect(paths.has(".claude/rules/testing.md")).toBe(false);
    expect(paths.has(".claude/settings.json")).toBe(false);
  });

  it("creates scoped AGENTS.md files for planned instruction scopes", () => {
    const input = baseInput({ projectShape: "monorepo" });
    const plan = buildProjectPlan(input);
    const files = createScaffoldFiles(input, plan, null);
    const paths = new Set(files.map((file) => file.path));

    for (const scoped of plan.scopedInstructions) {
      expect(paths.has(`${scoped.directory}/AGENTS.md`)).toBe(true);
    }
  });

  it("creates scoped CLAUDE.md adapters for monorepo package scopes", () => {
    const input = baseInput({ projectShape: "monorepo", targetAgent: "claude" });
    const plan = buildProjectPlan(input);
    const files = createScaffoldFiles(input, plan, null);
    const filesByPath = new Map(files.map((file) => [file.path, file.content]));

    expect(filesByPath.has("apps/web/CLAUDE.md")).toBe(true);
    expect(filesByPath.has("apps/api/CLAUDE.md")).toBe(true);
    expect(filesByPath.has("packages/shared/CLAUDE.md")).toBe(true);
    expect(filesByPath.has("tests/CLAUDE.md")).toBe(false);

    const webScopedClaude = filesByPath.get("apps/web/CLAUDE.md");
    expect(webScopedClaude).toContain("@../../AGENTS.md");
    expect(webScopedClaude).toContain("@../../docs/index.md");
    expect(webScopedClaude).toContain("@AGENTS.md");
  });

  it("adds maintenance automation artifacts from research checklist", () => {
    const input = baseInput({ targetAgent: "both" });
    const plan = buildProjectPlan(input);
    const files = createScaffoldFiles(input, plan, null);
    const paths = new Set(files.map((file) => file.path));

    expect(paths.has("docs/maintenance.md")).toBe(true);
    expect(paths.has("docs/skills.md")).toBe(true);
    expect(paths.has(".github/workflows/agent-context-checks.yml")).toBe(true);
    expect(paths.has(".github/workflows/doc-gardening.yml")).toBe(true);
    expect(paths.has("scripts/check-agent-context.mjs")).toBe(true);
    expect(paths.has("scripts/check-doc-freshness.mjs")).toBe(true);
    expect(paths.has("scripts/check-skills.mjs")).toBe(true);
    expect(paths.has("scripts/doc-garden.mjs")).toBe(true);
    expect(paths.has("scripts/compose-agents.mjs")).toBe(true);
    expect(paths.has(".agents/README.md")).toBe(true);
    expect(paths.has("skills/architecture-update/SKILL.md")).toBe(true);
    expect(paths.has("skills/architecture-update/tests/trigger-cases.md")).toBe(true);
    expect(paths.has("skills/adaptive-refactor/SKILL.md")).toBe(true);
    expect(paths.has("skills/adaptive-refactor/tests/trigger-cases.md")).toBe(true);
  });

  it("embeds configurable Codex fallback parsing in agent context checks", () => {
    const input = baseInput();
    const plan = buildProjectPlan(input);
    const files = createScaffoldFiles(input, plan, null);
    const script = files.find((file) => file.path === "scripts/check-agent-context.mjs")?.content ?? "";

    expect(script).toContain("PRIMER_AI_AGENT_FALLBACK_FILES");
    expect(script).toContain("project_doc_fallback_files");
    expect(script).toContain("instructions_fallback_files");
    expect(script).toContain('join(ROOT, ".codex", "config.toml")');
    expect(script).toContain('join(homedir(), ".codex", "config.toml")');
  });

  it("enforces trigger quality checks for curated skills", () => {
    const input = baseInput();
    const plan = buildProjectPlan(input);
    const files = createScaffoldFiles(input, plan, null);
    const script = files.find((file) => file.path === "scripts/check-skills.mjs")?.content ?? "";

    expect(script).toContain("##\\s*Trigger");
    expect(script).toContain("##\\s*Workflow");
    expect(script).toContain("##\\s*Should trigger");
    expect(script).toContain("##\\s*Should NOT trigger");
    expect(script).toContain("at least 2 positive trigger examples");
    expect(script).toContain("at least 2 negative trigger examples");
  });

  it("renders adaptive refactor skill policy guidance in docs/skills.md", () => {
    const input = baseInput({ techStack: "TypeScript + Node.js + Express", projectShape: "api-service" });
    const plan = buildProjectPlan(input);
    const files = createScaffoldFiles(input, plan, null);
    const skillsDoc = files.find((file) => file.path === "docs/skills.md")?.content ?? "";

    expect(skillsDoc).toContain("## Refactor Skill Baseline");
    expect(skillsDoc).toContain("qa-refactoring");
    expect(skillsDoc).toContain("nodejs-backend-patterns");
    expect(skillsDoc).toContain("npx skills add vasilyu1983/ai-agents-public --skill qa-refactoring");
    expect(skillsDoc).toContain("npx tsc --noEmit");
  });

  it("includes guardrails and optional specialist notes in adaptive refactor skill", () => {
    const input = baseInput({ techStack: "React + TypeScript + Vite", projectShape: "web-app" });
    const plan = buildProjectPlan(input);
    const files = createScaffoldFiles(input, plan, null);
    const skillDoc = files.find((file) => file.path === "skills/adaptive-refactor/SKILL.md")?.content ?? "";

    expect(skillDoc).toContain("## Do Not Trigger");
    expect(skillDoc).toContain("react-vite-expert");
    expect(skillDoc).toContain("eslint");
  });
});
