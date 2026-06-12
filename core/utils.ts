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

/**
 * True when a backend base URL points at a machine-local server (LM Studio,
 * Ollama, vLLM). Cloud providers (Anthropic, Groq, OpenAI, OpenRouter) return
 * false — used to decide whether the user's notes leave the machine and which
 * runtime-specific request fields are safe to send.
 */
/**
 * "Local" here means a private/sovereign endpoint the user controls — not just
 * literal localhost. Bridge-networking addresses (Tailscale, LAN, internal
 * TLDs) are privacy-equivalent to localhost: the user manages them, traffic
 * stays on their own devices/network. Cloud providers fall through to false.
 */
export function isLocalBaseUrl(baseUrl: string): boolean {
  try {
    const u = new URL(baseUrl);
    const h = u.hostname.toLowerCase();
    return (
      // Direct localhost
      h === "localhost" ||
      h === "127.0.0.1" ||
      h === "0.0.0.0" ||
      // mDNS / Bonjour
      h.endsWith(".local") ||
      // Tailscale Magic DNS
      h.endsWith(".ts.net") ||
      h.endsWith(".tailscale.net") ||
      // Common internal TLDs
      h.endsWith(".lan") ||
      h.endsWith(".home") ||
      h.endsWith(".internal") ||
      // RFC 1918 private IPv4 ranges (LAN)
      /^10\./.test(h) ||
      /^192\.168\./.test(h) ||
      /^172\.(1[6-9]|2[0-9]|3[01])\./.test(h)
    );
  } catch {
    return false;
  }
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
  lbl.setCssStyles({
    fontSize: "0.78em",
    opacity: "0.55",
    marginBottom: "4px",
    fontStyle: "italic",
  });
  lbl.setText(name);
}
