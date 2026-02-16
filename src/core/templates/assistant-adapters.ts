import { normalizeMarkdown } from "../text.js";
import type { InitInput, ProjectPlan } from "../types.js";

function normalizePath(path: string): string {
  return path.replaceAll("\\", "/");
}

function relativeToRootPrefix(directory: string): string {
  const depth = normalizePath(directory)
    .split("/")
    .filter(Boolean).length;
  if (depth === 0) return ".";
  return Array.from({ length: depth }, () => "..").join("/");
}

export function buildClaudeEntry(input: InitInput): string {
  return normalizeMarkdown(`# CLAUDE.md

@AGENTS.md
@docs/index.md
@docs/architecture.md
@docs/api-contracts.md
@docs/conventions.md
@docs/maintenance.md
@docs/skills.md

## Claude Adapter Notes
- Keep this file small and routing-focused.
- Detailed guardrails live in \`.claude/rules/*.md\`.
- Deterministic enforcement hooks live in \`.claude/settings.json\`.
- For path-specific guidance, read the matching scoped \`AGENTS.md\`.

## Project
- Name: \`${input.projectName}\`
- Stack: ${input.techStack}
- Workflow target: ${input.targetAgent}
`);
}

export function buildScopedClaudeEntry(scopeDir: string): string {
  const prefix = relativeToRootPrefix(scopeDir);
  const rootImport = prefix === "." ? "@AGENTS.md" : `@${prefix}/AGENTS.md`;
  const docsIndexImport = prefix === "." ? "@docs/index.md" : `@${prefix}/docs/index.md`;
  const architectureImport = prefix === "." ? "@docs/architecture.md" : `@${prefix}/docs/architecture.md`;
  const contractsImport = prefix === "." ? "@docs/api-contracts.md" : `@${prefix}/docs/api-contracts.md`;
  const conventionsImport = prefix === "." ? "@docs/conventions.md" : `@${prefix}/docs/conventions.md`;
  const maintenanceImport = prefix === "." ? "@docs/maintenance.md" : `@${prefix}/docs/maintenance.md`;
  const skillsImport = prefix === "." ? "@docs/skills.md" : `@${prefix}/docs/skills.md`;
  const localAgentsImport = "@AGENTS.md";

  return normalizeMarkdown(`# CLAUDE.md

${rootImport}
${docsIndexImport}
${architectureImport}
${contractsImport}
${conventionsImport}
${maintenanceImport}
${skillsImport}
${localAgentsImport}

## Scope Adapter Notes
- Applies to subtree: \`${normalizePath(scopeDir)}/**\`.
- Local \`AGENTS.md\` in this directory provides subtree overrides.
- Keep this scoped entry concise and rely on canonical docs for details.
`);
}

export function buildClaudeTestingRule(plan: ProjectPlan): string {
  return normalizeMarkdown(`---
description: Required verification steps before finishing implementation tasks.
alwaysApply: true
---

# Testing Rule

- Run relevant verification commands before handing off changes.
- Do not claim completion without reporting command outcomes.
- Prefer deterministic checks over subjective quality statements.

## Baseline Commands
 - \`node scripts/check-agent-context.mjs\`
 - \`node scripts/check-doc-freshness.mjs\`
 - \`node scripts/check-skills.mjs\`
${plan.verificationCommands.map((command) => `- \`${command}\``).join("\n")}
`);
}

export function buildClaudeSecurityRule(): string {
  return normalizeMarkdown(`---
description: Safe command and data handling.
alwaysApply: true
---

# Security Rule

- Avoid destructive operations unless explicitly requested.
- Treat secrets, credentials, and tokens as sensitive.
- Prefer least-privilege command execution.
- Validate external input and sanitize outputs.
`);
}

export function buildClaudeApiRule(): string {
  return normalizeMarkdown(`---
description: API contract discipline for transport and schema changes.
paths:
  - "src/http/**"
  - "src/contracts/**"
  - "apps/api/**"
---

# API Rule

- Changes to request/response schemas must update \`docs/api-contracts.md\`.
- Preserve backward compatibility unless a versioned migration is introduced.
- Add or update integration tests for contract changes.
`);
}

export function buildCursorProjectRule(input: InitInput): string {
  return normalizeMarkdown(`---
description: Project context routing for Cursor.
alwaysApply: true
---

# Primer-ai Project Rule

- Treat \`AGENTS.md\` as the root map for this repository.
- Pull details from \`docs/index.md\` and linked docs before broad changes.
- Keep edits scoped and update docs for architecture/contract changes.

## Project Snapshot
- Name: \`${input.projectName}\`
- Stack: ${input.techStack}
- Shape: ${input.projectShape}
`);
}

export function buildCursorApiRule(): string {
  return normalizeMarkdown(`---
description: API contract guardrails for Cursor.
globs:
  - "src/http/**"
  - "src/contracts/**"
  - "apps/api/**"
---

# API Contract Rule

- Contract changes require matching documentation updates.
- Prefer additive changes and explicit versioning for breaks.
- Add tests that lock expected request/response behavior.
`);
}

export function buildClaudeSettings(): string {
  return normalizeMarkdown(`{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node scripts/claude-hooks/session-start.mjs"
          }
        ]
      }
    ],
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "node scripts/claude-hooks/pre-tool-use.mjs"
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node scripts/claude-hooks/stop.mjs"
          }
        ]
      }
    ]
  }
}
`);
}

export function buildClaudePreToolHook(): string {
  return normalizeMarkdown(`import { readFileSync } from "node:fs";

const input = readFileSync(0, "utf8").trim();
const payload = input ? JSON.parse(input) : {};
const toolName = payload.tool_name || payload.toolName || "";
const command = payload.tool_input?.command || payload.toolInput?.command || "";

const blockedPatterns = [
  /\\brm\\s+-rf\\s+\\/$/i,
  /\\brm\\s+-rf\\s+\\/[^\\s]*/i,
  /\\bmkfs\\b/i,
  /\\bdd\\s+if=.*\\sof=\\/dev\\//i,
  /\\bshutdown\\b/i,
  /\\breboot\\b/i,
  /\\bcurl\\b[^\\n]*\\|\\s*sh\\b/i
];

if (toolName === "Bash" && blockedPatterns.some((pattern) => pattern.test(command))) {
  console.log(JSON.stringify({
    permissionDecision: "deny",
    reason: "Blocked by primer-ai safety hook. Use safer scoped commands or require explicit human approval."
  }));
  process.exit(0);
}

console.log(JSON.stringify({ permissionDecision: "allow" }));
`);
}

export function buildClaudeStopHook(): string {
  return normalizeMarkdown(`import { execSync } from "node:child_process";

function run(command) {
  try {
    return execSync(command, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "";
  }
}

const tracked = run("git diff --name-only");
const staged = run("git diff --name-only --cached");
const changed = new Set([...tracked.split("\\n"), ...staged.split("\\n")].map((v) => v.trim()).filter(Boolean));

if (!changed.size) {
  console.log(JSON.stringify({ decision: "allow" }));
  process.exit(0);
}

const implementationChanged = [...changed].some((file) => {
  if (file.startsWith("src/") || file.startsWith("apps/") || file.startsWith("packages/")) return true;
  return /\\.(ts|tsx|js|jsx|mjs|cjs|py|go|rs|java|kt|swift|rb|php)$/i.test(file);
});

const docsChanged = [...changed].some((file) => {
  return (
    file.startsWith("docs/") ||
    file.endsWith("AGENTS.md") ||
    file === "CLAUDE.md" ||
    file.startsWith(".claude/rules/") ||
    file.startsWith(".cursor/rules/")
  );
});

if (implementationChanged && !docsChanged) {
  console.log(JSON.stringify({
    decision: "block",
    reason: "Implementation files changed without documentation updates. Update docs/ or add an ADR before ending the session."
  }));
  process.exit(0);
}

console.log(JSON.stringify({ decision: "allow" }));
`);
}

export function buildClaudeSessionStartHook(): string {
  return normalizeMarkdown(`console.log(JSON.stringify({
  hookSpecificOutput: {
    hookEventName: "SessionStart",
    additionalContext: "Primer-ai maintenance hooks are active. Run node scripts/check-agent-context.mjs and node scripts/check-doc-freshness.mjs before finishing substantial code changes."
  }
}));
`);
}
