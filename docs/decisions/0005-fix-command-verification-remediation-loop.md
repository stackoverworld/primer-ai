# ADR-0005: Add `primer-ai fix` Verification-First Remediation Workflow

- Last reviewed: 2026-02-16

## Status
Accepted

## Context
`primer-ai` had `init` and `refactor`, but no dedicated flow for correctness-driven maintenance where users want:
- deterministic verification before edits,
- focused fixes for actionable lint/test/typecheck/build failures,
- bounded AI passes with re-verification between passes.

Using `refactor` for this use case encouraged broader structural edits when users primarily needed reliability fixes.

## Decision
- Introduce `primer-ai fix` command as a first-class CLI contract.
- Implement a verification planner that composes commands from:
  - stack policy defaults,
  - repository scripts (`package.json`),
  - installed package/tool signals (for example `eslint`, `typescript`, `vitest`, `jest`, `next`, `vite`) when scripts are absent.
- Run baseline verification first, then:
  - exit early if no actionable failures,
  - or execute bounded AI fix passes with verification reruns after each pass.
- Treat missing scripts/tools and lock/timeout verification failures as non-actionable skips to keep execution deterministic and avoid stalled loops.

## Consequences
- Users now have a dedicated maintenance command for behavior-preserving issue remediation.
- `refactor` can stay focused on decomposition and architecture quality, while `fix` focuses on verification health.
- Public CLI surface expands and requires synchronized updates to API contracts, README, and command tests.
