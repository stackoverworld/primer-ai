# AGENTS.md

## Scope
- Applies to: `src/core/**`
- Priority: this file overrides broader instructions for files in this subtree.

## Focus
- Core orchestration and side-effect boundaries.
- Keep changes localized to this subtree unless a contract requires broader edits.
- If API behavior changes, update `docs/api-contracts.md`.
- If architecture boundaries change, update `docs/architecture.md` and ADRs.

## Working Rules
- Prefer small, reviewable patches.
- Avoid hidden side effects across module boundaries.
- Keep tests near the behavior they validate.
- Do not skip verification commands.

## Required Checks
- `npm run lint`
- `npm run test`
- `npm run build`
