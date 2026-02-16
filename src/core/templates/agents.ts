import { posix } from "node:path";

import { buildRefactorPolicy } from "../refactor-policy.js";
import { normalizeMarkdown, toTitleCase } from "../text.js";
import type { AIDraft, FileArtifact, InitInput, ProjectPlan, RepositoryArea, ScopedInstruction } from "../types.js";
import { defaultArchitectureSummary, defaultQualityGates, defaultRisks } from "./defaults.js";
import { includesClaude, includesCodex, normalizePath } from "./shared.js";

function enforceRootLineBudget(content: string): string {
  const minLines = 60;
  const maxLines = 150;
  const lines = content.trimEnd().split("\n");

  if (lines.length > maxLines) {
    return normalizeMarkdown(lines.slice(0, maxLines).join("\n"));
  }

  if (lines.length >= minLines) {
    return normalizeMarkdown(lines.join("\n"));
  }

  const fillers = [
    "",
    "## Additional Reminders",
    "- Prefer explicit contracts over implicit behavior.",
    "- Keep runtime side effects at module boundaries.",
    "- Record tradeoffs in `docs/decisions/` when they affect future work.",
    "- Keep architecture docs synchronized with merged behavior.",
    "- If unsure, choose predictable and testable implementations."
  ];

  while (lines.length < minLines && fillers.length > 0) {
    lines.push(fillers.shift() ?? "");
  }

  return normalizeMarkdown(lines.join("\n"));
}

function buildRepoMap(plan: ProjectPlan): string {
  const staticAreas: RepositoryArea[] = [
    { path: "AGENTS.md", purpose: "Root routing instructions for coding agents." },
    { path: "docs/index.md", purpose: "Index of architecture and delivery docs." },
    { path: "docs/architecture.md", purpose: "System boundaries and dependency model." },
    { path: "docs/api-contracts.md", purpose: "External/internal API expectations." },
    { path: "docs/conventions.md", purpose: "Code, testing, and review conventions." },
    { path: "docs/maintenance.md", purpose: "Mechanical checks, context budgets, and doc-gardening policy." },
    { path: "docs/skills.md", purpose: "Skill curation and trigger discipline." },
    { path: ".agents/fragments/root", purpose: "Composable fragments used to build AGENTS.md." }
  ];

  const areas = [...staticAreas, ...plan.repositoryAreas];
  const deduplicated = new Map<string, string>();
  for (const area of areas) {
    if (!deduplicated.has(area.path)) {
      deduplicated.set(area.path, area.purpose);
    }
  }

  const rows = ["| Path | Purpose |", "| --- | --- |"];
  for (const [path, purpose] of deduplicated.entries()) {
    rows.push(`| \`${normalizePath(path)}\` | ${purpose} |`);
  }

  return rows.join("\n");
}

export function buildRootAgents(
  input: InitInput,
  plan: ProjectPlan,
  draft: AIDraft | null,
  providerUsed?: "codex" | "claude"
): string {
  const architectureSummary = draft?.architectureSummary?.length ? draft.architectureSummary : defaultArchitectureSummary(input);
  const qualityGates = draft?.qualityGates?.length ? draft.qualityGates : defaultQualityGates(plan);
  const risks = draft?.risks?.length ? draft.risks : defaultRisks();
  const refactorPolicy = buildRefactorPolicy(input.techStack, input.projectShape);

  const scopedInstructionLines = plan.scopedInstructions.length
    ? plan.scopedInstructions
        .map(
          (entry) =>
            `- \`${normalizePath(posix.join(entry.directory, "AGENTS.md"))}\`: ${entry.focus} (applies inside \`${normalizePath(entry.directory)}/\`).`
        )
        .join("\n")
    : "- No scoped AGENTS files are currently defined.";

  const codexNote = includesCodex(input.targetAgent)
    ? "- Codex chain behavior: root `AGENTS.md` + deeper scoped files are intentionally concise to avoid context truncation."
    : "- Codex-specific notes are omitted because Codex target was not selected.";

  const claudeNote = includesClaude(input.targetAgent)
    ? "- Claude entrypoint: `CLAUDE.md` imports this file and routes details into `.claude/rules/*` + `docs/*`."
    : "- Claude-specific adapter files are omitted because Claude target was not selected.";

  const cursorNote = input.includeCursorRules
    ? "- Cursor adapters are included under `.cursor/rules/` and point to canonical docs."
    : "- Cursor adapters were skipped in this initialization.";

  const sourceNote = draft
    ? `- Architecture draft source: ${providerUsed ?? "ai-provider"} output normalized into deterministic templates.`
    : "- Architecture draft source: deterministic primer-ai templates (no external model output).";

  const refactorSkillLines = [
    `- Baseline: \`${refactorPolicy.baselineSkill.name}\` for safe, test-backed refactors.`,
    ...refactorPolicy.stackSkills.map(
      (skill) => `- Stack add-on: \`${skill.name}\` (${skill.appliesWhen.toLowerCase()}).`
    )
  ];
  if (!refactorPolicy.stackSkills.length) {
    refactorSkillLines.push("- Stack add-ons: none detected from current stack metadata.");
  }
  const refactorNoteLines = refactorPolicy.notes.length
    ? refactorPolicy.notes.map((note) => `- ${note}`).join("\n")
    : "- No extra stack-specific notes for this scaffold.";

  const content = `# AGENTS.md

## Mission
- Project: \`${input.projectName}\`
- Goal: ${input.description}
- Stack focus: ${input.techStack}
- Shape: ${toTitleCase(input.projectShape)}
- Target coding assistants: ${input.targetAgent}

## Always-Loaded Rules
- Treat this file as the routing layer, not the full handbook.
- Pull detailed guidance from \`docs/index.md\` before major design changes.
- Keep edits scoped; avoid unrelated cleanup unless explicitly requested.
- Prefer deterministic checks over prose-only guidance.
- Update docs when architecture or contracts change.
- Keep responses concise, concrete, and verifiable.
- Prefer invoking project automation over manual style enforcement.

## Progressive Disclosure Map
- \`docs/index.md\`: source-of-truth index for project knowledge.
- \`docs/architecture.md\`: bounded contexts, module boundaries, dependency direction.
- \`docs/api-contracts.md\`: contracts, schemas, and compatibility policy.
- \`docs/conventions.md\`: coding, testing, and collaboration standards.
- \`docs/maintenance.md\`: verification pipeline, context budget, and freshness policy.
- \`docs/skills.md\`: curated skill inventory and trigger discipline.
- \`docs/decisions/*.md\`: ADR history.
- \`docs/runbooks/local-dev.md\`: environment setup and local operation guide.
- \`skills/**/SKILL.md\`: reusable task playbooks loaded only when relevant.
${scopedInstructionLines}

## Harness Adapters
${codexNote}
${claudeNote}
${cursorNote}
${sourceNote}

## Repository Map
${buildRepoMap(plan)}

## Architecture Snapshot
${architectureSummary.map((line) => `- ${line}`).join("\n")}

## Task Workflow
- 1) Read this file, then open \`docs/index.md\`.
- 2) Load scoped \`AGENTS.md\` files for directories being modified.
- 3) Draft a minimal change plan before editing.
- 4) Implement with clear module boundaries and explicit contracts.
- 5) Run automation checks: \`node scripts/check-agent-context.mjs\`, \`node scripts/check-doc-freshness.mjs\`, \`node scripts/check-skills.mjs\`.
- 6) Run stack checks from scoped instructions.
- 7) Update docs/ADR entries if architecture or contracts changed.
- 8) Summarize edits with affected files and verification results.

## Refactoring Guidance
${refactorSkillLines.join("\n")}
- Install command details live in \`docs/skills.md\`.
- Verify each micro-step with:
${refactorPolicy.verificationCommands.map((command) => `- \`${command}\``).join("\n")}
${refactorNoteLines}

## Quality Gates
${qualityGates.map((command) => `- \`${command}\``).join("\n")}

## Update Policy
- New architecture decisions: add \`docs/decisions/NNNN-title.md\`.
- Contract changes: update \`docs/api-contracts.md\` in the same change.
- Convention changes: update \`docs/conventions.md\` with rationale.
- Keep root instructions between 60-150 lines and scoped docs focused.
- Keep Codex instruction chains under 32 KiB total; run \`node scripts/check-agent-context.mjs\`.
- Keep docs fresh: run \`node scripts/check-doc-freshness.mjs\` (default max age 90 days).
- Keep skill catalog curated with trigger tests in \`skills/**/tests/trigger-cases.md\`.
- If guidance conflicts, deeper scoped \`AGENTS.md\` files win for their subtree.

## Initial Risks
${risks.map((risk) => `- ${risk}`).join("\n")}
`;

  return enforceRootLineBudget(content);
}

export function buildScopedAgents(entry: ScopedInstruction, plan: ProjectPlan): string {
  const checks = plan.verificationCommands.map((command) => `- \`${command}\``).join("\n");

  return normalizeMarkdown(`# AGENTS.md

## Scope
- Applies to: \`${normalizePath(entry.directory)}/**\`
- Priority: this file overrides broader instructions for files in this subtree.

## Focus
- ${entry.focus}
- Keep changes localized to this subtree unless a contract requires broader edits.
- If API behavior changes, update \`docs/api-contracts.md\`.
- If architecture boundaries change, update \`docs/architecture.md\` and ADRs.

## Working Rules
- Prefer small, reviewable patches.
- Avoid hidden side effects across module boundaries.
- Keep tests near the behavior they validate.
- Do not skip verification commands.

## Required Checks
${checks}
`);
}

export function buildAgentsFragmentsReadme(): string {
  return normalizeMarkdown(`# AGENTS Fragments

Root \`AGENTS.md\` is composed from \`.agents/fragments/root/*.md\` to keep high-level instructions maintainable.

## Commands
- Compose and write root file: \`node scripts/compose-agents.mjs --write\`
- Validate composition only: \`node scripts/compose-agents.mjs --check\`

Use fragments for durable sections and keep subtree-specific guidance in scoped \`AGENTS.md\` files.
`);
}

export function splitRootIntoFragments(rootContent: string): FileArtifact[] {
  const fragments: FileArtifact[] = [];
  const lines = rootContent.trimEnd().split("\n");
  let currentHeader = "root";
  let currentLines: string[] = [];
  const sections: Array<{ header: string; content: string }> = [];

  for (const line of lines) {
    if (line.startsWith("## ") && currentLines.length > 0) {
      sections.push({ header: currentHeader, content: normalizeMarkdown(currentLines.join("\n")) });
      currentHeader = line.slice(3).trim().toLowerCase().replace(/[^a-z0-9]+/g, "-");
      currentLines = [line];
      continue;
    }

    if (currentLines.length === 0) {
      if (line.startsWith("# ")) {
        currentHeader = "00-title";
      }
    }
    currentLines.push(line);
  }

  if (currentLines.length > 0) {
    sections.push({ header: currentHeader, content: normalizeMarkdown(currentLines.join("\n")) });
  }

  sections.forEach((section, index) => {
    const prefix = String(index).padStart(2, "0");
    const safeHeader = section.header || `section-${prefix}`;
    fragments.push({
      path: `.agents/fragments/root/${prefix}-${safeHeader}.md`,
      content: section.content
    });
  });

  return fragments;
}
