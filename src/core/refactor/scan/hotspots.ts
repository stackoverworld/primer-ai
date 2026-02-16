import type { RefactorFileInsight, RefactorHotspot } from "../contracts.js";
import { MONOLITH_COMPLEXITY_THRESHOLD, MONOLITH_LINE_THRESHOLD } from "./constants.js";
import { normalizeSlashPath } from "./path-utils.js";
import type { AnalyzedFile } from "./types.js";

export function toPublicInsight(file: AnalyzedFile): RefactorFileInsight {
  const { moduleKey: _moduleKey, relativeImports: _relativeImports, ...insight } = file;
  return insight;
}

export function selectLargest(files: AnalyzedFile[], take: number): RefactorFileInsight[] {
  return [...files]
    .sort((a, b) => (b.lineCount === a.lineCount ? a.path.localeCompare(b.path) : b.lineCount - a.lineCount))
    .slice(0, take)
    .map(toPublicInsight);
}

export function selectMonolithCandidates(files: AnalyzedFile[]): RefactorFileInsight[] {
  return files
    .filter((file) => file.lineCount >= MONOLITH_LINE_THRESHOLD)
    .map((file) => ({ file, score: monolithComplexityScore(file) }))
    .filter((entry) => entry.score >= MONOLITH_COMPLEXITY_THRESHOLD)
    .sort((a, b) => {
      if (b.score === a.score) {
        if (b.file.lineCount === a.file.lineCount) {
          return a.file.path.localeCompare(b.file.path);
        }
        return b.file.lineCount - a.file.lineCount;
      }
      return b.score - a.score;
    })
    .slice(0, 24)
    .map((entry) => toPublicInsight(entry.file));
}

function monolithComplexityScore(file: AnalyzedFile): number {
  const linePressure = file.lineCount >= MONOLITH_LINE_THRESHOLD ? (file.lineCount - MONOLITH_LINE_THRESHOLD) / 90 + 4 : 0;
  const structurePressure =
    file.internalImportCount * 0.9 +
    file.fanIn * 1.5 +
    file.exportCount * 0.25 +
    file.functionCount * 0.35 +
    file.classCount * 1.2;
  const debtPressure = file.todoCount * 1.4 + file.lowSignalCommentLines * 0.1;

  let score = linePressure + structurePressure + debtPressure;

  // Large cohesive modules with narrow boundaries should not be auto-marked as monolith debt.
  const isLikelyCohesive =
    file.exportCount <= 2 &&
    file.internalImportCount <= 3 &&
    file.fanIn <= 2 &&
    file.classCount <= 1 &&
    file.todoCount === 0;
  if (isLikelyCohesive) {
    score -= 3;
  }

  const isLowBranchingSurface = file.functionCount <= 6 && file.internalImportCount <= 3 && file.exportCount <= 3;
  if (isLowBranchingSurface) {
    score -= 2;
  }

  return Number(score.toFixed(2));
}

export function selectCommentCleanupCandidates(files: AnalyzedFile[]): RefactorFileInsight[] {
  return files
    .filter((file) => {
      if (file.commentLines < 6) return false;
      if (file.lowSignalCommentLines >= 4) return true;
      return file.lowSignalCommentLines / Math.max(1, file.commentLines) >= 0.35;
    })
    .sort((a, b) =>
      b.lowSignalCommentLines === a.lowSignalCommentLines
        ? a.path.localeCompare(b.path)
        : b.lowSignalCommentLines - a.lowSignalCommentLines
    )
    .slice(0, 24)
    .map(toPublicInsight);
}

function hotspotReasons(file: AnalyzedFile): string[] {
  const reasons: string[] = [];
  if (file.lineCount >= MONOLITH_LINE_THRESHOLD) reasons.push(`${file.lineCount} LOC`);
  if (file.fanIn >= 3) reasons.push(`fan-in ${file.fanIn}`);
  if (file.internalImportCount >= 12) reasons.push(`${file.internalImportCount} internal imports`);
  if (file.exportCount >= 10) reasons.push(`${file.exportCount} exports`);
  if (file.functionCount >= 20) reasons.push(`${file.functionCount} function-like declarations`);
  if (file.todoCount >= 3) reasons.push(`${file.todoCount} TODO/FIXME markers`);
  return reasons;
}

function hotspotScore(file: AnalyzedFile): number {
  return (
    file.lineCount / 40 +
    file.fanIn * 2.4 +
    file.internalImportCount * 1.2 +
    file.exportCount * 0.9 +
    file.functionCount * 0.55 +
    file.todoCount * 1.6
  );
}

function isLikelyFacadeFile(file: AnalyzedFile): boolean {
  const hasNoInternalOrchestration =
    file.internalImportCount <= 1 && file.functionCount <= 1 && file.classCount === 0 && file.todoCount === 0;
  const isMostlyExports = file.exportCount >= 2;
  const isSmallToMedium = file.lineCount <= 240;
  return hasNoInternalOrchestration && isMostlyExports && isSmallToMedium;
}

function splitHypothesis(path: string): string {
  const normalized = normalizeSlashPath(path).toLowerCase();
  if (normalized.includes("/commands/")) {
    return "Split into command parser, validation layer, and execution/service layer.";
  }
  if (normalized.includes("/core/ai")) {
    return "Split into provider adapters, prompt builders, and output parsing/validation.";
  }
  if (normalized.includes("/core/prompts")) {
    return "Split into stack detection, prompt question flow, and defaults normalization modules.";
  }
  if (normalized.includes("/core/templates")) {
    return "Split by template domain: docs generators, scripts generators, and adapter generators.";
  }
  if (normalized.includes("/quick-setup")) {
    return "Split into preset detection, command planning, and execution/reporting modules.";
  }
  return "Split into contracts/types, orchestration flow, and helper utilities.";
}

function toHotspot(file: AnalyzedFile): RefactorHotspot {
  const reasons = hotspotReasons(file);
  return {
    ...toPublicInsight(file),
    score: Number(hotspotScore(file).toFixed(2)),
    reasons,
    splitHypothesis: splitHypothesis(file.path)
  };
}

export function selectCouplingCandidates(files: AnalyzedFile[]): RefactorHotspot[] {
  return files
    .filter((file) => file.fanIn >= 2 || file.internalImportCount >= 9 || file.exportCount >= 8)
    .filter((file) => !isLikelyFacadeFile(file))
    .map(toHotspot)
    .sort((a, b) => (b.score === a.score ? a.path.localeCompare(b.path) : b.score - a.score))
    .slice(0, 16);
}

export function selectDebtCandidates(files: AnalyzedFile[]): RefactorHotspot[] {
  return files
    .filter((file) => file.todoCount > 0 || file.lowSignalCommentLines >= 3)
    .map(toHotspot)
    .sort((a, b) => {
      if (b.todoCount === a.todoCount) {
        if (b.lowSignalCommentLines === a.lowSignalCommentLines) {
          return a.path.localeCompare(b.path);
        }
        return b.lowSignalCommentLines - a.lowSignalCommentLines;
      }
      return b.todoCount - a.todoCount;
    })
    .slice(0, 16);
}
