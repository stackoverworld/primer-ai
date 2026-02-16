import type { RepoRefactorScan } from "../../../core/refactor.js";

import type { ScanCandidate } from "./candidates.js";

export function buildAiScanCalibrationPrompt(
  scan: RepoRefactorScan,
  candidates: ScanCandidate[],
  notes?: string
): string {
  const payload = {
    repository: {
      techStack: scan.techStack,
      projectShape: scan.projectShape,
      scannedSourceFiles: scan.scannedSourceFiles,
      scannedSourceLines: scan.scannedTotalLines
    },
    candidates
  };

  return [
    "You are auditing refactor signals for a software codebase.",
    "Classify ONLY provided candidate files into refactor categories.",
    "Return ONLY JSON. No markdown.",
    "",
    "Category semantics:",
    "- monolithPaths: file is truly multi-responsibility and should be split.",
    "- couplingPaths: file has problematic fan-in/dependency coupling.",
    "- debtPaths: file has actionable TODO/FIXME/debt risk.",
    "- commentCleanupPaths: file has low-signal comments worth cleanup.",
    "",
    "Important guidance:",
    "- Calibration is conservative: remove false positives, do not invent new categories.",
    "- A large file is NOT automatically monolithic.",
    "- Template-heavy files containing generated script text/literals should NOT be labeled monolith unless orchestration complexity is clearly high.",
    "- Facade/barrel files that mostly re-export contracts should NOT be marked as coupling hotspots.",
    "- Be conservative: avoid false positives.",
    "- Select only paths from candidates.",
    "",
    "Required output schema:",
    '{"monolithPaths": string[], "couplingPaths": string[], "debtPaths": string[], "commentCleanupPaths": string[]}',
    "",
    ...(notes?.trim()
      ? [
          "User notes for calibration context:",
          notes.trim(),
          ""
        ]
      : []),
    "Candidate payload:",
    JSON.stringify(payload, null, 2)
  ].join("\n");
}
