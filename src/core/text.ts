export function toKebabCase(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function toTitleCase(value: string): string {
  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part[0]!.toUpperCase() + part.slice(1))
    .join(" ");
}

export function normalizeMarkdown(content: string): string {
  return content.replace(/\r\n/g, "\n").trimEnd() + "\n";
}

export function countLines(content: string): number {
  return content.split("\n").length;
}
