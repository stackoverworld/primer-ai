import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import type { RefactorFileInsight, RefactorHotspot, RepoRefactorScan } from "../../../core/refactor.js";

export const MAX_SCAN_CANDIDATES = 32;

export interface ScanCandidate {
  path: string;
  lineCount: number;
  fanIn: number;
  internalImportCount: number;
  exportCount: number;
  functionCount: number;
  classCount: number;
  todoCount: number;
  lowSignalCommentLines: number;
  snippet: string;
}

function pushUniquePath(target: string[], seen: Set<string>, path: string): void {
  if (seen.has(path)) return;
  seen.add(path);
  target.push(path);
}

export function buildInsightMap(scan: RepoRefactorScan): Map<string, RefactorFileInsight> {
  const map = new Map<string, RefactorFileInsight>();
  for (const file of scan.largestFiles) map.set(file.path, file);
  for (const file of scan.monolithCandidates) map.set(file.path, file);
  for (const file of scan.commentCleanupCandidates) map.set(file.path, file);
  for (const file of scan.couplingCandidates) map.set(file.path, file);
  for (const file of scan.debtCandidates) map.set(file.path, file);
  return map;
}

export function buildHotspotMap(scan: RepoRefactorScan): Map<string, RefactorHotspot> {
  const map = new Map<string, RefactorHotspot>();
  for (const hotspot of scan.couplingCandidates) map.set(hotspot.path, hotspot);
  for (const hotspot of scan.debtCandidates) map.set(hotspot.path, hotspot);
  return map;
}

export function toPathSet(entries: Array<{ path: string }>): Set<string> {
  return new Set(entries.map((entry) => entry.path));
}

function readSnippet(root: string, relativePath: string): string {
  const absolutePath = join(root, relativePath);
  if (!existsSync(absolutePath)) return "";

  try {
    const raw = readFileSync(absolutePath, "utf8");
    const lines = raw.split(/\r?\n/);
    const keyLines = lines.filter((line) =>
      /\b(export|function|class|interface|type|const|let|var)\b/.test(line) ||
      line.includes("normalizeMarkdown(`") ||
      line.includes("return normalizeMarkdown(`")
    );

    const selectedLines = (keyLines.length >= 14 ? keyLines : lines).slice(0, 80);
    const snippet = selectedLines.join("\n").trim();
    if (!snippet) return "";
    if (snippet.length <= 1200) return snippet;
    return `${snippet.slice(0, 1200)}\n...`;
  } catch {
    return "";
  }
}

export function collectCandidates(scan: RepoRefactorScan): ScanCandidate[] {
  const orderedPaths: string[] = [];
  const seen = new Set<string>();

  for (const entry of scan.monolithCandidates) pushUniquePath(orderedPaths, seen, entry.path);
  for (const entry of scan.couplingCandidates) pushUniquePath(orderedPaths, seen, entry.path);
  for (const entry of scan.debtCandidates) pushUniquePath(orderedPaths, seen, entry.path);
  for (const entry of scan.commentCleanupCandidates) pushUniquePath(orderedPaths, seen, entry.path);
  for (const entry of scan.largestFiles) pushUniquePath(orderedPaths, seen, entry.path);

  const insightMap = buildInsightMap(scan);
  const limitedPaths = orderedPaths.slice(0, MAX_SCAN_CANDIDATES);

  const candidates: ScanCandidate[] = [];
  for (const path of limitedPaths) {
    const insight = insightMap.get(path);
    if (!insight) continue;

    candidates.push({
      path: insight.path,
      lineCount: insight.lineCount,
      fanIn: insight.fanIn,
      internalImportCount: insight.internalImportCount,
      exportCount: insight.exportCount,
      functionCount: insight.functionCount,
      classCount: insight.classCount,
      todoCount: insight.todoCount,
      lowSignalCommentLines: insight.lowSignalCommentLines,
      snippet: readSnippet(scan.targetDir, insight.path)
    });
  }

  return candidates;
}

export function normalizePathSelection(paths: string[], allowedPaths: Set<string>): string[] {
  const selected: string[] = [];
  const seen = new Set<string>();

  for (const rawPath of paths) {
    const trimmed = rawPath.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    if (!allowedPaths.has(trimmed)) continue;
    seen.add(trimmed);
    selected.push(trimmed);
  }

  return selected;
}

export function selectInsights(paths: string[], insightMap: Map<string, RefactorFileInsight>): RefactorFileInsight[] {
  const selected: RefactorFileInsight[] = [];
  for (const path of paths) {
    const insight = insightMap.get(path);
    if (insight) selected.push(insight);
  }
  return selected;
}

export function selectHotspots(paths: string[], hotspotMap: Map<string, RefactorHotspot>): RefactorHotspot[] {
  const selected: RefactorHotspot[] = [];
  for (const path of paths) {
    const hotspot = hotspotMap.get(path);
    if (hotspot) selected.push(hotspot);
  }
  return selected;
}
