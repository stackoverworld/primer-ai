import { posix } from "node:path";

import { countLines, normalizeMarkdown } from "./text.js";
import {
  buildClaudeApiRule,
  buildClaudeEntry,
  buildClaudePreToolHook,
  buildClaudeSecurityRule,
  buildClaudeSessionStartHook,
  buildClaudeSettings,
  buildClaudeStopHook,
  buildClaudeTestingRule,
  buildCursorApiRule,
  buildCursorProjectRule,
  buildScopedClaudeEntry
} from "./templates/assistant-adapters.js";
import { buildAgentsFragmentsReadme, buildRootAgents, buildScopedAgents, splitRootIntoFragments } from "./templates/agents.js";
import {
  buildAgentContextWorkflow,
  buildCheckAgentContextScript,
  buildCheckDocFreshnessScript,
  buildCheckSkillsScript,
  buildComposeAgentsScript,
  buildDocGardenScript,
  buildDocGardeningWorkflow
} from "./templates/automation.js";
import {
  buildApiContracts,
  buildArchitectureDoc,
  buildConventions,
  buildDocsIndex,
  buildInitialAdr,
  buildMaintenanceDoc,
  buildRunbook,
  buildSkillsDoc
} from "./templates/documentation.js";
import { buildReadme, buildScaffoldGitignore } from "./templates/project-files.js";
import { includesClaude, normalizePath } from "./templates/shared.js";
import {
  buildAdaptiveRefactorSkill,
  buildAdaptiveRefactorSkillTriggers,
  buildArchitectureSkill,
  buildArchitectureSkillTriggers,
  buildSkillsReadme
} from "./templates/skills.js";
import type { AIDraft, FileArtifact, InitInput, ProjectPlan } from "./types.js";

export function createScaffoldFiles(
  input: InitInput,
  plan: ProjectPlan,
  draft: AIDraft | null,
  providerUsed?: "codex" | "claude"
): FileArtifact[] {
  const files: FileArtifact[] = [];
  const rootAgentsContent = buildRootAgents(input, plan, draft, providerUsed);

  files.push({ path: "README.md", content: buildReadme(input, plan) });
  files.push({ path: ".gitignore", content: buildScaffoldGitignore() });
  files.push({
    path: "AGENTS.md",
    content: rootAgentsContent
  });
  files.push(...splitRootIntoFragments(rootAgentsContent));
  files.push({ path: ".agents/README.md", content: buildAgentsFragmentsReadme() });

  files.push({ path: "docs/index.md", content: buildDocsIndex(input) });
  files.push({ path: "docs/architecture.md", content: buildArchitectureDoc(input, plan, draft) });
  files.push({ path: "docs/api-contracts.md", content: buildApiContracts(input, draft) });
  files.push({ path: "docs/conventions.md", content: buildConventions(plan, draft) });
  files.push({ path: "docs/maintenance.md", content: buildMaintenanceDoc(plan) });
  files.push({ path: "docs/skills.md", content: buildSkillsDoc(input, plan) });
  files.push({ path: "docs/decisions/0001-initial-architecture.md", content: buildInitialAdr(input, plan) });
  files.push({ path: "docs/runbooks/local-dev.md", content: buildRunbook(plan) });
  files.push({ path: ".github/workflows/agent-context-checks.yml", content: buildAgentContextWorkflow() });
  files.push({ path: ".github/workflows/doc-gardening.yml", content: buildDocGardeningWorkflow() });

  files.push({ path: "scripts/compose-agents.mjs", content: buildComposeAgentsScript() });
  files.push({ path: "scripts/check-agent-context.mjs", content: buildCheckAgentContextScript() });
  files.push({ path: "scripts/check-doc-freshness.mjs", content: buildCheckDocFreshnessScript() });
  files.push({ path: "scripts/check-skills.mjs", content: buildCheckSkillsScript() });
  files.push({ path: "scripts/doc-garden.mjs", content: buildDocGardenScript() });

  files.push({ path: "skills/README.md", content: buildSkillsReadme() });
  files.push({ path: "skills/architecture-update/SKILL.md", content: buildArchitectureSkill() });
  files.push({ path: "skills/architecture-update/tests/trigger-cases.md", content: buildArchitectureSkillTriggers() });
  files.push({ path: "skills/adaptive-refactor/SKILL.md", content: buildAdaptiveRefactorSkill() });
  files.push({ path: "skills/adaptive-refactor/tests/trigger-cases.md", content: buildAdaptiveRefactorSkillTriggers() });

  for (const entry of plan.scopedInstructions) {
    const scopedPath = normalizePath(posix.join(entry.directory, "AGENTS.md"));
    files.push({
      path: scopedPath,
      content: buildScopedAgents(entry, plan)
    });
  }

  if (includesClaude(input.targetAgent)) {
    files.push({ path: "CLAUDE.md", content: buildClaudeEntry(input) });
    files.push({ path: ".claude/rules/testing.md", content: buildClaudeTestingRule(plan) });
    files.push({ path: ".claude/rules/security.md", content: buildClaudeSecurityRule() });
    files.push({ path: ".claude/rules/api.md", content: buildClaudeApiRule() });
    files.push({ path: ".claude/settings.json", content: buildClaudeSettings() });
    files.push({ path: "scripts/claude-hooks/pre-tool-use.mjs", content: buildClaudePreToolHook() });
    files.push({ path: "scripts/claude-hooks/stop.mjs", content: buildClaudeStopHook() });
    files.push({ path: "scripts/claude-hooks/session-start.mjs", content: buildClaudeSessionStartHook() });

    if (input.projectShape === "monorepo") {
      const claudeScopedDirs = Array.from(
        new Set(
          plan.scopedInstructions
            .map((entry) => normalizePath(entry.directory))
            .filter((directory) => directory.startsWith("apps/") || directory.startsWith("packages/"))
        )
      );

      for (const scopeDir of claudeScopedDirs) {
        files.push({
          path: `${scopeDir}/CLAUDE.md`,
          content: buildScopedClaudeEntry(scopeDir)
        });
      }
    }
  }

  if (input.includeCursorRules) {
    files.push({ path: ".cursor/rules/project.mdc", content: buildCursorProjectRule(input) });
    files.push({ path: ".cursor/rules/api.mdc", content: buildCursorApiRule() });
  }

  const pathsWithParents = new Set<string>();
  for (const file of files) {
    const normalized = normalizePath(file.path);
    const parts = normalized.split("/");
    if (parts.length > 1) {
      parts.pop();
      pathsWithParents.add(parts.join("/"));
    }
  }

  for (const directory of plan.directories) {
    const normalizedDirectory = normalizePath(directory);
    if (!pathsWithParents.has(normalizedDirectory)) {
      files.push({
        path: `${normalizedDirectory}/.gitkeep`,
        content: ""
      });
    }
  }

  return files.map((file) => ({
    ...file,
    path: normalizePath(file.path),
    content: file.path.endsWith(".gitkeep") ? "" : normalizeMarkdown(file.content)
  }));
}

export function rootAgentsLineCount(files: FileArtifact[]): number {
  const root = files.find((file) => file.path === "AGENTS.md");
  if (!root) return 0;
  return countLines(root.content);
}
