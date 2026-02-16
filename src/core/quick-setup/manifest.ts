import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import type { QuickSetupPreset } from "../types.js";

interface PackageManifestSnapshot {
  dependencies: Set<string>;
  scripts: Set<string>;
  hasPackageJson: boolean;
}

function readPackageManifest(targetDir: string): PackageManifestSnapshot {
  const packageJsonPath = join(targetDir, "package.json");
  if (!existsSync(packageJsonPath)) {
    return {
      dependencies: new Set<string>(),
      scripts: new Set<string>(),
      hasPackageJson: false
    };
  }

  try {
    const parsed = JSON.parse(readFileSync(packageJsonPath, "utf8")) as Record<string, unknown>;
    const dependencyFields = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"] as const;
    const dependencies = new Set<string>();
    for (const field of dependencyFields) {
      const section = parsed[field];
      if (!section || typeof section !== "object") continue;
      for (const dependencyName of Object.keys(section as Record<string, unknown>)) {
        dependencies.add(dependencyName.toLowerCase());
      }
    }

    const scripts = new Set<string>();
    const scriptsObj = parsed.scripts;
    if (scriptsObj && typeof scriptsObj === "object") {
      for (const scriptName of Object.keys(scriptsObj as Record<string, unknown>)) {
        scripts.add(scriptName);
      }
    }

    return {
      dependencies,
      scripts,
      hasPackageJson: true
    };
  } catch {
    return {
      dependencies: new Set<string>(),
      scripts: new Set<string>(),
      hasPackageJson: true
    };
  }
}

function hasAllDependencies(dependencies: Set<string>, required: string[]): boolean {
  return required.every((dependencyName) => dependencies.has(dependencyName));
}

function hasAllScripts(scripts: Set<string>, required: string[]): boolean {
  return required.every((scriptName) => scripts.has(scriptName));
}

export function isPresetAlreadyConfigured(targetDir: string, preset: QuickSetupPreset): boolean {
  const manifest = readPackageManifest(targetDir);
  const hasTsconfig = existsSync(join(targetDir, "tsconfig.json"));
  if (!manifest.hasPackageJson) return false;

  if (preset === "nextjs-ts") {
    return (
      hasTsconfig &&
      hasAllDependencies(manifest.dependencies, ["next", "react", "react-dom", "typescript"]) &&
      hasAllScripts(manifest.scripts, ["dev", "build"])
    );
  }

  if (preset === "vite-react-ts") {
    return (
      hasTsconfig &&
      hasAllDependencies(manifest.dependencies, ["vite", "react", "react-dom", "typescript"]) &&
      hasAllScripts(manifest.scripts, ["dev", "build"])
    );
  }

  return (
    hasTsconfig &&
    hasAllDependencies(manifest.dependencies, ["typescript"]) &&
    (manifest.scripts.has("build") || manifest.scripts.has("typecheck") || manifest.scripts.has("dev"))
  );
}
