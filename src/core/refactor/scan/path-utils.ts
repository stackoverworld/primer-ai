import { extname, relative } from "node:path";

import { SOURCE_EXTENSIONS } from "./constants.js";

export function normalizeRelativePath(root: string, absolutePath: string): string {
  return relative(root, absolutePath).replaceAll("\\", "/");
}

export function normalizeSlashPath(path: string): string {
  return path.replaceAll("\\", "/");
}

export function extensionOf(path: string): string {
  const normalized = path.toLowerCase();
  const dotIndex = normalized.lastIndexOf(".");
  return dotIndex === -1 ? "" : normalized.slice(dotIndex);
}

function stripSourceExtension(path: string): string {
  const extension = extname(path).toLowerCase();
  if (!SOURCE_EXTENSIONS.has(extension)) return path;
  return path.slice(0, path.length - extension.length);
}

export function toModuleKey(path: string): string {
  const normalized = stripSourceExtension(normalizeSlashPath(path));
  return normalized.endsWith("/index") ? normalized.slice(0, -"/index".length) : normalized;
}
