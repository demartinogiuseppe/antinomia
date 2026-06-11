// Antinomia — review AI-proposed presuppositions for a principle. Per row:
// create new, link to an existing U- note, edit the text, or skip.

import { App, Modal, Setting } from "obsidian";
import type AntinomiaPlugin from "../main";
import type { PresuppositionProposal } from "../core/types";
import type {
  PresupDecision,
  ExistingPresupposition,
} from "../flows/presuppositionMap";
import type { FrictionPayload } from "../core/aiFriction";
import { renderFrictionCard, gateAcceptButton } from "./FrictionCard";

export class PresuppositionMapModal extends Modal {
  private rows: { textarea: HTMLTextAreaElement; select: HTMLSelectElement; confidence: "high" | "medium" | "low" }[] = [];

  constructor(
    app: App,
    private plugin: AntinomiaPlugin,
    private principleTitle: string,
    private proposals: PresuppositionProposal[],
    private existing: ExistingPresupposition[],
    private onConfirm: (decisions: PresupDecision[]) => void | Promise<void>,
    private friction?: FrictionPayload
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h3", { text: "Map presuppositions" });
    contentEl.createEl("p", {
      text: `Implicit assumptions behind "${this.principleTitle}". For each, create a new presupposition, link to an existing one, edit the text, or skip.`,
    }).setCssStyles({ opacity: "0.85" });

    if (this.friction) {
      renderFrictionCard(
        contentEl,
        this.friction,
        this.plugin.settings.aiFrictionLevel ?? "medium"
      );
    }

    for (const p of this.proposals) {
      const row = contentEl.createDiv();
      row.setCssStyles({
        border: "1px solid var(--background-modifier-border)",
        borderRadius: "6px",
        padding: "8px 10px",
        marginBottom: "10px",
      });

      const conf = row.createEl("span", { text: `confidence: ${p.confidence}` });
      conf.setCssStyles({
        fontSize: "0.72em",
        opacity: "0.65",
        float: "right",
      });

      const textarea = row.createEl("textarea");
      textarea.value = p.text;
      textarea.setCssStyles({
        width: "100%",
        minHeight: "48px",
        resize: "vertical",
        margin: "4px 0",
        boxSizing: "border-box",
      });

      const select = row.createEl("select");
      select.setCssStyles({
        width: "100%",
        padding: "3px",
      });
      const optNew = select.createEl("option", { text: "➕ Create new presupposition" });
      optNew.value = "new";
      for (const e of this.existing) {
        const o = select.createEl("option", {
          text: `🔗 Link → ${e.basename}: ${e.title}`,
        });
        o.value = `link:${e.basename}`;
      }
      const optSkip = select.createEl("option", { text: "✖ Skip" });
      optSkip.value = "skip";
      // Default: link to the AI-suggested existing match, else create new.
      select.value =
        p.similar_existing &&
        this.existing.some((e) => e.basename === p.similar_existing)
          ? `link:${p.similar_existing}`
          : "new";

      this.rows.push({ textarea, select, confidence: p.confidence });
    }

    new Setting(contentEl)
      .addButton((b) => b.setButtonText("Cancel").onClick(() => this.close()))
      .addButton((b) => {
        b
          .setButtonText("Confirm")
          .setCta()
          .onClick(async () => {
            const decisions: PresupDecision[] = [];
            for (const r of this.rows) {
              const v = r.select.value;
              if (v === "skip") continue;
              if (v === "new") {
                const text = r.textarea.value.trim();
                if (text) decisions.push({ action: "new", text, confidence: r.confidence });
              } else if (v.startsWith("link:")) {
                decisions.push({ action: "link", basename: v.slice(5) });
              }
            }
            this.close();
            await this.onConfirm(decisions);
          });
        // High friction: gate "Confirm" behind an acknowledge checkbox.
        if (this.friction) {
          gateAcceptButton(b.buttonEl, this.plugin.settings.aiFrictionLevel ?? "medium");
        }
        return b;
      });
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
