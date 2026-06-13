// new-substrate guided modal. Extracted from main.ts (refactor v1.5).

import { App, Modal, Notice, Setting } from "obsidian";
import type AntinomiaPlugin from "../main";
import { renderUsageMetaBanner } from "../ai/notifyUsage";
import type { AIUsageMeta, SubstrateFields } from "../core/types";
import { withLoadingButton } from "../helpers/withLoadingButton";
import { renderFrictionCard } from "./FrictionCard";

export class NewSubstrateModal extends Modal {
  private plugin: AntinomiaPlugin;
  private prefill: SubstrateFields;
  private prefillUsageMeta?: AIUsageMeta;
  constructor(
    app: App,
    plugin: AntinomiaPlugin,
    private onSubmit: (fields: SubstrateFields | null, skipped: boolean) => void,
    prefill: SubstrateFields = {},
    prefillUsageMeta?: AIUsageMeta
  ) {
    super(app);
    this.plugin = plugin;
    this.prefill = prefill;
    this.prefillUsageMeta = prefillUsageMeta;
  }
  onOpen(): void {
    const { contentEl } = this;
    contentEl.createEl("h3", { text: "New substrate" });
    if (this.prefillUsageMeta) renderUsageMetaBanner(contentEl, this.prefillUsageMeta, this.app);
    // AI-prefilled (e.g. free-input flow) → show the friction card.
    if (this.prefillUsageMeta && this.plugin.lastFriction) {
      renderFrictionCard(contentEl, this.plugin.lastFriction, this.plugin.settings.aiFrictionLevel ?? "medium");
    }
    const intro = contentEl.createEl("p");
    intro.setCssStyles({
      fontSize: "0.9em",
      opacity: "0.8",
    });
    intro.setText(
      "A substrate is raw material: a quote, a fact, a note. The raw stuff from which tensions and principles can emerge."
    );

    let titolo = this.prefill.title ?? "";
    let contenuto = this.prefill.contenuto ?? "";

    const mkLabel = (text: string) => {
      const l = contentEl.createEl("label", { text });
      l.setCssStyles({
        display: "block",
        marginTop: "10px",
        fontWeight: "bold",
      });
      return l;
    };
    const mkHint = (text: string) => {
      const h = contentEl.createEl("div", { text });
      h.setCssStyles({
        fontSize: "0.8em",
        opacity: "0.6",
      });
      return h;
    };

    mkLabel("Title (optional)");
    mkHint("Short label (e.g. 'Kahneman quote on confirmation bias').");
    const titleInput = contentEl.createEl("input", { type: "text" });
    titleInput.setCssStyles({
      width: "100%",
      padding: "6px",
      marginTop: "4px",
    });
    titleInput.value = titolo;
    titleInput.addEventListener("input", (e) => {
      titolo = (e.target as HTMLInputElement).value;
    });

    // ---- "Proponi titolo (AI)" button ----
    const aiBtn = contentEl.createEl("button", { text: "Propose title (AI)" });
    aiBtn.setCssStyles({
      marginTop: "6px",
      fontSize: "0.85em",
      padding: "3px 10px",
      cursor: "pointer",
    });
    aiBtn.title =
      "Asks the configured AI model to propose a title from the filled content.";
    aiBtn.onclick = async (e) => {
      e.preventDefault();
      const cTxt = contenuto.trim();
      if (!cTxt) {
        new Notice("Fill the content before requesting a title.");
        return;
      }
      const content =
        "I'm creating a new Antinomia substrate (raw material: quote, fact, note). Propose a neutral title that identifies the object, doesn't summarize it.\n\n" +
        `Content: ${cTxt}`;
      const proposed = await withLoadingButton(
        aiBtn,
        "⏳ Generating...",
        (signal) => this.plugin.proposeTitleFromContent(content, signal, aiBtn)
      );
      if (proposed) {
        titleInput.value = proposed;
        titolo = proposed;
      }
    };

    mkLabel("Content");
    mkHint("The quote, the fact, the observation. Without interpreting it.");
    const cInput = contentEl.createEl("textarea");
    cInput.setCssStyles({
      width: "100%",
      padding: "6px",
      marginTop: "4px",
      minHeight: "100px",
    });
    cInput.value = contenuto;
    cInput.addEventListener("input", (e) => {
      contenuto = (e.target as HTMLTextAreaElement).value;
    });

    new Setting(contentEl)
      .addButton((b) =>
        b.setButtonText("Cancel").onClick(() => {
          this.onSubmit(null, false);
          this.close();
        })
      )
      .addButton((b) =>
        b.setButtonText("Skip and open empty note").onClick(() => {
          this.onSubmit(null, true);
          this.close();
        })
      )
      .addButton((b) =>
        b
          .setButtonText("Create")
          .setCta()
          .onClick(() => {
            this.onSubmit({ title: titolo, content: contenuto }, false);
            this.close();
          })
      );

    window.setTimeout(() => titleInput.focus(), 0);
  }
  onClose(): void {
    this.contentEl.empty();
  }
}
