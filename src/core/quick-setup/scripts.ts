import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { AiQuickSetupPlan, QuickSetupPreset } from "../types.js";

function buildCheckScript(scripts: Record<string, string>): string {
  const commands = [
    "node scripts/check-agent-context.mjs",
    "node scripts/check-doc-freshness.mjs",
    "node scripts/check-skills.mjs",
    scripts.lint ? "npm run lint" : null,
    scripts.test ? "npm run test" : null,
    scripts.build ? "npm run build" : null
  ].filter((command): command is string => Boolean(command && command.trim().length > 0));

  return Array.from(new Set(commands)).join(" && ");
}

export function upsertScripts(cwd: string, preset: QuickSetupPreset, plan: AiQuickSetupPlan): void {
  const packageJsonPath = join(cwd, "package.json");
  if (!existsSync(packageJsonPath)) return;

  const parsed = JSON.parse(readFileSync(packageJsonPath, "utf8")) as Record<string, unknown>;
  const currentScripts = (parsed.scripts as Record<string, string> | undefined) ?? {};
  const scripts: Record<string, string> = { ...currentScripts };

  const setIfMissing = (name: string, value: string): void => {
    if (!scripts[name]) scripts[name] = value;
  };

  if (preset === "nextjs-ts") {
    setIfMissing("dev", "next dev");
    setIfMissing("build", "next build");
    setIfMissing("start", "next start");
    if (plan.includeLinting) setIfMissing("lint", "eslint .");
    if (plan.includeTesting) setIfMissing("test", "vitest run");
  } else if (preset === "vite-react-ts") {
    setIfMissing("dev", "vite");
    setIfMissing("build", "vite build");
    setIfMissing("preview", "vite preview");
    if (plan.includeLinting) setIfMissing("lint", "eslint .");
    if (plan.includeTesting) setIfMissing("test", "vitest run");
  } else if (preset === "swift-spm") {
    setIfMissing("build", "swift build");
    if (plan.includeLinting) setIfMissing("lint", "swift format lint .");
    if (plan.includeFormatting) setIfMissing("format", "swift format . --in-place");
    if (plan.includeTesting) setIfMissing("test", "swift test");
  } else {
    setIfMissing("dev", "tsx src/main.ts");
    setIfMissing("build", "tsc -p tsconfig.json");
    setIfMissing("start", "node dist/main.js");
    setIfMissing("typecheck", "tsc --noEmit");
    if (plan.includeLinting) setIfMissing("lint", "eslint .");
    if (plan.includeTesting) setIfMissing("test", "vitest run");
  }

  setIfMissing("check", buildCheckScript(scripts));

  parsed.scripts = scripts;
  writeFileSync(packageJsonPath, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
}
