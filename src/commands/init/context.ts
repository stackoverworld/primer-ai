import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

export interface ExistingContextSnippet {
  path: string;
  excerpt: string;
}

export function listMeaningfulEntries(targetDir: string): string[] {
  const entries = readdirSync(targetDir);
  return entries.filter((entry) => ![".git", ".DS_Store"].includes(entry));
}

function clipForPrompt(content: string, maxChars = 420): string {
  const compact = content.replace(/\s+/g, " ").trim();
  if (compact.length <= maxChars) return compact;
  return `${compact.slice(0, maxChars)}...`;
}

export function collectExistingContextSnippets(targetDir: string): ExistingContextSnippet[] {
  const candidates = [
    "AGENTS.md",
    "CLAUDE.md",
    ".claude/CLAUDE.md",
    "docs/index.md",
    "docs/architecture.md",
    "docs/api-contracts.md",
    "docs/conventions.md"
  ];

  const snippets: ExistingContextSnippet[] = [];
  for (const relativePath of candidates) {
    const absolute = join(targetDir, relativePath);
    if (!existsSync(absolute)) continue;
    const raw = readFileSync(absolute, "utf8");
    const excerpt = clipForPrompt(raw);
    if (!excerpt) continue;
    snippets.push({ path: relativePath, excerpt });
  }

  const skillDirs = ["skills", ".claude/skills", ".codex/skills"];
  for (const skillDir of skillDirs) {
    const absolute = join(targetDir, skillDir);
    if (!existsSync(absolute)) continue;
    snippets.push({
      path: skillDir,
      excerpt: "Skill directory exists. Preserve useful skills and align trigger tests with docs/skills.md."
    });
  }

  return snippets;
}

export function buildExistingContextImportDoc(snippets: ExistingContextSnippet[]): string {
  const sections = snippets
    .map(
      (snippet) => `## ${snippet.path}

\`\`\`text
${snippet.excerpt}
\`\`\``
    )
    .join("\n\n");

  return `# Existing Context Import

- Source: pre-existing project files before primer-ai scaffold write.
- Purpose: keep migration transparent and preserve useful guidance from existing agent/docs artifacts.

## How To Use
- Review sections below and merge relevant constraints into canonical docs under \`docs/*\`.
- If existing \`AGENTS.md\` / \`CLAUDE.md\` files already encode useful rules, keep them as source references during consolidation.
- Preserve skill triggers and test cases when moving skills to canonical \`skills/*\` layout.

${sections}
`;
}
