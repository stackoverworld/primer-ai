import { buildRefactorPolicy } from "../refactor-policy.js";
import { normalizeMarkdown } from "../text.js";
import type { AIDraft, InitInput, ProjectPlan } from "../types.js";
import {
  defaultApiSurface,
  defaultArchitectureSummary,
  defaultConventions
} from "./defaults.js";
import { isLandingPageProject, normalizePath, todayIso } from "./shared.js";

export function buildDocsIndex(input: InitInput): string {
  const reviewed = todayIso();
  return normalizeMarkdown(`# Docs Index

This folder is the source of truth for architecture and delivery guidance.

- Last reviewed: ${reviewed}

## Core Documents
- \`architecture.md\`: architectural boundaries, module ownership, and dependency rules.
- \`api-contracts.md\`: contract-first API design, versioning, and compatibility.
- \`conventions.md\`: coding standards, testing expectations, and collaboration flow.
- \`maintenance.md\`: mechanical checks, context budget enforcement, and automation policy.
- \`skills.md\`: curated skill inventory and trigger/testing lifecycle.
- \`decisions/\`: ADR history for architectural tradeoffs.
- \`runbooks/local-dev.md\`: local setup, run, and troubleshooting steps.

## Document Inventory
<!-- primer-ai:docs-index:start -->
- \`architecture.md\`
- \`api-contracts.md\`
- \`conventions.md\`
- \`maintenance.md\`
- \`skills.md\`
- \`decisions/0001-initial-architecture.md\`
- \`runbooks/local-dev.md\`
<!-- primer-ai:docs-index:end -->

## Maintenance Loop
- Keep docs synchronized with merged implementation.
- Prefer short, specific updates over giant rewrites.
- Add ADR entries whenever cross-cutting architecture decisions change.

## Project Summary
- Name: \`${input.projectName}\`
- Description: ${input.description}
- Stack: ${input.techStack}
`);
}

export function buildArchitectureDoc(input: InitInput, plan: ProjectPlan, draft: AIDraft | null): string {
  const reviewed = todayIso();
  const architectureSummary = draft?.architectureSummary?.length ? draft.architectureSummary : defaultArchitectureSummary(input);
  const modules = draft?.initialModules?.length
    ? draft.initialModules
    : plan.repositoryAreas.map((area) => ({ path: area.path, purpose: area.purpose }));

  return normalizeMarkdown(`# Architecture

## Intent
${draft?.mission || input.description}

- Last reviewed: ${reviewed}

## Structural Principles
${architectureSummary.map((line) => `- ${line}`).join("\n")}

## Initial Module Plan
| Module Path | Responsibility |
| --- | --- |
${modules.map((module) => `| \`${normalizePath(module.path)}\` | ${module.purpose} |`).join("\n")}

## Dependency Direction
- Domain and business logic should not depend on delivery frameworks.
- Adapters (HTTP, CLI, persistence, UI) depend on domain contracts.
- Shared utilities must stay generic and avoid product-specific coupling.

## Change Management
- Any boundary change must be reflected in ADRs under \`docs/decisions/\`.
- Keep this document aligned with repository layout and ownership.
`);
}

export function buildApiContracts(input: InitInput, draft: AIDraft | null): string {
  const reviewed = todayIso();
  const landingProfile = isLandingPageProject(input);
  const apiSurface = landingProfile ? defaultApiSurface(input) : draft?.apiSurface?.length ? draft.apiSurface : defaultApiSurface(input);
  const contractPolicy = landingProfile
    ? [
        "Treat third-party integrations (forms, analytics, CRM) as contracts even without a first-party API.",
        "If a backend is added later, introduce explicit versioned API contracts in this file.",
        "Keep event names and payload schemas stable once instrumentation is live."
      ]
    : [
        "Define or update contracts before implementing integration behavior.",
        "Keep schema changes backward-compatible unless a migration is documented.",
        "Version externally consumed contracts."
      ];

  const errorModel = landingProfile
    ? [
        "Form submission failures should map to user-safe messages and loggable technical reasons.",
        "Analytics transport failures must not break primary UI flows.",
        "Track integration failures via monitoring/console events for operator visibility."
      ]
    : [
        "Provide stable machine-readable error codes.",
        "Separate user-safe messages from internal diagnostics.",
        "Track error classes and expected remediation in tests."
      ];

  const compatibilityRules = landingProfile
    ? [
        "Do not rename analytics events without migration mapping.",
        "Keep form payload fields additive when possible.",
        "Document third-party integration changes and fallback behavior."
      ]
    : [
        "Additive changes are preferred over breaking changes.",
        "Breaking changes require explicit versioning and migration notes.",
        "Reflect contract updates in tests and release notes."
      ];

  return normalizeMarkdown(`# API Contracts

- Last reviewed: ${reviewed}

## Contract-First Policy
${contractPolicy.map((entry) => `- ${entry}`).join("\n")}

## Initial Contract Surface
${apiSurface.map((entry) => `- ${entry}`).join("\n")}

## Error Model
${errorModel.map((entry) => `- ${entry}`).join("\n")}

## Compatibility Rules
${compatibilityRules.map((entry) => `- ${entry}`).join("\n")}
`);
}

export function buildConventions(plan: ProjectPlan, draft: AIDraft | null): string {
  const reviewed = todayIso();
  const conventions = draft?.conventions?.length ? draft.conventions : defaultConventions();

  return normalizeMarkdown(`# Conventions

- Last reviewed: ${reviewed}

## Coding
${conventions.map((entry) => `- ${entry}`).join("\n")}

## Delivery Workflow
- Start from a short plan, then implement minimal viable changes.
- Keep commits scoped and reversible.
- Validate locally before asking for review.

## Verification
- \`node scripts/check-agent-context.mjs\`
- \`node scripts/check-doc-freshness.mjs\`
- \`node scripts/check-skills.mjs\`
${plan.verificationCommands.map((command) => `- \`${command}\``).join("\n")}

## Documentation
- Update \`docs/architecture.md\` when module boundaries evolve.
- Update \`docs/api-contracts.md\` when interfaces or payloads change.
- Add ADR entries for durable architecture decisions.
`);
}

export function buildInitialAdr(input: InitInput, plan: ProjectPlan): string {
  const reviewed = todayIso();
  return normalizeMarkdown(`# ADR-0001: Initial Architecture Blueprint

- Last reviewed: ${reviewed}

## Status
Accepted

## Context
The project was initialized with \`primer-ai\` to provide an agent-optimized, progressively disclosed architecture scaffold.

## Decision
- Establish \`AGENTS.md\` as the root routing document.
- Keep source-of-truth architecture data in \`docs/*\`.
- Use scoped \`AGENTS.md\` files for subtree-specific constraints.
- Validate changes with the following initial checks:
${plan.verificationCommands.map((command) => `  - \`${command}\``).join("\n")}

## Consequences
- Faster cold-start for coding agents due to stable context layout.
- Documentation maintenance is required to avoid drift.
- Repository decisions become explicit and reviewable.

## Notes
Initial project intent: ${input.description}
`);
}

export function buildRunbook(plan: ProjectPlan): string {
  const reviewed = todayIso();
  return normalizeMarkdown(`# Local Development Runbook

- Last reviewed: ${reviewed}

## Prerequisites
- Runtime/toolchain for your selected stack.
- Package manager configured for this repository.
- Git installed.

## First-Time Setup
1. Install dependencies.
2. Run baseline verification commands.
3. Start local development runtime.

## Commands
- \`node scripts/check-agent-context.mjs\`
- \`node scripts/check-doc-freshness.mjs\`
- \`node scripts/check-skills.mjs\`
${plan.verificationCommands.map((command) => `- \`${command}\``).join("\n")}
- Launch: \`${plan.launchCommand}\`

## Troubleshooting
- If checks fail, fix root cause before continuing.
- Keep docs and contracts updated with behavior changes.
- Capture recurring setup issues in this runbook.
`);
}

export function buildMaintenanceDoc(plan: ProjectPlan): string {
  const reviewed = todayIso();
  return normalizeMarkdown(`# Maintenance

- Last reviewed: ${reviewed}

## Context Budget Policy
- Keep root \`AGENTS.md\` between 60 and 150 lines.
- Keep Codex project instruction chain under 32 KiB total.
- Prefer scoped \`AGENTS.md\` files instead of growing root instructions.
- Run \`node scripts/check-agent-context.mjs\` before merging.

## Mechanical Checks
- \`node scripts/check-agent-context.mjs\`: validates AGENTS structure, chain budget, and fragment composition.
- \`node scripts/check-doc-freshness.mjs\`: validates \`Last reviewed\` dates in docs.
- \`node scripts/check-skills.mjs\`: validates skill packaging and trigger case docs.
- Stack verification commands:
${plan.verificationCommands.map((command) => `  - \`${command}\``).join("\n")}

## Doc-Gardening Loop
- Scheduled CI workflow runs weekly and opens a PR when docs drift.
- Use \`node scripts/doc-garden.mjs --apply\` to refresh docs index and review metadata locally.
- Every architecture-affecting change must include docs and ADR updates.
`);
}

export function buildSkillsDoc(input: InitInput, plan: ProjectPlan): string {
  const reviewed = todayIso();
  const refactorPolicy = buildRefactorPolicy(input.techStack, input.projectShape);
  const skills = [refactorPolicy.baselineSkill, ...refactorPolicy.stackSkills];
  const uniqueSkills = new Map(skills.map((skill) => [skill.name, skill]));
  const stackLines = refactorPolicy.stackSkills.length
    ? refactorPolicy.stackSkills.map((skill) => `- \`${skill.name}\`: ${skill.purpose}`).join("\n")
    : "- No stack-specific add-on detected; keep using `qa-refactoring` baseline flow.";

  return normalizeMarkdown(`# Skills

- Last reviewed: ${reviewed}

## Purpose
Skills are progressive-disclosure playbooks. Metadata stays easy to scan, detailed instructions are loaded only when task triggers match.

## Curation Rules
- Keep a small, high-signal catalog.
- Each skill must define explicit trigger patterns.
- Each skill must include trigger test cases in \`tests/trigger-cases.md\`.
- Remove or archive stale skills that no longer trigger meaningfully.

## Structure
- \`skills/<skill-name>/SKILL.md\`
- \`skills/<skill-name>/tests/trigger-cases.md\`

## Refactor Skill Baseline
- Default workflow skill: \`${refactorPolicy.baselineSkill.name}\`
- Why: ${refactorPolicy.baselineSkill.purpose}
- Install: \`${refactorPolicy.baselineSkill.installCommand}\`

## Stack Add-ons
${stackLines}

## Install Commands
${Array.from(uniqueSkills.values())
  .map((skill) => `- \`${skill.name}\`: \`${skill.installCommand}\``)
  .join("\n")}

## Deterministic Refactor Checks
${refactorPolicy.verificationCommands.map((command) => `- \`${command}\``).join("\n")}

## Adaptive Notes
${refactorPolicy.notes.length ? refactorPolicy.notes.map((note) => `- ${note}`).join("\n") : "- None."}
- Keep command execution deterministic and preserve behavior via boundary tests.
- Run these checks before and after each non-trivial refactor step.

## Validation
- Run \`node scripts/check-skills.mjs\`.
- Keep docs and runbooks in sync when public contracts or architecture boundaries change.
- Update this document when skill lifecycle policy changes.
- Stack verification defaults:
${plan.verificationCommands.map((command) => `  - \`${command}\``).join("\n")}
`);
}
