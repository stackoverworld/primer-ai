import { describe, expect, it } from "vitest";

import { buildRefactorPolicy, inferVerificationCommands } from "../src/core/refactor-policy.js";

describe("refactor policy", () => {
  it("always includes qa-refactoring baseline skill", () => {
    const policy = buildRefactorPolicy("TypeScript + Node.js", "api-service");
    expect(policy.baselineSkill.name).toBe("qa-refactoring");
    expect(policy.baselineSkill.installCommand).toContain("--skill qa-refactoring");
  });

  it("applies Rust add-on skill and Rust verification loop", () => {
    const policy = buildRefactorPolicy("Rust + Axum", "api-service");
    const commands = inferVerificationCommands("Rust + Axum", "api-service");

    expect(policy.stackSkills.map((skill) => skill.name)).toContain("rust-refactor-helper");
    expect(commands).toEqual(["cargo fmt", "cargo clippy --fix", "cargo test"]);
  });

  it("applies React/Next and Node backend add-ons for Node API services", () => {
    const policy = buildRefactorPolicy("React + TypeScript + Node.js + Express", "api-service");
    const skillNames = policy.stackSkills.map((skill) => skill.name);

    expect(skillNames).toContain("vercel-react-best-practices");
    expect(skillNames).toContain("nodejs-backend-patterns");
  });

  it("adds iOS guidance for Swift stacks", () => {
    const policy = buildRefactorPolicy("Swift + iOS + Xcode", "web-app");
    const skillNames = policy.stackSkills.map((skill) => skill.name);

    expect(skillNames).toContain("ios-development");
    expect(policy.notes.some((note) => note.includes("swift-format"))).toBe(true);
    expect(inferVerificationCommands("Swift + iOS + Xcode", "web-app")).toEqual([
      "swift format lint .",
      "swift test"
    ]);
  });

  it("uses typecheck-first loop for TypeScript node backend stacks", () => {
    expect(inferVerificationCommands("TypeScript + Node.js + Express", "api-service")).toEqual([
      "npx tsc --noEmit",
      "npm run test",
      "npm run build"
    ]);
  });

  it("infers Node backend policy for Fastify stacks without explicit Node.js token", () => {
    const policy = buildRefactorPolicy("TypeScript + Fastify", "api-service");
    const skillNames = policy.stackSkills.map((skill) => skill.name);

    expect(skillNames).toContain("nodejs-backend-patterns");
    expect(inferVerificationCommands("TypeScript + Fastify", "api-service")).toEqual([
      "npx tsc --noEmit",
      "npm run test",
      "npm run build"
    ]);
  });

  it("uses Vite + Vitest loop for TypeScript Vite stacks", () => {
    expect(inferVerificationCommands("React + TypeScript + Vite", "web-app")).toEqual([
      "npx tsc --noEmit",
      "vitest run",
      "vite build"
    ]);
  });

  it("uses lightweight verification loop for Next.js TypeScript stacks", () => {
    expect(inferVerificationCommands("Next.js + TypeScript", "web-app")).toEqual([
      "npx tsc --noEmit",
      "npm run lint",
      "npm run test"
    ]);
  });
});
