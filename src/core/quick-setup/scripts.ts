import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { AiQuickSetupPlan, QuickSetupPreset } from "../types.js";

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
  } else {
    setIfMissing("dev", "tsx src/main.ts");
    setIfMissing("build", "tsc -p tsconfig.json");
    setIfMissing("start", "node dist/main.js");
    setIfMissing("typecheck", "tsc --noEmit");
    if (plan.includeLinting) setIfMissing("lint", "eslint .");
    if (plan.includeTesting) setIfMissing("test", "vitest run");
  }

  parsed.scripts = scripts;
  writeFileSync(packageJsonPath, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
}
