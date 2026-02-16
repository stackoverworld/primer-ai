import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = process.cwd();
const DOCS_DIR = resolve(ROOT, "docs");
const MAX_AGE_DAYS = Number(process.env.DOC_MAX_AGE_DAYS || 90);
const NOW = new Date();
const DATE_PATTERN = /Last reviewed:\s*(\d{4}-\d{2}-\d{2})/i;

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
  const reviewedDate = new Date(`${match[1]}T00:00:00Z`);
  const ageDays = Math.floor((NOW.getTime() - reviewedDate.getTime()) / 86400000);
  if (Number.isNaN(ageDays) || ageDays > MAX_AGE_DAYS) {
    stale.push({ file, ageDays });
  }
}

if (missing.length) {
  for (const file of missing) console.error(`[error] Missing 'Last reviewed' in ${file}`);
}
if (stale.length) {
  for (const entry of stale) console.error(`[error] Stale doc (${entry.ageDays} days): ${entry.file}`);
}

if (missing.length || stale.length) {
  process.exit(1);
}

console.log(`Doc freshness checks passed (${docs.length} files).`);
