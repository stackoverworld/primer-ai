# Conventions

- Last reviewed: 2026-02-14

## Coding
- Each command file exports `command`, `describe`, `builder`, and `handler` for predictable CLI wiring.
- No business logic in `src/commands`; all side effects are mediated through `src/lib` abstractions.
- All cross-module data must use types from `src/lib/contracts.ts`; avoid ad-hoc object shapes.
- Config precedence is fixed and documented: defaults < file < environment < CLI flags.
- Errors are typed (`ConfigError`, `ExecutionError`, `UserInputError`) and mapped to stable exit codes.
- Documentation follows progressive disclosure: top-level summary, then linked deep sections per command/module.
- Each ADR is single-decision, immutable after accepted, and superseded via a new ADR.
- Runbooks are task-scoped (one operational objective per file) with copy-pasteable commands.
- Tests must freeze time/randomness where applicable and avoid network calls by default.

## Delivery Workflow
- Start from a short plan, then implement minimal viable changes.
- Keep commits scoped and reversible.
- Validate locally before asking for review.

## Verification
- `node scripts/check-agent-context.mjs`
- `node scripts/check-doc-freshness.mjs`
- `node scripts/check-skills.mjs`
- `npm run lint`
- `npm run test`
- `npm run build`

## Documentation
- Update `docs/architecture.md` when module boundaries evolve.
- Update `docs/api-contracts.md` when interfaces or payloads change.
- Add ADR entries for durable architecture decisions.
