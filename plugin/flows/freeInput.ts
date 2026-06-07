// free-input analysis flow. Extracted from main.ts (refactor v1.5).

import { Notice } from "obsidian";
import type AntinomiaPlugin from "../main";
import { callAI } from "../ai/callAI";
import { notifyAIUsage, showErrorModal } from "../ai/notifyUsage";
import { extractJson } from "../ai/parseResponse";
import { FREE_INPUT_SYSTEM } from "../ai/prompts";
import { substrateTemplate, tensionTemplate } from "../core/templates";
import type { AIUsageMeta, FreeInputAnalysis, Profile } from "../core/types";
import { extractYouTubeId } from "../core/utils";
import { FreeInputModal } from "../modals/FreeInputModal";
import { NewSubstrateModal } from "../modals/NewSubstrateModal";
import { NewTensionModal } from "../modals/NewTensionModal";

export async function openFreeInputFromClipboard(plugin: AntinomiaPlugin): Promise<void> {
    let clip = "";
    let source = "unknown";

    // Try Electron clipboard first (Obsidian Desktop). Available via require.
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const electron = (window as any).require?.("electron");
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

    console.log(
      `[Antinomia] clipboard read via ${source}: ${clip.length} chars`
    );

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
        "Il contenuto della clipboard sembra un URL YouTube. Vuoi scaricare la trascrizione e creare un substrate pre-popolato?\n\nOK = scarica trascrizione.\nAnnulla = procedi con l'inserimento libero (AI classifica)."
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
    try {
      const result = await callAI({
        baseUrl: profile.baseUrl,
        apiKey: profile.apiKey,
        model: profile.model,
        system: FREE_INPUT_SYSTEM,
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
      const parsed = extractJson<FreeInputAnalysis>(result.text);
      if (!parsed || (parsed.tipo !== "tension" && parsed.tipo !== "substrate")) {
        console.error("[Antinomia] analyzeFreeInput unparseable:", result.text);
        showErrorModal(
          plugin.app,
          "AI analysis not parseable",
          "The AI replied but the response wasn't valid JSON with a tension/substrate classification. Try again or rephrase the input.",
          `Profile: ${profile.name} (${profile.model})\n\n--- RAW RESPONSE ---\n${result.text?.slice(0, 2000) ?? "(empty)"}`
        );
        return null;
      }
      const meta: AIUsageMeta = {
        usage: result.usage,
        durationMs: Date.now() - t0,
        profile: profile.name,
        model: profile.model,
        url: profile.baseUrl,
        operation: "Free input",
      };
      return { analysis: parsed, meta };
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
