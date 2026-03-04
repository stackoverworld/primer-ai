import { normalizeMarkdown } from "../../text.js";

interface CiWorkflowOptions {
  verificationCommands?: string[];
  includePackageSmokeTest?: boolean;
  useNpmCheckShortcut?: boolean;
}

function unique(items: string[]): string[] {
  const seen = new Set<string>();
  const deduped: string[] = [];

  for (const item of items) {
    const normalized = item.trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    deduped.push(normalized);
  }

  return deduped;
}

function buildCheckCommands(options?: CiWorkflowOptions): string[] {
  if (options?.useNpmCheckShortcut ?? true) {
    return ["npm run check"];
  }

  const baseChecks = [
    "node scripts/check-agent-context.mjs",
    "node scripts/check-doc-freshness.mjs",
    "node scripts/check-skills.mjs"
  ];
  return unique([...baseChecks, ...(options?.verificationCommands ?? [])]);
}

export function buildCiWorkflow(options?: CiWorkflowOptions): string {
  const checkCommands = buildCheckCommands(options);
  const checksBlock = checkCommands.map((command) => `          ${command}`).join("\n");
  const includePackageSmokeTest = options?.includePackageSmokeTest ?? true;
  const packageSmokeSteps = includePackageSmokeTest
    ? `

      - name: Build package tarball
        if: \${{ hashFiles('package.json') != '' }}
        run: echo "PACKAGE_TARBALL=$(npm pack --silent)" >> "$GITHUB_ENV"

      - name: Verify package contents
        if: \${{ env.PACKAGE_TARBALL != '' }}
        run: |
          tar -tzf "$PACKAGE_TARBALL" | grep -E '^package/dist/cli\\.js$'
          tar -tzf "$PACKAGE_TARBALL" | grep -E '^package/package\\.json$'`
    : "";

  return normalizeMarkdown(`name: CI

on:
  pull_request:
  push:
    branches: ["main"]

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "npm"

      - name: Install npm dependencies (lockfile)
        if: \${{ hashFiles('package-lock.json') != '' }}
        run: npm ci

      - name: Install npm dependencies (package.json fallback)
        if: \${{ hashFiles('package-lock.json') == '' && hashFiles('package.json') != '' }}
        run: npm install --no-audit --no-fund

      - name: Run repository checks
        run: |
${checksBlock}${packageSmokeSteps}
`);
}

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
