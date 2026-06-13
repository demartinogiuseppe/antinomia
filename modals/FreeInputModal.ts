// free-input modal. Extracted from main.ts (refactor v1.5).

import { App, Modal, Notice, Setting } from "obsidian";
import type AntinomiaPlugin from "../main";
import type { AIUsageMeta, FreeInputAnalysis } from "../core/types";
import { withLoadingButton } from "../helpers/withLoadingButton";

export class FreeInputModal extends Modal {
  private plugin: AntinomiaPlugin;
  private prefillText: string;
  constructor(
    app: App,
    plugin: AntinomiaPlugin,
    private onAnalyzed: (
      analysis: FreeInputAnalysis,
      originalText: string,
      meta?: AIUsageMeta
    ) => void,
    prefillText = ""
  ) {
    super(app);
    this.plugin = plugin;
    this.prefillText = prefillText;
  }
  onOpen(): void {
    const { contentEl } = this;
    contentEl.createEl("h3", { text: "Free-form input" });
    const intro = contentEl.createEl("p");
    intro.setCssStyles({
      fontSize: "0.9em",
      opacity: "0.8",
    });
    intro.setText(
      "Write what you have in mind, without worrying about the type. The AI figures out if it's a tension or substrate, extracts the fields, and opens the matching modal pre-filled. You can always refine before saving."
    );

    let testo = this.prefillText;

    const labelEl = contentEl.createEl("label", { text: "Raw text" });
    labelEl.setCssStyles({
      display: "block",
      fontWeight: "bold",
      marginTop: "10px",
    });

    const hint = contentEl.createEl("div");
    hint.setCssStyles({
      fontSize: "0.8em",
      opacity: "0.6",
    });
    hint.setText(
      "A quote, an observation, a doubt, a contradiction you see, a single thought. Anything: the AI figures it out."
    );

    const textarea = contentEl.createEl("textarea");
    textarea.setCssStyles({
      width: "100%",
      minHeight: "180px",
      padding: "8px",
      marginTop: "4px",
    });
    textarea.value = testo;
    textarea.addEventListener("input", (e) => {
      testo = (e.target as HTMLTextAreaElement).value;
    });

    window.setTimeout(() => textarea.focus(), 0);

    new Setting(contentEl)
      .addButton((b) =>
        b.setButtonText("Cancel").onClick(() => {
          this.close();
        })
      )
      .addButton((b) =>
        b
          .setButtonText("Analyze with AI")
          .setCta()
          .onClick(async () => {
            const t = testo.trim();
            if (!t) {
              new Notice("Write something before analyzing.");
              return;
            }
            const result = await withLoadingButton(
              b.buttonEl,
              "⏳ Analyzing...",
              (signal) => this.plugin.analyzeFreeInput(t, signal, b.buttonEl)
            );
            if (!result) return;
            this.close();
            this.onAnalyzed(result.analysis, t, result.meta);
          })
      );
  }
  onClose(): void {
    this.contentEl.empty();
  }
}
