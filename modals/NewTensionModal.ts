// new-tension guided modal. Extracted from main.ts (refactor v1.5).

import { App, Modal, Notice, Setting } from "obsidian";
import type AntinomiaPlugin from "../main";
import { renderUsageMetaBanner } from "../ai/notifyUsage";
import type { AIUsageMeta, TensionFields } from "../core/types";
import { withLoadingButton } from "../helpers/withLoadingButton";
import { renderFrictionCard } from "./FrictionCard";

export class NewTensionModal extends Modal {
  private plugin: AntinomiaPlugin;
  private prefill: TensionFields;
  private prefillUsageMeta?: AIUsageMeta;
  constructor(
    app: App,
    plugin: AntinomiaPlugin,
    private onSubmit: (fields: TensionFields | null, skipped: boolean) => void,
    prefill: TensionFields = {},
    prefillUsageMeta?: AIUsageMeta
  ) {
    super(app);
    this.plugin = plugin;
    this.prefill = prefill;
    this.prefillUsageMeta = prefillUsageMeta;
  }
  onOpen(): void {
    const { contentEl } = this;
    contentEl.createEl("h3", { text: "New tension" });
    if (this.prefillUsageMeta) renderUsageMetaBanner(contentEl, this.prefillUsageMeta, this.app);
    // AI-prefilled (e.g. free-input flow) → show the friction card.
    if (this.prefillUsageMeta && this.plugin.lastFriction) {
      renderFrictionCard(contentEl, this.plugin.lastFriction, this.plugin.settings.aiFrictionLevel ?? "medium");
    }
    const intro = contentEl.createEl("p");
    intro.style.fontSize = "0.9em";
    intro.style.opacity = "0.8";
    intro.setText(
      "A tension captures a contradiction between two positions. The more incompatible, the more fertile. You'll map the presuppositions later, at your own pace."
    );

    let titolo = this.prefill.title ?? "";
    let statementA = this.prefill.statementA ?? "";
    let statementB = this.prefill.statementB ?? "";

    const mkLabel = (text: string) => {
      const l = contentEl.createEl("label", { text });
      l.style.display = "block";
      l.style.marginTop = "10px";
      l.style.fontWeight = "bold";
      return l;
    };
    const mkHint = (text: string) => {
      const h = contentEl.createEl("div", { text });
      h.style.fontSize = "0.8em";
      h.style.opacity = "0.6";
      return h;
    };

    mkLabel("Title (optional)");
    mkHint(
      "3-7 words, neutral (e.g. 'Creative solitude', 'Decision: instinct vs data')"
    );
    const titleInput = contentEl.createEl("input", { type: "text" });
    titleInput.style.width = "100%";
    titleInput.style.padding = "6px";
    titleInput.style.marginTop = "4px";
    titleInput.value = titolo;
    titleInput.addEventListener("input", (e) => {
      titolo = (e.target as HTMLInputElement).value;
    });

    // ---- "Proponi titolo (AI)" button right under the title input ----
    // Chiede al modello di proporre un titolo basandosi sui due statement
    // gia' digitati. Disabilitato se A e B sono entrambi vuoti.
    const aiBtn = contentEl.createEl("button", {
      text: "Propose title (AI)",
    });
    aiBtn.style.marginTop = "6px";
    aiBtn.style.fontSize = "0.85em";
    aiBtn.style.padding = "3px 10px";
    aiBtn.style.cursor = "pointer";
    aiBtn.title =
      "Asks the configured AI model to propose a title from the two filled statements.";
    aiBtn.onclick = async (e) => {
      e.preventDefault();
      const aTxt = statementA.trim();
      const bTxt = statementB.trim();
      if (!aTxt && !bTxt) {
        new Notice(
          "Fill at least one of Statement A or B before requesting a title."
        );
        return;
      }
      const content =
        "I'm creating a new Antinomia tension with these two statements (presuppositions are not yet mapped). Propose a neutral title for the tension's theme.\n\n" +
        `Statement A: ${aTxt || "(empty)"}\n\n` +
        `Statement B: ${bTxt || "(empty)"}`;
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

    mkLabel("Statement A");
    mkHint("The first position, clearly formulated.");
    const aInput = contentEl.createEl("textarea");
    aInput.style.width = "100%";
    aInput.style.padding = "6px";
    aInput.style.marginTop = "4px";
    aInput.style.minHeight = "70px";
    aInput.value = statementA;
    aInput.addEventListener("input", (e) => {
      statementA = (e.target as HTMLTextAreaElement).value;
    });

    mkLabel("Statement B");
    mkHint(
      "The opposing position. Must be semantically incompatible with A."
    );
    const bInput = contentEl.createEl("textarea");
    bInput.style.width = "100%";
    bInput.style.padding = "6px";
    bInput.style.marginTop = "4px";
    bInput.style.minHeight = "70px";
    bInput.value = statementB;
    bInput.addEventListener("input", (e) => {
      statementB = (e.target as HTMLTextAreaElement).value;
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
            this.onSubmit({ title: titolo, statementA, statementB }, false);
            this.close();
          })
      );

    setTimeout(() => titleInput.focus(), 0);
  }
  onClose(): void {
    this.contentEl.empty();
  }
}
