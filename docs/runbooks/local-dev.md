# Local Development Runbook

- Last reviewed: 2026-02-14

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

## Troubleshooting
- If checks fail, fix root cause before continuing.
- Keep docs and contracts updated with behavior changes.
- Capture recurring setup issues in this runbook.
