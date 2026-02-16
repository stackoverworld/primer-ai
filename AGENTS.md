# AGENTS.md

## Mission
- Project: `primer-ai`
- Goal: Build primer-ai with an agent-optimized architecture and reproducible delivery workflow.
- Stack focus: TypeScript + Node.js
- Shape: Cli Tool
- Target coding assistants: codex

## Always-Loaded Rules
- Treat this file as the routing layer, not the full handbook.
- Pull detailed guidance from `docs/index.md` before major design changes.
- Keep edits scoped; avoid unrelated cleanup unless explicitly requested.
- Prefer deterministic checks over prose-only guidance.
- Update docs when architecture or contracts change.
- Keep responses concise, concrete, and verifiable.
- Prefer invoking project automation over manual style enforcement.

## Progressive Disclosure Map
- `docs/index.md`: source-of-truth index for project knowledge.
- `docs/architecture.md`: bounded contexts, module boundaries, dependency direction.
- `docs/api-contracts.md`: contracts, schemas, and compatibility policy.
- `docs/conventions.md`: coding, testing, and collaboration standards.
- `docs/maintenance.md`: verification pipeline, context budget, and freshness policy.
- `docs/skills.md`: curated skill inventory and trigger discipline.
- `docs/decisions/*.md`: ADR history.
- `docs/runbooks/local-dev.md`: environment setup and local operation guide.
- `skills/**/SKILL.md`: reusable task playbooks loaded only when relevant.
- `src/commands/AGENTS.md`: Command UX, validation, and error ergonomics. (applies inside `src/commands/`).
- `src/lib/AGENTS.md`: Core orchestration and side-effect boundaries. (applies inside `src/lib/`).
- `tests/AGENTS.md`: End-to-end command scenarios and edge cases. (applies inside `tests/`).

## Harness Adapters
- Codex chain behavior: root `AGENTS.md` + deeper scoped files are intentionally concise to avoid context truncation.
- Claude-specific adapter files are omitted because Claude target was not selected.
- Cursor adapters were skipped in this initialization.
- Architecture draft source: codex output normalized into deterministic templates.

## Repository Map
| Path | Purpose |
| --- | --- |
| `AGENTS.md` | Root routing instructions for coding agents. |
| `docs/index.md` | Index of architecture and delivery docs. |
| `docs/architecture.md` | System boundaries and dependency model. |
| `docs/api-contracts.md` | External/internal API expectations. |
| `docs/conventions.md` | Code, testing, and review conventions. |
| `docs/maintenance.md` | Mechanical checks, context budgets, and doc-gardening policy. |
| `docs/skills.md` | Skill curation and trigger discipline. |
| `.agents/fragments/root` | Composable fragments used to build AGENTS.md. |
| `src/commands` | Command definitions and argument parsing. |
| `src/lib` | Shared services used by commands. |
| `tests` | CLI behavior validation. |
| `scripts` | Automation helpers. |

## Architecture Snapshot
- Use a thin-command/thick-library split: `src/commands` parses flags and delegates all behavior to `src/lib`.
- Define strict contracts for config, execution plans, and reports so Codex can compose workflows without reading internal modules.
- Prefer deterministic execution: explicit inputs, stable ordering, no hidden environment dependencies, and machine-readable outputs.
- Model work as a task graph with typed steps, allowing dry-run, explain, and execute modes from the same core API.
- Keep docs progressively disclosed: short overview first, then command/module-specific deep dives linked from it.
- Store architecture decisions as ADRs in `docs/decisions` and operational steps as narrowly scoped runbooks in `docs/runbooks`.
- Treat verification as a product feature: lint/test/build plus contract tests for CLI JSON output and exit codes.

## Task Workflow
- 1) Read this file, then open `docs/index.md`.
- 2) Load scoped `AGENTS.md` files for directories being modified.
- 3) Draft a minimal change plan before editing.
- 4) Implement with clear module boundaries and explicit contracts.
- 5) Run automation checks: `node scripts/check-agent-context.mjs`, `node scripts/check-doc-freshness.mjs`, `node scripts/check-skills.mjs`.
- 6) Run stack checks from scoped instructions.
- 7) Update docs/ADR entries if architecture or contracts changed.
- 8) Summarize edits with affected files and verification results.

## Quality Gates
- ``npm run lint` passes with zero errors and no ignored fatal diagnostics.`
- ``npm run test` passes, including CLI contract tests for exit codes and JSON output schema.`
- ``npm run build` passes and emits distributable artifacts without type errors.`
- `CI uses `npm ci` with pinned Node version (`.nvmrc` + `engines`) to ensure reproducibility.`
- `All reports and logs are deterministic in key order and status semantics across runs.`
- `New commands require at least one contract test and one failure-mode test before merge.`
- `Any public contract change updates `docs/decisions` and includes a migration note in the related runbook.`

## Update Policy
- New architecture decisions: add `docs/decisions/NNNN-title.md`.
- Contract changes: update `docs/api-contracts.md` in the same change.
- Convention changes: update `docs/conventions.md` with rationale.
- Keep root instructions between 60-150 lines and scoped docs focused.
- Keep Codex instruction chains under 32 KiB total; run `node scripts/check-agent-context.mjs`.
- Keep docs fresh: run `node scripts/check-doc-freshness.mjs` (default max age 90 days).
- Keep skill catalog curated with trigger tests in `skills/**/tests/trigger-cases.md`.
- If guidance conflicts, deeper scoped `AGENTS.md` files win for their subtree.

## Initial Risks
- Command handlers accumulating business logic can break agent predictability and test isolation.
- Non-deterministic factors (clock, locale, filesystem ordering) can cause flaky tests and unstable outputs.
- Unversioned JSON contracts may break Codex integrations silently as fields evolve.
- Config sprawl across file/env/flags can create ambiguous behavior without strict precedence enforcement.
- Docs drift between ADRs, runbooks, and implementation can degrade onboarding and incident response.
- Overly broad runbooks can become stale; scope creep reduces operational usefulness.
