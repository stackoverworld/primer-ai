import type { ProjectShape, QuickSetupPreset } from "../types.js";
import { isPresetAlreadyConfigured } from "./manifest.js";

export interface QuickSetupSupport {
  supported: boolean;
  preset?: QuickSetupPreset;
  label?: string;
  reason: string;
}

export interface QuickSetupPromptDecision {
  offer: boolean;
  support: QuickSetupSupport;
  reason: string;
}

function includesAny(haystack: string, needles: string[]): boolean {
  return needles.some((needle) => haystack.includes(needle));
}

export function assessQuickSetupSupport(techStack: string, projectShape: ProjectShape): QuickSetupSupport {
  const stack = techStack.toLowerCase();
  const isWeb = projectShape === "web-app";
  const hasTypescript = stack.includes("typescript") || stack.includes("ts");

  if (isWeb && hasTypescript && stack.includes("next")) {
    return {
      supported: true,
      preset: "nextjs-ts",
      label: "Next.js + TypeScript",
      reason: "Supported web preset."
    };
  }

  if (isWeb && hasTypescript && stack.includes("react") && stack.includes("vite")) {
    return {
      supported: true,
      preset: "vite-react-ts",
      label: "React + TypeScript + Vite",
      reason: "Supported web preset."
    };
  }

  if (
    hasTypescript &&
    includesAny(stack, ["node", "node.js"]) &&
    ["api-service", "cli-tool", "library", "custom"].includes(projectShape)
  ) {
    return {
      supported: true,
      preset: "node-ts",
      label: "TypeScript + Node.js",
      reason: "Supported runtime preset."
    };
  }

  if (includesAny(stack, ["swift", "xcode", "ios"])) {
    return {
      supported: false,
      reason: "Swift/iOS flow requires Xcode project generation, which is outside quick CLI setup scope."
    };
  }

  if (projectShape === "monorepo") {
    return {
      supported: false,
      reason: "Monorepo quick setup is not enabled yet. Use per-package setup after scaffold."
    };
  }

  return {
    supported: false,
    reason: "No safe quick setup preset for this stack yet."
  };
}

export function decideQuickSetupPrompt(
  targetDir: string,
  techStack: string,
  projectShape: ProjectShape,
  existingProject: boolean
): QuickSetupPromptDecision {
  const support = assessQuickSetupSupport(techStack, projectShape);
  if (!support.supported || !support.preset) {
    return {
      offer: false,
      support,
      reason: support.reason
    };
  }

  if (!existingProject) {
    return {
      offer: true,
      support,
      reason: support.reason
    };
  }

  const alreadyConfigured = isPresetAlreadyConfigured(targetDir, support.preset);
  if (alreadyConfigured) {
    return {
      offer: false,
      support,
      reason: "Existing project already has baseline runtime/tooling setup."
    };
  }

  return {
    offer: true,
    support,
    reason: "Existing project appears partially configured; quick setup may fill missing baseline pieces."
  };
}
