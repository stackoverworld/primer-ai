const POPULAR_STACKS = [
  "TypeScript + Node.js",
  "Next.js + TypeScript",
  "React + TypeScript + Vite",
  "Python + FastAPI",
  "Python + Django",
  "Go + Gin",
  "Rust + Axum",
  "Java + Spring Boot",
  "C# + ASP.NET Core",
  "Flutter + Dart"
] as const;

type StackPreset = (typeof POPULAR_STACKS)[number];
type StackChoice = StackPreset | "other";
type StackDetection = {
  stack: string;
  source: string;
};

const SCAN_SKIP_DIRECTORIES = new Set([
  ".git",
  "node_modules",
  ".next",
  "dist",
  "build",
  "coverage",
  ".turbo",
  "target",
  ".venv",
  "venv",
  "Pods"
]);

const DEFAULT_MODEL_VALUE = "__primer_ai_default_model__";
const CUSTOM_MODEL_VALUE = "__primer_ai_custom_model__";

export {
  CUSTOM_MODEL_VALUE,
  DEFAULT_MODEL_VALUE,
  POPULAR_STACKS,
  SCAN_SKIP_DIRECTORIES
};
export type { StackChoice, StackDetection, StackPreset };
