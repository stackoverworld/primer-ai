import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { __internal, assessQuickSetupSupport, decideQuickSetupPrompt } from "../src/core/quick-setup.js";
import type { AiQuickSetupPlan } from "../src/core/types.js";

describe("quick setup support", () => {
  it("detects Next.js + TypeScript web preset", () => {
    const support = assessQuickSetupSupport("Next.js + TypeScript", "web-app");
    expect(support.supported).toBe(true);
    expect(support.preset).toBe("nextjs-ts");
  });

  it("blocks unsupported Swift/Xcode stack", () => {
    const support = assessQuickSetupSupport("Swift + iOS + Xcode", "web-app");
    expect(support.supported).toBe(false);
    expect(support.reason.toLowerCase()).toContain("xcode");
  });

  it("builds node-ts commands with express profile", () => {
    const plan: AiQuickSetupPlan = {
      includeTesting: true,
      includeLinting: true,
      includeFormatting: false,
      runtimeProfile: "express",
      notes: ["Use standard API stack."]
    };

    const commands = __internal.buildCommandsForPreset("node-ts", plan, false, false);
    const serialized = commands.map((step) => `${step.command} ${step.args.join(" ")}`);

    expect(serialized.some((line) => line.includes("npm init -y"))).toBe(true);
    expect(serialized.some((line) => line.includes("npm install express zod dotenv"))).toBe(true);
    expect(serialized.some((line) => line.includes("npm install -D @types/express"))).toBe(true);
    expect(serialized.some((line) => line.includes("npx tsc --init"))).toBe(true);
  });

  it("skips quick setup prompt for existing node-ts project already configured", () => {
    const dir = mkdtempSync(join(tmpdir(), "primer-ai-quick-setup-ready-"));
    writeFileSync(
      join(dir, "package.json"),
      JSON.stringify(
        {
          name: "ready-node-ts",
          scripts: {
            build: "tsc -p tsconfig.json",
            typecheck: "tsc --noEmit"
          },
          devDependencies: {
            typescript: "^5.0.0"
          }
        },
        null,
        2
      )
    );
    writeFileSync(join(dir, "tsconfig.json"), "{}");

    try {
      const decision = decideQuickSetupPrompt(dir, "TypeScript + Node.js", "api-service", true);
      expect(decision.offer).toBe(false);
      expect(decision.reason.toLowerCase()).toContain("already");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("offers quick setup prompt for existing node-ts project missing baseline setup", () => {
    const dir = mkdtempSync(join(tmpdir(), "primer-ai-quick-setup-missing-"));
    writeFileSync(join(dir, "README.md"), "existing project");

    try {
      const decision = decideQuickSetupPrompt(dir, "TypeScript + Node.js", "api-service", true);
      expect(decision.offer).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("writes eslint lint script for Next.js preset defaults", () => {
    const dir = mkdtempSync(join(tmpdir(), "primer-ai-next-lint-"));
    writeFileSync(
      join(dir, "package.json"),
      JSON.stringify(
        {
          name: "next-project",
          scripts: {}
        },
        null,
        2
      )
    );

    try {
      __internal.upsertScripts(dir, "nextjs-ts", {
        includeTesting: false,
        includeLinting: true,
        includeFormatting: false,
        notes: ["baseline"]
      });

      const parsed = JSON.parse(
        readFileSync(join(dir, "package.json"), "utf8")
      ) as { scripts?: Record<string, string> };
      expect(parsed.scripts?.lint).toBe("eslint .");
      expect(parsed.scripts?.dev).toBe("next dev");
      expect(parsed.scripts?.build).toBe("next build");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
