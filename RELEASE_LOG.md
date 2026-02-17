### Changes
- Added primer-ai fix verification-first remediation command with a dedicated scan, prompt, iterative AI fix execution, and re-verification loop for actionable failures; default pass budget starts at 3 and can grow up to 12 when remaining actionable failures persist. Thanks @stackoverworld.
- Added `--format text|json` for `init`, `refactor`, and `fix` with normalized JSON error payload output and stable exit-code semantics for command failures. Thanks @stackoverworld.
- Added structured CLI error model (`UserInputError`, `ConfigError`, `ExecutionError`) and deterministic contract-aware normalization for argument/validation failures. Thanks @stackoverworld.
- Added fix command docs and contract updates to keep command API, architecture, and operation semantics aligned after new command introduction. Thanks @stackoverworld.
- Added live AI output rendering with compact file operations and noise suppression for clearer progress logs during refactor and fix runs. Thanks @stackoverworld.
- Added process-runner enhancements for output-tail truncation notices, stop-on-status-pattern handling, and improved subprocess timeout/error reporting. Thanks @stackoverworld.
- Added adaptive refactor pass behavior that can increase pass caps from live backlog signals with an explicit cap, plus improved resume checkpoint compatibility. Thanks @stackoverworld.
- Added extensive tests for fix flows, error normalization, process-runner behavior, and AI prompt/status parsing stability. Thanks @stackoverworld.

### Fixes
- Fixed init non-empty migration behavior to require AI-assisted mode and made `--force` a clear overwrite path instead of ambiguous suffix-only conflict handling. Thanks @stackoverworld.
- Fixed CLI argument validation paths so malformed inputs now return stable contract-style errors instead of uncaught raw exceptions. Thanks @stackoverworld.
- Fixed refactor/fix status output so waiting states remain informative without over-logging or stale spinner transitions. Thanks @stackoverworld.
- Fixed AI structured-output parsing for arrays by validating each item independently and accepting the first valid payload item. Thanks @stackoverworld.
- Fixed verification loops that could stall on lock/timeouts/missing tools by treating non-actionable outcomes as skip conditions and continuing deterministically. Thanks @stackoverworld.
- Fixed missing/slow subprocess scenarios by preserving output tails and surfacing explicit completion reasons for debugging without corrupting final report content. Thanks @stackoverworld.
- Fixed file-operation streaming defaults to be enabled by default while preserving ability to disable noise with `--no-show-ai-file-ops`. Thanks @stackoverworld.
