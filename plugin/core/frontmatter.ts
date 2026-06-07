// Antinomia — frontmatter / note-title helpers.
// Extracted from main.ts (refactor v1.5).

import { App, TFile } from "obsidian";

export function stripFrontmatter(raw: string): string {
  if (!raw.startsWith("---")) return raw;
  const end = raw.indexOf("\n---", 3);
  if (end === -1) return raw;
  const after = raw.slice(end + 4);
  return after.startsWith("\n") ? after.slice(1) : after;
}

/**
 * Quote a string for use as a YAML scalar in our raw template strings.
 * Necessary because user-provided titles (and similar) may contain `:`,
 * `#`, `"`, leading `-`, etc., which break unquoted YAML parsing.
 * Always wraps in double quotes and escapes embedded `\\` and `"`.
 */
export function yamlQuote(s: string): string {
  return '"' + s.replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"';
}

export function humanTitle(app: App, file: TFile): string {
  const cache = app.metadataCache.getFileCache(file);
  const fm = cache?.frontmatter;
  const explicit =
    (fm?.title as string | undefined) ?? (fm?.title as string | undefined);
  if (explicit && String(explicit).trim()) return String(explicit).trim();
  const firstHeading = cache?.headings?.[0]?.heading;
  if (firstHeading && firstHeading.trim()) return firstHeading.trim();
  return file.basename;
}
