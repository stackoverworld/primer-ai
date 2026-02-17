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
- `npm run build` only compiles output and does not modify versions

## Release

Use explicit version bumps for predictable releases:

```bash
npm run release:patch   # or release:minor / release:major
git push --follow-tags
```

After `git push --follow-tags`, GitHub Actions publishes automatically from tag workflow
`.github/workflows/release-publish.yml`.

### One-time setup (required)

1. In GitHub repo settings, add secret `NPM_TOKEN` (token must be allowed to publish).
2. In npm account settings, keep publish auth/2FA enabled.
3. Ensure tags are pushed as `vX.Y.Z` and `package.json.version` matches that tag.

If you prefer manual fallback publish:

```bash
npm run release:publish
```

## Published Package Smoke Test

After publishing, verify users can run the CLI from npm:

```bash
npx primer-ai@latest --version
npx primer-ai@latest --help
```

Optional global-install check:

```bash
npm i -g primer-ai
primer-ai --version
primer-ai --help
```

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
