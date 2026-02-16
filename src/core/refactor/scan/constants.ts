export const SOURCE_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".py",
  ".go",
  ".rs",
  ".swift",
  ".java",
  ".kt",
  ".kts",
  ".cs"
]);

export const SCAN_SKIP_DIRS = new Set([
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
  "Pods",
  ".idea",
  ".vscode",
  ".npm-cache"
]);

export const MONOLITH_LINE_THRESHOLD = 320;
export const MONOLITH_COMPLEXITY_THRESHOLD = 12;
export const MAX_BYTES_PER_FILE = 512_000;
