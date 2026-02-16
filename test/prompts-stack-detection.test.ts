import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { collectInitInput } from "../src/core/prompts.js";

function createFixture(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  writeFileSync(join(dir, "README.md"), "existing project");
  return dir;
}

describe("existing-project stack detection", () => {
  it("detects Next.js + TypeScript from package.json", async () => {
    const targetPath = createFixture("primer-ai-next-");
    writeFileSync(
      join(targetPath, "package.json"),
      JSON.stringify(
        {
          name: "web-app",
          private: true,
          dependencies: {
            next: "15.0.0",
            react: "19.0.0",
            "react-dom": "19.0.0"
          },
          devDependencies: {
            typescript: "5.0.0"
          }
        },
        null,
        2
      )
    );
    writeFileSync(join(targetPath, "tsconfig.json"), "{}");

    try {
      const input = await collectInitInput(targetPath, { yes: true });
      expect(input.existingProject).toBe(true);
      expect(input.techStack).toBe("Next.js + TypeScript");
    } finally {
      rmSync(targetPath, { recursive: true, force: true });
    }
  });

  it("detects Python + Django from requirements files", async () => {
    const targetPath = createFixture("primer-ai-django-");
    writeFileSync(join(targetPath, "requirements.txt"), "Django==5.0.0\npsycopg2==2.9.0\n");

    try {
      const input = await collectInitInput(targetPath, { yes: true });
      expect(input.existingProject).toBe(true);
      expect(input.techStack).toBe("Python + Django");
    } finally {
      rmSync(targetPath, { recursive: true, force: true });
    }
  });

  it("respects explicit --stack over auto-detection", async () => {
    const targetPath = createFixture("primer-ai-stack-override-");
    writeFileSync(
      join(targetPath, "package.json"),
      JSON.stringify({ dependencies: { next: "15.0.0" } }, null, 2)
    );

    try {
      const input = await collectInitInput(targetPath, {
        yes: true,
        stack: "Rust + Axum"
      });
      expect(input.techStack).toBe("Rust + Axum");
    } finally {
      rmSync(targetPath, { recursive: true, force: true });
    }
  });
});
