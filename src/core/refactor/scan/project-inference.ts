import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import type { ProjectShape } from "../../types.js";
import type { RefactorFileInsight } from "../contracts.js";
import type { PackageSignals } from "./types.js";

export function readPackageSignals(root: string): PackageSignals {
  const packageJsonPath = join(root, "package.json");
  if (!existsSync(packageJsonPath)) {
    return {
      hasPackageJson: false,
      hasTypescript: existsSync(join(root, "tsconfig.json")),
      hasBin: false,
      dependencies: new Set<string>()
    };
  }

  try {
    const parsed = JSON.parse(readFileSync(packageJsonPath, "utf8")) as Record<string, unknown>;
    const fields = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"] as const;
    const dependencies = new Set<string>();
    for (const field of fields) {
      const section = parsed[field];
      if (!section || typeof section !== "object") continue;
      for (const name of Object.keys(section as Record<string, unknown>)) {
        dependencies.add(name.toLowerCase());
      }
    }

    return {
      hasPackageJson: true,
      hasTypescript: dependencies.has("typescript") || existsSync(join(root, "tsconfig.json")),
      hasBin: Boolean(parsed.bin && typeof parsed.bin === "object"),
      dependencies
    };
  } catch {
    return {
      hasPackageJson: true,
      hasTypescript: existsSync(join(root, "tsconfig.json")),
      hasBin: false,
      dependencies: new Set<string>()
    };
  }
}

export function inferTechStack(root: string, packageSignals: PackageSignals, sourceFiles: RefactorFileInsight[]): string {
  const dependencies = packageSignals.dependencies;

  if (dependencies.has("next")) {
    return packageSignals.hasTypescript ? "Next.js + TypeScript" : "Next.js";
  }
  if (dependencies.has("react") && dependencies.has("vite")) {
    return packageSignals.hasTypescript ? "React + TypeScript + Vite" : "React + Vite";
  }
  if (dependencies.has("express")) {
    return packageSignals.hasTypescript ? "TypeScript + Node.js + Express" : "Node.js + Express";
  }
  if (dependencies.has("fastify")) {
    return packageSignals.hasTypescript ? "TypeScript + Node.js + Fastify" : "Node.js + Fastify";
  }
  if (existsSync(join(root, "Cargo.toml"))) {
    return "Rust";
  }
  if (existsSync(join(root, "go.mod"))) {
    return "Go";
  }
  if (existsSync(join(root, "pyproject.toml")) || existsSync(join(root, "requirements.txt"))) {
    return "Python";
  }
  if (existsSync(join(root, "Package.swift")) || existsSync(join(root, ".xcodeproj"))) {
    return "Swift";
  }
  if (packageSignals.hasPackageJson) {
    return packageSignals.hasTypescript ? "TypeScript + Node.js" : "Node.js";
  }

  const hasTs = sourceFiles.some((file) => file.path.endsWith(".ts") || file.path.endsWith(".tsx"));
  if (hasTs) return "TypeScript";
  const hasJs = sourceFiles.some((file) => file.path.endsWith(".js") || file.path.endsWith(".jsx"));
  if (hasJs) return "JavaScript";
  return "custom";
}

export function inferProjectShape(root: string, techStack: string, packageSignals: PackageSignals): ProjectShape {
  if (existsSync(join(root, "apps")) && existsSync(join(root, "packages"))) {
    return "monorepo";
  }

  const stack = techStack.toLowerCase();
  if (stack.includes("next") || stack.includes("vite")) return "web-app";
  if (stack.includes("express") || stack.includes("fastify")) return "api-service";
  if (packageSignals.hasBin || existsSync(join(root, "src", "cli.ts")) || existsSync(join(root, "src", "commands"))) {
    return "cli-tool";
  }
  if (packageSignals.hasPackageJson) {
    return "library";
  }
  return "custom";
}
