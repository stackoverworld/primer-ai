# ADR-0001: Initial Architecture Blueprint

- Last reviewed: 2026-02-14

## Status
Accepted

## Context
The project was initialized with `primer-ai` to provide an agent-optimized, progressively disclosed architecture scaffold.

## Decision
- Establish `AGENTS.md` as the root routing document.
- Keep source-of-truth architecture data in `docs/*`.
- Use scoped `AGENTS.md` files for subtree-specific constraints.
- Validate changes with the following initial checks:
  - `npm run lint`
  - `npm run test`
  - `npm run build`

## Consequences
- Faster cold-start for coding agents due to stable context layout.
- Documentation maintenance is required to avoid drift.
- Repository decisions become explicit and reviewable.

## Notes
Initial project intent: Build primer-ai with an agent-optimized architecture and reproducible delivery workflow.
