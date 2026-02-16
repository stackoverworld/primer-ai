import { dirname, join } from "node:path";

import type { StackDetection } from "../constants.js";
import { findDirectories, findFiles, safeReadFile } from "./fs-walk.js";

export type StackDetector = (targetPath: string) => Promise<StackDetection | null>;

function collectDependencyNames(manifest: Record<string, unknown>): Set<string> {
  const fields = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"] as const;
  const names = new Set<string>();

  for (const field of fields) {
    const section = manifest[field];
    if (!section || typeof section !== "object") continue;
    for (const name of Object.keys(section as Record<string, unknown>)) {
      names.add(name.toLowerCase());
    }
  }

  return names;
}

async function detectNodeStack(targetPath: string): Promise<StackDetection | null> {
  const packageJsonFiles = await findFiles(targetPath, (name) => name === "package.json", 3, 24);
  if (packageJsonFiles.length === 0) return null;

  const dependencies = new Set<string>();
  let hasTypescript = false;

  for (const packageJsonPath of packageJsonFiles) {
    const raw = await safeReadFile(packageJsonPath);
    if (!raw) continue;

    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const names = collectDependencyNames(parsed);
      for (const name of names) dependencies.add(name);
    } catch {
      continue;
    }

    const manifestDir = dirname(packageJsonPath);
    const tsconfig = await safeReadFile(join(manifestDir, "tsconfig.json"));
    if (tsconfig !== null) hasTypescript = true;
  }

  if (dependencies.has("next")) {
    return {
      stack: "Next.js + TypeScript",
      source: "package.json dependencies"
    };
  }

  if (dependencies.has("react") && dependencies.has("vite")) {
    return {
      stack: "React + TypeScript + Vite",
      source: "package.json dependencies"
    };
  }

  if (dependencies.has("typescript") || hasTypescript || dependencies.size > 0) {
    return {
      stack: "TypeScript + Node.js",
      source: "package.json/tsconfig.json"
    };
  }

  return null;
}

async function detectPythonStack(targetPath: string): Promise<StackDetection | null> {
  const pythonFiles = await findFiles(
    targetPath,
    (name) =>
      name === "pyproject.toml" ||
      name === "requirements.txt" ||
      name === "requirements-dev.txt" ||
      name === "Pipfile",
    3,
    24
  );

  if (pythonFiles.length === 0) return null;

  const content = (
    await Promise.all(pythonFiles.map((filePath) => safeReadFile(filePath)))
  )
    .filter((value): value is string => Boolean(value))
    .join("\n")
    .toLowerCase();

  if (content.includes("fastapi")) {
    return { stack: "Python + FastAPI", source: "Python project files" };
  }

  if (content.includes("django")) {
    return { stack: "Python + Django", source: "Python project files" };
  }

  return { stack: "Python", source: "Python project files" };
}

async function detectGoStack(targetPath: string): Promise<StackDetection | null> {
  const goModules = await findFiles(targetPath, (name) => name === "go.mod", 3, 8);
  if (goModules.length === 0) return null;

  const combined = (
    await Promise.all(goModules.map((filePath) => safeReadFile(filePath)))
  )
    .filter((value): value is string => Boolean(value))
    .join("\n")
    .toLowerCase();

  if (combined.includes("gin-gonic/gin")) {
    return { stack: "Go + Gin", source: "go.mod" };
  }

  return { stack: "Go", source: "go.mod" };
}

async function detectRustStack(targetPath: string): Promise<StackDetection | null> {
  const cargoFiles = await findFiles(targetPath, (name) => name === "Cargo.toml", 3, 12);
  if (cargoFiles.length === 0) return null;

  const combined = (
    await Promise.all(cargoFiles.map((filePath) => safeReadFile(filePath)))
  )
    .filter((value): value is string => Boolean(value))
    .join("\n")
    .toLowerCase();

  if (combined.includes("axum")) {
    return { stack: "Rust + Axum", source: "Cargo.toml" };
  }

  return { stack: "Rust", source: "Cargo.toml" };
}

async function detectJavaStack(targetPath: string): Promise<StackDetection | null> {
  const javaFiles = await findFiles(
    targetPath,
    (name) => name === "pom.xml" || name === "build.gradle" || name === "build.gradle.kts",
    3,
    12
  );
  if (javaFiles.length === 0) return null;

  const combined = (
    await Promise.all(javaFiles.map((filePath) => safeReadFile(filePath)))
  )
    .filter((value): value is string => Boolean(value))
    .join("\n")
    .toLowerCase();

  if (combined.includes("spring-boot")) {
    return { stack: "Java + Spring Boot", source: "Java build files" };
  }

  return { stack: "Java", source: "Java build files" };
}

async function detectDotnetStack(targetPath: string): Promise<StackDetection | null> {
  const csprojFiles = await findFiles(targetPath, (name) => name.endsWith(".csproj"), 3, 16);
  if (csprojFiles.length === 0) return null;

  const combined = (
    await Promise.all(csprojFiles.map((filePath) => safeReadFile(filePath)))
  )
    .filter((value): value is string => Boolean(value))
    .join("\n")
    .toLowerCase();

  if (combined.includes("microsoft.aspnetcore")) {
    return { stack: "C# + ASP.NET Core", source: ".csproj files" };
  }

  return { stack: "C#", source: ".csproj files" };
}

async function detectFlutterStack(targetPath: string): Promise<StackDetection | null> {
  const pubspecFiles = await findFiles(targetPath, (name) => name === "pubspec.yaml", 3, 8);
  if (pubspecFiles.length === 0) return null;

  const combined = (
    await Promise.all(pubspecFiles.map((filePath) => safeReadFile(filePath)))
  )
    .filter((value): value is string => Boolean(value))
    .join("\n")
    .toLowerCase();

  if (combined.includes("flutter")) {
    return { stack: "Flutter + Dart", source: "pubspec.yaml" };
  }

  return { stack: "Dart", source: "pubspec.yaml" };
}

async function detectSwiftStack(targetPath: string): Promise<StackDetection | null> {
  const packageSwiftFiles = await findFiles(targetPath, (name) => name === "Package.swift", 3, 8);
  const xcodeprojDirs = await findDirectories(targetPath, (name) => name.endsWith(".xcodeproj"), 3, 8);

  if (packageSwiftFiles.length === 0 && xcodeprojDirs.length === 0) return null;
  return { stack: "Swift + iOS + Xcode", source: "Xcode/Swift project files" };
}

export const STACK_DETECTORS: readonly StackDetector[] = [
  detectNodeStack,
  detectPythonStack,
  detectGoStack,
  detectRustStack,
  detectJavaStack,
  detectDotnetStack,
  detectFlutterStack,
  detectSwiftStack
];
