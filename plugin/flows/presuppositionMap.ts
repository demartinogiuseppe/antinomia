// Antinomia — presupposition (U-) mapping flow (v1.5, PTM Core).
//
// Surfaces the implicit, load-bearing assumptions a principle rests on, keeps
// the bidirectional links in sync (principle.presupposes <-> U.presupposes_of),
// and answers "what collapses if this fails?".

import { App, Notice, TFile } from "obsidian";
import type AntinomiaPlugin from "../main";
import { callAI } from "../ai/callAI";
import { notifyAIUsage, showErrorModal } from "../ai/notifyUsage";
import { parsePresuppositionsFromAIResponse } from "../ai/parseResponse";
import { PRESUPPOSITION_MAP_SYSTEM } from "../ai/prompts";
import { TYPE } from "../core/constants";
import { stripFrontmatter, humanTitle } from "../core/frontmatter";
import { presuppositionTemplate } from "../core/templates";
import type { PresuppositionProposal } from "../core/types";
import { PresuppositionMapModal } from "../modals/PresuppositionMapModal";
import { CollapseImpactModal } from "../modals/CollapseImpactModal";

// --- pure helpers (exported for tests) ------------------------------------

/** Strip wikilink brackets: "[[X]]" -> "X"; bare "X" -> "X". */
export function linkToBasename(s: string): string {
  const m = String(s).match(/^\[\[([^\]|]+)(?:\|[^\]]*)?\]\]$/);
  return (m ? m[1] : String(s)).trim();
}

/** A frontmatter list value (wikilinks or bare) -> array of basenames. */
export function basenamesFromFrontmatter(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((v) => linkToBasename(String(v))).filter(Boolean);
}

/** Wrap basenames as wikilinks for writing to frontmatter. */
export function toWikilinks(basenames: string[]): string[] {
  return basenames.map((b) => `[[${b}]]`);
}

/** Union of two basename lists, de-duplicated, order-stable. */
export function mergeUnique(a: string[], b: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of [...a, ...b]) {
    if (!seen.has(x)) {
      seen.add(x);
      out.push(x);
    }
  }
  return out;
}

/** Short, filename-friendly title from a presupposition sentence. */
export function presuppositionTitle(text: string): string {
  const words = text.trim().replace(/[.]+$/, "").split(/\s+/);
  const t = words.slice(0, 8).join(" ");
  return t.length > 60 ? t.slice(0, 60).trim() : t;
}

// --- decisions from the modal --------------------------------------------

export type PresupDecision =
  | { action: "new"; text: string; confidence: "high" | "medium" | "low" }
  | { action: "link"; basename: string };

export interface ExistingPresupposition {
  basename: string;
  title: string;
  snippet: string;
}

// --- vault operations -----------------------------------------------------

/** All presupposition (U-) notes in the vault, with a short snippet. */
export function gatherExistingPresuppositions(app: App): ExistingPresupposition[] {
  const out: ExistingPresupposition[] = [];
  for (const file of app.vault.getMarkdownFiles()) {
    const fm = app.metadataCache.getFileCache(file)?.frontmatter;
    if (fm?.antinomia_type !== TYPE.presupposition) continue;
    out.push({
      basename: file.basename,
      title: humanTitle(app, file),
      snippet: "",
    });
  }
  return out;
}

/**
 * Map the presuppositions of the active principle: ask the AI for 3-5 implicit
 * assumptions (dedup-aware against existing U- notes), then open the review
 * modal. On confirm, new U- notes are created and the bidirectional links are
 * written. Returns silently on non-principle notes / missing key.
 */
export async function mapPresuppositionsOfPrinciple(
  plugin: AntinomiaPlugin,
  file: TFile,
  attachToButton?: HTMLButtonElement
): Promise<void> {
  const app = plugin.app;
  const fm = app.metadataCache.getFileCache(file)?.frontmatter;
  if (fm?.antinomia_type !== TYPE.principle) {
    new Notice("Map presuppositions: the active note is not a principle.");
    return;
  }
  const profile = plugin.profileFor("default");
  if (!profile.apiKey) {
    showErrorModal(
      app,
      "API key missing",
      "The active AI profile has no API key. Open Settings → Antinomia and add one."
    );
    return;
  }

  let raw = "";
  try {
    raw = await app.vault.read(file);
  } catch (e) {
    new Notice(`Read error: ${(e as Error).message}`);
    return;
  }
  const title = humanTitle(app, file);
  const body = stripFrontmatter(raw).trim();
  const existing = gatherExistingPresuppositions(app);
  const existingList = existing.length
    ? existing
        .map((e) => `- ${e.basename}: ${e.title}`)
        .join("\n")
    : "(none yet)";

  const userContent =
    `PRINCIPLE\nTitle: ${title}\n\n${body}\n\n` +
    `EXISTING PRESUPPOSITIONS IN THE VAULT (prefer linking via similar_existing when meaning matches):\n${existingList}`;

  new Notice("Mapping presuppositions…");
  const t0 = Date.now();
  let proposals: PresuppositionProposal[] | null = null;
  try {
    const result = await callAI({
      baseUrl: profile.baseUrl,
      apiKey: profile.apiKey,
      model: profile.model,
      system: PRESUPPOSITION_MAP_SYSTEM,
      messages: [{ role: "user", content: userContent }],
      taskClass: "medium",
    });
    notifyAIUsage(
      "Presuppositions",
      result.usage,
      Date.now() - t0,
      { app, profile: profile.name, model: profile.model, url: profile.baseUrl },
      attachToButton
    );
    proposals = parsePresuppositionsFromAIResponse(result.text);
  } catch (e) {
    showErrorModal(
      app,
      "Presupposition mapping error",
      `Couldn't map presuppositions. ${(e as Error).message}`,
      `Profile: ${profile.name} (${profile.model})\n\n${(e as Error).message}`
    );
    return;
  }

  if (!proposals || proposals.length === 0) {
    showErrorModal(
      app,
      "No presuppositions parsed",
      "The AI replied but no presuppositions could be parsed. Try again."
    );
    return;
  }

  new PresuppositionMapModal(
    app,
    plugin,
    title,
    proposals,
    existing,
    async (decisions) => {
      await applyPresuppositionDecisions(plugin, file, decisions);
    }
  ).open();
}

/**
 * Apply the reviewed decisions: create new U- notes, collect the final set of
 * presupposition basenames (new + linked), write principle.presupposes, and
 * append the principle to each U's presupposes_of (de-duplicated).
 */
export async function applyPresuppositionDecisions(
  plugin: AntinomiaPlugin,
  principleFile: TFile,
  decisions: PresupDecision[]
): Promise<void> {
  const app = plugin.app;
  const principleBasename = principleFile.basename;
  const uBasenames: string[] = [];

  for (const d of decisions) {
    if (d.action === "link") {
      uBasenames.push(d.basename);
    } else if (d.action === "new") {
      const content = presuppositionTemplate({
        title: presuppositionTitle(d.text),
        text: d.text,
        confidence: d.confidence,
        presupposes_of: [principleBasename],
      });
      const created = await plugin.createNote("U", content, undefined, false);
      if (created) uBasenames.push(created.basename);
    }
  }

  // principle.presupposes = union of existing + new
  await app.fileManager.processFrontMatter(principleFile, (fm) => {
    const prev = basenamesFromFrontmatter(fm.presupposes);
    fm.presupposes = toWikilinks(mergeUnique(prev, uBasenames));
  });

  // each LINKED U: append the principle to presupposes_of (new ones already have it)
  const linked = decisions.filter((d): d is { action: "link"; basename: string } => d.action === "link");
  for (const d of linked) {
    const uFile = app.vault.getMarkdownFiles().find((f) => f.basename === d.basename);
    if (!uFile) continue;
    await app.fileManager.processFrontMatter(uFile, (fm) => {
      const prev = basenamesFromFrontmatter(fm.presupposes_of);
      fm.presupposes_of = toWikilinks(mergeUnique(prev, [principleBasename]));
    });
  }

  new Notice(`Mapped ${uBasenames.length} presuppositions for ${principleBasename}.`);
  plugin.refreshOpenGraphViews();
}

/** Principle files that depend on the given presupposition note. */
export function principlesDependingOn(app: App, presupFile: TFile): TFile[] {
  const fm = app.metadataCache.getFileCache(presupFile)?.frontmatter;
  const wanted = new Set(basenamesFromFrontmatter(fm?.presupposes_of));
  // Also catch principles that list it in `presupposes` (source of truth either way).
  const out: TFile[] = [];
  for (const f of app.vault.getMarkdownFiles()) {
    const ffm = app.metadataCache.getFileCache(f)?.frontmatter;
    if (ffm?.antinomia_type !== TYPE.principle) continue;
    if (
      wanted.has(f.basename) ||
      basenamesFromFrontmatter(ffm.presupposes).includes(presupFile.basename)
    ) {
      out.push(f);
    }
  }
  return out;
}

/** Show the "what collapses if this fails?" modal for a presupposition note. */
export async function showCollapseImpact(
  plugin: AntinomiaPlugin,
  file: TFile
): Promise<void> {
  const app = plugin.app;
  const fm = app.metadataCache.getFileCache(file)?.frontmatter;
  if (fm?.antinomia_type !== TYPE.presupposition) {
    new Notice("Collapse impact: the active note is not a presupposition.");
    return;
  }
  const principles = principlesDependingOn(app, file);
  new CollapseImpactModal(app, plugin, file, principles, () =>
    markPresuppositionUndermined(plugin, file)
  ).open();
}

/** Mark a presupposition as undermined and refresh the graph. */
export async function markPresuppositionUndermined(
  plugin: AntinomiaPlugin,
  file: TFile
): Promise<void> {
  await plugin.app.fileManager.processFrontMatter(file, (fm) => {
    fm.status = "undermined";
    fm.modified_date = new Date().toISOString().slice(0, 10);
  });
  new Notice(`Marked "${file.basename}" as undermined.`);
  plugin.refreshOpenGraphViews();
}

/**
 * Delete-sync: when a presupposition note is removed, strip its basename from
 * every principle's `presupposes`. Call from the vault 'delete' event.
 */
export async function removePresuppositionFromPrinciples(
  app: App,
  uBasename: string
): Promise<void> {
  for (const f of app.vault.getMarkdownFiles()) {
    const fm = app.metadataCache.getFileCache(f)?.frontmatter;
    if (fm?.antinomia_type !== TYPE.principle) continue;
    const cur = basenamesFromFrontmatter(fm.presupposes);
    if (!cur.includes(uBasename)) continue;
    await app.fileManager.processFrontMatter(f, (m) => {
      m.presupposes = toWikilinks(cur.filter((b) => b !== uBasename));
    });
  }
}
