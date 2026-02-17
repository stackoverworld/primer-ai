# primer-ai

`primer-ai` is a beta TypeScript CLI for four jobs:
- bootstrap a repository with AI-ready project architecture and maintainable agent context
- run AI-guided refactors on existing codebases using your locally installed agent CLI
- run AI-guided verification/fix loops that detect and remediate actionable repo issues
- generate GitHub-style release log notes from previous version/tag to current state

The project started from deep research across modern AI workflows (including ChatGPT and Claude research tooling) to capture practical patterns that are usually missing when teams run ad-hoc `/init` prompts.

## Why This Exists

Most AI coding sessions are stateless and inconsistent across runs. `primer-ai` creates explicit project context surfaces so assistants can work from shared, versioned rules:
- root + scoped `AGENTS.md` instruction chain
- `docs/` knowledge base (architecture, contracts, runbooks, ADRs)
- `skills/` catalog with trigger tests
- maintenance checks that keep instructions and docs fresh over time

It also includes refactor and fix workflows for medium and large repositories, with resumable multi-pass refactor execution and Codex orchestration support.

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
`init --mode ai-assisted`, `refactor`, `fix`, and `generate-logs` require an installed and authenticated AI CLI.

## Install and Use

Run without installing (always uses latest published version):

```bash
npx primer-ai@latest --help
```

Install globally:

```bash
npm i -g primer-ai
primer-ai --help
```

Check installed version:

```bash
primer-ai --version
```

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

Run AI-assisted fix loop (detect verification failures, apply fixes, re-check):

```bash
npx primer-ai fix . --provider auto
```

Generate release logs in GitHub markdown style:

```bash
npx primer-ai generate-logs .
```

Generate release logs between two versions (even if current `HEAD` is newer):

```bash
npx primer-ai generate-logs . --from-version 0.1.59 --to-version 0.1.79
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
- `--format <format>` `text | json` (controls error output format)
- `-y, --yes` skip prompts and use defaults
- `--force` overwrite existing scaffold paths instead of creating `.primer-ai.generated` variants

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
- `--show-ai-file-ops` / `--no-show-ai-file-ops` stream compact AI file-operation events (default `true`); known noisy provider internals and prompt-echo text are suppressed, and file ops are shown as concise `Read/Created/Updated/Deleted file` lines
- `--orchestration` / `--no-orchestration` Codex orchestration toggle (default `true`)
- `--max-subagents <count>` orchestration workers `1..24` (default `12`)
- `--max-files <count>` scan file cap (default auto)
- `--max-passes <count>` pass cap (default adaptive)
- `--ai-timeout-sec <seconds>` timeout per AI subprocess (default `1800`, clamped to `60..14400`)
- `--format <format>` `text | json` (controls error output format)
- `--resume` / `--no-resume` checkpoint behavior (default `true`)
- `--dry-run` generate prompt only, no AI execution
- `-y, --yes` non-interactive execution choices

### `primer-ai fix [path]`

Purpose:
- detect verification failures based on stack policy, scripts, and installed package tooling
- run iterative AI fix passes and re-run checks until actionable failures clear or pass cap is reached

Options:
- `--provider <provider>` `auto | codex | claude` (default `auto`)
- `--model <model>` model id when provider is fixed
- `--agent <target>` `codex | claude | both` (used with `--provider auto`)
- `--notes <text>` custom notes for AI fix prompt
- `--focus <text>` merged into notes
- `--show-ai-file-ops` / `--no-show-ai-file-ops` stream compact AI file-operation events (default `true`)
- `--max-files <count>` scan file cap (default `20000`, clamped to `80..120000`)
- `--max-passes <count>` AI fix hard pass cap (clamped to `1..12`); when omitted, starts from `3` and can adaptively grow up to `12` if actionable failures remain
- `--ai-timeout-sec <seconds>` timeout per AI subprocess (default `1800`, clamped to `60..14400`)
- `--dry-run` run detection only, no AI edits
- `--format <format>` `text | json` (controls error output format)
- `-y, --yes` non-interactive execution choices

### `primer-ai generate-logs [path]`

Purpose:
- AI-analyze repository deltas and generate GitHub release-note markdown in `### Changes` / `### Fixes` style
- default base version comes from latest section in `RELEASE_LOG.md`; if no section exists, latest GitHub tag (`origin`) is used
- store logs by version sections (`## from -> to`) and prepend newest section at the top without deleting older sections
- omit empty sections (`### Fixes` is skipped when there are no fixes)
- if AI returns no changes and no fixes, show this in console and keep the file unchanged

Options:
- `--from <ref>` explicit base tag/ref (default: auto previous reachable tag)
- `--to <ref>` target ref (default `HEAD`)
- `--from-version <version>` base version like `0.1.59` that must exist on GitHub tags (`origin`)
- `--to-version <version>` target version like `0.1.79` that must exist on GitHub tags (`origin`)
- `--output <path>` output markdown file (default `RELEASE_LOG.md`)
- `--thanks <handle>` GitHub handle appended to each entry (optional)
- `--stdout` print generated markdown to stdout
- `--no-uncommitted` ignore staged/unstaged/untracked local changes
- `--provider <provider>` `auto | codex | claude` (default `auto`)
- `--agent <target>` `codex | claude | both` (default `codex`)
- `--model <model>` model id when provider is fixed
- `--ai-timeout-sec <seconds>` timeout per AI subprocess (default `1800`, clamped to `60..14400`)
- `--show-ai-file-ops` / `--no-show-ai-file-ops` stream AI file-operation output during generation (default `false`)
- note: when `--from-version` or `--to-version` is used, uncommitted changes are ignored automatically to keep historical range generation deterministic
- `--format <format>` `text | json` (controls error output format)

## AI Provider Resolution

- Codex-first by default
- If provider is `auto`, primer-ai prefers provider by agent target and binary availability
- If no compatible `codex`/`claude` binary is found:
  - `init` can fall back to deterministic templates for new/empty projects
  - `refactor` and `fix` fail with a provider warning

## Local Development

```bash
npm install
npm run lint
npm run test
npm run build
```

Notes:
- `npm run build` only builds distributable files and does not change version
- bump version explicitly with `npm run release:patch` / `npm run release:minor` / `npm run release:major`
- publish after versioning with `npm run release:publish`
- source entrypoint for local iteration: `npm run dev`

Related project docs:
- `docs/index.md`
- `docs/runbooks/local-dev.md`
- `README.dev.md`

## License

MIT. See `LICENSE`.
