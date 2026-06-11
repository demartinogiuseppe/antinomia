// contextual guidance modal. Extracted from main.ts (refactor v1.5).

import { App, Modal } from "obsidian";
import { NewSubstrateModal } from "./NewSubstrateModal";
import { NewTensionModal } from "./NewTensionModal";
import type AntinomiaPlugin from "../main";
import { TYPE, VIEW_TYPE_OPEN_TENSIONS } from "../core/constants";
import { substrateTemplate, tensionTemplate } from "../core/templates";

export class GuidanceModal extends Modal {
  private plugin: AntinomiaPlugin;
  constructor(app: App, plugin: AntinomiaPlugin) {
    super(app);
    this.plugin = plugin;
  }
  onOpen(): void {
    const { contentEl } = this;
    contentEl.createEl("h3", { text: "What to do next" });

    const intro = contentEl.createEl("p");
    intro.setCssStyles({
      fontSize: "0.9em",
      opacity: "0.8",
    });
    intro.setText(
      "Contextual hint based on the current state of your vault."
    );

    const suggestion = this.computeSuggestion();

    const box = contentEl.createEl("div");
    box.setCssStyles({
      padding: "14px",
      marginTop: "12px",
      marginBottom: "16px",
      background: "var(--background-secondary)",
      borderLeft: "3px solid var(--interactive-accent)",
      borderRadius: "4px",
    });

    const title = box.createEl("div");
    title.setCssStyles({
      fontWeight: "600",
      marginBottom: "6px",
    });
    title.setText(suggestion.headline);

    const body = box.createEl("div");
    body.setCssStyles({
      fontSize: "0.9em",
      lineHeight: "1.5",
    });
    body.setText(suggestion.body);

    const btnRow = contentEl.createEl("div");
    btnRow.setCssStyles({
      display: "flex",
      gap: "8px",
      justifyContent: "flex-end",
      marginTop: "12px",
    });

    const closeBtn = btnRow.createEl("button", { text: "Close" });
    closeBtn.setCssStyles({
      padding: "6px 12px",
      cursor: "pointer",
    });
    closeBtn.onclick = () => this.close();

    if (suggestion.actionLabel && suggestion.action) {
      const goBtn = btnRow.createEl("button", { text: suggestion.actionLabel });
      goBtn.setCssStyles({
        padding: "6px 14px",
        cursor: "pointer",
        background: "var(--interactive-accent)",
        color: "var(--text-on-accent)",
        fontWeight: "600",
      });
      goBtn.onclick = () => {
        this.close();
        suggestion.action!();
      };
    }
  }

  /**
   * Compute a context-aware suggestion based on vault state.
   */
  private computeSuggestion(): {
    headline: string;
    body: string;
    actionLabel?: string;
    action?: () => void;
  } {
    const files = this.app.vault.getMarkdownFiles();
    const countByType = (t: string) =>
      files.filter((f) => {
        const fm = this.app.metadataCache.getFileCache(f)?.frontmatter;
        return fm?.antinomia_type === t;
      }).length;

    const tensions = countByType(TYPE.tension);
    const openTensions = files.filter((f) => {
      const fm = this.app.metadataCache.getFileCache(f)?.frontmatter;
      return fm?.antinomia_type === TYPE.tension && fm?.status === "open";
    }).length;
    const substrates = countByType(TYPE.substrate);
    const principles = countByType(TYPE.principle);
    const totalAntinomia = tensions + substrates + principles + countByType(TYPE.defeated);

    const s = this.plugin.settings;

    // No notes at all
    if (totalAntinomia === 0) {
      return {
        headline: "Empty vault: create your first tension",
        body: "Antinomia starts from a contradiction. Think of a dilemma you have (work, decisions, values) — two positions that both seem true but incompatible. That is the base material.",
        actionLabel: "Create first tension",
        action: () => {
          new NewTensionModal(this.app, this.plugin, (fields, skipped) => {
            if (fields === null && !skipped) return;
            const content = fields ? tensionTemplate(fields) : tensionTemplate();
            void this.plugin.createNote("T", content);
          }).open();
        },
      };
    }

    // 1+ tensioni ma 0 substrate
    if (tensions >= 1 && substrates === 0) {
      return {
        headline: "Add some raw material (substrate)",
        body: "You already have some tensions but no substrate. Substrate (quotes, facts, observations) is the raw material from which new contradictions emerge. The Hunter works much better when it has substrate to cross-reference with tensions.",
        actionLabel: "Create substrate",
        action: () => {
          new NewSubstrateModal(this.app, this.plugin, (fields, skipped) => {
            if (fields === null && !skipped) return;
            const content = fields ? substrateTemplate(fields) : substrateTemplate();
            void this.plugin.createNote("S", content);
          }).open();
        },
      };
    }

    // Hai materiale ma mai lanciato Hunter
    if (totalAntinomia >= 3 && !s.hasRunHunter) {
      return {
        headline: "Run your first Hunter",
        body: `You have ${totalAntinomia} notes in the vault. The Hunter scans open tensions + substrate and identifies contradictory pairs you may not have seen. For local models it takes a few minutes. Nothing destructive, just reading.`,
        actionLabel: "Run Hunter",
        action: () => void this.plugin.runHunter(),
      };
    }

    // You've run Hunter, have open tensions, but no principles
    if (s.hasRunHunter && openTensions >= 1 && principles === 0) {
      return {
        headline: "Consider elevating a tension to a principle",
        body: "You have open tensions and have already run the Hunter. If a tension feels clear enough, elevate it: turn the contradiction into an operational IF/THEN principle. It doesn't mean 'being right', it means 'having understood the contexts'.",
        actionLabel: "Open tensions sidebar",
        action: () => void this.plugin.activateViewExternal(VIEW_TYPE_OPEN_TENSIONS),
      };
    }

    // Several tensions but no presuppositions mapped (heuristic check)
    if (openTensions >= 2) {
      return {
        headline: "Map the presuppositions of a tension",
        body: "The most productive tensions emerge when you make explicit the epistemic/value presuppositions that A and B take for granted. The 'Presuppositions' button on an open tension opens a form with an AI button that proposes a mapping.",
        actionLabel: "Open active tensions",
        action: () => void this.plugin.activateViewExternal(VIEW_TYPE_OPEN_TENSIONS),
      };
    }

    // Mature vault (default fallback)
    return {
      headline: "Keep working with the system",
      body: `Status: ${tensions} tensions (${openTensions} open), ${substrates} substrate, ${principles} principles. The vault is working. When you want an overview of hidden contradictions, run the Hunter again. When you encounter new material, drop in a substrate via '✨ Free' (AI classifies for you).`,
      actionLabel: "Open tensions sidebar",
      action: () => void this.plugin.activateViewExternal(VIEW_TYPE_OPEN_TENSIONS),
    };
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
