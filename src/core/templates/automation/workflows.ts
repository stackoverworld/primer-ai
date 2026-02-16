import { normalizeMarkdown } from "../../text.js";

export function buildAgentContextWorkflow(): string {
  return normalizeMarkdown(`name: Agent Context Checks

on:
  pull_request:
  push:
    branches: ["main"]

jobs:
  validate-agent-context:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
      - name: Validate AGENTS structure and budget
        run: node scripts/check-agent-context.mjs
      - name: Validate docs freshness
        run: node scripts/check-doc-freshness.mjs
      - name: Validate skill catalog
        run: node scripts/check-skills.mjs
`);
}

export function buildDocGardeningWorkflow(): string {
  return normalizeMarkdown(`name: Doc Gardening

on:
  workflow_dispatch:
  schedule:
    - cron: "0 8 * * 1"

permissions:
  contents: write
  pull-requests: write

jobs:
  garden-docs:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
      - name: Refresh docs metadata and inventory
        run: node scripts/doc-garden.mjs --apply
      - name: Validate context + docs + skills
        run: |
          node scripts/check-agent-context.mjs
          node scripts/check-doc-freshness.mjs
          node scripts/check-skills.mjs
      - name: Create pull request
        uses: peter-evans/create-pull-request@v6
        with:
          commit-message: "chore(docs): automated doc-gardening refresh"
          title: "chore(docs): automated doc-gardening refresh"
          body: "Automated documentation freshness and index maintenance."
          branch: "chore/doc-gardening"
`);
}
