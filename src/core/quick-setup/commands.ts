import type { AiQuickSetupPlan, QuickSetupPreset } from "../types.js";

export interface SetupCommand {
  command: string;
  args: string[];
  label: string;
}

export function buildCommandsForPreset(
  preset: QuickSetupPreset,
  plan: AiQuickSetupPlan,
  hasPackageJson: boolean,
  hasTsconfig: boolean
): SetupCommand[] {
  const commands: SetupCommand[] = [];

  if (!hasPackageJson) {
    commands.push({
      command: "npm",
      args: ["init", "-y"],
      label: "Initialize package.json"
    });
  }

  if (preset === "nextjs-ts") {
    commands.push({
      command: "npm",
      args: ["install", "next", "react", "react-dom"],
      label: "Install Next.js runtime dependencies"
    });
    commands.push({
      command: "npm",
      args: ["install", "-D", "typescript", "@types/node", "@types/react", "@types/react-dom"],
      label: "Install TypeScript toolchain"
    });
    if (plan.includeLinting) {
      commands.push({
        command: "npm",
        args: ["install", "-D", "eslint", "eslint-config-next"],
        label: "Install linting dependencies"
      });
    }
    if (plan.includeTesting) {
      commands.push({
        command: "npm",
        args: ["install", "-D", "vitest", "@testing-library/react", "@testing-library/jest-dom", "jsdom"],
        label: "Install test dependencies"
      });
    }
    if (plan.includeFormatting) {
      commands.push({
        command: "npm",
        args: ["install", "-D", "prettier"],
        label: "Install formatter"
      });
    }
    return commands;
  }

  if (preset === "vite-react-ts") {
    commands.push({
      command: "npm",
      args: ["install", "react", "react-dom"],
      label: "Install React runtime dependencies"
    });
    commands.push({
      command: "npm",
      args: ["install", "-D", "vite", "@vitejs/plugin-react", "typescript", "@types/node", "@types/react", "@types/react-dom"],
      label: "Install Vite + TypeScript toolchain"
    });
    if (plan.includeLinting) {
      commands.push({
        command: "npm",
        args: [
          "install",
          "-D",
          "eslint",
          "@typescript-eslint/parser",
          "@typescript-eslint/eslint-plugin",
          "eslint-plugin-react-hooks",
          "eslint-plugin-react-refresh"
        ],
        label: "Install linting dependencies"
      });
    }
    if (plan.includeTesting) {
      commands.push({
        command: "npm",
        args: ["install", "-D", "vitest", "@testing-library/react", "@testing-library/jest-dom", "jsdom"],
        label: "Install test dependencies"
      });
    }
    if (plan.includeFormatting) {
      commands.push({
        command: "npm",
        args: ["install", "-D", "prettier"],
        label: "Install formatter"
      });
    }
    return commands;
  }

  commands.push({
    command: "npm",
    args: ["install", "-D", "typescript", "tsx", "@types/node"],
    label: "Install Node + TypeScript toolchain"
  });
  if (!hasTsconfig) {
    commands.push({
      command: "npx",
      args: ["tsc", "--init"],
      label: "Initialize tsconfig.json"
    });
  }

  const runtimeProfile = plan.runtimeProfile ?? "bare";
  if (runtimeProfile === "express") {
    commands.push({
      command: "npm",
      args: ["install", "express", "zod", "dotenv"],
      label: "Install express runtime dependencies"
    });
    commands.push({
      command: "npm",
      args: ["install", "-D", "@types/express"],
      label: "Install express type definitions"
    });
  } else if (runtimeProfile === "fastify") {
    commands.push({
      command: "npm",
      args: ["install", "fastify", "zod", "dotenv"],
      label: "Install fastify runtime dependencies"
    });
  }

  if (plan.includeLinting) {
    commands.push({
      command: "npm",
      args: ["install", "-D", "eslint", "@typescript-eslint/parser", "@typescript-eslint/eslint-plugin"],
      label: "Install linting dependencies"
    });
  }
  if (plan.includeTesting) {
    commands.push({
      command: "npm",
      args: ["install", "-D", "vitest"],
      label: "Install test dependencies"
    });
  }
  if (plan.includeFormatting) {
    commands.push({
      command: "npm",
      args: ["install", "-D", "prettier"],
      label: "Install formatter"
    });
  }

  return commands;
}
