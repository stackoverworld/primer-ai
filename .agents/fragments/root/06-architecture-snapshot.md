## Architecture Snapshot
- Use a thin-command/thick-core split: `src/commands` parses flags and delegates behavior to `src/core` and focused command helpers.
- Define strict contracts for config, execution plans, and reports so Codex can compose workflows without reading internal modules.
- Prefer deterministic execution: explicit inputs, stable ordering, no hidden environment dependencies, and machine-readable outputs.
- Treat task-graph/reporting runtime APIs as planned; current shipped surface is `init`, `refactor`, and `fix`.
- Keep docs progressively disclosed: short overview first, then command/module-specific deep dives linked from it.
- Store architecture decisions as ADRs in `docs/decisions` and operational steps as narrowly scoped runbooks in `docs/runbooks`.
- Treat verification as a product feature: lint/test/build plus contract tests for CLI JSON output and exit codes.
