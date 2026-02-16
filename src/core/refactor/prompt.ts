import type { RefactorPolicy } from "../refactor-policy.js";
import type { RepoRefactorScan } from "./contracts.js";

function renderInsightRows<T>(
  entries: T[],
  formatter: (entry: T) => string,
  fallback: string
): string[] {
  if (!entries.length) return [fallback];
  return entries.map((entry) => formatter(entry));
}

export function buildRefactorPrompt(
  scan: RepoRefactorScan,
  policy: RefactorPolicy,
  options: { dryRun: boolean; notes?: string; focus?: string; orchestration?: boolean; maxSubagents?: number }
): string {
  const largestRows = renderInsightRows(
    scan.largestFiles,
    (entry) =>
      `- ${entry.path} (${entry.lineCount} LOC, fan-in ${entry.fanIn}, exports ${entry.exportCount}, functions ${entry.functionCount})`,
    "- No source files detected."
  );
  const monolithRows = renderInsightRows(
    scan.monolithCandidates,
    (entry) =>
      `- ${entry.path} (${entry.lineCount} LOC, imports ${entry.internalImportCount}, exports ${entry.exportCount}, functions ${entry.functionCount})`,
    "- No monolith-sized files above threshold were detected."
  );
  const couplingRows = renderInsightRows(
    scan.couplingCandidates,
    (entry) =>
      `- ${entry.path} (score ${entry.score}; ${entry.reasons.join(", ") || "coupling hotspot"}). Proposed split: ${entry.splitHypothesis}`,
    "- No high-coupling hotspots detected."
  );
  const debtRows = renderInsightRows(
    scan.debtCandidates,
    (entry) =>
      `- ${entry.path} (TODO/FIXME ${entry.todoCount}, low-signal comments ${entry.lowSignalCommentLines}).`,
    "- No TODO/FIXME or comment-debt hotspots detected."
  );
  const commentRows = renderInsightRows(
    scan.commentCleanupCandidates,
    (entry) =>
      `- ${entry.path} (${entry.lowSignalCommentLines}/${entry.commentLines} low-signal comment lines, ${entry.lineCount} LOC)`,
    "- No strong low-signal comment hotspots were detected."
  );

  const lines: string[] = [
    "You are a senior refactoring agent working directly inside this repository.",
    "",
    "Primary objective:",
    "- Make the codebase scalable and comfortable for AI-assisted maintenance.",
    "- Remove AI-slop and low-value comments while preserving useful documentation.",
    "- Split monolithic and over-coupled files into cohesive modules with explicit boundaries.",
    "",
    "Hard constraints:",
    "- Preserve behavior and public contracts (CLI flags, API payloads, output semantics).",
    "- Do not change user-facing UI/UX behavior, visual design, or interaction flow unless explicitly requested.",
    "- Keep business logic outcomes and side-effect semantics identical.",
    "- Prefer many small safe refactor steps over one large rewrite.",
    "- Do not introduce placeholder logic, speculative abstractions, or TODO-only edits.",
    "- Keep deterministic ordering and outputs.",
    "- If contracts or architecture boundaries change, update docs in the same change.",
    "",
    "Repository scan summary:",
    `- Detected stack: ${scan.techStack}`,
    `- Inferred project shape: ${scan.projectShape}`,
    `- Scanned source files: ${scan.scannedSourceFiles}`,
    `- Scanned source lines: ${scan.scannedTotalLines}`,
    `- Scan reached configured file cap: ${scan.reachedFileCap ? "yes" : "no"}`,
    "",
    "Large files (with structural metrics):",
    ...largestRows,
    "",
    "Monolith split candidates:",
    ...monolithRows,
    "",
    "Coupling hotspots (priority refactor targets):",
    ...couplingRows,
    "",
    "Technical debt hotspots:",
    ...debtRows,
    "",
    "Comment cleanup candidates:",
    ...commentRows,
    "",
    "Refactor policy from research:",
    `- Baseline skill: ${policy.baselineSkill.name} (${policy.baselineSkill.purpose})`,
    ...policy.stackSkills.map((skill) => `- Stack add-on: ${skill.name} (${skill.appliesWhen})`),
    "",
    "Verification commands (run if available in this repo):",
    ...policy.verificationCommands.map((command) => `- ${command}`),
    "",
    "Notes:",
    ...(policy.notes.length ? policy.notes.map((note) => `- ${note}`) : ["- None."]),
    ""
  ];

  const combinedNotes = [options.notes?.trim(), options.focus?.trim()]
    .filter((entry): entry is string => Boolean(entry))
    .join("\n");

  if (combinedNotes) {
    lines.push("Additional user notes:", combinedNotes, "");
  }

  lines.push(
    "Execution workflow:",
    "1) Establish baseline by running available verification commands before edits.",
    "2) Start with top coupling hotspots and monolith files; make focused extractions.",
    "3) Split files by responsibility, isolate contracts/types, and reduce import fan-out.",
    "4) Remove low-value comments and convert intent into concise, high-signal docs.",
    "5) Re-run verification commands and resolve regressions immediately.",
    "6) Never run watch/dev-server commands (`dev`, `start`, `--watch`, `--hot`) during refactor verification.",
    "7) If a verification command hangs (for example lock contention), stop it and report timeout/lock instead of blocking the pass.",
    "8) Return a concise report with changed files, architectural effect, and verification results.",
    ""
  );

  if (options.orchestration) {
    lines.push(
      "Codex orchestration mode:",
      "- Use one coordinator plus workers with strict file ownership.",
      "- A file can be owned by only one worker at a time; no overlapping edits.",
      "- Workers must not delete directories.",
      "- Workers must not spawn additional subagents.",
      "- Merge worker outputs at checkpoints and run verification between checkpoints.",
      `- Keep active worker count within ${options.maxSubagents ?? 12}.`,
      ""
    );
  }

  if (options.dryRun) {
    lines.push(
      "Mode: DRY-RUN",
      "- Do not modify any files.",
      "- Return a concrete, ordered refactor plan with file-level actions and checkpoints."
    );
  } else {
    lines.push(
      "Mode: EXECUTE",
      "- Apply the refactor changes directly in this repository now.",
      "- Keep changes focused and behavior-preserving.",
      "- End with the change report.",
      "- Final line required: PRIMER_REFACTOR_STATUS: COMPLETE or PRIMER_REFACTOR_STATUS: CONTINUE"
    );
  }

  return lines.join("\n");
}
