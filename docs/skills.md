# Skills

- Last reviewed: 2026-02-14

## Purpose
Skills are progressive-disclosure playbooks. Metadata stays easy to scan, detailed instructions are loaded only when task triggers match.

## Curation Rules
- Keep a small, high-signal catalog.
- Each skill must define explicit trigger patterns.
- Each skill must include trigger test cases in `tests/trigger-cases.md`.
- Remove or archive stale skills that no longer trigger meaningfully.

## Structure
- `skills/<skill-name>/SKILL.md`
- `skills/<skill-name>/tests/trigger-cases.md`

## Refactor Skill Baseline
- Default workflow skill: `qa-refactoring`
- Purpose: safe, test-backed refactor loop (baseline, invariants, micro-steps, verification).
- Install: `npx skills add vasilyu1983/ai-agents-public --skill qa-refactoring`

## Stack Add-ons
- Rust: `rust-refactor-helper` (`npx skills add zhanghandong/rust-skills --skill rust-refactor-helper`)
- Next.js/React: `vercel-react-best-practices` (`npx skills add vercel-labs/agent-skills --skill vercel-react-best-practices`)
- Node backend: `nodejs-backend-patterns` (`npx skills add wshobson/agents --skill nodejs-backend-patterns`)
- Swift/iOS: `ios-development` (`npx skills add rshankras/claude-code-apple-skills --skill ios-development`)
- Optional Vite specialist: `react-vite-expert` (use for large structural reorganizations, not small edits)

## Deterministic Refactor Checks
- TypeScript + Node backend: `npx tsc --noEmit`, `npm run test`, `npm run build`
- Rust: `cargo fmt`, `cargo clippy --fix`, `cargo test`
- Vite + TypeScript: `npx tsc --noEmit`, `vitest run`, `vite build`
- Swift: `swift format lint .`, `swift test`
- Next.js linting: prefer project `eslint` scripts over `next lint`

## Validation
- Run `node scripts/check-skills.mjs`.
- Keep docs and ADRs synchronized when contracts or architecture boundaries change.
- Update this document when skill lifecycle policy changes.
