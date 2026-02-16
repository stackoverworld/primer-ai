# API Contracts

- Last reviewed: 2026-02-16

## Contract-First Policy
- Define or update contracts before implementing integration behavior.
- Keep schema changes backward-compatible unless a migration is documented.
- Version externally consumed contracts.

## Initial Contract Surface
- CLI: `primer-ai init [path] [--provider auto|codex|claude] [--model <id>] [options]` -> scaffolds project context with Codex-first defaults (Claude optional), optionally captures provider-specific model selection in interactive AI-assisted mode, exit `0` success, `1` operational failure.
- CLI: `primer-ai refactor [path] [--provider auto|codex|claude] [--model <id>] [--planner-model <id>] [--orchestrator-model <id>] [--worker-model <id>] [--agent codex|claude|both] [--notes <text>] [--focus <text>] [--show-ai-file-ops] [--[no-]orchestration] [--max-subagents <n>] [--max-files <n>] [--max-passes <n>] [--ai-timeout-sec <seconds>] [--[no-]resume] [--dry-run] [-y|--yes]` -> scans repository, composes deterministic refactor prompt, optionally asks for provider/model/log streaming/custom notes/orchestration choices in interactive mode, calibrates heuristic scan categories with AI classification, computes adaptive pass budget from calibrated backlog unless `--max-passes` is provided, then runs multi-pass AI refactor loops with rescans (and AI recalibration) until backlog converges or pass cap is reached; exits early when no actionable backlog remains. Refactor execution persists checkpoint state in `.primer-ai/refactor-resume.json`, prompts whether to continue when an unfinished session exists (interactive mode), reuses saved execution settings on resume, and continues from the saved pass when `--resume` is enabled. `--ai-timeout-sec` controls per-subprocess AI execution timeout. On completion, CLI prints a deterministic run summary including final backlog and source-file change counts for the current invocation. Codex orchestration mode can run planner/orchestrator/worker role models with deterministic worker wave scheduling and file-scope ownership prompts; exit `0` success, `1` operational failure.
- CLI: `primer run [--config <path>] [--dry-run] [--format text|json]` -> exit `0` success, `1` operational failure, `2` contract/config error.
- CLI: `primer check [--config <path>] [--format text|json]` -> deterministic validation report, no mutations.
- CLI: `primer doctor [--format text|json]` -> environment diagnostics with remediation codes.
- Library: `loadConfig(cwd: string, overrides?: Partial<PrimerConfig>): Promise<PrimerConfig>`.
- Library: `buildTaskGraph(spec: TaskSpec): TaskGraph` (throws `ConfigError` on invalid graph).
- Library: `executeTaskGraph(graph: TaskGraph, opts: ExecuteOptions): Promise<RunReport>`.
- Library: `runChecks(cfg: PrimerConfig): Promise<CheckReport>`.
- Library: `formatReport(report: RunReport | CheckReport, format: "text" | "json"): string`.
- Contracts: JSON report objects include required `version`, `timestamp`, `status`, `summary`, and `details` fields for forward-compatible parsing.

## Error Model
- Provide stable machine-readable error codes.
- Separate user-safe messages from internal diagnostics.
- Track error classes and expected remediation in tests.

## Compatibility Rules
- Additive changes are preferred over breaking changes.
- Breaking changes require explicit versioning and migration notes.
- Reflect contract updates in tests and release notes.
