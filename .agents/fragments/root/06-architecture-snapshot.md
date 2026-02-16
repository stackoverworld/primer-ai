## Architecture Snapshot
- Use a thin-command/thick-library split: `src/commands` parses flags and delegates all behavior to `src/lib`.
- Define strict contracts for config, execution plans, and reports so Codex can compose workflows without reading internal modules.
- Prefer deterministic execution: explicit inputs, stable ordering, no hidden environment dependencies, and machine-readable outputs.
- Model work as a task graph with typed steps, allowing dry-run, explain, and execute modes from the same core API.
- Keep docs progressively disclosed: short overview first, then command/module-specific deep dives linked from it.
- Store architecture decisions as ADRs in `docs/decisions` and operational steps as narrowly scoped runbooks in `docs/runbooks`.
- Treat verification as a product feature: lint/test/build plus contract tests for CLI JSON output and exit codes.
