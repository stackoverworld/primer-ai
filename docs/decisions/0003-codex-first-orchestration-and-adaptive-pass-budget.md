# ADR-0003: Codex-First Refactor UX with Safe Orchestration and Adaptive Pass Budgets

- Last reviewed: 2026-02-15

## Status
Accepted

## Context
Refactor runs exposed three UX and reliability issues:
- Progress output showed static pass denominators (for example `1/40`) even for small repositories, which looked inaccurate.
- Status strings included vague "finalizing" language that did not map to concrete execution phases.
- Advanced workflows needed orchestration controls for Codex subagents and explicit controls for noisy file operation output.

The project also needed consistent Codex-first defaults while preserving optional Claude compatibility.

## Decision
- Make Codex the default/recommended path in init/refactor prompts and defaults; keep Claude as optional fallback.
- Add refactor controls:
  - `--notes` (with `--focus` retained as compatibility alias and merged into one notes channel)
  - `--[no-]show-ai-file-ops` (default on)
  - `--[no-]orchestration` (default on)
  - `--max-subagents` (default 12, clamped 1..24)
- Add Codex orchestration guardrails directly in refactor prompts (coordinator/worker ownership, no overlapping file edits, no worker directory deletion, no nested worker spawning).
- Pass Codex orchestration runtime override through provider execution via `codex exec -c agents.max_threads=<n>`.
- Replace static default pass cap behavior with adaptive pass budgeting based on calibrated backlog (`monolith*3 + coupling*2 + debt + commentCleanup`, clamped to 1..80 safety cap), unless `--max-passes` is explicitly set.
- Remove "finalizing" status phrasing and keep only actionable progress text.

## Consequences
- Refactor progress indicators now show run-specific totals instead of a hardcoded default denominator.
- Users get compact file-operation streams by default and can suppress them with `--no-show-ai-file-ops` when needed.
- Codex orchestration behavior is configurable and safer for concurrent refactor workflows.
- Existing Claude support remains intact, but orchestration overrides are Codex-specific and ignored for Claude runs.
