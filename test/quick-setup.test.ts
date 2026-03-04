import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

  it("detects Swift + SwiftPM preset for supported shapes", () => {
    const support = assessQuickSetupSupport("Swift + SPM", "cli-tool");
    expect(support.supported).toBe(true);
    expect(support.preset).toBe("swift-spm");
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

  it("builds swift-spm commands for library bootstrap", () => {
    const plan: AiQuickSetupPlan = {
      includeTesting: true,
      includeLinting: true,
      includeFormatting: false,
      notes: ["Use Swift Package Manager baseline."]
    };

    const commands = __internal.buildCommandsForPreset("swift-spm", plan, false, false, {
      hasPackageSwift: false,
      projectShape: "library"
    });
    expect(commands).toEqual([
      {
        command: "swift",
        args: ["package", "init", "--type", "library"],
        label: "Initialize Swift package (library)"
      }
    ]);
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

  it("skips quick setup prompt for existing swift-spm project already configured", () => {
    const dir = mkdtempSync(join(tmpdir(), "primer-ai-swift-setup-ready-"));
    writeFileSync(join(dir, "Package.swift"), "// swift-tools-version: 5.10\n");
    mkdirSync(join(dir, "Sources"), { recursive: true });
    writeFileSync(join(dir, "README.md"), "swift project");

    try {
      const decision = decideQuickSetupPrompt(dir, "Swift + SPM", "library", true);
      expect(decision.offer).toBe(false);
      expect(decision.reason.toLowerCase()).toContain("already");
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
      expect(parsed.scripts?.check).toBe(
        "node scripts/check-agent-context.mjs && node scripts/check-doc-freshness.mjs && node scripts/check-skills.mjs && npm run lint && npm run build"
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("preserves existing check script while still adding missing baseline scripts", () => {
    const dir = mkdtempSync(join(tmpdir(), "primer-ai-next-check-preserve-"));
    writeFileSync(
      join(dir, "package.json"),
      JSON.stringify(
        {
          name: "next-project",
          scripts: {
            check: "npm run lint && npm run test"
          }
        },
        null,
        2
      )
    );

    try {
      __internal.upsertScripts(dir, "nextjs-ts", {
        includeTesting: true,
        includeLinting: true,
        includeFormatting: false,
        notes: ["baseline"]
      });

      const parsed = JSON.parse(
        readFileSync(join(dir, "package.json"), "utf8")
      ) as { scripts?: Record<string, string> };
      expect(parsed.scripts?.check).toBe("npm run lint && npm run test");
      expect(parsed.scripts?.dev).toBe("next dev");
      expect(parsed.scripts?.build).toBe("next build");
      expect(parsed.scripts?.test).toBe("vitest run");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
