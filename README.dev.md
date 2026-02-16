# Development Guide

This file is for contributors working on `primer-ai` itself.

## Prerequisites

- Node.js `>= 20.10.0`
- npm
- Git

Optional for end-to-end AI flows:
- `codex` CLI (recommended)
- `claude` CLI (optional fallback path)

## Setup

```bash
npm install
```

## Verification

Run project checks before commit:

```bash
node scripts/check-agent-context.mjs
node scripts/check-doc-freshness.mjs
node scripts/check-skills.mjs
npm run lint
npm run test
```

## Build

```bash
npm run build
```

Important:
- `npm run build` runs `scripts/bump-version.mjs` first
- this auto-increments patch version in `package.json`

## Local CLI Run

```bash
npm run dev -- --help
npm run dev -- init --help
npm run dev -- refactor --help
```

If your environment blocks `tsx` IPC sockets, use built output:

```bash
node dist/cli.js --help
```

## Documentation Discipline

When contracts or architecture change:
- update `docs/api-contracts.md`
- update `docs/architecture.md` and/or ADRs in `docs/decisions/`
- keep `README.md` command docs in sync with `src/cli.ts`
