// PDF ingestion + concept extraction flow. Extracted from main.ts (refactor v1.5).

import { Notice, TFile, normalizePath } from "obsidian";
import type AntinomiaPlugin from "../main";
import { callAI } from "../ai/callAI";
import { notifyAIUsage, showErrorModal } from "../ai/notifyUsage";
import { extractJson } from "../ai/parseResponse";
import { EXTRACT_CONCEPTS_SYSTEM } from "../ai/prompts";
import { VIEW_TYPE_SUBSTRATE_LIST } from "../core/constants";
import { substrateTemplate } from "../core/templates";
import type { AIUsageMeta, PdfConcept, PdfConceptsResult, PdfExtractResult, Profile, SubstrateFields } from "../core/types";
import { ensureFolder, todayISO } from "../core/utils";
import { buildFrictionPayload, parseFrictionFields, withFrictionSuffix, type FrictionPayload } from "../core/aiFriction";
import { withLoadingButton } from "../helpers/withLoadingButton";
import { PdfAnalyzingModal } from "../modals/PdfAnalyzingModal";
import { ConceptsPreviewModal } from "../modals/ConceptsPreviewModal";
import { PdfSourcePickerModal } from "../modals/PdfSourcePickerModal";

export async function extractConceptsFromPdfText(plugin: AntinomiaPlugin,
    text: string,
    signal?: AbortSignal,
    attachUsageTo?: HTMLButtonElement,
    operationLabel: string = "PDF concepts"
  ): Promise<{ concepts: PdfConcept[]; meta: AIUsageMeta; friction: FrictionPayload } | null> {
    const profile = plugin.profileFor("default");
    if (!profile.apiKey) {
      showErrorModal(
        plugin.app,
        "API key missing",
        "The active AI profile has no API key. Open Settings → Antinomia and add one (or switch profile)."
      );
      return null;
    }
    const t0 = Date.now();
    try {
      const result = await callAI({
        baseUrl: profile.baseUrl,
        apiKey: profile.apiKey,
        model: profile.model,
        system: withFrictionSuffix(EXTRACT_CONCEPTS_SYSTEM),
        messages: [{ role: "user", content: text }],
        taskClass: "deep",
        signal,
      });
      notifyAIUsage(
        operationLabel,
        result.usage,
        Date.now() - t0,
        {
          app: plugin.app,
          profile: profile.name,
          model: profile.model,
          url: profile.baseUrl,
        },
        attachUsageTo
      );
      if (signal?.aborted) return null;
      const parsed = extractJson<PdfConceptsResult>(result.text);
      if (!parsed || !Array.isArray(parsed.concepts)) {
        console.error("[Antinomia] extractConceptsFromPdfText unparseable:", result.text);
        showErrorModal(
          plugin.app,
          "AI concept extraction not parseable",
          "The AI replied but the response wasn't a valid JSON array of concepts. Try again, or shorten the PDF section.",
          `Profile: ${profile.name} (${profile.model})\n\n--- RAW RESPONSE ---\n${result.text?.slice(0, 2000) ?? "(empty)"}`
        );
        return null;
      }
      // Sanitize: drop concepts with empty title/content, trim, cap title length.
      const cleaned = parsed.concepts
        .map((c) => ({
          title: String(c.title ?? "").trim().slice(0, 120),
          content: String(c.content ?? "").trim(),
        }))
        .filter((c) => c.title.length > 0 && c.content.length > 0);
      const meta: AIUsageMeta = {
        usage: result.usage,
        durationMs: Date.now() - t0,
        profile: profile.name,
        model: profile.model,
        url: profile.baseUrl,
        operation: operationLabel,
      };
      const friction = buildFrictionPayload({
        operation: "conceptExtraction",
        modelName: profile.model,
        baseUrl: profile.baseUrl,
        usage: result.usage,
        ai: parseFrictionFields(result.text),
      });
      return { concepts: cleaned, meta, friction };
    } catch (e) {
      const msg = (e as Error).message;
      if (msg === "hunter_aborted" || msg === "ai_aborted" || signal?.aborted) {
        return null;
      }
      showErrorModal(
        plugin.app,
        "AI concept extraction error",
        `Couldn't extract concepts from the PDF. ${msg.includes("not reachable") ? "Your local AI backend doesn't seem to be running." : "Check that the backend is reachable and the API key is valid."}`,
        `Profile: ${profile.name} (${profile.model})\nURL: ${profile.baseUrl}\n\n${msg}`
      );
      return null;
    }
}

export async function bulkCreateSubstratesFromConcepts(plugin: AntinomiaPlugin, 
    concepts: PdfConcept[],
    pdfFile: TFile
  ): Promise<number> {
    if (concepts.length === 0) return 0;

    // Sanitize the PDF basename for use as folder name (Obsidian-safe).
    const safeName = pdfFile.basename
      .replace(/[\\/:*?"<>|]/g, "-")
      .slice(0, 60)
      .trim()
      .replace(/\s+/g, "_");
    const folder = `notes/from-pdf-${safeName}`;

    // Ensure subfolder exists.
    if (!plugin.app.vault.getAbstractFileByPath(folder)) {
      try {
        await plugin.app.vault.createFolder(folder);
      } catch (e) {
        console.warn(`[Antinomia] folder create failed (may exist):`, e);
      }
    }

    // STEP 1 — Create the PDF hub note (an Antinomia meta_note that acts as
    // the central node in the graph for this PDF). Concepts will link to
    // this hub via `links` frontmatter; the hub in turn links to the PDF.
    // Result in the graph view: hub at the center, N concept satellites.
    const hubFile = await plugin.createOrUpdatePdfHubNote(pdfFile, folder, []);
    const hubBasename = hubFile?.basename ?? `PDF-${safeName}`;
    // Use a short, human-friendly alias for body wikilinks so Front Matter
    // Title doesn't pop up an "Approve changes" dialog for every concept
    // proposing to promote `[[H-xxx]]` → `[[H-xxx|<long PDF title>]]`.
    const hubAlias = `PDF: ${pdfFile.basename}`;

    // STEP 2 — Create one substrate per concept, each linked to the hub.
    const createdFiles: TFile[] = [];
    for (const c of concepts) {
      const fields: SubstrateFields = {
        title: c.title,
        content: c.content,
      };
      const body = substrateTemplate(fields);
      // Post-process the template:
      // - Replace `source: user_input` with `source: "PDF: <basename>"`
      // - Add `origin: pdf_extraction`
      // - Add `links: ["[[<hub basename>]]"]` so the graph wires this
      //   substrate to the PDF hub node (cluster effect). Frontmatter
      //   links stay basename-only (YAML, not body — no FMT prompt).
      // - Append a body footer wikilink WITH ALIAS back to the hub and the
      //   PDF, so Front Matter Title doesn't propose alias promotion every
      //   time the user opens a concept note.
      const enriched = body
        .replace(
          /^source:\s*user_input$/m,
          `source: "PDF: ${pdfFile.basename}"\norigin: "pdf_extraction"\nlinks:\n  - "[[${hubBasename}]]"`
        )
        .replace(
          /\n*$/,
          `\n\n> Extracted from: [[${hubBasename}|${hubAlias}]]\n> See PDF: [[${pdfFile.basename}|${pdfFile.basename}]]\n`
        );

      try {
        const file = await plugin.createNote("S", enriched, folder, false);
        if (file) createdFiles.push(file);
      } catch (e) {
        console.error(`[Antinomia] failed to create substrate from concept "${c.title}":`, e);
      }
    }

    // STEP 3 — Refresh the hub note's body to list all the actual concept
    // wikilinks (we couldn't write them in step 1 because the files didn't
    // exist yet).
    if (hubFile && createdFiles.length > 0) {
      await plugin.createOrUpdatePdfHubNote(pdfFile, folder, createdFiles, hubFile);
    }

    new Notice(
      `Created ${createdFiles.length} of ${concepts.length} substrates from "${pdfFile.basename}" in ${folder}/`
    );
    return createdFiles.length;
}

export async function createOrUpdatePdfHubNote(plugin: AntinomiaPlugin, 
    pdfFile: TFile,
    folder: string,
    conceptFiles: TFile[],
    existing?: TFile
  ): Promise<TFile | null> {
    const safeName = pdfFile.basename
      .replace(/[\\/:*?"<>|]/g, "-")
      .slice(0, 60)
      .trim()
      .replace(/\s+/g, "_");
    const hubPath = normalizePath(`${folder}/H-${safeName}.md`);

    // Each concept wikilink uses an explicit alias (the human title from the
    // concept's frontmatter, falling back to its basename) so Front Matter
    // Title doesn't trigger an "Approve changes" prompt for each one.
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

    const today = todayISO();
    const hubContent = `---
antinomia_type: meta_note
title: "PDF source: ${pdfFile.basename.replace(/"/g, '\\"')}"
source: "PDF: ${pdfFile.basename}"
origin: pdf_extraction_hub
date: ${today}
modified_date: ${today}
---

# PDF source: ${pdfFile.basename}

> Original file: [[${pdfFile.basename}]]
> Extracted concepts: **${conceptFiles.length}**

## Concepts extracted

${conceptLinks}

---

_This is an Antinomia meta_note acting as a graph hub for substrates extracted from the PDF above. Concepts link back to this hub via their \`links\` frontmatter — the Antinomia Graph view will show them as a cluster around this node._
`;

    try {
      // Find existing hub: prefer the one passed in, otherwise look up by path.
      const target =
        existing ??
        (plugin.app.vault.getAbstractFileByPath(hubPath) as TFile | null);
      if (target) {
        await plugin.app.vault.modify(target, hubContent);
        return target;
      }
      const file = await plugin.app.vault.create(hubPath, hubContent);
      return file;
    } catch (e) {
      console.error(`[Antinomia] PDF hub note create/update failed:`, e);
      return null;
    }
}

export async function importPdfFromDisk(plugin: AntinomiaPlugin): Promise<TFile | null> {
    return new Promise((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "application/pdf,.pdf";
      input.style.display = "none";
      document.body.appendChild(input);

      let resolved = false;
      const cleanup = () => {
        try {
          input.remove();
        } catch {
          /* ignore */
        }
      };

      input.addEventListener("change", async () => {
        const file = input.files?.[0];
        if (!file) {
          if (!resolved) {
            resolved = true;
            cleanup();
            resolve(null);
          }
          return;
        }
        try {
          const buffer = await file.arrayBuffer();
          const basename = file.name.replace(/\.pdf$/i, "");
          const folder = "attachments";
          await ensureFolder(plugin.app, folder);
          let destPath = normalizePath(`${folder}/${basename}.pdf`);
          let i = 1;
          while (plugin.app.vault.getAbstractFileByPath(destPath)) {
            destPath = normalizePath(`${folder}/${basename} (${i}).pdf`);
            i++;
          }
          const tFile = await plugin.app.vault.createBinary(destPath, buffer);
          new Notice(`Imported PDF to ${destPath}`);
          resolved = true;
          cleanup();
          resolve(tFile);
        } catch (e) {
          console.error("[Antinomia] importPdfFromDisk failed:", e);
          showErrorModal(
            plugin.app,
            "PDF import failed",
            "Couldn't copy the PDF into the vault.",
            (e as Error).message
          );
          resolved = true;
          cleanup();
          resolve(null);
        }
      });

      // Cancel detection: HTML5 file input doesn't fire any event on cancel.
      // Use the body's `focus` event as a heuristic — when the dialog
      // closes, focus returns to the window. We wait a beat then check.
      const onFocus = () => {
        window.removeEventListener("focus", onFocus);
        setTimeout(() => {
          if (!resolved && !input.files?.length) {
            resolved = true;
            cleanup();
            resolve(null);
          }
        }, 300);
      };
      window.addEventListener("focus", onFocus);

      input.click();
    });
}

export async function openSubstrateFromPDF(plugin: AntinomiaPlugin): Promise<void> {
    new PdfSourcePickerModal(plugin.app, plugin, async (pdf) => {
      await plugin.runPdfIngest(pdf);
    }).open();
}

export async function runPdfIngest(plugin: AntinomiaPlugin, pdf: TFile): Promise<void> {
    // Step 1: extract text from PDF binary.
    const extractingNotice = new Notice(
      `Extracting text from "${pdf.basename}"…`,
      0
    );
    let extracted: PdfExtractResult;
    try {
      const binary = await plugin.app.vault.readBinary(pdf);
      extracted = await extractPdfText(binary);
    } catch (e) {
      extractingNotice.hide();
      const msg = (e as Error).message;
      if (msg.startsWith("pdfjs_not_loaded:")) {
        showErrorModal(
          plugin.app,
          "PDF library not loaded yet",
          msg.replace(/^pdfjs_not_loaded:/, ""),
          msg
        );
      } else {
        showErrorModal(
          plugin.app,
          "PDF text extraction failed",
          "Couldn't extract text from this PDF. It may be scanned (image-only) or corrupt. OCR support is planned for v1.5.",
          msg
        );
      }
      return;
    }
    extractingNotice.hide();

    if (extracted.text.trim().length === 0) {
      showErrorModal(
        plugin.app,
        "Empty PDF text",
        `No extractable text in "${pdf.basename}". This is usually a scanned PDF (image-only). OCR is planned for v1.5.`,
        `Pages: ${extracted.pageCount}\nTotal chars: ${extracted.totalChars}`
      );
      return;
    }

    if (extracted.truncated) {
      const proceed = window.confirm(
        `The PDF is longer than ${PDF_TEXT_HARD_CAP_CHARS.toLocaleString()} characters.\n\n` +
          `Only the first ${PDF_TEXT_HARD_CAP_CHARS.toLocaleString()} chars will be analyzed; the rest will be skipped.\n\n` +
          `Chunking support (full coverage) is planned for v1.5.\n\n` +
          `OK = proceed with truncated text.\nCancel = abort.`
      );
      if (!proceed) return;
    }

    // Step 2: AI concept extraction with a dedicated progress modal that
    // exposes a Stop button. The source picker has already closed, so we
    // cannot use withLoadingButton — this modal IS the loading UI.
    const profile = plugin.profileFor("default");
    const progressModal = new PdfAnalyzingModal(plugin.app, pdf.basename, profile.model);
    progressModal.open();
    let result: Awaited<ReturnType<typeof plugin.extractConceptsFromPdfText>> = null;
    try {
      result = await plugin.extractConceptsFromPdfText(
        extracted.text,
        progressModal.controller.signal
      );
    } finally {
      progressModal.close();
    }
    if (!result) return; // error modal already shown by extractConcepts (or silent abort)

    // Step 3: preview & let the user pick.
    const pdfFolderHint = `notes/from-pdf-${pdf.basename
      .replace(/[\\/:*?"<>|]/g, "-")
      .replace(/\s+/g, "_")}`;
    new ConceptsPreviewModal(
      plugin.app,
      plugin,
      pdf.basename,
      pdfFolderHint,
      result.concepts,
      result.meta,
      async (picks) => {
        await plugin.bulkCreateSubstratesFromConcepts(picks, pdf);
        // Wait a beat so Obsidian's metadataCache picks up the new
        // frontmatter (otherwise sidebars would show basenames instead of
        // human titles until the next interaction). Then refresh the
        // Substrate and Graph views ONLY if the user already had them open —
        // don't force-open a leaf the user didn't ask for. Open views refresh
        // themselves on the vault/metadata events they register.
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

const PDF_TEXT_HARD_CAP_CHARS = 30_000;

/**
 * Extract plain text from a PDF binary using Obsidian's bundled pdfjsLib.
 *
 * pdfjsLib is lazy-loaded by Obsidian — it's only present after the user has
 * opened a PDF at least once in the current session. We check for it and
 * throw a friendly error if missing so we can guide the user.
 *
 * Returns concatenated page text with "\n\n--- Page N ---\n\n" separators
 * (helpful for debugging). Truncated to PDF_TEXT_HARD_CAP_CHARS to keep
 * the AI call cost predictable on very long documents.
 */
async function extractPdfText(
  binary: ArrayBuffer
): Promise<PdfExtractResult> {
  const pdfjsLib = (window as any).pdfjsLib;
  if (!pdfjsLib || typeof pdfjsLib.getDocument !== "function") {
    throw new Error(
      "pdfjs_not_loaded:Obsidian's PDF library is not loaded yet. Open any PDF in Obsidian once (just opening it is enough), then retry."
    );
  }

  const loadingTask = pdfjsLib.getDocument({ data: binary });
  const doc = await loadingTask.promise;
  const pageCount: number = doc.numPages;

  const pageTexts: string[] = [];
  let totalChars = 0;
  let truncated = false;

  for (let p = 1; p <= pageCount; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const pageText = content.items
      .map((it: any) => (typeof it.str === "string" ? it.str : ""))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();

    if (pageText.length === 0) continue;

    if (totalChars + pageText.length > PDF_TEXT_HARD_CAP_CHARS) {
      // Take only what fits, then stop
      const remaining = PDF_TEXT_HARD_CAP_CHARS - totalChars;
      if (remaining > 0) {
        pageTexts.push(`--- Page ${p} (truncated) ---\n${pageText.slice(0, remaining)}`);
        totalChars += remaining;
      }
      truncated = true;
      break;
    }

    pageTexts.push(`--- Page ${p} ---\n${pageText}`);
    totalChars += pageText.length;
  }

  return {
    text: pageTexts.join("\n\n"),
    pageCount,
    truncated,
    totalChars,
  };
}
