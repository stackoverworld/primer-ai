# ADR-0004: Hard Orchestration Runtime with Planner/Orchestrator/Worker Role Models

- Last reviewed: 2026-02-15

## Status
Accepted

## Context
Prompt-only orchestration improved guidance but still left coordination risk in refactor runs:
- Worker overlap rules were advisory only.
- There was no deterministic scheduler for concurrent worker waves.
- Users needed role-level model control for analysis/planning versus implementation throughput.

## Decision
- Add Codex orchestration role model controls:
  - `--planner-model` (default `gpt-5.3-codex`)
  - `--orchestrator-model` (default `gpt-5.3-codex`)
  - `--worker-model` (default `gpt-5.3-codex-spark`)
- Introduce a deterministic orchestration runtime in `src/core/refactor/orchestration.ts`:
  - planner stage produces a task list and refactor-needed gate
  - orchestrator stage converts tasks into execution assignments
  - runtime scheduler builds worker waves with bounded concurrency and file-overlap avoidance per wave
  - worker stage executes file-scoped implementation tasks
- Keep backward-compatible fallback:
  - if orchestration planning output is invalid/unavailable, fall back to existing single-pass prompt execution.
- Keep Claude compatibility:
  - hard orchestration path is Codex-oriented; non-Codex paths continue through existing execution flow.

## Consequences
- Refactor execution gains deterministic scheduling semantics while retaining existing command behavior.
- Users can tune model cost/quality per role without changing command workflow.
- Orchestration failures degrade gracefully to the previous execution mode instead of aborting immediately.
- Reasoning effort is controlled via Codex config (`model_reasoning_effort`) instead of model id suffixes.
