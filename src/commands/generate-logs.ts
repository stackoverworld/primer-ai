import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { log, spinner } from "@clack/prompts";
import { z } from "zod";

import { runAiFreeformTask } from "../core/ai.js";
import { parseWithSchema } from "../core/ai-parsing.js";
import { ExecutionError, UserInputError } from "../core/errors.js";
import type { AgentTarget, GenerateLogsCommandOptions } from "../core/types.js";

const DEFAULT_OUTPUT_FILE = "RELEASE_LOG.md";
const DEFAULT_AI_TIMEOUT_SEC = 1800;
const MIN_AI_TIMEOUT_SEC = 60;
const MAX_AI_TIMEOUT_SEC = 14_400;
const VERSION_LITERAL_PATTERN = /^v?\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/i;
const MAX_DIFF_CHARS = 120_000;
const MAX_LOG_SECTION_CHARS = 8_000;

const releaseLogSchema = z.object({
  changes: z.array(z.string().min(1)).max(40),
  fixes: z.array(z.string().min(1)).max(40)
});

interface RangeSelection {
  fromRef: string;
  toRef: string;
  fromLabel: string;
  toLabel: string;
  includeUncommitted: boolean;
}

interface DiffContext {
  changedFiles: Set<string>;
  committedNameStatus: string;
  committedNumStat: string;
  committedPatch: string;
  commitSubjects: string;
  stagedNameStatus: string;
  stagedPatch: string;
  unstagedNameStatus: string;
  unstagedPatch: string;
  untrackedFiles: string;
}

interface ParsedVersion {
  major: number;
  minor: number;
  patch: number;
  prerelease: string | null;
}

function parseLines(raw: string): string[] {
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function parseExecErrorMessage(error: unknown): string {
  if (!error || typeof error !== "object") return String(error);
  const withStderr = error as { stderr?: unknown; message?: unknown };
  if (typeof withStderr.stderr === "string" && withStderr.stderr.trim()) return withStderr.stderr.trim();
  if (Buffer.isBuffer(withStderr.stderr)) {
    const decoded = withStderr.stderr.toString("utf8").trim();
    if (decoded) return decoded;
  }
  if (typeof withStderr.message === "string" && withStderr.message.trim()) return withStderr.message.trim();
  return String(error);
}

function runGit(cwd: string, args: string[]): string {
  try {
    return execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    }).trim();
  } catch (error) {
    throw new UserInputError(`git ${args.join(" ")} failed: ${parseExecErrorMessage(error)}`);
  }
}

function tryRunGit(cwd: string, args: string[]): string | null {
  try {
    return execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    }).trim();
  } catch {
    return null;
  }
}

function normalizeVersionToken(value: string): string {
  return value.trim().replace(/^v/i, "").toLowerCase();
}

function isLikelyVersionLiteral(value: string): boolean {
  return VERSION_LITERAL_PATTERN.test(value.trim());
}

function parseVersionParts(value: string): ParsedVersion | null {
  const normalized = normalizeVersionToken(value);
  const match = normalized.match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/);
  if (!match?.[1] || !match[2] || !match[3]) return null;
  return {
    major: Number.parseInt(match[1], 10),
    minor: Number.parseInt(match[2], 10),
    patch: Number.parseInt(match[3], 10),
    prerelease: match[4] ?? null
  };
}

function compareVersionsDesc(left: string, right: string): number {
  const a = parseVersionParts(left);
  const b = parseVersionParts(right);
  if (!a || !b) {
    return right.localeCompare(left);
  }

  if (a.major !== b.major) return b.major - a.major;
  if (a.minor !== b.minor) return b.minor - a.minor;
  if (a.patch !== b.patch) return b.patch - a.patch;
  if (a.prerelease === b.prerelease) return 0;
  if (a.prerelease === null) return -1;
  if (b.prerelease === null) return 1;
  return b.prerelease.localeCompare(a.prerelease);
}

function listRemoteTags(cwd: string, remoteName = "origin"): string[] {
  const raw = runGit(cwd, ["ls-remote", "--tags", "--refs", remoteName]);
  const tags = parseLines(raw)
    .map((line) => {
      const [, ref = ""] = line.split(/\s+/, 2);
      const match = ref.match(/^refs\/tags\/(.+)$/);
      return match?.[1]?.trim() ?? "";
    })
    .filter((tag) => tag.length > 0);

  if (tags.length === 0) {
    throw new UserInputError(
      `No tags found on remote "${remoteName}". Push tags to GitHub (origin) before running generate-logs.`
    );
  }

  return Array.from(new Set(tags)).sort(compareVersionsDesc);
}

function ensureLocalTag(cwd: string, tag: string, remoteName = "origin"): void {
  const exists = tryRunGit(cwd, ["rev-parse", "--verify", `refs/tags/${tag}`]);
  if (exists) return;
  runGit(cwd, ["fetch", remoteName, `refs/tags/${tag}:refs/tags/${tag}`]);
}

function resolveVersionTagFromRemote(tags: string[], versionLiteral: string, optionName: string): string {
  if (!isLikelyVersionLiteral(versionLiteral)) {
    throw new UserInputError(
      `Invalid ${optionName} value "${versionLiteral}". Expected semantic version like "0.1.59" or "v0.1.79-beta".`
    );
  }

  const normalizedRequested = normalizeVersionToken(versionLiteral);
  const exact = tags.find((tag) => normalizeVersionToken(tag) === normalizedRequested);
  if (exact) return exact;

  const requestedBase = normalizedRequested.replace(/[-+].*$/, "");
  const baseMatches = tags.filter((tag) => normalizeVersionToken(tag).replace(/[-+].*$/, "") === requestedBase);
  if (baseMatches.length === 1) return baseMatches[0]!;
  if (baseMatches.length > 1) {
    const stable = baseMatches.find((tag) => !normalizeVersionToken(tag).includes("-"));
    return stable ?? baseMatches[0]!;
  }

  throw new UserInputError(
    `${optionName}="${versionLiteral}" was not found on GitHub tags (origin). Use an existing released version tag.`
  );
}

function resolveRefFromCandidates(cwd: string, value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const candidates = new Set<string>([
    trimmed,
    `refs/tags/${trimmed}`,
    ...(trimmed.startsWith("v") ? [] : [`v${trimmed}`, `refs/tags/v${trimmed}`])
  ]);
  for (const candidate of candidates) {
    const resolved = tryRunGit(cwd, ["rev-parse", "--verify", candidate]);
    if (resolved) return candidate.replace(/^refs\/tags\//, "");
  }
  return null;
}

function resolveUserRef(cwd: string, rawValue: string, optionName: string): string {
  const resolved = resolveRefFromCandidates(cwd, rawValue);
  if (resolved) return resolved;
  if (isLikelyVersionLiteral(rawValue)) {
    const localTagCandidate = resolveRefFromCandidates(cwd, `v${normalizeVersionToken(rawValue)}`);
    if (localTagCandidate) return localTagCandidate;
  }
  throw new UserInputError(`Could not resolve ${optionName}="${rawValue}" as a valid git ref.`);
}

function normalizeAiTimeoutMs(value: number | string | undefined): number {
  if (value === undefined) return DEFAULT_AI_TIMEOUT_SEC * 1000;
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim().length > 0
        ? Number.parseInt(value, 10)
        : Number.NaN;
  if (!Number.isFinite(parsed)) {
    throw new UserInputError(
      `Invalid --ai-timeout-sec value "${String(value)}". Expected an integer between ${MIN_AI_TIMEOUT_SEC} and ${MAX_AI_TIMEOUT_SEC}.`
    );
  }
  const clamped = Math.min(MAX_AI_TIMEOUT_SEC, Math.max(MIN_AI_TIMEOUT_SEC, parsed));
  return clamped * 1000;
}

function trimText(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  const omitted = value.length - maxChars;
  return `${value.slice(0, maxChars)}\n\n... [truncated ${omitted} characters]`;
}

function splitTopLevelSections(existingContent: string): string[] {
  const normalized = existingContent.replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];
  if (!/^##\s+/m.test(normalized)) return [normalized];
  return normalized.split(/\n(?=##\s+)/g).map((section) => section.trim()).filter(Boolean);
}

function extractLatestLoggedToVersion(content: string): string | null {
  const sections = splitTopLevelSections(content);
  for (const section of sections) {
    const firstLine = section.split(/\r?\n/, 1)[0]?.trim() ?? "";
    const match = firstLine.match(/^##\s+(.+?)\s*->\s*(.+?)\s*$/);
    if (!match?.[2]) continue;
    const toToken = match[2].trim();
    if (!isLikelyVersionLiteral(toToken)) continue;
    return toToken;
  }
  return null;
}

function getTopSectionForPrompt(content: string): string {
  const sections = splitTopLevelSections(content);
  if (sections.length === 0) return "";
  return trimText(sections[0]!, MAX_LOG_SECTION_CHARS);
}

function collectDiffContext(cwd: string, fromRef: string, toRef: string, includeUncommitted: boolean): DiffContext {
  const committedNameStatus = tryRunGit(cwd, ["diff", "--name-status", `${fromRef}..${toRef}`]) ?? "";
  const committedNumStat = tryRunGit(cwd, ["diff", "--numstat", `${fromRef}..${toRef}`]) ?? "";
  const committedPatch = trimText(tryRunGit(cwd, ["diff", "--unified=2", `${fromRef}..${toRef}`]) ?? "", MAX_DIFF_CHARS);
  const commitSubjects = tryRunGit(cwd, ["log", "--no-merges", "--pretty=format:%h %s", `${fromRef}..${toRef}`]) ?? "";

  const changedFiles = new Set<string>();
  for (const line of parseLines(committedNameStatus)) {
    const parts = line.split(/\s+/).filter(Boolean);
    const filePath = parts[parts.length - 1];
    if (filePath) changedFiles.add(filePath);
  }

  if (!includeUncommitted) {
    return {
      changedFiles,
      committedNameStatus,
      committedNumStat,
      committedPatch,
      commitSubjects,
      stagedNameStatus: "",
      stagedPatch: "",
      unstagedNameStatus: "",
      unstagedPatch: "",
      untrackedFiles: ""
    };
  }

  const stagedNameStatus = tryRunGit(cwd, ["diff", "--cached", "--name-status"]) ?? "";
  const stagedPatch = trimText(tryRunGit(cwd, ["diff", "--cached", "--unified=2"]) ?? "", MAX_DIFF_CHARS / 2);
  const unstagedNameStatus = tryRunGit(cwd, ["diff", "--name-status"]) ?? "";
  const unstagedPatch = trimText(tryRunGit(cwd, ["diff", "--unified=2"]) ?? "", MAX_DIFF_CHARS / 2);
  const untrackedFiles = tryRunGit(cwd, ["ls-files", "--others", "--exclude-standard"]) ?? "";

  for (const line of [...parseLines(stagedNameStatus), ...parseLines(unstagedNameStatus)]) {
    const parts = line.split(/\s+/).filter(Boolean);
    const filePath = parts[parts.length - 1];
    if (filePath) changedFiles.add(filePath);
  }
  for (const file of parseLines(untrackedFiles)) {
    changedFiles.add(file);
  }

  return {
    changedFiles,
    committedNameStatus,
    committedNumStat,
    committedPatch,
    commitSubjects,
    stagedNameStatus,
    stagedPatch,
    unstagedNameStatus,
    unstagedPatch,
    untrackedFiles
  };
}

function buildAiPrompt(input: {
  fromLabel: string;
  toLabel: string;
  diff: DiffContext;
  existingTopSection: string;
  includeUncommitted: boolean;
}): string {
  const uncommittedNote = input.includeUncommitted
    ? "Included: committed + staged + unstaged + untracked deltas."
    : "Included: committed history only.";

  return [
    "You generate GitHub release note bullets.",
    "Return ONLY JSON with this exact shape:",
    '{"changes":["..."],"fixes":["..."]}',
    "",
    "Hard rules:",
    "- No markdown in values. Plain strings only.",
    "- No duplicates across changes/fixes.",
    "- No 'Thanks @...' suffixes.",
    "- Use concise product-style wording similar to changelog bullets.",
    "- Classify bug fixes/regressions/validation corrections under fixes.",
    "- If a section has no entries, return an empty array for it.",
    "",
    `Range: ${input.fromLabel} -> ${input.toLabel}`,
    `Scope note: ${uncommittedNote}`,
    "",
    "Already published top section (avoid repeating the same ideas if unchanged):",
    input.existingTopSection || "(none)",
    "",
    "Commit subjects in range:",
    input.diff.commitSubjects || "(none)",
    "",
    "Name-status deltas (committed):",
    input.diff.committedNameStatus || "(none)",
    "",
    "Numstat deltas (committed):",
    input.diff.committedNumStat || "(none)",
    "",
    "Unified patch (committed, may be truncated):",
    input.diff.committedPatch || "(none)",
    "",
    "Name-status deltas (staged):",
    input.diff.stagedNameStatus || "(none)",
    "",
    "Unified patch (staged, may be truncated):",
    input.diff.stagedPatch || "(none)",
    "",
    "Name-status deltas (unstaged):",
    input.diff.unstagedNameStatus || "(none)",
    "",
    "Unified patch (unstaged, may be truncated):",
    input.diff.unstagedPatch || "(none)",
    "",
    "Untracked files:",
    input.diff.untrackedFiles || "(none)"
  ].join("\n");
}

function normalizeBulletText(value: string): string {
  const trimmed = value.trim().replace(/^[-*]\s+/, "").replace(/\s+/g, " ");
  const withoutThanks = trimmed.replace(/\s+thanks\s+@[\w.-]+\.?$/i, "").trim();
  if (!withoutThanks) return "";
  if (/[.!?]$/.test(withoutThanks)) return withoutThanks;
  return `${withoutThanks}.`;
}

function renderMarkdown(changes: string[], fixes: string[]): string {
  const lines: string[] = [];
  if (changes.length > 0) {
    lines.push("### Changes");
    for (const entry of changes) {
      lines.push(`- ${entry}`);
    }
    lines.push("");
  }

  if (fixes.length > 0) {
    lines.push("### Fixes");
    for (const entry of fixes) {
      lines.push(`- ${entry}`);
    }
    lines.push("");
  }

  return lines.join("\n").trimEnd();
}

function renderVersionSection(fromLabel: string, toLabel: string, markdownBody: string): string {
  return `## ${fromLabel} -> ${toLabel}\n\n${markdownBody.trimEnd()}`;
}

function upsertVersionSection(existingContent: string, sectionHeading: string, nextSection: string): string {
  const sections = splitTopLevelSections(existingContent);
  if (sections.length === 0) return `${nextSection}\n`;

  const hasVersionSections = sections.some((section) => section.startsWith("## "));
  if (!hasVersionSections) {
    return `${nextSection}\n\n${sections[0]}\n`;
  }

  const filtered = sections.filter((section) => {
    const firstLine = section.split(/\r?\n/, 1)[0]?.trim() ?? "";
    return firstLine !== sectionHeading;
  });
  return `${[nextSection, ...filtered].join("\n\n")}\n`;
}

function selectRange(options: GenerateLogsCommandOptions, cwd: string, outputPath: string): RangeSelection {
  const remoteTags = listRemoteTags(cwd);
  runGit(cwd, ["fetch", "--tags", "origin"]);

  const hasExplicitVersionTarget = Boolean(options.toVersion?.trim());
  const hasExplicitVersionSource = Boolean(options.fromVersion?.trim());

  const toRef = hasExplicitVersionTarget
    ? resolveVersionTagFromRemote(remoteTags, options.toVersion!.trim(), "--to-version")
    : options.to?.trim()
      ? resolveUserRef(cwd, options.to.trim(), "--to")
      : "HEAD";
  const toLabel = hasExplicitVersionTarget ? normalizeVersionToken(options.toVersion!.trim()) : options.to?.trim() || "HEAD";

  let fromRef: string;
  let fromLabel: string;

  if (hasExplicitVersionSource) {
    fromRef = resolveVersionTagFromRemote(remoteTags, options.fromVersion!.trim(), "--from-version");
    fromLabel = normalizeVersionToken(options.fromVersion!.trim());
  } else if (options.from?.trim()) {
    if (hasExplicitVersionTarget) {
      throw new UserInputError("When using --to-version, use --from-version (or omit --from to auto-pick from RELEASE_LOG/latest tag).");
    }
    fromRef = resolveUserRef(cwd, options.from.trim(), "--from");
    fromLabel = options.from.trim();
  } else {
    const latestLoggedVersion = existsSync(outputPath)
      ? extractLatestLoggedToVersion(readFileSync(outputPath, "utf8"))
      : null;
    if (latestLoggedVersion) {
      fromRef = resolveVersionTagFromRemote(remoteTags, latestLoggedVersion, "latest RELEASE_LOG version");
      fromLabel = normalizeVersionToken(latestLoggedVersion);
    } else {
      fromRef = remoteTags[0]!;
      fromLabel = fromRef;
    }
  }

  if (fromRef !== "HEAD") {
    if (remoteTags.includes(fromRef)) ensureLocalTag(cwd, fromRef);
    runGit(cwd, ["rev-parse", "--verify", fromRef]);
  }
  if (toRef !== "HEAD") {
    if (remoteTags.includes(toRef)) ensureLocalTag(cwd, toRef);
    runGit(cwd, ["rev-parse", "--verify", toRef]);
  } else {
    runGit(cwd, ["rev-parse", "--verify", "HEAD"]);
  }

  if (hasExplicitVersionTarget) {
    if (!remoteTags.includes(fromRef)) {
      throw new UserInputError(`From version (${fromLabel}) is not present on GitHub tags (origin).`);
    }
    if (!remoteTags.includes(toRef)) {
      throw new UserInputError(`To version (${toLabel}) is not present on GitHub tags (origin).`);
    }
  }

  const includeUncommitted = hasExplicitVersionTarget || hasExplicitVersionSource ? false : (options.uncommitted ?? true);
  return { fromRef, toRef, fromLabel, toLabel, includeUncommitted };
}

export async function runGenerateLogs(pathArg: string | undefined, options: GenerateLogsCommandOptions): Promise<void> {
  const targetDir = resolve(process.cwd(), pathArg ?? ".");
  if (!existsSync(targetDir) || !statSync(targetDir).isDirectory()) {
    throw new UserInputError(`Target path is not a directory: ${targetDir}`);
  }

  const insideRepo = tryRunGit(targetDir, ["rev-parse", "--is-inside-work-tree"]);
  if (insideRepo !== "true") {
    throw new UserInputError(`Target path is not a git repository: ${targetDir}`);
  }

  const outputPath = resolve(targetDir, options.output?.trim() || DEFAULT_OUTPUT_FILE);
  const existingContent = existsSync(outputPath) ? readFileSync(outputPath, "utf8") : "";

  const planSpinner = spinner({ indicator: "dots" });
  planSpinner.start("Step 1/4: Resolving release range...");
  const range = selectRange(options, targetDir, outputPath);
  planSpinner.stop(`Step 1/4: Range resolved (${range.fromLabel} -> ${range.toLabel}).`);

  const scanSpinner = spinner({ indicator: "dots" });
  scanSpinner.start("Step 2/4: Collecting git deltas...");
  const diff = collectDiffContext(targetDir, range.fromRef, range.toRef, range.includeUncommitted);
  scanSpinner.stop(`Step 2/4: Collected ${diff.changedFiles.size} changed file(s).`);

  const prompt = buildAiPrompt({
    fromLabel: range.fromLabel,
    toLabel: range.toLabel,
    diff,
    existingTopSection: getTopSectionForPrompt(existingContent),
    includeUncommitted: range.includeUncommitted
  });

  const aiTimeoutMs = normalizeAiTimeoutMs(options.aiTimeoutSec);
  const streamAiFileOps = options.showAiFileOps ?? false;
  const aiSpinner = streamAiFileOps ? null : spinner({ indicator: "dots" });
  if (aiSpinner) {
    aiSpinner.start("Step 3/4: Generating release notes with AI...");
  } else {
    log.info("Step 3/4: Generating release notes with AI...");
  }

  let lastAiStatus = "";
  const aiResult = await runAiFreeformTask({
    prompt,
    provider: options.provider ?? "auto",
    targetAgent: (options.agent ?? "codex") as AgentTarget,
    ...(options.model ? { model: options.model } : {}),
    cwd: targetDir,
    aiTimeoutMs,
    showAiFileOps: options.showAiFileOps ?? false,
    expectFileWrites: false,
    onStatus(message) {
      if (message === lastAiStatus) return;
      lastAiStatus = message;
      if (aiSpinner) {
        aiSpinner.message(`Step 3/4: ${message}`);
      } else {
        log.info(`Step 3/4: ${message}`);
      }
    }
  });

  if (!aiResult.ok) {
    if (aiSpinner) {
      aiSpinner.stop("Step 3/4: AI generation failed.");
    } else {
      log.error("Step 3/4: AI generation failed.");
    }
    throw new ExecutionError(aiResult.warning ?? "AI release log generation failed.");
  }
  if (aiSpinner) {
    aiSpinner.stop("Step 3/4: AI release notes generated.");
  } else {
    log.success("Step 3/4: AI release notes generated.");
  }

  const parsed = parseWithSchema(aiResult.output, releaseLogSchema);
  if (!parsed) {
    throw new ExecutionError("AI output could not be parsed into release log schema (changes/fixes JSON).");
  }

  const changes = Array.from(
    new Set(parsed.changes.map((entry) => normalizeBulletText(entry)).filter((entry) => entry.length > 0))
  );
  const fixes = Array.from(new Set(parsed.fixes.map((entry) => normalizeBulletText(entry)).filter((entry) => entry.length > 0)));

  if (changes.length === 0) {
    log.info("Step 3/4: No changes entries generated for this range.");
  }
  if (fixes.length === 0) {
    log.info("Step 3/4: No fixes entries generated for this range.");
  }
  if (changes.length === 0 && fixes.length === 0) {
    log.warn("Step 4/4: AI returned no release entries. RELEASE_LOG.md was not modified.");
    return;
  }

  const markdown = renderMarkdown(changes, fixes);
  const section = renderVersionSection(range.fromLabel, range.toLabel, markdown);
  const merged = upsertVersionSection(existingContent, `## ${range.fromLabel} -> ${range.toLabel}`, section);

  const writeSpinner = spinner({ indicator: "dots" });
  writeSpinner.start("Step 4/4: Writing release log section...");
  writeFileSync(outputPath, merged, "utf8");
  writeSpinner.stop("Step 4/4: Release log updated.");

  if (options.stdout) {
    process.stdout.write(`${section}\n`);
  }

  log.success(`Generated AI release logs from ${range.fromLabel} to ${range.toLabel}.`);
  log.info(`Saved ${outputPath}.`);
}
