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
export type CodexReasoningEffort = "low" | "medium" | "high" | "xhigh";
export type ClaudeEffort = "low" | "medium" | "high";
export type QuickSetupPreset = "nextjs-ts" | "vite-react-ts" | "node-ts" | "swift-spm";
export type NodeRuntimeProfile = "bare" | "express" | "fastify";
