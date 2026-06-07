// AI title proposal flow. Extracted from main.ts (refactor v1.5).

import { Notice, TFile } from "obsidian";
import type AntinomiaPlugin from "../main";
import { callAI } from "../ai/callAI";
import { notifyAIUsage, showErrorModal } from "../ai/notifyUsage";
import { parseTitleFromAIResponse } from "../ai/parseResponse";
import { TITLE_SYSTEM } from "../ai/prompts";
import type { ClaudeResponse, Profile } from "../core/types";
import { todayISO } from "../core/utils";
import { TitleEditModal } from "../modals/TitleEditModal";

export async function proposeTitleAI(plugin: AntinomiaPlugin, file: TFile): Promise<void> {
    const profile = plugin.profileFor("default");
    if (!profile.apiKey) {
      showErrorModal(
        plugin.app,
        "API key missing",
        "The active AI profile has no API key. Open Settings → Antinomia and add one (or switch profile)."
      );
      return;
    }
    const raw = await plugin.app.vault.read(file);
    new Notice("Antinomia: proposing title (AI)...");
    const t0 = Date.now();
    let result: { text: string; usage?: ClaudeResponse["usage"] };
    try {
      result = await callAI({
        baseUrl: profile.baseUrl,
        apiKey: profile.apiKey,
        model: profile.model,
        system: TITLE_SYSTEM,
        messages: [
          {
            role: "user",
            content:
              "Filename: " +
              file.basename +
              "\n\n=== NOTE CONTENT ===\n\n" +
              raw,
          },
        ],
        taskClass: "short",
      });
      notifyAIUsage("Title", result.usage, Date.now() - t0, {
        app: plugin.app,
        profile: profile.name,
        model: profile.model,
        url: profile.baseUrl,
      });
    } catch (e) {
      showErrorModal(
        plugin.app,
        "AI title error",
        `Couldn't get a title from the AI. ${(e as Error).message.includes("not reachable") ? "Your local AI backend doesn't seem to be running." : "Check that the backend is reachable and the API key is valid."}`,
        `Profile: ${profile.name} (${profile.model})\nURL: ${profile.baseUrl}\n\n${(e as Error).message}`
      );
      return;
    }
    const proposed = parseTitleFromAIResponse(result.text);
    if (!proposed) {
      const responseLen = result.text?.length ?? 0;
      console.error(
        "[Antinomia] proposeTitleAI unparseable. Length=" + responseLen,
        result.text
      );
      const message =
        responseLen === 0
          ? "The AI returned an empty response. This usually happens with reasoning models (Qwen3, DeepSeek-R1, o-series) that consume all tokens on internal <think> blocks before producing output. The plugin already tries to disable extended reasoning, but some distilled models force it. Try a non-reasoning model (Llama 3.x, Mistral, Phi) for short tasks like titles."
          : "The AI replied but the response didn't contain a usable title (no valid JSON, no recognizable title pattern). Try a different model.";
      showErrorModal(
        plugin.app,
        "AI title not parseable",
        message,
        `Profile: ${profile.name} (${profile.model})\nResponse length: ${responseLen}\n\n--- RAW RESPONSE ---\n${result.text?.slice(0, 2000) ?? "(empty)"}`
      );
      return;
    }
    new TitleEditModal(
      plugin.app,
      proposed,
      `Proposed title for ${file.basename}`,
      "AI suggestion. Edit freely before saving.",
      async (value) => {
        if (value === null || value === "") return;
        try {
          await plugin.app.fileManager.processFrontMatter(file, (frontm) => {
            frontm.title = value;
            frontm.modified_date = todayISO();
          });
          new Notice(`Title: ${value}`);
        } catch (e) {
          new Notice(`Error: ${(e as Error).message}`);
        }
      }
    ).open();
}

export async function proposeTitleFromContent(plugin: AntinomiaPlugin, 
    content: string,
    signal?: AbortSignal,
    attachUsageTo?: HTMLButtonElement
  ): Promise<string | null> {
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
        system: TITLE_SYSTEM,
        messages: [{ role: "user", content }],
        // Autoadaptive: titles = short task. Per model family:
        //  - Anthropic/Llama/Mistral/Phi  → ~200 max_tokens, no reasoning controls
        //  - OpenAI o-series              → 4000, reasoning_effort=low
        //  - Qwen3 reasoning / DeepSeek-R1 → 4000, reasoning_effort=off + enable_thinking=false
        //  - Qwen instruct                → ~300
        taskClass: "short",
        signal,
      });
      notifyAIUsage(
        "Title",
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
      // If the user clicked Stop *after* the backend already started
      // streaming a response, callAI may still resolve successfully with a
      // partial / empty body. Don't show an "unparseable" error modal in
      // that case — the user knows they aborted.
      if (signal?.aborted) return null;
      const title = parseTitleFromAIResponse(result.text);
      if (title) return title;
      const responseLen = result.text?.length ?? 0;
      console.error(
        "[Antinomia] proposeTitleFromContent unparseable. Length=" + responseLen,
        result.text
      );
      const message =
        responseLen === 0
          ? "The AI returned an empty response. This usually happens with reasoning models (Qwen3, DeepSeek-R1, o-series) that consume all tokens on internal <think> blocks before producing output. The plugin already tries to disable extended reasoning, but some distilled models force it. Try a non-reasoning model (Llama 3.x, Mistral, Phi) for short tasks like titles."
          : "The AI replied but the response didn't contain a usable title (no valid JSON, no recognizable title pattern). Try a different model.";
      showErrorModal(
        plugin.app,
        "AI title not parseable",
        message,
        `Profile: ${profile.name} (${profile.model})\nResponse length: ${responseLen}\n\n--- RAW RESPONSE ---\n${result.text?.slice(0, 2000) ?? "(empty)"}`
      );
      return null;
    } catch (e) {
      const msg = (e as Error).message;
      // Silent abort: user clicked Stop. No error modal.
      if (msg === "hunter_aborted" || msg === "ai_aborted" || signal?.aborted) {
        return null;
      }
      showErrorModal(
        plugin.app,
        "AI title error",
        `Couldn't get a title from the AI. ${msg.includes("not reachable") ? "Your local AI backend doesn't seem to be running." : "Check that the backend is reachable and the API key is valid."}`,
        `Profile: ${profile.name} (${profile.model})\nURL: ${profile.baseUrl}\n\n${msg}`
      );
      return null;
    }
}
