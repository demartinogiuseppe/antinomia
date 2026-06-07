// YouTube transcript ingestion flow. Extracted from main.ts (refactor v1.5).

import { Modal, Notice, requestUrl, Setting } from "obsidian";
import type AntinomiaPlugin from "../main";
import { substrateTemplate } from "../core/templates";
import { decodeHtmlEntities, extractYouTubeId } from "../core/utils";
import { NewSubstrateModal } from "../modals/NewSubstrateModal";

export async function openSubstrateFromYouTube(plugin: AntinomiaPlugin, prefillUrl = ""): Promise<void> {
    // Mini prompt modal for the URL
    const askUrl = (): Promise<string | null> =>
      new Promise((resolve) => {
        const modal = new Modal(plugin.app);
        modal.onOpen = () => {
          const c = modal.contentEl;
          c.createEl("h3", { text: "Substrate from YouTube" });
          const p = c.createEl("p");
          p.style.fontSize = "0.88em";
          p.style.opacity = "0.8";
          p.setText(
            "Incolla l'URL del video. Scarichero' la trascrizione (se disponibile) tramite l'API timedtext di YouTube."
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
                .setButtonText("Scarica trascrizione")
                .setCta()
                .onClick(() => {
                  modal.close();
                  resolve(url.trim() || null);
                })
            );
        };
        modal.open();
      });

    const url = await askUrl();
    if (!url) return;

    new Notice("Attempting automatic YouTube transcript fetch...");
    const result = await fetchYouTubeTranscript(url);

    if (result) {
      // Auto-fetch success
      new Notice(
        `Transcript downloaded: ${result.text.length} characters (language: ${result.lang}).`
      );
      const titoloSuggerito = `Video YouTube — ${result.videoId}`;
      const contenutoIniziale = `> Video: ${url}\n\n${result.text}`;
      new NewSubstrateModal(
        plugin.app,
        plugin,
        (fields, skipped) => {
          if (fields === null && !skipped) return;
          const content = fields
            ? substrateTemplate(fields)
            : substrateTemplate();
          void plugin.createNote("S", content);
        },
        { title: titoloSuggerito, contenuto: contenutoIniziale }
      ).open();
      return;
    }

    // ---- Auto-fetch failed: paste-assisted fallback ----
    const videoId = extractYouTubeId(url) ?? "video";
    const fallbackModal = new Modal(plugin.app);
    fallbackModal.onOpen = () => {
      const c = fallbackModal.contentEl;
      c.createEl("h3", { text: "Automatic fetch failed" });
      const p = c.createEl("p");
      p.style.fontSize = "0.9em";
      p.style.lineHeight = "1.5";
      p.setText(
        "YouTube blocca il fetch diretto della trascrizione (richiede sessione autenticata). Workaround in 3 click:"
      );
      const steps = c.createEl("ol");
      steps.style.lineHeight = "1.5";
      steps.style.marginBottom = "12px";
      steps.createEl("li", {
        text: "Click sul bottone qui sotto per aprire youtubetotranscript.com nel browser.",
      });
      steps.createEl("li", {
        text: "On the site, the video URL is already pasted. Click 'Get Transcript'.",
      });
      steps.createEl("li", {
        text: "Seleziona tutta la trascrizione, Ctrl+C, torna qui e incollala nel campo sotto.",
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
        text: "Incolla qui la trascrizione",
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
            .setButtonText("Create substrate")
            .setCta()
            .onClick(() => {
              const txt = pasted.trim();
              if (!txt) {
                new Notice("Paste the transcript before saving.");
                return;
              }
              fallbackModal.close();
              const titoloSuggerito = `Video YouTube — ${videoId}`;
              const contenutoIniziale = `> Video: ${url}\n\n${txt}`;
              new NewSubstrateModal(
                plugin.app,
                plugin,
                (fields, skipped) => {
                  if (fields === null && !skipped) return;
                  const content = fields
                    ? substrateTemplate(fields)
                    : substrateTemplate();
                  void plugin.createNote("S", content);
                },
                { title: titoloSuggerito, contenuto: contenutoIniziale }
              ).open();
            })
        );
    };
    fallbackModal.onClose = () => fallbackModal.contentEl.empty();
    fallbackModal.open();
}

async function fetchYouTubeTranscript(
  videoIdOrUrl: string,
  preferredLangs: string[] = ["it", "en"]
): Promise<{ text: string; lang: string; videoId: string } | null> {
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
  return { text: lines.join(" "), lang, videoId };
}
