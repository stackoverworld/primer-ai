# Architecture

## Intent
Deliver a TypeScript/Node.js CLI that is predictable for agents, easy to evolve, and reproducible from local dev through CI.

- Last reviewed: 2026-02-16

## Structural Principles
- Use a thin-command/thick-library split: `src/commands` parses flags and delegates all behavior to `src/lib`.
- Keep Codex as the default execution path while preserving optional Claude compatibility.
- Use a deterministic orchestration runtime for Codex refactor execution (planner -> orchestrator -> worker roles) instead of pure prompt-only coordination.
- Define strict contracts for config, execution plans, and reports so Codex can compose workflows without reading internal modules.
- Prefer deterministic execution: explicit inputs, stable ordering, no hidden environment dependencies, and machine-readable outputs.
- Model work as a task graph with typed steps, allowing dry-run, explain, and execute modes from the same core API.
- Treat refactor progress as a contract: adaptive pass budgets, actionable status text, and no hardcoded pass denominators.
- Persist refactor checkpoints so interrupted runs can resume from the last completed pass rather than restarting pass 1.
- Keep docs progressively disclosed: short overview first, then command/module-specific deep dives linked from it.
- Store architecture decisions as ADRs in `docs/decisions` and operational steps as narrowly scoped runbooks in `docs/runbooks`.
- Treat verification as a product feature: lint/test/build plus contract tests for CLI JSON output and exit codes.

## Initial Module Plan
| Module Path | Responsibility |
| --- | --- |
| `src/commands/index.ts` | Register CLI commands, route argv to handlers, and standardize process exit behavior. |
| `src/commands/init.ts` | Command orchestration for project initialization and scaffold writing. |
| `src/commands/init/*.ts` | Init-command helpers split by existing-context import, README merge behavior, and conflict-safe file remapping. |
| `src/commands/refactor.ts` | Command handler for AI-guided repository refactor execution and dry-run analysis. |
| `src/commands/refactor/*.ts` | Internal refactor-command helpers split by scan limits, execution-choice prompts, adaptive pass budgeting, heuristic+AI scan calibration, backlog analysis, and status rendering. |
| `src/commands/refactor/resume.ts` | Checkpoint persistence for resumable refactor runs (`.primer-ai/refactor-resume.json`). |
| `src/core/refactor.ts` | Stable public facade that re-exports refactor scan/prompt/execution APIs. |
| `src/core/refactor/contracts.ts` | Shared refactor contracts consumed across scan, prompt, and execution modules. |
| `src/core/refactor/scan.ts` | Deterministic source scanning, hotspot scoring, and repository refactor analysis output. |
| `src/core/refactor/scan/*.ts` | Internal scan modules split by path/file analysis, project inference, and hotspot ranking. |
| `src/core/refactor/prompt.ts` | Refactor prompt rendering from scan results, notes, and Codex orchestration safety guidance. |
| `src/core/refactor/orchestration.ts` | Deterministic Codex orchestration runtime for planner/orchestrator/worker stages, wave scheduling, and worker task handoff. |
| `src/core/refactor/execution.ts` | AI execution orchestration for refactor handoff and output-tail reporting. |
| `src/core/refactor-policy.ts` | Public policy facade that preserves existing policy API exports. |
| `src/core/refactor-policy/*.ts` | Internal policy modules for stack-signal detection, skill recommendations, and verification command inference. |
| `src/core/ai.ts` | Stable public AI facade that orchestrates architecture/quick-setup/freeform task flows. |
| `src/core/ai/*-task.ts` | Task-focused AI orchestration modules split by architecture drafting, quick-setup planning, and freeform execution. |
| `src/core/ai/task-shared.ts` | Shared provider resolution, live-status wrapping, and output combination helpers used by AI task modules. |
| `src/core/ai/provider-selection.ts` | Provider resolution logic and CLI binary detection with deterministic preference order. |
| `src/core/ai/prompts.ts` | Prompt builders for architecture draft and quick-setup planning requests. |
| `src/core/ai/schemas.ts` | JSON output schema definitions used for structured AI responses. |
| `src/core/ai/providers.ts` | Provider-specific execution adapters, retries, failure summarization, and Codex orchestration thread-limit overrides. |
| `src/core/ai/process-runner.ts` | Spawn wrapper with bounded output, timeout control, and optional live streaming. |
| `src/core/ai/status.ts` | Live status ticker for long-running provider operations. |
| `src/core/ai-parsing.ts` | Structured parsing and schema validation for AI JSON outputs. |
| `src/core/prompts.ts` | Stable init-input facade that preserves existing imports from commands/tests. |
| `src/core/prompts/*.ts` | Init prompt modules split by normalization, stack detection, and provider-model interactions. |
| `src/core/quick-setup.ts` | Stable quick-setup facade preserving support detection, prompt decisions, and execution API exports. |
| `src/core/quick-setup/*.ts` | Internal quick-setup modules split by support detection, package inspection, command planning, process execution, and script updates. |
| `src/core/templates.ts` | Scaffold composition entrypoint that assembles docs/scripts/rules from focused template builders. |
| `src/core/templates/*.ts` | Focused template builders for assistant adapters, automation scripts/workflows, and skills content. |
| `src/core/types.ts` | Stable type barrel preserving existing import paths across commands/core modules. |
| `src/core/types/*.ts` | Domain-focused type declarations split by init, refactor, plan, AI draft, and quick-setup contracts. |
| `src/commands/run.ts` | Execute a planned workflow from config/task input and emit structured run reports. |
| `src/commands/check.ts` | Run deterministic preflight checks (config, filesystem, toolchain) without side effects. |
| `src/commands/doctor.ts` | Diagnose environment issues and return actionable, machine-readable remediation hints. |
| `src/lib/contracts.ts` | Source of truth for core types: `PrimerConfig`, `TaskSpec`, `TaskGraph`, `RunReport`, `CheckReport`. |
| `src/lib/config.ts` | Load, validate, and merge config from file/env/flags with explicit precedence rules. |
| `src/lib/taskGraph.ts` | Build and topologically sort executable task graphs with cycle detection and stable ordering. |
| `src/lib/executor.ts` | Run tasks with timeout/retry policies, deterministic logging, and typed error mapping. |
| `src/lib/reporting.ts` | Render reports as `text` or `json` with stable field order for agent parsing. |
| `tests/cli.contract.test.ts` | Assert command exit codes, stdout/stderr contracts, and JSON schema stability. |
| `tests/lib/taskGraph.test.ts` | Verify graph build/sort/cycle behaviors with deterministic fixtures. |
| `scripts/ci-verify.sh` | Single reproducible CI entrypoint running lint, tests, and build in strict mode. |
| `docs/decisions/0001-core-architecture.md` | ADR documenting command-library split, contracts-first design, and tradeoffs. |
| `docs/runbooks/local-dev.md` | Minimal local setup, verification flow, and failure triage steps. |

## Dependency Direction
- Domain and business logic should not depend on delivery frameworks.
- Adapters (HTTP, CLI, persistence, UI) depend on domain contracts.
- Shared utilities must stay generic and avoid product-specific coupling.

## Change Management
- Any boundary change must be reflected in ADRs under `docs/decisions/`.
- Keep this document aligned with repository layout and ownership.
