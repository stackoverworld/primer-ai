import { normalizeMarkdown } from "../../text.js";

export function buildComposeAgentsScript(): string {
  return normalizeMarkdown(`import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = process.cwd();
const fragmentsDir = resolve(root, ".agents/fragments/root");
const outputPath = resolve(root, "AGENTS.md");
const args = new Set(process.argv.slice(2));
const checkOnly = args.has("--check");
const writeMode = args.has("--write") || !checkOnly;

const files = readdirSync(fragmentsDir)
  .filter((name) => name.endsWith(".md"))
  .sort((a, b) => a.localeCompare(b));

if (!files.length) {
  console.error("No AGENTS fragments found in .agents/fragments/root");
  process.exit(1);
}

const composed = files.map((file) => readFileSync(join(fragmentsDir, file), "utf8").trimEnd()).join("\\n\\n").trimEnd() + "\\n";
const current = readFileSync(outputPath, "utf8");

if (checkOnly) {
  if (current !== composed) {
    console.error("AGENTS.md is out of sync with fragments. Run: node scripts/compose-agents.mjs --write");
    process.exit(1);
  }
  console.log("AGENTS.md composition check passed.");
  process.exit(0);
}

if (writeMode) {
  writeFileSync(outputPath, composed, "utf8");
  console.log("AGENTS.md composed from fragments.");
}
`);
}

export function buildCheckAgentContextScript(): string {
  return normalizeMarkdown(`import { existsSync, readFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join, relative, resolve } from "node:path";

const ROOT = process.cwd();
const MAX_CHAIN_BYTES = 32 * 1024;
const ROOT_MIN = 60;
const ROOT_MAX = 150;
const IGNORED = new Set([".git", "node_modules", "dist", "coverage"]);
const DEFAULT_PRIMARY_FILES = ["AGENTS.override.md", "AGENTS.md"];

function parseQuotedList(raw) {
  const values = [];
  const regex = /"([^"]+)"|'([^']+)'/g;
  for (;;) {
    const match = regex.exec(raw);
    if (!match) break;
    const value = (match[1] || match[2] || "").trim();
    if (value) values.push(value);
  }
  return values;
}

function parseFallbackEnv() {
  const raw = process.env.PRIMER_AI_AGENT_FALLBACK_FILES || "";
  if (!raw.trim()) return [];
  return raw
    .split(/[\\s,]+/)
    .map((value) => value.trim())
    .filter(Boolean);
}

function parseFallbackFromCodexConfig(content) {
  const keys = [
    "project_doc_fallback_files",
    "instructions_fallback_files",
    "fallback_instruction_files",
    "instruction_fallback_files"
  ];
  const values = [];
  for (const key of keys) {
    const pattern = new RegExp(\`\${key}\\\\s*=\\\\s*\\\\[([^\\\\]]*)\\\\]\`, "gi");
    for (;;) {
      const match = pattern.exec(content);
      if (!match?.[1]) break;
      values.push(...parseQuotedList(match[1]));
    }
  }
  return values;
}

function parseFallbackFiles() {
  const files = [];
  files.push(...parseFallbackEnv());

  const candidateConfigPaths = [
    join(ROOT, ".codex", "config.toml"),
    join(homedir(), ".codex", "config.toml")
  ];

  for (const configPath of candidateConfigPaths) {
    if (!existsSync(configPath)) continue;
    const content = readFileSync(configPath, "utf8");
    files.push(...parseFallbackFromCodexConfig(content));
  }

  const seen = new Set();
  const normalized = [];
  for (const file of files) {
    const onlyName = basename(file);
    if (!onlyName.endsWith(".md")) continue;
    if (seen.has(onlyName)) continue;
    seen.add(onlyName);
    normalized.push(onlyName);
  }
  return normalized;
}

const CANDIDATE_FILES = [...DEFAULT_PRIMARY_FILES];
for (const file of parseFallbackFiles()) {
  if (!CANDIDATE_FILES.includes(file)) CANDIDATE_FILES.push(file);
}

function pickInstructionFile(dir) {
  for (const name of CANDIDATE_FILES) {
    const path = join(dir, name);
    if (existsSync(path)) return path;
  }
  return null;
}

function walk(dir) {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (IGNORED.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walk(full));
    else files.push(full);
  }
  return files;
}

function listInstructionFiles() {
  const fileSet = new Set(CANDIDATE_FILES);
  return walk(ROOT)
    .filter((file) => fileSet.has(basename(file)))
    .map((file) => resolve(file));
}

function chainBytesForDir(targetDir) {
  const targetAbs = resolve(targetDir);
  const rel = relative(ROOT, targetAbs);
  const segments = rel ? rel.split("/").filter(Boolean) : [];
  const chainFiles = [];
  for (let i = 0; i <= segments.length; i += 1) {
    const dir = join(ROOT, ...segments.slice(0, i));
    const selected = pickInstructionFile(dir);
    if (selected) chainFiles.push(selected);
  }
  const bytes = chainFiles.reduce((sum, file) => sum + Buffer.byteLength(readFileSync(file, "utf8"), "utf8"), 0);
  return { bytes, chainFiles };
}

const errors = [];
const warnings = [];

const rootAgentsPath = join(ROOT, "AGENTS.md");
if (!existsSync(rootAgentsPath)) {
  errors.push("Missing root AGENTS.md");
} else {
  const rootLines = readFileSync(rootAgentsPath, "utf8").split("\\n").length;
  if (rootLines < ROOT_MIN || rootLines > ROOT_MAX) {
    errors.push(\`Root AGENTS.md line count is \${rootLines}; expected \${ROOT_MIN}-\${ROOT_MAX}.\`);
  }
}

const requiredDocs = ["docs/index.md", "docs/architecture.md", "docs/api-contracts.md", "docs/conventions.md", "docs/maintenance.md", "docs/skills.md"];
for (const file of requiredDocs) {
  if (!existsSync(join(ROOT, file))) errors.push(\`Missing required doc: \${file}\`);
}

const claudePath = join(ROOT, "CLAUDE.md");
if (existsSync(claudePath)) {
  const content = readFileSync(claudePath, "utf8");
  if (!content.includes("@AGENTS.md")) errors.push("CLAUDE.md must import @AGENTS.md.");
}

const fragmentDir = join(ROOT, ".agents/fragments/root");
if (existsSync(fragmentDir)) {
  const fragmentFiles = readdirSync(fragmentDir).filter((name) => name.endsWith(".md")).sort();
  if (!fragmentFiles.length) {
    errors.push("No fragment files found under .agents/fragments/root.");
  } else if (existsSync(rootAgentsPath)) {
    const composed = fragmentFiles
      .map((file) => readFileSync(join(fragmentDir, file), "utf8").trimEnd())
      .join("\\n\\n")
      .trimEnd() + "\\n";
    const current = readFileSync(rootAgentsPath, "utf8");
    if (composed !== current) {
      errors.push("AGENTS.md is not synchronized with fragments. Run node scripts/compose-agents.mjs --write");
    }
  }
}

const instructionFiles = listInstructionFiles();
for (const file of instructionFiles) {
  const dir = resolve(file, "..");
  const { bytes, chainFiles } = chainBytesForDir(dir);
  if (bytes > MAX_CHAIN_BYTES) {
    errors.push(
      \`Instruction chain exceeds 32 KiB for \${relative(ROOT, dir) || "."}: \${bytes} bytes. Chain: \${chainFiles.map((path) => relative(ROOT, path)).join(" -> ")}\`
    );
  } else if (bytes > MAX_CHAIN_BYTES * 0.8) {
    warnings.push(\`Instruction chain near budget for \${relative(ROOT, dir) || "."}: \${bytes} bytes.\`);
  }
}

if (warnings.length) {
  for (const warning of warnings) console.warn(\`[warn] \${warning}\`);
}

if (errors.length) {
  for (const error of errors) console.error(\`[error] \${error}\`);
  process.exit(1);
}

console.log(\`Agent context checks passed. Candidate instruction files: \${CANDIDATE_FILES.join(", ")}\`);
`);
}

export function buildCheckDocFreshnessScript(): string {
  return normalizeMarkdown(`import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = process.cwd();
const DOCS_DIR = resolve(ROOT, "docs");
const MAX_AGE_DAYS = Number(process.env.DOC_MAX_AGE_DAYS || 90);
const NOW = new Date();
const DATE_PATTERN = /Last reviewed:\\s*(\\d{4}-\\d{2}-\\d{2})/i;

function walk(dir) {
  const entries = readdirSync(dir, { withFileTypes: true });
  const out = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.name.endsWith(".md")) out.push(full);
  }
  return out;
}

const docs = walk(DOCS_DIR);
const stale = [];
const missing = [];

for (const file of docs) {
  const content = readFileSync(file, "utf8");
  const match = content.match(DATE_PATTERN);
  if (!match?.[1]) {
    missing.push(file);
    continue;
  }
  const reviewedDate = new Date(\`\${match[1]}T00:00:00Z\`);
  const ageDays = Math.floor((NOW.getTime() - reviewedDate.getTime()) / 86400000);
  if (Number.isNaN(ageDays) || ageDays > MAX_AGE_DAYS) {
    stale.push({ file, ageDays });
  }
}

if (missing.length) {
  for (const file of missing) console.error(\`[error] Missing 'Last reviewed' in \${file}\`);
}
if (stale.length) {
  for (const entry of stale) console.error(\`[error] Stale doc (\${entry.ageDays} days): \${entry.file}\`);
}

if (missing.length || stale.length) {
  process.exit(1);
}

console.log(\`Doc freshness checks passed (\${docs.length} files).\`);
`);
}

export function buildCheckSkillsScript(): string {
  return normalizeMarkdown(`import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = process.cwd();
const SKILLS_DIR = resolve(ROOT, "skills");
const REQUIRED_FILES = ["SKILL.md", "tests/trigger-cases.md"];

if (!existsSync(SKILLS_DIR)) {
  console.error("Missing skills directory.");
  process.exit(1);
}

const skillDirs = readdirSync(SKILLS_DIR, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
  .map((entry) => entry.name);

const errors = [];
const warnings = [];

function countBullets(section) {
  return section
    .split("\\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- ")).length;
}

for (const skill of skillDirs) {
  const skillPath = join(SKILLS_DIR, skill);
  for (const required of REQUIRED_FILES) {
    const full = join(skillPath, required);
    if (!existsSync(full)) errors.push(\`Skill '\${skill}' missing \${required}\`);
  }

  const skillFile = join(skillPath, "SKILL.md");
  const triggerFile = join(skillPath, "tests/trigger-cases.md");

  if (existsSync(skillFile)) {
    const content = readFileSync(skillFile, "utf8");
    if (!/##\\s*Trigger/i.test(content)) {
      errors.push(\`Skill '\${skill}' SKILL.md must contain a '## Trigger' section.\`);
    }
    if (!/##\\s*Workflow/i.test(content)) {
      errors.push(\`Skill '\${skill}' SKILL.md must contain a '## Workflow' section.\`);
    }
    if (!/\\n\\s*1\\.\\s+/m.test(content)) {
      warnings.push(\`Skill '\${skill}' workflow has no numbered steps.\`);
    }
    const lineCount = content.split("\\n").length;
    if (lineCount > 220) {
      warnings.push(\`Skill '\${skill}' is long (\${lineCount} lines). Consider splitting for progressive disclosure.\`);
    }
  }

  if (existsSync(triggerFile)) {
    const content = readFileSync(triggerFile, "utf8");
    const triggerMatch = content.match(/##\\s*Should trigger([\\s\\S]*?)(##\\s*Should NOT trigger|$)/i);
    const notTriggerMatch = content.match(/##\\s*Should NOT trigger([\\s\\S]*)$/i);
    if (!triggerMatch) {
      errors.push(\`Skill '\${skill}' tests/trigger-cases.md missing '## Should trigger' section.\`);
    }
    if (!notTriggerMatch) {
      errors.push(\`Skill '\${skill}' tests/trigger-cases.md missing '## Should NOT trigger' section.\`);
    }
    if (triggerMatch && countBullets(triggerMatch[1] || "") < 2) {
      errors.push(\`Skill '\${skill}' should include at least 2 positive trigger examples.\`);
    }
    if (notTriggerMatch && countBullets(notTriggerMatch[1] || "") < 2) {
      errors.push(\`Skill '\${skill}' should include at least 2 negative trigger examples.\`);
    }
  }
}

if (!skillDirs.length) {
  errors.push("No skill directories found. Add at least one curated skill.");
}

if (warnings.length) {
  for (const warning of warnings) console.warn(\`[warn] \${warning}\`);
}

if (errors.length) {
  for (const error of errors) console.error(\`[error] \${error}\`);
  process.exit(1);
}

console.log(\`Skill checks passed (\${skillDirs.length} skills).\`);
`);
}

export function buildDocGardenScript(): string {
  return normalizeMarkdown(`import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve, relative } from "node:path";

const ROOT = process.cwd();
const DOCS_DIR = resolve(ROOT, "docs");
const apply = process.argv.includes("--apply");
const today = new Date().toISOString().slice(0, 10);
const reviewedPattern = /Last reviewed:\\s*(\\d{4}-\\d{2}-\\d{2})/i;
const startMarker = "<!-- primer-ai:docs-index:start -->";
const endMarker = "<!-- primer-ai:docs-index:end -->";

function walk(dir) {
  const entries = readdirSync(dir, { withFileTypes: true });
  const out = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.name.endsWith(".md")) out.push(full);
  }
  return out;
}

function ensureReviewedTag(content) {
  if (reviewedPattern.test(content)) return content;
  const lines = content.split("\\n");
  if (lines[0]?.startsWith("# ")) {
    lines.splice(1, 0, "", \`- Last reviewed: \${today}\`);
    return lines.join("\\n");
  }
  return \`- Last reviewed: \${today}\\n\\n\${content}\`;
}

const docs = walk(DOCS_DIR).map((path) => relative(DOCS_DIR, path).replaceAll("\\\\", "/")).sort();

let changed = false;
for (const relPath of docs) {
  const absolute = join(DOCS_DIR, relPath);
  const before = readFileSync(absolute, "utf8");
  const after = ensureReviewedTag(before);
  if (after !== before) {
    changed = true;
    if (apply) writeFileSync(absolute, after.trimEnd() + "\\n", "utf8");
  }
}

const indexPath = join(DOCS_DIR, "index.md");
const indexBefore = readFileSync(indexPath, "utf8");
const inventory = docs.filter((path) => path !== "index.md").map((path) => \`- \\\`\${path}\\\`\`).join("\\n");
let indexAfter = indexBefore;

if (indexBefore.includes(startMarker) && indexBefore.includes(endMarker)) {
  indexAfter = indexBefore.replace(new RegExp(\`\${startMarker}[\\\\s\\\\S]*?\${endMarker}\`), \`\${startMarker}\\n\${inventory}\\n\${endMarker}\`);
} else {
  indexAfter = indexBefore.trimEnd() + \`\\n\\n## Document Inventory\\n\${startMarker}\\n\${inventory}\\n\${endMarker}\\n\`;
}

if (indexAfter !== indexBefore) {
  changed = true;
  if (apply) writeFileSync(indexPath, indexAfter.trimEnd() + "\\n", "utf8");
}

if (!apply) {
  if (changed) {
    console.error("Doc-garden check found drift. Run: node scripts/doc-garden.mjs --apply");
    process.exit(1);
  }
  console.log("Doc-garden check passed.");
  process.exit(0);
}

if (changed) {
  console.log("Doc-garden applied updates.");
} else {
  console.log("Doc-garden found nothing to update.");
}
`);
}
