// free-input analysis flow. Extracted from main.ts (refactor v1.5).

import { Notice } from "obsidian";
import type AntinomiaPlugin from "../main";
import { callAI } from "../ai/callAI";
import { notifyAIUsage, showErrorModal } from "../ai/notifyUsage";
import { parseFreeInputFromAIResponse } from "../ai/parseResponse";
import { FREE_INPUT_SYSTEM } from "../ai/prompts";
import { buildFrictionPayload, parseFrictionFields, withFrictionSuffix } from "../core/aiFriction";
import { substrateTemplate, tensionTemplate } from "../core/templates";
import type { AIUsageMeta, FreeInputAnalysis, Profile } from "../core/types";
import { extractYouTubeId } from "../core/utils";
import { ConfirmModal } from "../modals/ConfirmModal";
import { FreeInputModal } from "../modals/FreeInputModal";
import { NewSubstrateModal } from "../modals/NewSubstrateModal";
import { NewTensionModal } from "../modals/NewTensionModal";

export async function openFreeInputFromClipboard(plugin: AntinomiaPlugin): Promise<void> {
    let clip = "";
    let source = "unknown";

    // Try Electron clipboard first (Obsidian Desktop). Available via require,
    // which Electron injects at runtime and isn't in the DOM lib typings.
    try {
      const req = (window as unknown as { require?: (m: string) => unknown }).require;
      const electron = req?.("electron") as
        | { clipboard?: { readText(): string } }
        | undefined;
      if (electron?.clipboard?.readText) {
        clip = electron.clipboard.readText() ?? "";
        source = "electron";
      }
    } catch (e) {
      // electron not available (mobile? web?), fall through
      console.debug("[Antinomia] electron clipboard not available", e);
    }

    // Fallback to web clipboard API
    if (!clip) {
      try {
        clip = await navigator.clipboard.readText();
        source = "navigator";
      } catch (e) {
        console.error("[Antinomia] navigator.clipboard.readText failed", e);
      }
    }

    if (!clip.trim()) {
      new Notice(
        "Clipboard empty or unreadable. Opening empty free-form modal: you can paste manually (Ctrl+V)."
      );
      plugin.openFreeInputModal();
      return;
    }

    // Special handling: if the clipboard contains a single YouTube URL,
    // offer to fetch the transcript directly into a substrate.
    const ytId = extractYouTubeId(clip.trim());
    if (ytId && clip.trim().length < 200) {
      const proceed = window.confirm(
        "The clipboard looks like a YouTube URL. Download the transcript and create a pre-filled substrate?\n\nOK = download transcript.\nCancel = continue with free input (AI classifies)."
      );
      if (proceed) {
        await plugin.openSubstrateFromYouTube(clip.trim());
        return;
      }
    }

    new Notice(
      `Read ${clip.length} characters. The AI will classify as tension or substrate.`
    );

    // Route through FreeInputModal so the AI decides tipo (tension/substrate)
    new FreeInputModal(
      plugin.app,
      plugin,
      (analysis, originalText, meta) => {
        if (analysis.tipo === "tension") {
          new NewTensionModal(
            plugin.app,
            plugin,
            (fields, skipped) => {
              if (fields === null && !skipped) return;
              const content = fields
                ? tensionTemplate(fields)
                : tensionTemplate();
              void plugin.createNote("T", content);
            },
            {
              title: analysis.title,
              statementA: analysis.statementA,
              statementB: analysis.statementB,
            },
            meta
          ).open();
        } else {
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
            {
              title: analysis.title,
              contenuto: analysis.contenuto || originalText,
            },
            meta
          ).open();
        }
      },
      clip
    ).open();
}

export function openFreeInputModal(plugin: AntinomiaPlugin): void {
    new FreeInputModal(plugin.app, plugin, (analysis, originalText, meta) => {
      if (analysis.tipo === "tension") {
        new NewTensionModal(
          plugin.app,
          plugin,
          (fields, skipped) => {
            if (fields === null && !skipped) return;
            const content = fields
              ? tensionTemplate(fields)
              : tensionTemplate();
            void plugin.createNote("T", content);
          },
          {
            title: analysis.title,
            statementA: analysis.statementA,
            statementB: analysis.statementB,
          },
          meta
        ).open();
      } else {
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
          {
            title: analysis.title,
            contenuto: analysis.contenuto || originalText,
          },
          meta
        ).open();
      }
    }).open();
}

export async function analyzeFreeInput(plugin: AntinomiaPlugin, 
    text: string,
    signal?: AbortSignal,
    attachUsageTo?: HTMLButtonElement
  ): Promise<{ analysis: FreeInputAnalysis; meta: AIUsageMeta } | null> {
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
    // Reinforced suffix appended on the (single) retry when the first reply
    // was prose the robust parser still couldn't classify.
    const REINFORCE =
      '\n\nSTRICT JSON ONLY. Your previous reply was prose. Output exactly one JSON object {"tipo": "tension"|"substrate", "title": "...", "statementA": "...", "statementB": "...", "contenuto": "..."} starting with { and ending with }. No prose, no commentary before or after.';
    try {
      let lastRaw = "";
      // Attempt 0: normal prompt. Attempt 1: reinforced retry (once).
      for (let attempt = 0; attempt < 2; attempt++) {
        if (attempt === 1) {
          new Notice(
            "Free input: model output was prose, retrying with stricter prompt..."
          );
        }
        const result = await callAI({
          baseUrl: profile.baseUrl,
          apiKey: profile.apiKey,
          model: profile.model,
          system: withFrictionSuffix(attempt === 0 ? FREE_INPUT_SYSTEM : FREE_INPUT_SYSTEM + REINFORCE),
          messages: [{ role: "user", content: text }],
          taskClass: "short",
          signal,
        });
        notifyAIUsage(
          "Free input",
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
        // Silent abort if user clicked Stop after backend started streaming.
        if (signal?.aborted) return null;
        lastRaw = result.text ?? "";
        const parsed = parseFreeInputFromAIResponse(result.text);
        if (parsed) {
          const meta: AIUsageMeta = {
            usage: result.usage,
            durationMs: Date.now() - t0,
            profile: profile.name,
            model: profile.model,
            url: profile.baseUrl,
            operation: "Free input",
          };
          plugin.lastFriction = buildFrictionPayload({
            operation: "freeInput",
            modelName: profile.model,
            baseUrl: profile.baseUrl,
            usage: result.usage,
            ai: parseFrictionFields(result.text),
          });
          return { analysis: parsed, meta };
        }
        // else: loop retries once, then drops to the escape hatch below.
      }

      // Both attempts unparseable → escape hatch: let the user keep the text
      // as a raw substrate and edit it manually, instead of losing it.
      console.error(
        "[Antinomia] analyzeFreeInput unparseable after retry:",
        lastRaw
      );
      new ConfirmModal(
        plugin.app,
        "AI response not parseable",
        `The AI replied but it wasn't valid JSON, even after a stricter retry. You can open the raw response as a substrate and edit it by hand.\n\n--- RAW RESPONSE ---\n${lastRaw.slice(0, 1200) || "(empty)"}`,
        "Open response as substrate",
        () => {
          void plugin.createNote(
            "S",
            substrateTemplate({ content: lastRaw.trim() })
          );
        }
      ).open();
      return null;
    } catch (e) {
      const msg = (e as Error).message;
      // Silent abort: user clicked Stop. No error modal.
      if (msg === "hunter_aborted" || msg === "ai_aborted" || signal?.aborted) {
        return null;
      }
      showErrorModal(
        plugin.app,
        "AI analysis error",
        `Couldn't analyze the input. ${msg.includes("not reachable") ? "Your local AI backend doesn't seem to be running." : "Check that the backend is reachable and the API key is valid."}`,
        `Profile: ${profile.name} (${profile.model})\nURL: ${profile.baseUrl}\n\n${msg}`
      );
      return null;
    }
}
