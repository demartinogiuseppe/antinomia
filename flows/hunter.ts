// Contradiction Hunter flow. Extracted from main.ts (refactor v1.5).

import { Notice, TFile } from "obsidian";
import type AntinomiaPlugin from "../main";
import { callAI } from "../ai/callAI";
import { notifyAIUsage, showErrorModal } from "../ai/notifyUsage";
import { extractJson, normalizeHunterPair } from "../ai/parseResponse";
import { buildHunterSystem } from "../ai/prompts";
import { buildFrictionPayload, parseFrictionFields, withFrictionSuffix } from "../core/aiFriction";
import { TYPE, VIEW_TYPE_HUNTER_RESULTS } from "../core/constants";
import { stripFrontmatter, readFrontmatter } from "../core/frontmatter";
import { HunterResultsView } from "../views/HunterResultsView";
import type { AntinomiaFrontmatter, ClaudeResponse, HunterResponse, HunterResult, HunterRun, HunterRunMetadata } from "../core/types";

export async function runHunter(plugin: AntinomiaPlugin, focusFile?: TFile, attachToButton?: HTMLButtonElement): Promise<void> {
    const profile = plugin.profileFor("hunter");
    if (!profile.apiKey) {
      new Notice("API key missing in the Hunter profile (or active one). Settings -> Antinomia.");
      return;
    }
    if (!plugin.settings.hasRunHunter) {
      plugin.settings.hasRunHunter = true;
      void plugin.saveSettings();
    }
    const all = plugin.app.vault.getMarkdownFiles();
    const candidates: TFile[] = [];
    for (const f of all) {
      const fm = readFrontmatter(plugin.app, f);
      const t = fm?.antinomia_type;
      const isOpenTension = t === TYPE.tension && fm?.status === "open";
      const isSubstrate = t === TYPE.substrate;
      if (isOpenTension || isSubstrate) candidates.push(f);
    }
    if (candidates.length < 2) {
      new Notice(`Hunter: at least 2 notes needed. Found: ${candidates.length}.`);
      return;
    }
    candidates.sort((a, b) => b.stat.mtime - a.stat.mtime);
    const cap = plugin.settings.hunterMaxNotes;
    let selected: TFile[];
    let truncated = false;
    if (focusFile) {
      // Modalita' focalizzata: target + altri candidati per riempire fino al cap
      const others = candidates.filter((f) => f.path !== focusFile.path);
      truncated = others.length > cap - 1;
      selected = [focusFile, ...others.slice(0, cap - 1)];
    } else {
      truncated = candidates.length > cap;
      selected = candidates.slice(0, cap);
    }

    // Conta tipi per il prompt (cosi' il modello sa quante substrate ci sono)
    let nTensions = 0, nSubstrates = 0;
    for (const f of selected) {
      const fm = readFrontmatter(plugin.app, f);
      if (fm?.antinomia_type === TYPE.tension) nTensions++;
      else if (fm?.antinomia_type === TYPE.substrate) nSubstrates++;
    }

    const bodyLimit = plugin.settings.hunterNoteBodyLimit;
    const noteBlocks: string[] = [];
    for (const f of selected) {
      const raw = await plugin.app.vault.read(f);
      const fm = readFrontmatter(plugin.app, f);
      const body = stripFrontmatter(raw).trim();
      const truncBody = body.length > bodyLimit ? body.slice(0, bodyLimit) + "..." : body;
      const tipo = fm?.antinomia_type || "?";
      noteBlocks.push(`### ${f.basename} [${tipo}]\n${truncBody}`);
    }
    const nTotal = selected.length;
    const userContent = focusFile
      ? `Analizza queste ${nTotal} note Antinomia. La nota FOCUS e' "${focusFile.basename}" (la prima sotto). ` +
        `Identifica SOLO coppie contraddittorie che COINVOLGONO "${focusFile.basename}" — cioe' coppie (FOCUS, altra). ` +
        `NON includere coppie tra le altre note tra loro. Rispondi SOLO con JSON conforme allo schema.\n\n` +
        noteBlocks.join("\n\n")
      : `Analizza queste ${nTotal} note Antinomia (${nTensions} tensioni, ${nSubstrates} substrate) ` +
        `e identifica coppie contraddittorie. ESAMINA TUTTE le ${(nTotal * (nTotal - 1)) / 2} coppie possibili, ` +
        `incluse substrate-substrate. Rispondi SOLO con JSON conforme allo schema.\n\n` +
        noteBlocks.join("\n\n");

    await plugin.activateView(VIEW_TYPE_HUNTER_RESULTS);
    const hunterLeaf = plugin.app.workspace.getLeavesOfType(VIEW_TYPE_HUNTER_RESULTS)[0];
    const hunterView =
      hunterLeaf && hunterLeaf.view instanceof HunterResultsView
        ? hunterLeaf.view
        : null;

    new Notice(`Hunter${focusFile ? ` on ${focusFile.basename}` : ""}: sending ${selected.length} notes (${nTensions}T + ${nSubstrates}S)...${truncated ? " (truncated)" : ""}`);
    hunterView?.setLoading(true, selected.length);

    plugin.hunterAbortController = new AbortController();
    const abortSignal = plugin.hunterAbortController.signal;

    const t0 = Date.now();
    // Reinforced suffix appended to the system prompt on the (single) retry
    // when the first reply was prose instead of a pairs[] structure. Hunter's
    // output is a structured array, so heuristic salvage is too fragile — an
    // explicit "JSON only" retry is more reliable than pattern-matching prose.
    const REINFORCE =
      '\n\nCRITICAL: your previous reply was prose, not JSON. Output ONLY the JSON {"pairs": [{"note_a": "...", "note_b": "...", "description": "...", "confidence": "high|medium|low"}]} or {"pairs": []} if none. NO commentary, NO instructions, NO meta-text. Start with { end with }.';
    let result!: { text: string; usage?: ClaudeResponse["usage"] };
    let rawPairs: unknown[] | null = null;
    let durationMs = 0;

    // Attempt 0: normal prompt. Attempt 1: reinforced retry (once). A network
    // / abort error bails immediately (it's not a prose problem); only an
    // unparseable reply triggers the retry.
    for (let attempt = 0; attempt < 2; attempt++) {
      if (attempt === 1) {
        new Notice("Hunter: model output was prose, retrying with stricter prompt...");
      }
      try {
        const aiPromise = callAI({
          baseUrl: profile.baseUrl,
          apiKey: profile.apiKey,
          model: profile.model,
          system: withFrictionSuffix(
            buildHunterSystem(plugin.settings.hunterReasoningStyle) +
              (attempt === 1 ? REINFORCE : "")
          ),
          messages: [{ role: "user", content: userContent }],
          // Hunter is a "deep" task — the model has to compare many notes
          // pairwise and emit a structured list. Autoadaptive budget per
          // family (e.g. ~2000 for Llama/Anthropic, ~10000 for reasoning
          // models that need room for both <think> and the JSON output).
          taskClass: "deep",
          // Hunter benefits from reasoning when the model supports it
          // (substrate↔substrate is genuinely subtle work), so we leave
          // extended thinking ON for deep tasks.
          disableThinking: false,
          signal: abortSignal,
        });
        const abortPromise = new Promise<never>((_, reject) => {
          abortSignal.addEventListener("abort", () => reject(new Error("hunter_aborted")));
        });
        result = await Promise.race([aiPromise, abortPromise]);
      } catch (e) {
        hunterView?.setLoading(false);
        plugin.hunterAbortController = null;
        if ((e as Error).message === "hunter_aborted") {
          new Notice("Hunter stopped by user.");
        } else {
          showErrorModal(
            plugin.app,
            "Hunter error",
            `The Hunter run failed. ${(e as Error).message.includes("not reachable") ? "Your local AI backend doesn't seem to be running." : "Check that the backend is reachable and the API key is valid."}`,
            `Profile: ${profile.name} (${profile.model})\nURL: ${profile.baseUrl}\n\n${(e as Error).message}`
          );
          console.error("[Antinomia] hunter call failed", e);
        }
        return;
      }
      durationMs = Date.now() - t0;
      const parsedRaw = extractJson<HunterResponse>(result.text);
      if (parsedRaw && Array.isArray(parsedRaw.pairs)) rawPairs = parsedRaw.pairs;
      else if (parsedRaw && Array.isArray(parsedRaw.contraddizioni)) rawPairs = parsedRaw.contraddizioni;
      if (rawPairs) break; // got a structure — stop retrying
    }

    hunterView?.setLoading(false);
    plugin.hunterAbortController = null;

    // Normalize via the shared, unit-tested normalizeHunterPair (English +
    // legacy Italian schema). See ai/parseResponse.
    if (!rawPairs) {
      console.error("[Antinomia] hunter unparseable after retry:", result.text);
      showErrorModal(
        plugin.app,
        "Hunter response not parseable",
        "The AI replied but didn't return a valid pairs[] structure, even after a stricter retry. This often happens with local reasoning models that spend all tokens on internal <think> blocks, or with very strict JSON-mode responses.",
        `Profile: ${profile.name} (${profile.model})\nResponse length: ${result.text?.length ?? 0}\n\n--- RAW RESPONSE ---\n${result.text?.slice(0, 3000) ?? "(empty)"}`,
        {
          label: "Open raw response",
          onClick: () => {
            void plugin.createNote(
              "HUNTER-RAW",
              `# Hunter raw response (debug)\n\nProfile: ${profile.name} (${profile.model})\nResponse length: ${result.text?.length ?? 0}\n\n\`\`\`\n${result.text ?? "(empty)"}\n\`\`\`\n`
            );
          },
        }
      );
      return;
    }
    const parsed: HunterResult = { pairs: rawPairs.map(normalizeHunterPair) };

    // Anti-hallucination validation: discard invented basenames, self-pairs, empty descriptions
    const realBasenames = new Set(selected.map((f) => f.basename));
    const validated = parsed.pairs.filter((c) => {
      const a = String(c.note_a || "").trim();
      const b = String(c.note_b || "").trim();
      const desc = String(c.description || "").trim();
      if (!a || !b || a === b) { return false; }
      if (!desc || desc === "undefined") { return false; }
      if (!realBasenames.has(a) || !realBasenames.has(b)) {
        console.warn("[Antinomia] hunter: discarded pair with non-existent basenames:", a, "<->", b);
        return false;
      }
      // In focus mode, discard pairs that do NOT involve the focusFile
      if (focusFile && a !== focusFile.basename && b !== focusFile.basename) {
        return false;
      }
      return true;
    });

    // Filter out already-dismissed false positives
    const dismissedSet = new Set<string>();
    for (const f of selected) {
      const fm = readFrontmatter(plugin.app, f);
      const fp = fm?.hunter_false_positives;
      if (Array.isArray(fp)) {
        for (const peer of fp) {
          const key = [f.basename, String(peer)].sort().join("|");
          dismissedSet.add(key);
        }
      }
    }
    let dismissedFiltered = 0;
    const filtered = validated.filter((c) => {
      const key = [c.note_a, c.note_b].sort().join("|");
      if (dismissedSet.has(key)) {
        dismissedFiltered++;
        return false;
      }
      return true;
    });

    const meta: HunterRunMetadata = {
      timestamp: new Date().toISOString(),
      notesExamined: selected.length,
      totalCandidates: candidates.length,
      truncated,
      durationMs,
      model: profile.model,
      inputTokens: result.usage?.input_tokens,
      outputTokens: result.usage?.output_tokens,
      dismissedFiltered,
    };
    const run: HunterRun = { meta, result: { pairs: filtered } };

    plugin.settings.lastHunterRunISO = meta.timestamp;
    plugin.settings.lastHunterRunCount = filtered.length;
    void plugin.saveSettings();

    plugin.lastFriction = buildFrictionPayload({
      operation: "hunter",
      modelName: profile.model,
      baseUrl: profile.baseUrl,
      usage: result.usage,
      ai: parseFrictionFields(result.text),
    });
    hunterView?.setRun(run);
    new Notice(`Hunter: ${filtered.length} pairs in ${(durationMs / 1000).toFixed(1)}s.`);
    notifyAIUsage(
      "Hunter",
      result.usage
        ? { input_tokens: result.usage.input_tokens, output_tokens: result.usage.output_tokens }
        : undefined,
      durationMs,
      {
        app: plugin.app,
        profile: profile.name,
        model: profile.model,
        url: profile.baseUrl,
      },
      attachToButton
    );
}

export async function undismissContradiction(plugin: AntinomiaPlugin, 
    aBasename: string,
    bBasename: string
  ): Promise<void> {
    const findFile = (bn: string): TFile | null => {
      const all = plugin.app.vault.getMarkdownFiles();
      return all.find((f) => f.basename === bn) ?? null;
    };
    const cleanOne = async (
      file: TFile | null,
      peer: string
    ): Promise<boolean> => {
      if (!file) return false;
      let modified = false;
      await plugin.app.fileManager.processFrontMatter(file, (fm: AntinomiaFrontmatter) => {
        const arr = fm.hunter_false_positives;
        if (!Array.isArray(arr)) return;
        const filtered = arr.filter((x: unknown) => String(x) !== peer);
        if (filtered.length !== arr.length) {
          modified = true;
          if (filtered.length === 0) delete fm.hunter_false_positives;
          else fm.hunter_false_positives = filtered;
        }
      });
      return modified;
    };
    const a = findFile(aBasename);
    const b = findFile(bBasename);
    const mA = await cleanOne(a, bBasename);
    const mB = await cleanOne(b, aBasename);
    if (mA || mB) {
      new Notice(`Reincluso: ${aBasename} <-> ${bBasename}`);
    } else {
      new Notice("No dismissal found for this pair.");
    }
}
