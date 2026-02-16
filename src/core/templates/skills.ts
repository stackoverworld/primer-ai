import { normalizeMarkdown } from "../text.js";

export function buildSkillsReadme(): string {
  return normalizeMarkdown(`# Skills Catalog

Keep this catalog small and high-signal. Each skill must include:
- \`SKILL.md\` with clear trigger conditions
- \`tests/trigger-cases.md\` with under-trigger and over-trigger examples

Included starter skills:
- \`architecture-update\`: contract/boundary change workflow
- \`adaptive-refactor\`: stack-aware safe refactor loop with deterministic checks

Run \`node scripts/check-skills.mjs\` after adding or editing skills.
`);
}

export function buildArchitectureSkill(): string {
  return normalizeMarkdown(`# Architecture Update Skill

## Trigger
Use this skill when a change affects module boundaries, contracts, or cross-cutting architecture decisions.

## Workflow
1. Read \`docs/architecture.md\` and \`docs/api-contracts.md\`.
2. Implement minimal code changes for the selected boundary update.
3. Update \`docs/architecture.md\` and add an ADR in \`docs/decisions/\`.
4. Run verification:
   - \`node scripts/check-agent-context.mjs\`
   - \`node scripts/check-doc-freshness.mjs\`
5. Summarize architectural impact and migration concerns.
`);
}

export function buildArchitectureSkillTriggers(): string {
  return normalizeMarkdown(`# Trigger Cases

## Should trigger
- "Split payments domain into two bounded contexts."
- "Move validation from HTTP layer to domain contracts."
- "Introduce versioned API contract for transactions endpoint."

## Should NOT trigger
- "Rename a local variable."
- "Fix typo in README."
- "Adjust one unit test assertion with no architecture impact."
`);
}

export function buildAdaptiveRefactorSkill(): string {
  return normalizeMarkdown(`# Adaptive Refactor Skill

## Trigger
Use this skill when a request asks to refactor code while preserving behavior, especially across stack-specific toolchains.

## Do Not Trigger
- Net-new feature delivery where behavior-preservation is not the goal.
- Cosmetic-only edits (typos, formatting-only passes, copy changes).
- Pure explanation requests with no code edits.

## Workflow
1. Start with baseline safety loop:
   - establish current behavior and add/confirm invariants
   - create a narrow seam for the refactor
   - execute smallest safe change
   - verify before proceeding
2. Apply baseline skill preference:
   - \`qa-refactoring\` as default safe workflow
3. Add stack-specific skill(s) when relevant:
   - Rust: \`rust-refactor-helper\`
   - Next.js/React: \`vercel-react-best-practices\`
   - Node backend: \`nodejs-backend-patterns\`
   - Swift/iOS: \`ios-development\`
   - Large Vite reorganizations (optional specialist): \`react-vite-expert\`
4. Prefer deterministic verification commands per stack:
   - Rust: \`cargo fmt\`, \`cargo clippy --fix\`, \`cargo test\`
   - TypeScript + Node backend: \`npx tsc --noEmit\`, \`npm run test\`, \`npm run build\`
   - Vite + TypeScript: \`npx tsc --noEmit\`, \`vitest run\`, \`vite build\`
   - Swift: \`swift format lint .\`, \`swift test\`
   - Next.js note: use project \`eslint\` scripts instead of \`next lint\`
5. Keep output concise and contract-focused. If contracts change, update docs/ADRs in the same change.
`);
}

export function buildAdaptiveRefactorSkillTriggers(): string {
  return normalizeMarkdown(`# Trigger Cases

## Should trigger
- "Refactor this CLI command flow without changing behavior."
- "Extract service boundaries and keep API contracts stable."
- "Reorganize Rust modules safely with step-by-step verification."
- "Refactor TypeScript + Fastify service internals without changing HTTP contract."

## Should NOT trigger
- "Write a brand new feature from scratch."
- "Fix one typo in docs."
- "Explain what this command does without changing code."
- "Create a greenfield Vite app from scratch."
`);
}
