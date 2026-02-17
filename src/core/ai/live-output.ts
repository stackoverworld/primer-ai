type OutputStream = "stdout" | "stderr";
type FileOp = "read" | "create" | "update" | "delete";

interface DiffFormattingState {
  inUnifiedDiff: boolean;
  suppressInstructionBlock: boolean;
  suppressShellCommandOutput: boolean;
  suppressNarrativeBlock: boolean;
  suppressApplyPatchBlock: boolean;
  suppressLoosePatchBlock: boolean;
  suppressUsageValueLine: boolean;
  suppressJsonBlock: boolean;
  jsonBraceDepth: number;
  jsonTaskCount: number;
  jsonLooksLikePlan: boolean;
  pendingDiffFile: string | null;
  pendingDiffType: Exclude<FileOp, "read">;
  pendingDiffStream: OutputStream | null;
  suppressedInstructionLines: number;
  suppressedInstructionTitle: string | null;
  suppressedInstructionHasUserNotes: boolean;
  suppressedInstructionStream: OutputStream | null;
}

interface FormatLiveAiLineOptions {
  colorize?: boolean | undefined;
}

interface CreateLiveAiOutputRendererOptions {
  writeStdout?: ((chunk: string) => void) | undefined;
  writeStderr?: ((chunk: string) => void) | undefined;
  colorize?: boolean | undefined;
}

const NOISE_PATTERNS = [
  /mcp startup:\s*no servers/i,
  /codex_core::rollout::list:\s*state db missing rollout path/i,
  /^-{8,}$/i,
  /^file update:?$/i
] as const;
const PROMPT_ECHO_START_PATTERNS = [
  /^openai codex v[0-9.]+\b/i,
  /^workdir:\s+/i,
  /^model:\s+/i,
  /^provider:\s+/i,
  /^approval:\s+/i,
  /^sandbox:\s+/i,
  /^reasoning effort:\s+/i,
  /^reasoning summaries:\s+/i,
  /^session id:\s+/i,
  /^user$/i,
  /^user\s+you are\b/i,
  /^you are a (?:senior|expert)\b/i,
  /^analyze the mission and produce only json\b/i,
  /^mission prompt:?$/i,
  /^primary objective:?$/i,
  /^hard constraints:?$/i,
  /^repository scan summary:?$/i,
  /^large files \(with structural metrics\):$/i,
  /^monolith split candidates:?$/i,
  /^coupling hotspots \(priority refactor targets\):$/i,
  /^technical debt hotspots:?$/i,
  /^comment cleanup candidates:?$/i,
  /^refactor policy from research:?$/i,
  /^verification commands \(run if available in this repo\):$/i,
  /^notes:?$/i,
  /^additional user notes:?$/i,
  /^mode:\s*execute$/i,
  /^codex orchestration mode:?$/i,
  /^(?:e?xecution workflow|refactor execution workflow):?$/i
] as const;
const PROMPT_ECHO_LINE_PATTERNS = [
  /^worker rules:?$/i,
  /^owned files \(edit only these files\):$/i,
  /^task instructions:?$/i,
  /^global mission context:?$/i,
  /^return a concise completion note\.$/i,
  /^final line required:\s*primer_refactor_status:/i,
  /^- apply the refactor changes directly in this repository now\.$/i,
  /^- keep changes focused and behavior-preserving\.$/i,
  /^- end with the change report\.$/i,
  /^- use one coordinator plus workers with strict file ownership\.$/i,
  /^- a file can be owned by only one worker at a time; no overlapping edits\.$/i,
  /^- workers must not delete directories\.$/i,
  /^- workers must not spawn additional subagents\.$/i,
  /^- merge worker outputs at checkpoints and run verification between checkpoints\.$/i,
  /^- keep active worker count within \d+\.$/i,
  /^\d+\)\s+/i
] as const;

const DIFF_START_PATTERN = /^diff --git\s+/i;
const DIFF_END_PATTERNS = [/^tokens used\b/i, /^implemented\b/i, /^primer_refactor_status:/i] as const;
const DIFF_METADATA_PATTERNS = [
  /^index\b/i,
  /^new file mode\b/i,
  /^deleted file mode\b/i,
  /^similarity index\b/i,
  /^rename from\b/i,
  /^rename to\b/i,
  /^---\s+/,
  /^\+\+\+\s+/,
  /^@@\s+/,
  /^\+(?!\+\+\+)/,
  /^-(?!---)/,
  /^\\ No newline at end of file$/
] as const;
const READ_OPERATION_PATTERNS = [
  /^read(?:ing)?\s+file\s+["'`]?(.+?)["'`]?\s*$/i,
  /^read\s+["'`]?(.+?)["'`]?\s*$/i,
  /^open(?:ed)?\s+file\s+["'`]?(.+?)["'`]?\s*$/i,
  /^view(?:ed)?\s+file\s+["'`]?(.+?)["'`]?\s*$/i
] as const;
const CREATE_OPERATION_PATTERNS = [
  /^creat(?:e|ed)\s+(?:file\s+)?["'`]?(.+?)["'`]?\s*$/i,
  /^add(?:ed)?\s+(?:file\s+)?["'`]?(.+?)["'`]?\s*$/i
] as const;
const UPDATE_OPERATION_PATTERNS = [
  /^updat(?:e|ed)\s+(?:file\s+)?["'`]?(.+?)["'`]?\s*$/i,
  /^modif(?:y|ied)\s+(?:file\s+)?["'`]?(.+?)["'`]?\s*$/i,
  /^edit(?:ed)?\s+(?:file\s+)?["'`]?(.+?)["'`]?\s*$/i
] as const;
const DELETE_OPERATION_PATTERNS = [
  /^delet(?:e|ed)\s+(?:file\s+)?["'`]?(.+?)["'`]?\s*$/i,
  /^remov(?:e|ed)\s+(?:file\s+)?["'`]?(.+?)["'`]?\s*$/i
] as const;
const SHELL_EXEC_TRACE_PATTERN = /(?:\/bin\/)?zsh\s+-lc\s+"([^"]+)"/i;
const APPLY_PATCH_BEGIN_PATTERN = /^\*\*\*\s+begin patch$/i;
const APPLY_PATCH_END_PATTERN = /^\*\*\*\s+end patch$/i;
const APPLY_PATCH_FILE_PATTERN = /^\*\*\*\s+(update|add|delete)\s+file:\s+(.+)$/i;
const TRACKED_COMMAND_START_PATTERN =
  /^(?:npm|pnpm|yarn|bun|npx|node|cargo|go|pytest|ruff|swift|\.\/gradlew|gradle|tsc|vite|vitest|jest|eslint)\b/i;
const NARRATIVE_BLOCK_START_PATTERNS = [
  /^\*\*[^*]+\*\*$/,
  /^implemented\b/i,
  /^verification results:?$/i,
  /^changed files:?$/i
] as const;

const ANSI = {
  reset: "\u001B[0m",
  green: "\u001B[32m",
  red: "\u001B[31m",
  cyan: "\u001B[36m",
  yellow: "\u001B[33m",
  bold: "\u001B[1m",
  gray: "\u001B[90m"
} as const;

const FILE_OP_ICON: Record<FileOp, string> = {
  read: "◉",
  create: "+",
  update: "~",
  delete: "-"
};

function countChar(value: string, char: "{" | "}"): number {
  let total = 0;
  for (const current of value) {
    if (current === char) total += 1;
  }
  return total;
}

function defaultColorize(): boolean {
  return Boolean(process.stdout.isTTY) && process.env.NO_COLOR === undefined && process.env.TERM !== "dumb";
}

function paint(line: string, color: string, colorize: boolean): string {
  if (!colorize || line.length === 0) return line;
  return `${color}${line}${ANSI.reset}`;
}

function isDiffEndLine(trimmedStart: string): boolean {
  return DIFF_END_PATTERNS.some((pattern) => pattern.test(trimmedStart));
}

function isDiffMetadataLine(trimmedStart: string): boolean {
  return DIFF_METADATA_PATTERNS.some((pattern) => pattern.test(trimmedStart));
}

function parseDiffFilePath(line: string): string | null {
  const match = line.match(/^diff --git\s+a\/(.+?)\s+b\/(.+)$/i);
  if (!match) return null;
  return match[2]?.trim() || match[1]?.trim() || null;
}

function extractOperationPath(line: string, patterns: readonly RegExp[]): string | null {
  for (const pattern of patterns) {
    const match = line.match(pattern);
    if (!match?.[1]) continue;
    const candidate = match[1].trim().replace(/[.,;:]+$/, "");
    if (!looksLikeFilePath(candidate)) continue;
    return candidate;
  }
  return null;
}

function parseReadPathFromShellCommand(command: string): string | null {
  const normalized = command.replace(/\s+/g, " ").trim();
  const readPatterns = [
    /\bnl\s+-ba\s+([^\s|;]+)\b/i,
    /\bsed\s+-n\s+['"][^'"]+['"]\s+([^\s|;]+)\b/i,
    /\bcat\s+([^\s|;]+)\b/i,
    /\bhead\s+-n\s+\d+\s+([^\s|;]+)\b/i,
    /\btail\s+-n\s+\d+\s+([^\s|;]+)\b/i
  ] as const;

  for (const pattern of readPatterns) {
    const match = normalized.match(pattern);
    const candidate = match?.[1]?.trim();
    if (!candidate) continue;
    const cleaned = candidate.replace(/^['"`]|['"`]$/g, "");
    if (!looksLikeFilePath(cleaned)) continue;
    return cleaned;
  }

  return null;
}

function extractPrimaryShellSegment(command: string): string {
  const normalized = command.replace(/\s+/g, " ").trim();
  const segment = normalized.split(/\s*(?:\|\||&&|;|\|)\s*/)[0] ?? normalized;
  const withoutRedirects = segment
    .replace(/\s+2?>\s*[^ ]+.*$/i, "")
    .replace(/\s+2>&1.*$/i, "")
    .trim();
  return withoutRedirects;
}

function parseTrackedCommandFromShellCommand(command: string): string | null {
  const primary = extractPrimaryShellSegment(command);
  if (!primary) return null;
  if (!TRACKED_COMMAND_START_PATTERN.test(primary)) return null;
  if (primary.length <= 120) return primary;
  return `${primary.slice(0, 117)}...`;
}

function parseApplyPatchFileOperation(line: string): { op: FileOp; path: string } | null {
  const match = line.match(APPLY_PATCH_FILE_PATTERN);
  if (!match?.[1] || !match[2]) return null;
  const operation = match[1].toLowerCase();
  const rawPath = match[2].trim();
  if (!looksLikeFilePath(rawPath)) return null;
  const op: FileOp = operation === "add" ? "create" : operation === "delete" ? "delete" : "update";
  return { op, path: rawPath };
}

function looksLikeLoosePatchHunkLine(trimmed: string): boolean {
  if (/^@@\s/.test(trimmed)) return true;
  const match = trimmed.match(/^([+-])(.+)$/);
  if (!match?.[2]) return false;
  const body = match[2].trim();
  if (!body) return false;
  if (/^(?:created|updated|deleted|read)\s+file\b/i.test(body)) return false;
  if (/^step\s+\d+\/\d+/i.test(body)) return false;
  if (/^\d+\)\s/.test(body)) return false;

  if (/[{}()[\];=<>]/.test(body)) return true;
  if (/^(?:import|export|const|let|var|function|type|interface|class|if|for|while|return)\b/.test(body)) return true;
  if (/\bfrom\s+['"`]/.test(body)) return true;
  if (/^[A-Za-z0-9_$]+\s*[:=]/.test(body)) return true;
  return false;
}

function looksLikeFilePath(value: string): boolean {
  const normalized = value.trim();
  if (!normalized) return false;
  if (normalized.includes("/") || normalized.includes("\\")) return true;
  if (/\.[a-z0-9]{1,10}$/i.test(normalized)) return true;
  if (/^(?:src|app|lib|test|tests|docs|scripts)\b/i.test(normalized)) return true;
  return false;
}

function formatFileOperation(op: FileOp, filePath: string, colorize: boolean): string {
  const text =
    op === "read"
      ? `${FILE_OP_ICON.read} Read file "${filePath}"`
      : op === "create"
        ? `${FILE_OP_ICON.create} Created file "${filePath}"`
        : op === "delete"
          ? `${FILE_OP_ICON.delete} Deleted file "${filePath}"`
          : `${FILE_OP_ICON.update} Updated file "${filePath}"`;

  const color = op === "read" ? ANSI.gray : op === "create" ? ANSI.green : op === "delete" ? ANSI.red : ANSI.cyan;
  return paint(text, color, colorize);
}

function formatCommandOperation(command: string, colorize: boolean): string {
  return paint(`▶ Running command "${command}"`, ANSI.yellow, colorize);
}

function formatJsonPlanSummary(taskCount: number, colorize: boolean): string {
  const suffix = taskCount > 0 ? ` (${taskCount} tasks)` : "";
  return paint(`▣ Orchestration plan received${suffix}`, ANSI.gray, colorize);
}

function isPromptEchoBoundary(trimmed: string): boolean {
  return (
    DIFF_START_PATTERN.test(trimmed) ||
    /^primer_refactor_status:\s*(complete|continue)/i.test(trimmed) ||
    /^tokens used\b/i.test(trimmed) ||
    /^implemented\b/i.test(trimmed) ||
    /^could not complete ai task\b/i.test(trimmed) ||
    /\bstep \d+\/\d+:/i.test(trimmed)
  );
}

function isPromptEchoStartLine(trimmed: string): boolean {
  return PROMPT_ECHO_START_PATTERNS.some((pattern) => pattern.test(trimmed));
}

function isPromptEchoBodyLine(trimmed: string): boolean {
  return PROMPT_ECHO_LINE_PATTERNS.some((pattern) => pattern.test(trimmed));
}

function isAdditionalUserNotesLine(trimmed: string): boolean {
  return /^additional user notes:?$/i.test(trimmed) || /^additional user notes:\s+\S+/i.test(trimmed);
}

function isNarrativeBlockStartLine(trimmed: string): boolean {
  return NARRATIVE_BLOCK_START_PATTERNS.some((pattern) => pattern.test(trimmed));
}

function isNarrativeBlockBoundary(trimmed: string): boolean {
  return isPromptEchoBoundary(trimmed) || DIFF_START_PATTERN.test(trimmed) || /^primer_refactor_status:/i.test(trimmed);
}

function isShellOutputBoundary(trimmed: string): boolean {
  return (
    /^step \d+\/\d+:/i.test(trimmed) ||
    /^file update:?$/i.test(trimmed) ||
    /^primer_refactor_status:/i.test(trimmed) ||
    /^tokens used\b/i.test(trimmed) ||
    DIFF_START_PATTERN.test(trimmed) ||
    Boolean(extractOperationPath(trimmed, READ_OPERATION_PATTERNS)) ||
    Boolean(extractOperationPath(trimmed, CREATE_OPERATION_PATTERNS)) ||
    Boolean(extractOperationPath(trimmed, UPDATE_OPERATION_PATTERNS)) ||
    Boolean(extractOperationPath(trimmed, DELETE_OPERATION_PATTERNS))
  );
}

function isLoosePatchBoundary(trimmed: string): boolean {
  if (!trimmed) return true;
  if (isPromptEchoBoundary(trimmed)) return true;
  if (isNarrativeBlockStartLine(trimmed)) return true;
  if (DIFF_START_PATTERN.test(trimmed)) return true;
  if (/^primer_refactor_status:/i.test(trimmed)) return true;
  if (/^tokens used$/i.test(trimmed)) return true;
  if (/^file update:?$/i.test(trimmed)) return true;
  if (/\bstep \d+\/\d+:/i.test(trimmed)) return true;
  if (extractOperationPath(trimmed, READ_OPERATION_PATTERNS)) return true;
  if (extractOperationPath(trimmed, CREATE_OPERATION_PATTERNS)) return true;
  if (extractOperationPath(trimmed, UPDATE_OPERATION_PATTERNS)) return true;
  if (extractOperationPath(trimmed, DELETE_OPERATION_PATTERNS)) return true;
  if (APPLY_PATCH_BEGIN_PATTERN.test(trimmed) || APPLY_PATCH_FILE_PATTERN.test(trimmed) || APPLY_PATCH_END_PATTERN.test(trimmed)) {
    return true;
  }
  return false;
}

function startsLikelyJsonBlock(trimmed: string): boolean {
  return trimmed === "{" || trimmed.startsWith("{ ");
}

function summarizeInstructionTitle(rawTitle: string | null): string {
  if (!rawTitle) return "AI instruction block";
  if (
    /^openai codex v[0-9.]+\b/i.test(rawTitle) ||
    /^workdir:\s+/i.test(rawTitle) ||
    /^model:\s+/i.test(rawTitle) ||
    /^provider:\s+/i.test(rawTitle) ||
    /^approval:\s+/i.test(rawTitle) ||
    /^sandbox:\s+/i.test(rawTitle) ||
    /^reasoning effort:\s+/i.test(rawTitle) ||
    /^reasoning summaries:\s+/i.test(rawTitle) ||
    /^session id:\s+/i.test(rawTitle)
  ) {
    return "AI session metadata & prompt";
  }
  if (/^user$/i.test(rawTitle)) {
    return "Prompt body from AI handoff";
  }
  if (/^user\s+you are\b/i.test(rawTitle)) {
    return "Prompt body from AI handoff";
  }
  if (rawTitle.length > 96) {
    return `${rawTitle.slice(0, 93)}...`;
  }
  return rawTitle;
}

export function shouldSuppressLiveAiLine(line: string, state?: DiffFormattingState): boolean {
  const normalized = line.trim();
  if (!normalized) return false;
  return NOISE_PATTERNS.some((pattern) => pattern.test(normalized));
}

export function formatLiveAiLine(
  line: string,
  state: DiffFormattingState,
  options: FormatLiveAiLineOptions = {}
): string {
  const colorize = options.colorize ?? defaultColorize();
  const trimmedStart = line.trimStart();

  if (DIFF_START_PATTERN.test(trimmedStart)) {
    state.inUnifiedDiff = true;
    return paint(line, ANSI.cyan, colorize);
  }
  if (isDiffEndLine(trimmedStart)) {
    state.inUnifiedDiff = false;
  }
  if (/^new file mode\b/.test(trimmedStart)) {
    return paint(line, ANSI.green, colorize);
  }
  if (/^deleted file mode\b/.test(trimmedStart)) {
    return paint(line, ANSI.red, colorize);
  }
  if (/^\+\+\+\s/.test(trimmedStart)) {
    return paint(line, ANSI.green, colorize);
  }
  if (/^---\s/.test(trimmedStart)) {
    return paint(line, ANSI.red, colorize);
  }
  if (/^@@\s/.test(trimmedStart)) {
    return paint(line, ANSI.yellow, colorize);
  }
  if (/^PRIMER_REFACTOR_STATUS:\s*(COMPLETE|CONTINUE)/i.test(trimmedStart)) {
    return paint(line, ANSI.bold, colorize);
  }

  return line;
}

function consumeCompleteLines(buffer: string, onLine: (line: string) => void): string {
  let lineStart = 0;
  for (let index = 0; index < buffer.length; index += 1) {
    const char = buffer[index];
    if (char !== "\n" && char !== "\r") {
      continue;
    }

    onLine(buffer.slice(lineStart, index));
    if (char === "\r" && buffer[index + 1] === "\n") {
      index += 1;
    }
    lineStart = index + 1;
  }

  return buffer.slice(lineStart);
}

export function createLiveAiOutputRenderer(options: CreateLiveAiOutputRendererOptions = {}): {
  push: (stream: OutputStream, chunk: string) => void;
  flush: () => void;
} {
  const writeStdout = options.writeStdout ?? ((chunk: string) => process.stdout.write(chunk));
  const writeStderr = options.writeStderr ?? ((chunk: string) => process.stderr.write(chunk));
  const colorize = options.colorize ?? defaultColorize();

  const state: DiffFormattingState = {
    inUnifiedDiff: false,
    suppressInstructionBlock: false,
    suppressShellCommandOutput: false,
    suppressNarrativeBlock: false,
    suppressApplyPatchBlock: false,
    suppressLoosePatchBlock: false,
    suppressUsageValueLine: false,
    suppressJsonBlock: false,
    jsonBraceDepth: 0,
    jsonTaskCount: 0,
    jsonLooksLikePlan: false,
    pendingDiffFile: null,
    pendingDiffType: "update",
    pendingDiffStream: null,
    suppressedInstructionLines: 0,
    suppressedInstructionTitle: null,
    suppressedInstructionHasUserNotes: false,
    suppressedInstructionStream: null
  };

  let stdoutPending = "";
  let stderrPending = "";

  const emitRendered = (stream: OutputStream, rendered: string): void => {
    if (stream === "stdout") {
      writeStdout(`${rendered}\n`);
      return;
    }
    writeStderr(`${rendered}\n`);
  };

  const flushPendingDiff = (): void => {
    if (!state.pendingDiffFile || !state.pendingDiffStream) return;
    emitRendered(
      state.pendingDiffStream,
      formatFileOperation(state.pendingDiffType, state.pendingDiffFile, colorize)
    );
    state.pendingDiffFile = null;
    state.pendingDiffType = "update";
    state.pendingDiffStream = null;
    state.inUnifiedDiff = false;
  };

  const flushSuppressedInstructionSummary = (): void => {
    if (state.suppressedInstructionLines <= 0 || !state.suppressedInstructionStream) return;
    const title = summarizeInstructionTitle(state.suppressedInstructionTitle);
    const suffix =
      state.suppressedInstructionLines > 1 ? ` (+${state.suppressedInstructionLines - 1} lines)` : "";
    const stream = state.suppressedInstructionStream;
    emitRendered(stream, paint("╭─ AI Instructions (collapsed)", ANSI.gray, colorize));
    emitRendered(stream, paint(`│ ${title}${suffix}`, ANSI.gray, colorize));
    if (state.suppressedInstructionHasUserNotes) {
      emitRendered(stream, paint("│ includes Additional user notes", ANSI.gray, colorize));
    }
    emitRendered(stream, paint("╰─ hidden to keep file-op logs clean", ANSI.gray, colorize));
    state.suppressedInstructionLines = 0;
    state.suppressedInstructionTitle = null;
    state.suppressedInstructionHasUserNotes = false;
    state.suppressedInstructionStream = null;
  };

  const emitLine = (stream: OutputStream, line: string): void => {
    const trimmed = line.trim();
    if (!trimmed) return;

    if (/^tokens used$/i.test(trimmed)) {
      state.suppressUsageValueLine = true;
      return;
    }
    if (state.suppressUsageValueLine) {
      if (/^[0-9][0-9,]*$/.test(trimmed)) {
        state.suppressUsageValueLine = false;
        return;
      }
      state.suppressUsageValueLine = false;
    }

    if (state.suppressInstructionBlock) {
      if (isPromptEchoBoundary(trimmed)) {
        state.suppressInstructionBlock = false;
        flushSuppressedInstructionSummary();
      } else {
        state.suppressedInstructionLines += 1;
        if (isAdditionalUserNotesLine(trimmed)) {
          state.suppressedInstructionHasUserNotes = true;
        }
        return;
      }
    }

    if (state.suppressApplyPatchBlock) {
      if (APPLY_PATCH_END_PATTERN.test(trimmed)) {
        state.suppressApplyPatchBlock = false;
        return;
      }
      const applyPatchFileOp = parseApplyPatchFileOperation(trimmed);
      if (applyPatchFileOp) {
        emitRendered(stream, formatFileOperation(applyPatchFileOp.op, applyPatchFileOp.path, colorize));
      }
      return;
    }

    if (state.suppressShellCommandOutput) {
      if (!isShellOutputBoundary(trimmed)) {
        return;
      }
      state.suppressShellCommandOutput = false;
    }

    if (state.suppressNarrativeBlock) {
      if (!isNarrativeBlockBoundary(trimmed)) {
        return;
      }
      state.suppressNarrativeBlock = false;
    }

    if (state.suppressLoosePatchBlock) {
      if (!isLoosePatchBoundary(trimmed)) {
        return;
      }
      const isFileOperationBoundary = Boolean(
        extractOperationPath(trimmed, READ_OPERATION_PATTERNS) ||
          extractOperationPath(trimmed, CREATE_OPERATION_PATTERNS) ||
          extractOperationPath(trimmed, UPDATE_OPERATION_PATTERNS) ||
          extractOperationPath(trimmed, DELETE_OPERATION_PATTERNS) ||
          /^file update:?$/i.test(trimmed)
      );
      if (!isFileOperationBoundary) {
        state.suppressLoosePatchBlock = false;
      }
    }

    if (state.suppressJsonBlock) {
      if (/"id"\s*:\s*"/i.test(trimmed)) {
        state.jsonTaskCount += 1;
      }
      if (
        /"refactorneeded"\s*:/i.test(trimmed) ||
        /"tasks"\s*:/i.test(trimmed) ||
        /"summary"\s*:/i.test(trimmed)
      ) {
        state.jsonLooksLikePlan = true;
      }

      state.jsonBraceDepth += countChar(trimmed, "{");
      state.jsonBraceDepth -= countChar(trimmed, "}");
      if (state.jsonBraceDepth <= 0) {
        if (state.jsonLooksLikePlan) {
          emitRendered(stream, formatJsonPlanSummary(state.jsonTaskCount, colorize));
        }
        state.suppressJsonBlock = false;
        state.jsonBraceDepth = 0;
        state.jsonTaskCount = 0;
        state.jsonLooksLikePlan = false;
      }
      return;
    }

    if (isPromptEchoStartLine(trimmed)) {
      state.suppressInstructionBlock = true;
      state.suppressedInstructionLines = 1;
      state.suppressedInstructionTitle = trimmed;
      state.suppressedInstructionHasUserNotes = isAdditionalUserNotesLine(trimmed);
      state.suppressedInstructionStream = stream;
      return;
    }

    if (APPLY_PATCH_BEGIN_PATTERN.test(trimmed)) {
      state.suppressApplyPatchBlock = true;
      return;
    }
    const applyPatchFileOp = parseApplyPatchFileOperation(trimmed);
    if (applyPatchFileOp) {
      emitRendered(stream, formatFileOperation(applyPatchFileOp.op, applyPatchFileOp.path, colorize));
      state.suppressApplyPatchBlock = true;
      return;
    }

    if (startsLikelyJsonBlock(trimmed)) {
      state.suppressJsonBlock = true;
      state.jsonBraceDepth = countChar(trimmed, "{") - countChar(trimmed, "}");
      state.jsonTaskCount = 0;
      state.jsonLooksLikePlan = false;
      if (/"refactorneeded"\s*:/i.test(trimmed) || /"tasks"\s*:/i.test(trimmed) || /"summary"\s*:/i.test(trimmed)) {
        state.jsonLooksLikePlan = true;
      }
      if (state.jsonBraceDepth <= 0) {
        state.suppressJsonBlock = false;
        state.jsonBraceDepth = 0;
        if (state.jsonLooksLikePlan) {
          emitRendered(stream, formatJsonPlanSummary(state.jsonTaskCount, colorize));
        }
      }
      return;
    }

    const shellExecMatch = trimmed.match(SHELL_EXEC_TRACE_PATTERN);
    if (shellExecMatch?.[1]) {
      const trackedCommand = parseTrackedCommandFromShellCommand(shellExecMatch[1]);
      if (trackedCommand) {
        emitRendered(stream, formatCommandOperation(trackedCommand, colorize));
      }
      const readPath = parseReadPathFromShellCommand(shellExecMatch[1]);
      if (readPath) {
        emitRendered(stream, formatFileOperation("read", readPath, colorize));
      }
      state.suppressShellCommandOutput = true;
      return;
    }

    if (isNarrativeBlockStartLine(trimmed)) {
      state.suppressNarrativeBlock = true;
      return;
    }

    if (looksLikeLoosePatchHunkLine(trimmed)) {
      state.suppressLoosePatchBlock = true;
      return;
    }

    if (DIFF_START_PATTERN.test(trimmed)) {
      flushPendingDiff();
      const diffFile = parseDiffFilePath(trimmed);
      if (!diffFile) return;
      state.pendingDiffFile = diffFile;
      state.pendingDiffType = "update";
      state.pendingDiffStream = stream;
      state.inUnifiedDiff = true;
      return;
    }

    if (state.pendingDiffFile) {
      if (/^new file mode\b/i.test(trimmed)) {
        state.pendingDiffType = "create";
        return;
      }
      if (/^deleted file mode\b/i.test(trimmed)) {
        state.pendingDiffType = "delete";
        return;
      }
      if (isDiffMetadataLine(trimmed)) {
        return;
      }
      flushPendingDiff();
    }

    const readPath = extractOperationPath(trimmed, READ_OPERATION_PATTERNS);
    if (readPath) {
      emitRendered(stream, formatFileOperation("read", readPath, colorize));
      return;
    }
    const createPath = extractOperationPath(trimmed, CREATE_OPERATION_PATTERNS);
    if (createPath) {
      emitRendered(stream, formatFileOperation("create", createPath, colorize));
      return;
    }
    const updatePath = extractOperationPath(trimmed, UPDATE_OPERATION_PATTERNS);
    if (updatePath) {
      emitRendered(stream, formatFileOperation("update", updatePath, colorize));
      return;
    }
    const deletePath = extractOperationPath(trimmed, DELETE_OPERATION_PATTERNS);
    if (deletePath) {
      emitRendered(stream, formatFileOperation("delete", deletePath, colorize));
      return;
    }

    if (shouldSuppressLiveAiLine(line, state)) return;
    const rendered = formatLiveAiLine(line, state, { colorize });
    emitRendered(stream, rendered);
  };

  const push = (stream: OutputStream, chunk: string): void => {
    if (stream === "stdout") {
      stdoutPending = consumeCompleteLines(stdoutPending + chunk, (line) => emitLine("stdout", line));
      return;
    }
    stderrPending = consumeCompleteLines(stderrPending + chunk, (line) => emitLine("stderr", line));
  };

  const flush = (): void => {
    if (state.suppressInstructionBlock) {
      state.suppressInstructionBlock = false;
    }
    flushSuppressedInstructionSummary();
    flushPendingDiff();
    if (stdoutPending.length > 0) {
      emitLine("stdout", stdoutPending);
      stdoutPending = "";
    }
    if (stderrPending.length > 0) {
      emitLine("stderr", stderrPending);
      stderrPending = "";
    }
    if (state.suppressJsonBlock) {
      if (state.jsonLooksLikePlan) {
        emitRendered("stdout", formatJsonPlanSummary(state.jsonTaskCount, colorize));
      }
      state.suppressJsonBlock = false;
      state.jsonBraceDepth = 0;
      state.jsonTaskCount = 0;
      state.jsonLooksLikePlan = false;
    }
  };

  return { push, flush };
}
