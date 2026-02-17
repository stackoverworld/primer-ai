## 0.1.79 -> HEAD

### Changes
- CLI: add primer-ai generate-logs command to generate GitHub-style release note bullets from repository deltas.
- Release logs: support ref-based and version-based ranges with automatic section prepend and same-range upsert in RELEASE_LOG.md.
- Release logs: add output and scope controls including --output, --stdout, --thanks, and --no-uncommitted.
- Docs and contracts: document generate-logs behavior and options across README, architecture, and API contracts.
- Tests: add coverage for generate-logs command behavior.

## 0.1.59 -> 0.1.79

### Changes
- CLI: add `primer-ai fix` verification-first remediation workflow with iterative AI passes and re-verification.
- CLI: add structured error output contract (`--format text|json`) with normalized machine-readable failure payloads.
- Refactor: add adaptive multi-pass continuation and improved resume compatibility for backlog-driven workflows.
- AI runtime: add compact live file-operation rendering with provider-noise suppression for clearer execution logs.
- Docs: update README, API contracts, architecture notes, and ADRs for the expanded command surface.
- Tests: expand regression coverage for fix workflows, AI parsing/runtime behavior, and command execution choices.

### Fixes
- Init: enforce AI-assisted mode for non-empty migration and support explicit overwrite semantics through `--force`.
- Validation: normalize command argument failures into stable user/config error responses instead of raw exceptions.
- AI parsing: handle array-shaped model responses by schema-validating entries independently before accepting payloads.
- Verification loop: treat lock contention, missing tools, and timeout paths as non-actionable skips to avoid stalled runs.
- Runtime status: reduce noisy waiting transitions and keep progress phases deterministic during long-running AI passes.
- Process execution: preserve output tails with explicit truncation/timeout reasons for easier troubleshooting.
