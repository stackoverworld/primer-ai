## Quality Gates
- ``npm run lint` passes with zero errors and no ignored fatal diagnostics.`
- ``npm run test` passes, including CLI contract tests for exit codes and JSON output schema.`
- ``npm run build` passes and emits distributable artifacts without type errors.`
- `CI uses `npm ci` with pinned Node version (`.nvmrc` + `engines`) to ensure reproducibility.`
- `All reports and logs are deterministic in key order and status semantics across runs.`
- `New commands require at least one contract test and one failure-mode test before merge.`
- `Any public contract change updates `docs/decisions` and includes a migration note in the related runbook.`
