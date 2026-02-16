# primer-ai

`primer-ai` is a beta TypeScript CLI for two jobs:
- bootstrap a repository with AI-ready project architecture and maintainable agent context
- run AI-guided refactors on existing codebases using your locally installed agent CLI

The project started from deep research across modern AI workflows (including ChatGPT and Claude research tooling) to capture practical patterns that are usually missing when teams run ad-hoc `/init` prompts.

## Why This Exists

Most AI coding sessions are stateless and inconsistent across runs. `primer-ai` creates explicit project context surfaces so assistants can work from shared, versioned rules:
- root + scoped `AGENTS.md` instruction chain
- `docs/` knowledge base (architecture, contracts, runbooks, ADRs)
- `skills/` catalog with trigger tests
- maintenance checks that keep instructions and docs fresh over time

It also includes a refactor workflow for medium and large repositories, with resumable multi-pass execution and Codex orchestration support.

## Current Status

- Release channel: `beta`
- Recommended and best-tested path: Codex CLI
- Claude Code path: implemented, but less battle-tested
- Platform testing status: verified primarily on macOS
- Linux/Windows: expected to work for many cases, but currently less validated

## What It Generates

`init` scaffolding produces:
- `AGENTS.md` + scoped instruction files
- `.agents/fragments/root/*` composition fragments
- `docs/` source-of-truth docs, ADRs, and runbook structure
- optional Claude artifacts (`CLAUDE.md`, `.claude/rules/`, `.claude/settings.json`)
- optional Cursor rules (`.cursor/rules/`)
- maintenance scripts:
  - `scripts/check-agent-context.mjs`
  - `scripts/check-doc-freshness.mjs`
  - `scripts/check-skills.mjs`
  - `scripts/doc-garden.mjs`
- GitHub workflows for context checks and doc gardening

## Requirements

- Node.js `>= 20.10.0`
- npm
- Git
- Optional AI CLIs:
  - `codex` (recommended)
  - `claude` (supported fallback path)

`init --mode template` works without AI CLIs.
`init --mode ai-assisted` and `refactor` require an installed and authenticated AI CLI.

## Quick Start

Initialize in the current directory:

```bash
npx primer-ai init
```

Initialize a target directory:

```bash
npx primer-ai init my-new-project
```

Initialize non-interactively with explicit settings:

```bash
npx primer-ai init . \
  --yes \
  --description "Internal analytics API for event ingestion" \
  --stack "TypeScript + Node.js + PostgreSQL" \
  --project-type api-service \
  --agent codex \
  --mode ai-assisted \
  --provider codex
```

Run refactor in the current repo:

```bash
npx primer-ai refactor . --provider auto
```

Run scan-only dry run:

```bash
npx primer-ai refactor . --dry-run
```

## Refactor Workflow

In interactive terminals, `refactor` does:
1. scan repository and build backlog
2. collect execution choices (provider/model/logging/notes/orchestration)
3. run AI passes
4. print deterministic summary (passes, backlog, file changes, verification notes)

Checkpointing:
- Saved at `.primer-ai/refactor-resume.json`
- By default `--resume` is enabled
- Interrupted runs can continue from the last saved pass

Codex orchestration:
- Enabled by default (`--orchestration`)
- Planner / orchestrator / worker role models are supported
- Default role models:
  - planner: `gpt-5.3-codex`
  - orchestrator: `gpt-5.3-codex`
  - worker: `gpt-5.3-codex-spark`
- `--max-subagents` range: `1..24` (default `12`)

## Quick Setup Presets (`init --quick-setup`)

Available in AI-assisted mode for supported stacks:
- Next.js + TypeScript (`nextjs-ts`)
- React + Vite + TypeScript (`vite-react-ts`)
- TypeScript + Node.js (`node-ts`) for `api-service`, `cli-tool`, `library`, `custom`

Not enabled yet:
- monorepo quick setup
- Swift/iOS quick setup

## Command Reference

### `primer-ai init [path]`

Purpose:
- scaffold AI-optimized project structure
- for non-empty repositories, migration is supported only in `ai-assisted` mode

Options:
- `--description <text>` project description
- `--stack <text>` tech stack summary
- `--project-type <type>` `web-app | api-service | library | cli-tool | monorepo | custom`
- `--agent <target>` `codex | claude | both` (default `codex`)
- `--mode <mode>` `template | ai-assisted` (default `ai-assisted`)
- `--provider <provider>` `auto | codex | claude`
- `--model <model>` model id when provider is fixed (`codex` or `claude`)
- `--cursor` / `--no-cursor` generate `.cursor/rules` (default `false`)
- `--git-init` / `--no-git-init` initialize Git if missing (default `true`)
- `--quick-setup` run supported quick setup after scaffold (default `false`)
- `-y, --yes` skip prompts and use defaults
- `--force` allow scaffolding into non-empty folder

### `primer-ai refactor [path]`

Purpose:
- scan repository
- calibrate backlog
- execute adaptive AI refactor passes with optional orchestration

Options:
- `--provider <provider>` `auto | codex | claude` (default `auto`)
- `--model <model>` model id when provider is fixed
- `--planner-model <model>` planner model for Codex orchestration
- `--orchestrator-model <model>` orchestrator model for Codex orchestration
- `--worker-model <model>` worker model for Codex orchestration
- `--agent <target>` `codex | claude | both` (used with `--provider auto`)
- `--notes <text>` custom notes for scan/refactor prompt
- `--focus <text>` merged into notes
- `--show-ai-file-ops` stream AI file edit/create output (default `false`)
- `--orchestration` / `--no-orchestration` Codex orchestration toggle (default `true`)
- `--max-subagents <count>` orchestration workers `1..24` (default `12`)
- `--max-files <count>` scan file cap (default auto)
- `--max-passes <count>` pass cap (default adaptive)
- `--ai-timeout-sec <seconds>` timeout per AI subprocess (default `1800`, clamped to `60..14400`)
- `--resume` / `--no-resume` checkpoint behavior (default `true`)
- `--dry-run` generate prompt only, no AI execution
- `-y, --yes` non-interactive execution choices

## AI Provider Resolution

- Codex-first by default
- If provider is `auto`, primer-ai prefers provider by agent target and binary availability
- If no compatible `codex`/`claude` binary is found:
  - `init` can fall back to deterministic templates for new/empty projects
  - `refactor` fails with a provider warning

## Local Development

```bash
npm install
npm run lint
npm run test
npm run build
```

Notes:
- `npm run build` runs `prebuild` and auto-increments patch version
- source entrypoint for local iteration: `npm run dev`

Related project docs:
- `docs/index.md`
- `docs/runbooks/local-dev.md`
- `README.dev.md`

## License

MIT. See `LICENSE`.
