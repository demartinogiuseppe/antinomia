// Antinomia — frontmatter / note-title helpers.
// Extracted from main.ts (refactor v1.5).

import { App, TFile } from "obsidian";
import { TYPE } from "./constants";
import type { AntinomiaFrontmatter, GraphFilters } from "./types";

/**
 * Read a file's frontmatter as a typed AntinomiaFrontmatter (Obsidian types it
 * as `any`). Returns undefined when the file has no cached frontmatter.
 */
export function readFrontmatter(
  app: App,
  file: TFile
): AntinomiaFrontmatter | undefined {
  return app.metadataCache.getFileCache(file)?.frontmatter as
    | AntinomiaFrontmatter
    | undefined;
}

/**
 * Map a note's frontmatter to its graph layer key (the GraphFilters key used
 * for colouring/filtering), or null if it isn't an Antinomia note.
 *
 * Notable cases:
 *  - tension: status elevated/resolved/(open) -> tensione_elevata/risolta/aperta
 *  - defeated with motive=elevated: the ORIGINAL tension that produced a
 *    principle (Design C) -> shown under the "Elevated" layer, not "Defeated".
 *
 * Extracted from AntinomiaGraphView so it can be unit-tested.
 */
export function layerKey(fm: unknown): keyof GraphFilters | null {
  const f = (fm ?? {}) as {
    antinomia_type?: unknown;
    status?: unknown;
    motive?: unknown;
  };
  const t = f.antinomia_type;
  if (t === TYPE.tension) {
    const stato = f.status;
    if (stato === "elevated") return "tensione_elevata";
    if (stato === "resolved") return "tensione_risolta";
    return "tensione_aperta";
  }
  if (t === TYPE.substrate) return "substrate";
  if (t === TYPE.principle) return "principle";
  if (t === TYPE.defeated) {
    const motive = f.motive;
    if (motive === "elevated") return "tensione_elevata";
    return "defeated";
  }
  if (t === TYPE.meta) return "meta_note";
  if (t === TYPE.presupposition) return "presupposition";
  return null;
}

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
