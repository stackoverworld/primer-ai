export type AgentTarget = "codex" | "claude" | "both";
export type ProjectShape =
  | "web-app"
  | "api-service"
  | "library"
  | "cli-tool"
  | "monorepo"
  | "custom";
export type GenerationMode = "template" | "ai-assisted";
export type AiProvider = "auto" | "codex" | "claude";
export type QuickSetupPreset = "nextjs-ts" | "vite-react-ts" | "node-ts";
export type NodeRuntimeProfile = "bare" | "express" | "fastify";
