import type { InitInput, ProjectPlan, QuickSetupPreset } from "../types.js";

export function buildDraftPrompt(input: InitInput, plan: ProjectPlan, existingContext: string[] = []): string {
  const lines = [
    "You are generating initial architecture guidance for a freshly scaffolded software repository.",
    "Return ONLY JSON. No markdown.",
    "",
    "Project context:",
    `- Name: ${input.projectName}`,
    `- Description: ${input.description}`,
    `- Stack: ${input.techStack}`,
    `- Shape: ${input.projectShape}`,
    `- Target assistant workflow: ${input.targetAgent}`,
    "",
    "Planned directories:",
    ...plan.directories.map((dir) => `- ${dir}`),
    "",
    "Verification commands:",
    ...plan.verificationCommands.map((cmd) => `- ${cmd}`),
    "",
    "Constraints:",
    "- Keep guidance concise, concrete, and implementation-ready.",
    "- Emphasize progressive disclosure and scoped documentation.",
    "- Prefer deterministic checks over style-only prose.",
    "- Include realistic initial modules and API contracts for the described project.",
    "",
    "Output JSON schema keys:",
    "- mission: string",
    "- architectureSummary: string[]",
    "- initialModules: {path: string, purpose: string}[]",
    "- apiSurface: string[]",
    "- conventions: string[]",
    "- qualityGates: string[]",
    "- risks: string[]"
  ];

  if (existingContext.length > 0) {
    lines.push("", "Existing project context snippets (reuse if useful):");
    for (const snippet of existingContext) {
      lines.push(`- ${snippet}`);
    }
  }

  return lines.join("\n");
}

export function buildQuickSetupPrompt(input: InitInput, preset: QuickSetupPreset, existingContext: string[] = []): string {
  const presetGuide =
    preset === "nextjs-ts"
      ? "Next.js + TypeScript web app"
      : preset === "vite-react-ts"
        ? "React + TypeScript + Vite web app"
        : "TypeScript + Node.js runtime/app";

  const lines = [
    "You are generating a SAFE quick setup policy for project bootstrap.",
    "Return ONLY JSON. No markdown.",
    "",
    "Project context:",
    `- Name: ${input.projectName}`,
    `- Description: ${input.description}`,
    `- Stack: ${input.techStack}`,
    `- Shape: ${input.projectShape}`,
    `- Target assistant workflow: ${input.targetAgent}`,
    `- Preset: ${presetGuide}`,
    "",
    "Rules:",
    "- Conservative defaults.",
    "- Prefer minimal install set that keeps fast iteration.",
    "- runtimeProfile is only for node-ts and must be one of: bare, express, fastify.",
    "",
    "Output JSON schema keys:",
    "- includeTesting: boolean",
    "- includeLinting: boolean",
    "- includeFormatting: boolean",
    "- runtimeProfile?: \"bare\" | \"express\" | \"fastify\"",
    "- notes: string[]"
  ];

  if (existingContext.length > 0) {
    lines.push("", "Existing project context snippets (reuse if useful):");
    for (const snippet of existingContext) {
      lines.push(`- ${snippet}`);
    }
  }

  return lines.join("\n");
}
