import type { RepoRefactorScan } from "../../core/refactor.js";

export interface RefactorBacklog {
  monolithCount: number;
  couplingCount: number;
  debtCount: number;
  commentCount: number;
  score: number;
  signature: string;
}

export function summarizeBacklog(scan: RepoRefactorScan): RefactorBacklog {
  const couplingScore = scan.couplingCandidates.reduce((sum, entry) => sum + entry.score, 0);
  const debtScore = scan.debtCandidates.reduce((sum, entry) => sum + entry.score, 0);
  const monolithPressure = scan.monolithCandidates.reduce((sum, entry) => sum + entry.lineCount / 100, 0);
  const commentPressure = scan.commentCleanupCandidates.reduce((sum, entry) => sum + entry.lowSignalCommentLines, 0);
  const score = Number(
    (
      scan.monolithCandidates.length * 120 +
      couplingScore * 10 +
      debtScore * 6 +
      scan.commentCleanupCandidates.length * 2 +
      monolithPressure +
      commentPressure * 0.5
    ).toFixed(2)
  );

  const signature = [
    scan.monolithCandidates.map((entry) => `${entry.path}:${entry.lineCount}`).join("|"),
    scan.couplingCandidates.map((entry) => `${entry.path}:${entry.score}`).join("|"),
    scan.debtCandidates.map((entry) => `${entry.path}:${entry.todoCount}:${entry.lowSignalCommentLines}`).join("|"),
    scan.commentCleanupCandidates.map((entry) => `${entry.path}:${entry.lowSignalCommentLines}`).join("|")
  ].join("::");

  return {
    monolithCount: scan.monolithCandidates.length,
    couplingCount: scan.couplingCandidates.length,
    debtCount: scan.debtCandidates.length,
    commentCount: scan.commentCleanupCandidates.length,
    score,
    signature
  };
}

export function hasPendingBacklog(backlog: RefactorBacklog): boolean {
  return (
    backlog.monolithCount > 0 ||
    backlog.couplingCount > 0 ||
    backlog.debtCount > 0 ||
    backlog.commentCount > 0
  );
}

function isLikelyFacadeFile(file: {
  lineCount: number;
  internalImportCount: number;
  functionCount: number;
  classCount: number;
  todoCount: number;
  exportCount: number;
}): boolean {
  const hasNoInternalOrchestration =
    file.internalImportCount <= 1 && file.functionCount <= 1 && file.classCount === 0 && file.todoCount === 0;
  const isMostlyExports = file.exportCount >= 2;
  const isSmallToMedium = file.lineCount <= 240;
  return hasNoInternalOrchestration && isMostlyExports && isSmallToMedium;
}

export function hasActionableScanBacklog(scan: RepoRefactorScan): boolean {
  const actionableMonolith = scan.monolithCandidates.some((file) => file.lineCount >= 320);
  const actionableCoupling = scan.couplingCandidates.some((file) => !isLikelyFacadeFile(file));
  return (
    actionableMonolith ||
    actionableCoupling ||
    scan.debtCandidates.length > 0 ||
    scan.commentCleanupCandidates.length > 0
  );
}

export function sameBacklog(previous: RefactorBacklog, next: RefactorBacklog): boolean {
  if (previous.signature !== next.signature) return false;
  return Math.abs(previous.score - next.score) < 0.05;
}

export function formatBacklogCompact(backlog: RefactorBacklog): string {
  const labels: string[] = [];
  if (backlog.monolithCount > 0) labels.push(`${backlog.monolithCount} monolith`);
  if (backlog.couplingCount > 0) labels.push(`${backlog.couplingCount} coupling`);
  if (backlog.debtCount > 0) labels.push(`${backlog.debtCount} debt`);
  if (backlog.commentCount > 0) labels.push(`${backlog.commentCount} comment-cleanup`);
  return labels.length > 0 ? labels.join(", ") : "clear";
}
