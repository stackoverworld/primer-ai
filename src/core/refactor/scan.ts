import { resolve } from "node:path";

import type { RepoRefactorScan } from "./contracts.js";
import {
  selectCommentCleanupCandidates,
  selectCouplingCandidates,
  selectDebtCandidates,
  selectLargest,
  selectMonolithCandidates,
  toPublicInsight
} from "./scan/hotspots.js";
import { inferProjectShape, inferTechStack, readPackageSignals } from "./scan/project-inference.js";
import { scanSourceFiles } from "./scan/source-scan.js";

export function clampMaxFiles(value: number): number {
  if (!Number.isFinite(value)) return 20_000;
  if (value < 80) return 80;
  if (value > 120_000) return 120_000;
  return Math.floor(value);
}

export function scanRepositoryForRefactor(targetDir: string, maxFilesInput = 20_000): RepoRefactorScan {
  const root = resolve(targetDir);
  const maxFiles = clampMaxFiles(maxFilesInput);
  const { files, reachedFileCap } = scanSourceFiles(root, maxFiles);
  const packageSignals = readPackageSignals(root);
  const publicFiles = files.map(toPublicInsight);
  const techStack = inferTechStack(root, packageSignals, publicFiles);
  const projectShape = inferProjectShape(root, techStack, packageSignals);

  return {
    targetDir: root,
    techStack,
    projectShape,
    scannedSourceFiles: files.length,
    scannedTotalLines: files.reduce((sum, file) => sum + file.lineCount, 0),
    reachedFileCap,
    largestFiles: selectLargest(files, 12),
    monolithCandidates: selectMonolithCandidates(files),
    couplingCandidates: selectCouplingCandidates(files),
    debtCandidates: selectDebtCandidates(files),
    commentCleanupCandidates: selectCommentCleanupCandidates(files)
  };
}
