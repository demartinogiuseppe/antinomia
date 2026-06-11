// presuppositions mapping flow. Extracted from main.ts (refactor v1.5).

import { Notice, TFile } from "obsidian";
import type AntinomiaPlugin from "../main";
import { callAI } from "../ai/callAI";
import { notifyAIUsage, showErrorModal } from "../ai/notifyUsage";
import { extractJson } from "../ai/parseResponse";
import { PRESUPPOSTI_SYSTEM } from "../ai/prompts";
import { TYPE } from "../core/constants";
import type { PresuppostiFields, Profile } from "../core/types";
import { todayISO } from "../core/utils";
import { MapPresuppostiModal } from "../modals/MapPresuppostiModal";

export async function openMapPresupposti(plugin: AntinomiaPlugin, file: TFile): Promise<void> {
    const fm = plugin.app.metadataCache.getFileCache(file)?.frontmatter;
    if (fm?.antinomia_type !== TYPE.tension) {
      new Notice("Map presuppositions: the active note is not a tension.");
      return;
    }
    let raw = "";
    try {
      raw = await plugin.app.vault.read(file);
    } catch (e) {
      new Notice(`Read error: ${(e as Error).message}`);
      return;
    }
    // Pre-fill: prima frontmatter, poi fallback al body "**Presuppositions A:** ..."
    let existingA: string =
      typeof fm?.presupposizioniA === "string" ? fm.presupposizioniA : "";
    let existingB: string =
      typeof fm?.presupposizioniB === "string" ? fm.presupposizioniB : "";
    if (!existingA) {
      const m = raw.match(/\*\*Presuppositions A:\*\*\s*([^\n]*)/);
      if (m && m[1].trim() && !m[1].includes("[da mappare]")) {
        existingA = m[1].trim();
      }
    }
    if (!existingB) {
      const m = raw.match(/\*\*Presuppositions B:\*\*\s*([^\n]*)/);
      if (m && m[1].trim() && !m[1].includes("[da mappare]")) {
        existingB = m[1].trim();
      }
    }
    new MapPresuppostiModal(
      plugin.app,
      plugin,
      file,
      existingA,
      existingB,
      async (fields) => {
        if (!fields) return;
        await plugin.applyPresupposti(file, fields);
      }
    ).open();
}

export async function proposePresuppostiFromContent(plugin: AntinomiaPlugin, 
    content: string,
    signal?: AbortSignal
  ): Promise<PresuppostiFields | null> {
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
        format: profile.format,
        system: PRESUPPOSTI_SYSTEM,
        messages: [{ role: "user", content }],
        taskClass: "medium",
        signal,
      });
      notifyAIUsage("Presuppositions", result.usage, Date.now() - t0, {
        app: plugin.app,
        profile: profile.name,
        model: profile.model,
        url: profile.baseUrl,
      });
      const parsed = extractJson<PresuppostiFields>(result.text);
      if (!parsed) {
        console.error("[Antinomia] presupposti UNPARSEABLE:", result.text);
        showErrorModal(
          plugin.app,
          "AI presuppositions not parseable",
          "The AI replied but the response wasn't valid JSON with presuppositions A/B. Try again or switch model.",
          `Profile: ${profile.name} (${profile.model})\n\n--- RAW RESPONSE ---\n${result.text?.slice(0, 2000) ?? "(empty)"}`
        );
        return null;
      }
      if (typeof parsed.presupposizioniA !== "string" && typeof parsed.presupposizioniB !== "string") {
        console.error("[Antinomia] presupposti wrong keys:", parsed);
        showErrorModal(
          plugin.app,
          "AI presuppositions: wrong keys",
          "The AI returned valid JSON but with the wrong field names. Expected `presupposizioniA` and `presupposizioniB`.",
          `Got keys: ${Object.keys(parsed).join(", ")}\n\nParsed:\n${JSON.stringify(parsed, null, 2)}`
        );
        return null;
      }
      return parsed;
    } catch (e) {
      if ((e as Error).message === "hunter_aborted" || signal?.aborted) {
        throw new Error("ai_aborted");
      }
      console.error("[Antinomia] presupposti CATCH:", e);
      showErrorModal(
        plugin.app,
        "AI presuppositions error",
        `Couldn't get presuppositions from the AI. ${(e as Error).message.includes("not reachable") ? "Your local AI backend doesn't seem to be running." : "Check that the backend is reachable and the API key is valid."}`,
        `Profile: ${profile.name} (${profile.model})\nURL: ${profile.baseUrl}\n\n${(e as Error).message}`
      );
      return null;
    }
}

export async function applyPresupposti(plugin: AntinomiaPlugin, file: TFile, fields: PresuppostiFields): Promise<void> {
    try {
      const raw = await plugin.app.vault.read(file);
      const fmEnd = raw.indexOf("\n---", 3);
      if (fmEnd === -1) {
        new Notice("Error: frontmatter not readable.");
        return;
      }
      const fmBlock = raw.slice(0, fmEnd + 4);
      let body = raw.slice(fmEnd + 4);

      const a = (fields.presupposizioniA || "").trim();
      const b = (fields.presupposizioniB || "").trim();

      const reA = /\*\*Presuppositions A:\*\*[^\n]*/;
      const reB = /\*\*Presuppositions B:\*\*[^\n]*/;

      if (a) {
        if (reA.test(body)) body = body.replace(reA, `**Presuppositions A:** ${a}`);
        else body += `\n\n**Presuppositions A:** ${a}`;
      }
      if (b) {
        if (reB.test(body)) body = body.replace(reB, `**Presuppositions B:** ${b}`);
        else body += `\n**Presuppositions B:** ${b}`;
      }

      await plugin.app.fileManager.processFrontMatter(file, (fm) => {
        if (a) fm.presupposizioniA = a;
        if (b) fm.presupposizioniB = b;
        fm.modified_date = todayISO();
      });
      // Riscrive il body (preserva frontmatter aggiornato)
      const afterFm = await plugin.app.vault.read(file);
      const fmEnd2 = afterFm.indexOf("\n---", 3);
      const fmBlock2 = afterFm.slice(0, fmEnd2 + 4);
      await plugin.app.vault.modify(file, fmBlock2 + body);
      new Notice("Presupposti aggiornati.");
    } catch (e) {
      new Notice(`Presuppositions error: ${(e as Error).message}`);
    }
}
