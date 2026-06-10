// YouTube transcript ingestion flow. Extracted from main.ts (refactor v1.5).

import { Modal, Notice, requestUrl, Setting, TFile } from "obsidian";
import type AntinomiaPlugin from "../main";
import { substrateTemplate } from "../core/templates";
import { FOLDER, VIEW_TYPE_SUBSTRATE_LIST } from "../core/constants";
import { decodeHtmlEntities, extractYouTubeId, todayISO, ensureFolder } from "../core/utils";
import { NewSubstrateModal } from "../modals/NewSubstrateModal";
import { AIProgressModal } from "../modals/AIProgressModal";
import { ConceptsPreviewModal } from "../modals/ConceptsPreviewModal";
import { extractConceptsFromPdfText } from "./pdfIngest";
import type { PdfConcept, SubstrateFields } from "../core/types";

// Cap the transcript text sent to the AI for concept extraction, mirroring the
// PDF flow's hard cap. The FULL transcript is still stored verbatim in the hub
// note — only the AI *input* is bounded, to keep cost/context predictable on
// very long videos (local backends especially have small context windows).
const YT_AI_INPUT_CAP_CHARS = 30_000;

/**
 * Mini prompt modal asking for a YouTube URL. Shared by both YouTube entry
 * points (single-substrate quick path + AI concept extraction). Resolves to the
 * trimmed URL, or null if the user cancels.
 */
function askYouTubeUrl(
  plugin: AntinomiaPlugin,
  prefillUrl: string,
  ctaLabel: string
): Promise<string | null> {
  return new Promise((resolve) => {
    const modal = new Modal(plugin.app);
    modal.onOpen = () => {
      const c = modal.contentEl;
      c.createEl("h3", { text: "Substrate from YouTube" });
      const p = c.createEl("p");
      p.style.fontSize = "0.88em";
      p.style.opacity = "0.8";
      p.setText(
        "Paste the video URL. Antinomia will download the transcript (if available) via YouTube's timedtext API."
      );
      let url = prefillUrl;
      const input = c.createEl("input", { type: "text" });
      input.style.width = "100%";
      input.style.padding = "6px";
      input.style.marginBottom = "10px";
      input.value = url;
      input.placeholder = "https://www.youtube.com/watch?v=...";
      input.addEventListener("input", (e) => {
        url = (e.target as HTMLInputElement).value;
      });
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          modal.close();
          resolve(url.trim() || null);
        }
      });
      setTimeout(() => {
        input.focus();
        input.select();
      }, 0);
      new Setting(c)
        .addButton((b) =>
          b.setButtonText("Cancel").onClick(() => {
            modal.close();
            resolve(null);
          })
        )
        .addButton((b) =>
          b
            .setButtonText(ctaLabel)
            .setCta()
            .onClick(() => {
              modal.close();
              resolve(url.trim() || null);
            })
        );
    };
    modal.open();
  });
}

/** A transcript obtained either automatically or via the paste fallback. */
interface TranscriptResult {
  text: string;
  lang: string;
  videoId: string;
  videoTitle?: string;
  /** "paste" when the user supplied it manually (no page metadata available). */
  source: "auto" | "paste";
}

/**
 * Fetch a YouTube transcript with the paste-assisted fallback. Tries the
 * automatic timedtext fetch first; when YouTube blocks it (auth wall / no
 * recognized caption track), opens the "Automatic fetch failed" modal with an
 * Open-external button + a paste textarea. Shared by both YouTube entry points.
 *
 * Resolves null if the user cancels, or if both paths yield nothing.
 */
async function fetchTranscriptWithFallback(
  plugin: AntinomiaPlugin,
  url: string
): Promise<TranscriptResult | null> {
  new Notice("Attempting automatic YouTube transcript fetch...");
  const auto = await fetchYouTubeTranscript(url);
  if (auto && auto.text.trim().length > 0) {
    new Notice(
      `Transcript downloaded: ${auto.text.length} characters (language: ${auto.lang}).`
    );
    return {
      text: auto.text,
      lang: auto.lang,
      videoId: auto.videoId,
      videoTitle: auto.title,
      source: "auto",
    };
  }

  // ---- Auto-fetch failed: paste-assisted fallback ----
  const videoId = extractYouTubeId(url) ?? "video";
  return new Promise<TranscriptResult | null>((resolve) => {
    const fallbackModal = new Modal(plugin.app);
    let settled = false;
    const finish = (val: TranscriptResult | null) => {
      if (settled) return;
      settled = true;
      resolve(val);
    };

    fallbackModal.onOpen = () => {
      const c = fallbackModal.contentEl;
      c.createEl("h3", { text: "Automatic fetch failed" });
      const p = c.createEl("p");
      p.style.fontSize = "0.9em";
      p.style.lineHeight = "1.5";
      p.setText(
        "YouTube blocks the direct transcript fetch (it requires an authenticated session). Workaround in 3 clicks:"
      );
      const steps = c.createEl("ol");
      steps.style.lineHeight = "1.5";
      steps.style.marginBottom = "12px";
      steps.createEl("li", {
        text: "Click the button below to open youtubetotranscript.com in your browser.",
      });
      steps.createEl("li", {
        text: "On the site, the video URL is already pasted. Click 'Get Transcript'.",
      });
      steps.createEl("li", {
        text: "Select the whole transcript, Ctrl+C, come back here and paste it in the field below.",
      });

      new Setting(c)
        .setName("Open external service")
        .addButton((b) =>
          b
            .setButtonText("Open youtubetotranscript.com")
            .setCta()
            .onClick(() => {
              const externalUrl = `https://youtubetotranscript.com/transcript?v=${videoId}`;
              try {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const electron = (window as any).require?.("electron");
                if (electron?.shell?.openExternal) {
                  electron.shell.openExternal(externalUrl);
                } else {
                  window.open(externalUrl, "_blank");
                }
              } catch (e) {
                window.open(externalUrl, "_blank");
              }
            })
        );

      const label = c.createEl("label", {
        text: "Paste the transcript here",
      });
      label.style.display = "block";
      label.style.fontWeight = "bold";
      label.style.marginTop = "10px";

      const textarea = c.createEl("textarea");
      textarea.style.width = "100%";
      textarea.style.minHeight = "200px";
      textarea.style.padding = "8px";
      textarea.style.marginTop = "4px";
      let pasted = "";
      textarea.addEventListener("input", (e) => {
        pasted = (e.target as HTMLTextAreaElement).value;
      });

      new Setting(c)
        .addButton((b) =>
          b.setButtonText("Cancel").onClick(() => fallbackModal.close())
        )
        .addButton((b) =>
          b
            .setButtonText("Use transcript")
            .setCta()
            .onClick(() => {
              const txt = pasted.trim();
              if (!txt) {
                new Notice("Paste the transcript before continuing.");
                return;
              }
              // Paste path: no page metadata, so lang is unknown and the title
              // is absent (callers fall back to the videoId).
              finish({ text: txt, lang: "", videoId, source: "paste" });
              fallbackModal.close();
            })
        );
    };
    // Covers both the Cancel button and the window's X: resolve null unless a
    // transcript was already supplied.
    fallbackModal.onClose = () => {
      fallbackModal.contentEl.empty();
      finish(null);
    };
    fallbackModal.open();
  });
}

export async function openSubstrateFromYouTube(plugin: AntinomiaPlugin, prefillUrl = ""): Promise<void> {
    const url = await askYouTubeUrl(plugin, prefillUrl, "Download transcript");
    if (!url) return;

    const tr = await fetchTranscriptWithFallback(plugin, url);
    if (!tr) return;

    const titoloSuggerito = tr.videoTitle?.trim() || `Video YouTube — ${tr.videoId}`;
    const contenutoIniziale = `> Video: ${url}\n\n${tr.text}`;
    new NewSubstrateModal(
      plugin.app,
      plugin,
      (fields, skipped) => {
        if (fields === null && !skipped) return;
        const content = fields ? substrateTemplate(fields) : substrateTemplate();
        void plugin.createNote("S", content);
      },
      { title: titoloSuggerito, contenuto: contenutoIniziale }
    ).open();
}

async function fetchYouTubeTranscript(
  videoIdOrUrl: string,
  preferredLangs: string[] = ["it", "en"]
): Promise<{ text: string; lang: string; videoId: string; title?: string } | null> {
  const videoId = extractYouTubeId(videoIdOrUrl);
  if (!videoId) {
    new Notice("YouTube URL not recognized.");
    return null;
  }
  let html = "";
  try {
    const res = await requestUrl({
      url: `https://www.youtube.com/watch?v=${videoId}`,
      method: "GET",
      headers: {
        // Pretend to be a regular browser; YouTube serves a different page to bots
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
        "accept-language": "it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7",
      },
      throw: false,
    });
    if (res.status < 200 || res.status >= 300) {
      new Notice(`Video fetch error (HTTP ${res.status}).`);
      return null;
    }
    html = res.text;
  } catch (e) {
    console.error("[Antinomia] fetchYouTubeTranscript page fetch failed", e);
    new Notice(`Network error: ${(e as Error).message}`);
    return null;
  }

  // Best-effort video title from the page <title> (strips the trailing
  // " - YouTube"). Used to name the hub note; falls back to the videoId.
  let videoTitle: string | undefined;
  const titleMatch = html.match(/<title>([\s\S]*?)<\/title>/);
  if (titleMatch) {
    const t = decodeHtmlEntities(titleMatch[1]).replace(/\s*-\s*YouTube\s*$/, "").trim();
    if (t) videoTitle = t;
  }

  // Find captionTracks JSON array in the HTML
  const captionMatch = html.match(/"captionTracks":(\[.+?\])/);
  if (!captionMatch) {
    new Notice(
      "Transcript not available for this video (no captionTrack)."
    );
    return null;
  }
  let captionTracks: Array<Record<string, unknown>>;
  try {
    // YouTube escapes &amp; as \u0026; normalize before JSON.parse
    const raw = captionMatch[1].replace(/\\u0026/g, "&");
    captionTracks = JSON.parse(raw);
  } catch (e) {
    console.error("[Antinomia] captionTracks parse failed", e, captionMatch[1]);
    new Notice("Error parsing captionTracks (YouTube format changed).");
    return null;
  }

  if (!Array.isArray(captionTracks) || captionTracks.length === 0) {
    new Notice("No transcript available.");
    return null;
  }

  // Pick preferred language, fallback to first track
  const findLang = (lang: string) =>
    captionTracks.find((t) => (t.languageCode ?? t["languageCode"]) === lang);
  let track: Record<string, unknown> | undefined;
  for (const lang of preferredLangs) {
    track = findLang(lang);
    if (track) break;
  }
  if (!track) track = captionTracks[0];

  // Universal decoder for YouTube\'s JSON-embedded Unicode escapes:
  //   \\u0026 -> &, \\u003d -> =, \\u003f -> ?, \\u002f -> /, etc.
  const unescUnicode = (s: string): string =>
    s.replace(/\\u([0-9a-fA-F]{4})/g, (_m, hex) =>
      String.fromCharCode(parseInt(hex, 16))
    );

  const baseUrlRaw = String(track.baseUrl ?? "");
  const baseUrl = unescUnicode(baseUrlRaw);
  const lang = String(track.languageCode ?? "?");
  console.log("[Antinomia] track baseUrl (raw):", baseUrlRaw);
  console.log("[Antinomia] track baseUrl (decoded):", baseUrl);
  console.log("[Antinomia] track lang:", lang);
  if (!baseUrl) {
    new Notice("Track without baseUrl.");
    return null;
  }

  // Try multiple transcript formats. YouTube serves different things to
  // different requests; fmt=json3 is the most stable structured one.
  const formatsToTry: Array<{ url: string; format: "json3" | "srv3" | "xml" }> = [
    { url: baseUrl + "&fmt=json3", format: "json3" },
    { url: baseUrl + "&fmt=srv3", format: "srv3" },
    { url: baseUrl, format: "xml" },
  ];

  const parseLegacyXML = (xml: string): string[] => {
    const lines: string[] = [];
    // Tolerant regex: allow nested tags inside (e.g. <i>...</i>)
    const re = /<text[^>]*>([\s\S]*?)<\/text>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(xml)) !== null) {
      const stripped = m[1].replace(/<[^>]+>/g, "");
      const t = decodeHtmlEntities(stripped).trim();
      if (t) lines.push(t);
    }
    return lines;
  };

  const parseSrv3 = (xml: string): string[] => {
    const lines: string[] = [];
    // SRV3 uses <p t="..." d="...">text or <s>chunks</s></p>
    const re = /<p[^>]*>([\s\S]*?)<\/p>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(xml)) !== null) {
      const stripped = m[1].replace(/<[^>]+>/g, "");
      const t = decodeHtmlEntities(stripped).trim();
      if (t) lines.push(t);
    }
    return lines;
  };

  const parseJson3 = (raw: string): string[] => {
    try {
      const data = JSON.parse(raw) as { events?: Array<{ segs?: Array<{ utf8?: string }> }> };
      const events = data.events ?? [];
      const lines: string[] = [];
      for (const ev of events) {
        if (!ev.segs) continue;
        const txt = ev.segs.map((s) => s.utf8 ?? "").join("");
        const trimmed = txt.trim();
        if (trimmed) lines.push(trimmed);
      }
      return lines;
    } catch {
      return [];
    }
  };

  let lines: string[] = [];
  let chosen: string = "";
  for (const attempt of formatsToTry) {
    let raw = "";
    let status = -1;
    console.log(`[Antinomia] transcript fetching (${attempt.format}):`, attempt.url);
    try {
      const res = await requestUrl({
        url: attempt.url,
        method: "GET",
        headers: {
          "user-agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
          "accept-language": "it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7",
        },
        throw: false,
      });
      status = res.status;
      raw = res.text ?? "";
      console.log(
        `[Antinomia] transcript (${attempt.format}) HTTP ${status}, ${raw.length} bytes, headers:`,
        res.headers
      );
      if (status < 200 || status >= 300) {
        console.warn(
          `[Antinomia] transcript (${attempt.format}) HTTP ${status} -> skip`
        );
        continue;
      }
    } catch (e) {
      console.warn(`[Antinomia] transcript fetch (${attempt.format}) failed`, e);
      continue;
    }
    if (!raw || raw.length < 10) {
      console.warn(
        `[Antinomia] transcript (${attempt.format}) body too short (${raw.length} bytes), trying next`
      );
      continue;
    }
    // Try the corresponding parser
    if (attempt.format === "json3") lines = parseJson3(raw);
    else if (attempt.format === "srv3") lines = parseSrv3(raw);
    else lines = parseLegacyXML(raw);

    console.log(
      `[Antinomia] transcript ${attempt.format}: ${lines.length} lines, ${raw.length} bytes`
    );
    if (lines.length > 0) {
      chosen = attempt.format;
      break;
    }
    // If empty AND raw starts unexpectedly, log a sample for debugging
    if (raw.length > 0 && raw.length < 5000) {
      console.log(`[Antinomia] transcript raw (${attempt.format}):`, raw.slice(0, 500));
    }
  }

  if (lines.length === 0) {
    new Notice(
      "Empty transcript or unrecognized format across all 3 attempts (json3/srv3/xml). See DevTools console for raw data."
    );
    return null;
  }
  console.log(`[Antinomia] transcript parsed via ${chosen}: ${lines.length} lines`);
  return { text: lines.join(" "), lang, videoId, title: videoTitle };
}

/**
 * Create (or update, if it already exists) the YouTube hub note: an Antinomia
 * `meta_note` that acts as a graph cluster center for the substrates extracted
 * from a video. Mirrors the PDF hub (`createOrUpdatePdfHubNote`), with one key
 * difference: the FULL transcript is stored inline.
 *
 * Why inline: unlike a PDF, the video file is never stored in the vault. YouTube
 * can remove the caption track, the video can go private, or the channel can
 * close — so this preserved copy is the source of truth, and is never truncated.
 *
 * YAML safety: the transcript lives in the BODY, after the frontmatter block is
 * already closed, so a `---` inside it cannot break the frontmatter. We still
 * fence the body line-start case defensively (see below).
 */
export async function createOrUpdateYouTubeHubNote(
  plugin: AntinomiaPlugin,
  videoUrl: string,
  videoId: string,
  videoTitle: string | undefined,
  transcript: string,
  transcriptLang: string,
  conceptFiles: TFile[]
): Promise<TFile | null> {
  const displayTitle = videoTitle?.trim() || videoId;
  const folder = FOLDER.notes;
  await ensureFolder(plugin.app, folder);

  const safeName = displayTitle
    .replace(/[\\/:*?"<>|]/g, "-")
    .slice(0, 60)
    .trim()
    .replace(/\s+/g, "_");
  const hubPath = `${folder}/H-${safeName || videoId}.md`;

  // Concept wikilinks with explicit alias (human title, fallback basename) so
  // Front Matter Title doesn't prompt "Approve changes" for each one.
  const conceptLinks =
    conceptFiles.length > 0
      ? conceptFiles
          .map((f) => {
            const fm = plugin.app.metadataCache.getFileCache(f)?.frontmatter;
            const title =
              typeof fm?.title === "string" && fm.title.trim()
                ? String(fm.title).trim()
                : f.basename;
            return `- [[${f.basename}|${title}]]`;
          })
          .join("\n")
      : "_(no concepts yet — will be populated after bulk creation)_";

  // Defensive: a transcript line starting with `---` would render as a stray
  // thematic break in preview (it can't corrupt the already-closed frontmatter,
  // but it's visually wrong). Escape only the line-start case, leaving inline
  // dashes untouched so the text stays readable.
  const safeTranscript = transcript.replace(/^---/gm, "———");

  const esc = (s: string): string => s.replace(/"/g, '\\"');
  const today = todayISO();
  const hubContent = `---
antinomia_type: meta_note
title: "YouTube source: ${esc(displayTitle)}"
source: "YouTube: ${esc(videoUrl)}"
origin: youtube_extraction_hub
video_id: ${videoId}
video_url: ${videoUrl}
transcript_language: "${esc(transcriptLang)}"
transcript_length_chars: ${transcript.length}
date: ${today}
modified_date: ${today}
---

# YouTube source: ${displayTitle}

> Source: [${videoUrl}](${videoUrl})
> Language: ${transcriptLang}
> Extracted concepts: **${conceptFiles.length}**

## Concepts extracted

${conceptLinks}

## Transcript

> Full text of the YouTube transcript at extraction time. Kept inline because — unlike a PDF — the video itself is not stored in the vault. YouTube may remove the caption track, the video may go private, or the channel may close; this preserved copy is the source of truth.

${safeTranscript}

---

_This is an Antinomia meta_note acting as a graph hub for substrates extracted from the YouTube video above. Concepts link back to this hub via their \`links\` frontmatter — the Antinomia Graph view will show them as a cluster around this node._
`;

  try {
    const target = plugin.app.vault.getAbstractFileByPath(hubPath) as TFile | null;
    if (target) {
      await plugin.app.vault.modify(target, hubContent);
      return target;
    }
    return await plugin.app.vault.create(hubPath, hubContent);
  } catch (e) {
    console.error(`[Antinomia] YouTube hub note create/update failed:`, e);
    return null;
  }
}

/**
 * Create one substrate per selected concept, each linked to the YouTube hub
 * note. Mirrors bulkCreateSubstratesFromConcepts (PDF) but targets the YouTube
 * hub and writes YouTube provenance frontmatter. Returns the count created.
 */
export async function bulkCreateSubstratesFromYouTubeConcepts(
  plugin: AntinomiaPlugin,
  concepts: PdfConcept[],
  videoUrl: string,
  videoId: string,
  videoTitle: string | undefined,
  transcript: string,
  transcriptLang: string
): Promise<number> {
  if (concepts.length === 0) return 0;

  const displayTitle = videoTitle?.trim() || videoId;
  const safeName =
    displayTitle
      .replace(/[\\/:*?"<>|]/g, "-")
      .slice(0, 60)
      .trim()
      .replace(/\s+/g, "_") || videoId;
  const folder = `notes/from-youtube-${safeName}`;

  if (!plugin.app.vault.getAbstractFileByPath(folder)) {
    try {
      await plugin.app.vault.createFolder(folder);
    } catch (e) {
      console.warn(`[Antinomia] folder create failed (may exist):`, e);
    }
  }

  // STEP 1 — Create the hub note (with the full transcript) so the concepts
  // have something to link to. Concepts are filled in on the second pass.
  const hubFile = await createOrUpdateYouTubeHubNote(
    plugin,
    videoUrl,
    videoId,
    videoTitle,
    transcript,
    transcriptLang,
    []
  );
  const hubBasename = hubFile?.basename ?? `H-${safeName}`;
  const hubAlias = `YouTube: ${displayTitle}`;

  // STEP 2 — One substrate per concept, each wired to the hub.
  const createdFiles: TFile[] = [];
  for (const c of concepts) {
    const fields: SubstrateFields = { title: c.title, content: c.content };
    const body = substrateTemplate(fields);
    const enriched = body
      .replace(
        /^source:\s*user_input$/m,
        `source: "YouTube: ${videoUrl}"\norigin: "youtube_extraction"\nlinks:\n  - "[[${hubBasename}]]"`
      )
      .replace(
        /\n*$/,
        `\n\n> Extracted from: [[${hubBasename}|${hubAlias}]]\n> Source video: ${videoUrl}\n`
      );
    try {
      const file = await plugin.createNote("S", enriched, folder, false);
      if (file) createdFiles.push(file);
    } catch (e) {
      console.error(`[Antinomia] failed to create substrate from concept "${c.title}":`, e);
    }
  }

  // STEP 3 — Refresh the hub body now that the concept notes exist.
  if (hubFile && createdFiles.length > 0) {
    await createOrUpdateYouTubeHubNote(
      plugin,
      videoUrl,
      videoId,
      videoTitle,
      transcript,
      transcriptLang,
      createdFiles
    );
  }

  new Notice(
    `Created ${createdFiles.length} of ${concepts.length} substrates from "${displayTitle}" in ${folder}/`
  );
  return createdFiles.length;
}

/**
 * AI concept-extraction flow for YouTube — the PDF-parity path:
 *   fetch transcript → AI extracts N concepts → preview/pick → bulk-create
 *   substrates + a hub note holding the full transcript.
 *
 * The older openSubstrateFromYouTube (single substrate, transcript inline)
 * remains for the quick path.
 */
export async function runYouTubeConceptIngest(
  plugin: AntinomiaPlugin,
  prefillUrl = ""
): Promise<void> {
  const url = await askYouTubeUrl(plugin, prefillUrl, "Extract concepts");
  if (!url) return;

  // Auto fetch + paste-assisted fallback (shared with the quick path).
  const tr = await fetchTranscriptWithFallback(plugin, url);
  if (!tr) return; // user cancelled, or both paths failed (already notified)
  const { text, lang, videoId, videoTitle: title } = tr;
  if (!text || text.trim().length === 0) {
    new Notice("Transcript is empty — nothing to extract.");
    return;
  }

  // Bound the AI input; the full transcript still lands in the hub note.
  const aiInput =
    text.length > YT_AI_INPUT_CAP_CHARS ? text.slice(0, YT_AI_INPUT_CAP_CHARS) : text;
  if (text.length > YT_AI_INPUT_CAP_CHARS) {
    new Notice(
      `Transcript is long (${text.length.toLocaleString()} chars). Analyzing the first ${YT_AI_INPUT_CAP_CHARS.toLocaleString()} for concepts; the full text is preserved in the hub note.`
    );
  }

  // Progress modal owns the AbortController (Stop button → abort the AI call).
  const progress = new AIProgressModal(
    plugin.app,
    "Extracting concepts from YouTube…",
    "Analyzing the transcript…"
  );
  progress.open();
  let result: Awaited<ReturnType<typeof extractConceptsFromPdfText>> = null;
  try {
    result = await extractConceptsFromPdfText(
      plugin,
      aiInput,
      progress.controller.signal,
      undefined,
      "YouTube concepts"
    );
  } finally {
    progress.close();
  }
  if (!result) return; // error modal already shown, or silent abort

  const sourceName = title?.trim() || videoId;
  const safeFolder =
    sourceName
      .replace(/[\\/:*?"<>|]/g, "-")
      .slice(0, 60)
      .trim()
      .replace(/\s+/g, "_") || videoId;

  new ConceptsPreviewModal(
    plugin.app,
    plugin,
    sourceName,
    `notes/from-youtube-${safeFolder}`,
    result.concepts,
    result.meta,
    async (picks) => {
      await bulkCreateSubstratesFromYouTubeConcepts(
        plugin,
        picks,
        url,
        videoId,
        title,
        text,
        lang
      );
      // Refresh open Substrate + Graph views once the cache catches up.
      setTimeout(() => {
        const subLeaves = plugin.app.workspace.getLeavesOfType(
          VIEW_TYPE_SUBSTRATE_LIST
        );
        if (subLeaves.length > 0) {
          plugin.app.workspace.revealLeaf(subLeaves[0]);
        }
        plugin.refreshOpenGraphViews();
      }, 700);
    },
    result.friction
  ).open();
}
