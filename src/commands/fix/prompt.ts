import type { RefactorPolicy } from "../../core/refactor-policy.js";
import type { RepoRefactorScan } from "../../core/refactor.js";

import type { FixVerificationCommandResult } from "./verification.js";

function trimOutput(raw: string, maxChars = 700): string {
  const normalized = raw.trim();
  if (!normalized) return "(no output)";
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, maxChars)}...`;
}

function renderFailureRows(failures: FixVerificationCommandResult[]): string[] {
  if (!failures.length) {
    return ["- No actionable verification failures."];
  }

  const rows: string[] = [];
  for (const failure of failures) {
    rows.push(`- Command: ${failure.command}`);
    if (failure.reason) rows.push(`  Reason: ${failure.reason}`);
    rows.push(`  stderr: ${trimOutput(failure.stderr)}`);
    rows.push(`  stdout: ${trimOutput(failure.stdout)}`);
  }
  return rows;
}

export function buildFixPrompt(options: {
  scan: RepoRefactorScan;
  policy: RefactorPolicy;
  verificationCommands: string[];
  failures: FixVerificationCommandResult[];
  pass: number;
  totalPasses: number;
  notes?: string;
}): string {
  const lines: string[] = [
    "You are a senior reliability and maintenance agent working directly in this repository.",
    "",
    "Primary objective:",
    "- Resolve actionable verification failures (lint/test/typecheck/build/check) with minimal safe edits.",
    "- Keep behavior and public contracts unchanged.",
    "- Keep user-visible UI/UX and visual design unchanged unless explicitly requested.",
    "",
    "Repository context:",
    `- Detected stack: ${options.scan.techStack}`,
    `- Inferred project shape: ${options.scan.projectShape}`,
    `- Source files scanned: ${options.scan.scannedSourceFiles}`,
    "",
    "Golden execution constraints:",
    "- Make focused, behavior-preserving fixes only.",
    "- Do not introduce TODO placeholders or speculative abstractions.",
    "- Do not run watch/dev-server commands (`dev`, `start`, `--watch`, `--hot`).",
    "- If a verification command hangs (for example lock contention), stop and report timeout/lock.",
    "",
    "Verification commands for this repo (run if available):",
    ...options.verificationCommands.map((command) => `- ${command}`),
    "",
    "Current actionable failures to fix:",
    ...renderFailureRows(options.failures),
    "",
    "Research policy notes:",
    ...(options.policy.notes.length ? options.policy.notes.map((note) => `- ${note}`) : ["- None."]),
    ""
  ];

  if (options.notes?.trim()) {
    lines.push("Additional user notes:", options.notes.trim(), "");
  }

  lines.push(
    `Pass context: ${options.pass}/${options.totalPasses}`,
    "",
    "Execution workflow:",
    "1) Reproduce and understand each actionable failure from the provided outputs.",
    "2) Apply minimal edits to resolve root causes in failing files.",
    "3) Keep edits small and avoid broad refactors unless strictly required for the failures.",
    "4) Re-run relevant one-shot verification commands and report outcomes.",
    "5) Return a concise report with changed files and verification results.",
    "",
    "Mode: EXECUTE",
    "- Apply fixes directly in this repository now.",
    "- End with the change report.",
    "- Final line required: PRIMER_REFACTOR_STATUS: COMPLETE or PRIMER_REFACTOR_STATUS: CONTINUE"
  );

  return lines.join("\n");
}
