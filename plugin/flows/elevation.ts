// tension->principle elevation flow. Extracted from main.ts (refactor v1.5).

import { Notice, TFile } from "obsidian";
import type AntinomiaPlugin from "../main";
import { callAI } from "../ai/callAI";
import { notifyAIUsage, showErrorModal } from "../ai/notifyUsage";
import { extractJson } from "../ai/parseResponse";
import { PRINCIPLE_SYSTEM } from "../ai/prompts";
import { TYPE } from "../core/constants";
import { stripFrontmatter, yamlQuote } from "../core/frontmatter";
import { principleBodyTemplate } from "../core/templates";
import type { PrincipleFields, Profile } from "../core/types";
import { todayISO } from "../core/utils";
import { ElevateToPrincipleModal } from "../modals/ElevateToPrincipleModal";

export async function openElevateModal(plugin: AntinomiaPlugin, file: TFile): Promise<void> {
    if (plugin.elevateModalOpen) {
      console.warn("[Antinomia] openElevateModal: already open, ignoring duplicate request");
      return;
    }
    // Claim the guard SYNCHRONOUSLY, before the first await below. Otherwise two
    // rapid clicks both pass the check (the flag is still false while the first
    // is awaiting vault.read) and two modals open. Release on every early exit.
    plugin.elevateModalOpen = true;
    const fm0 = plugin.app.metadataCache.getFileCache(file)?.frontmatter;
    if (fm0?.antinomia_type !== TYPE.tension) {
      new Notice("Elevate: active note is not a tension.");
      plugin.elevateModalOpen = false;
      return;
    }
    let rawElev = "";
    try {
      rawElev = await plugin.app.vault.read(file);
    } catch (e) {
      new Notice(`Read error: ${(e as Error).message}`);
      plugin.elevateModalOpen = false;
      return;
    }
    const modal = new ElevateToPrincipleModal(
      plugin.app,
      plugin,
      file,
      rawElev,
      async (fields, skipped) => {
        if (fields === null && !skipped) return;
        await plugin.elevateToPrinciple(file, fields ?? undefined);
      }
    );
    // Sblocca il guard quando il modal si chiude (qualsiasi via)
    const originalOnClose = modal.onClose?.bind(modal);
    modal.onClose = () => {
      plugin.elevateModalOpen = false;
      if (originalOnClose) originalOnClose();
    };
    modal.open();
}

export async function elevateToPrinciple(plugin: AntinomiaPlugin, 
    file: TFile,
    fields?: PrincipleFields
  ): Promise<void> {
    try {
      if (plugin.settings.elevationMode === "split") {
        await plugin.elevateSplit(file, fields);
      } else {
        await plugin.elevateTransform(file, fields);
      }
    } catch (e) {
      new Notice(`Errore elevazione: ${(e as Error).message}`);
    }
}

export async function elevateTransform(plugin: AntinomiaPlugin, file: TFile, fields?: PrincipleFields): Promise<void> {
    const raw = await plugin.app.vault.read(file);
    const oldBody = stripFrontmatter(raw).trim();
    const originBasename = file.basename;
    const today = todayISO();
    await plugin.app.fileManager.processFrontMatter(file, (fm) => {
      fm.antinomia_type = TYPE.principle;
      fm.data = today;
      fm.modified_date = today;
      fm.origin_tension = `[[${originBasename}]]`;
      delete fm.status;
      delete fm.origin;
    });
    const afterFm = await plugin.app.vault.read(file);
    const fmEnd = afterFm.indexOf("\n---", 3);
    if (fmEnd === -1) {
      new Notice("Errore: frontmatter non leggibile.");
      return;
    }
    const fmBlock = afterFm.slice(0, fmEnd + 4);
    const newBody =
      "\n\n" +
      principleBodyTemplate(fields) +
      "\n## Origin (tension)\n\n" +
      `> Derived from: [[${originBasename}]]\n\n` +
      oldBody +
      "\n";
    await plugin.app.vault.modify(file, fmBlock + newBody);
    new Notice(`Elevata (transform): ${file.basename}`);
}

export async function elevateSplit(plugin: AntinomiaPlugin, file: TFile, fields?: PrincipleFields): Promise<void> {
    const oldFm = plugin.app.metadataCache.getFileCache(file)?.frontmatter ?? {};
    const tensionBasename = file.basename;
    const today = todayISO();
    const tensionTitle = typeof oldFm.title === "string" ? oldFm.title : tensionBasename;
    const existingLinks: string[] = Array.isArray(oldFm.links)
      ? oldFm.links.map((s: any) => String(s))
      : [];
    const collegamentiYaml = existingLinks.length > 0
      ? `links:\n${existingLinks.map((l) => "  - " + JSON.stringify(l)).join("\n")}\n`
      : "links: []\n";
    const principleContent =
      "---\n" +
      `antinomia_type: ${TYPE.principle}\n` +
      `title: ${yamlQuote("Principio da " + tensionTitle)}\n` +
      `data: ${today}\n` +
      `modified_date: ${today}\n` +
      `origin_tension: "[[${tensionBasename}]]"\n` +
      collegamentiYaml +
      "---\n\n" +
      principleBodyTemplate(fields) +
      "\n## Origin (tension)\n\n" +
      `> Derived from: [[${tensionBasename}]]\n\n` +
      "_(testo originale conservato nel defeated linkato)_\n";
    const principleFile = await plugin.createNote("P", principleContent);
    if (!principleFile) {
      new Notice("Errore: impossibile creare il principio.");
      return;
    }
    const principleBasename = principleFile.basename;
    await plugin.app.fileManager.processFrontMatter(file, (fm) => {
      fm.antinomia_type = TYPE.defeated;
      fm.motive = "elevated";
      fm.replaced_by = `[[${principleBasename}]]`;
      fm.modified_date = today;
      delete fm.status;
    });
    const afterFm = await plugin.app.vault.read(file);
    if (!afterFm.includes(`> Replaced by: [[${principleBasename}]]`)) {
      await plugin.app.vault.modify(file, afterFm + `\n\n> Replaced by: [[${principleBasename}]]\n`);
    }
    new Notice(`Elevata (split): ${tensionBasename} -> defeated, principio ${principleBasename}`);
}

export async function proposeIfThenFromContent(plugin: AntinomiaPlugin, 
    content: string,
    signal?: AbortSignal,
    attachUsageTo?: HTMLButtonElement
  ): Promise<PrincipleFields | null> {
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
        system: PRINCIPLE_SYSTEM,
        messages: [{ role: "user", content }],
        taskClass: "medium",
        signal,
      });
      notifyAIUsage(
        "IF/THEN",
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
      const parsed = extractJson<PrincipleFields>(result.text);
      if (!parsed) {
        console.error("[Antinomia] proposeIfThenFromContent unparseable:", result.text);
        showErrorModal(
          plugin.app,
          "AI principle proposal not parseable",
          "The AI replied but the response wasn't valid JSON with IF/THEN/GREY fields. Try again or switch model.",
          `Profile: ${profile.name} (${profile.model})\n\n--- RAW RESPONSE ---\n${result.text?.slice(0, 2000) ?? "(empty)"}`
        );
        return null;
      }
      return parsed;
    } catch (e) {
      const msg = (e as Error).message;
      if (msg === "hunter_aborted" || msg === "ai_aborted" || signal?.aborted) {
        return null;
      }
      showErrorModal(
        plugin.app,
        "AI principle error",
        `Couldn't get a principle proposal from the AI. ${msg.includes("not reachable") ? "Your local AI backend doesn't seem to be running." : "Check that the backend is reachable and the API key is valid."}`,
        `Profile: ${profile.name} (${profile.model})\nURL: ${profile.baseUrl}\n\n${msg}`
      );
      return null;
    }
}
