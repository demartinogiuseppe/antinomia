// Antinomia — small, dependency-light utility helpers.
// Extracted from main.ts (refactor v1.5). No Antinomia-internal imports.

import { App, moment } from "obsidian";

export function todayISO(): string {
  return moment().format("YYYY-MM-DD");
}

export function timestampId(): string {
  return moment().format("YYYYMMDD-HHmmss");
}

export async function ensureFolder(app: App, path: string): Promise<void> {
  if (!app.vault.getAbstractFileByPath(path))
    await app.vault.createFolder(path);
}

export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max).trimEnd() + " [...]";
}

/**
 * Extract a YouTube video ID from any common URL form.
 * Returns null if not a YouTube URL.
 */
export function extractYouTubeId(input: string): string | null {
  const trimmed = input.trim();
  // youtu.be/<id>
  let m = trimmed.match(/youtu\.be\/([A-Za-z0-9_-]{11})/);
  if (m) return m[1];
  // youtube.com/watch?v=<id>
  m = trimmed.match(/[?&]v=([A-Za-z0-9_-]{11})/);
  if (m) return m[1];
  // youtube.com/embed/<id> or /shorts/<id> or /v/<id>
  m = trimmed.match(/youtube\.com\/(?:embed|shorts|v)\/([A-Za-z0-9_-]{11})/);
  if (m) return m[1];
  // Bare 11-char id (unlikely but cheap to support)
  if (/^[A-Za-z0-9_-]{11}$/.test(trimmed)) return trimmed;
  return null;
}

export function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

export function alphabeticOwner(a: string, b: string): string {
  return a < b ? a : b;
}

/**
 * Helper to render the optional vault display name as a small subheader.
 * Used in the top of main sidebars.
 */
export function renderVaultLabel(parent: HTMLElement, name: string): void {
  if (!name) return;
  const lbl = parent.createEl("div");
  lbl.style.fontSize = "0.78em";
  lbl.style.opacity = "0.55";
  lbl.style.marginBottom = "4px";
  lbl.style.fontStyle = "italic";
  lbl.setText(name);
}
