# ADR-0002: Split AI Orchestration Internals by Responsibility

- Last reviewed: 2026-02-15

## Status
Accepted

## Context
`src/core/ai.ts` had accumulated provider detection, prompt assembly, schema definitions, process spawning, retry logic, and orchestration in one file. This made focused maintenance and safe edits harder for both humans and coding agents.

## Decision
- Keep `src/core/ai.ts` as the stable public facade.
- Move provider/binary resolution to `src/core/ai/provider-selection.ts`.
- Move prompt builders to `src/core/ai/prompts.ts`.
- Move output schemas to `src/core/ai/schemas.ts`.
- Move command execution + fallback logic to `src/core/ai/providers.ts`.
- Move spawn timeout/buffer logic to `src/core/ai/process-runner.ts`.
- Move live status ticker behavior to `src/core/ai/status.ts`.

## Consequences
- Internal AI behavior is split into cohesive modules with explicit boundaries.
- Public contracts remain unchanged (`generateAiDraft`, `generateAiQuickSetupPlan`, `runAiFreeformTask`, `__internal`).
- Future provider or prompt changes can be isolated without touching orchestration flow.
