# Local Development Runbook

- Last reviewed: 2026-02-16

## Prerequisites
- Runtime/toolchain for your selected stack.
- Package manager configured for this repository.
- Git installed.

## First-Time Setup
1. Install dependencies.
2. Run baseline verification commands.
3. Start local development runtime.

## Commands
- `node scripts/check-agent-context.mjs`
- `node scripts/check-doc-freshness.mjs`
- `node scripts/check-skills.mjs`
- `npm run lint`
- `npm run test`
- `npm run build`
- Launch: `npm run dev`

## Release Workflow
1. Run verification and build checks.
2. Bump version explicitly: `npm run release:patch` (or `release:minor` / `release:major`).
3. Push commit and tag: `git push --follow-tags`.
4. Publish package: `npm run release:publish`.

## Migration Notes
- 2026-02-16: `primer-ai fix` is available for verification-first remediation loops (`scan -> verify -> AI fix pass -> re-verify`). Prefer this command when the goal is correctness/stability fixes rather than structural refactoring.

## Troubleshooting
- If checks fail, fix root cause before continuing.
- Keep docs and contracts updated with behavior changes.
- Capture recurring setup issues in this runbook.
