// defeated-reason modal. Extracted from main.ts (refactor v1.5).

import { App, Modal, Setting, TFile } from "obsidian";
import { NotePickerModal } from "./NotePickerModal";
import { TYPE } from "../core/constants";
import type { DefeatedSubmit } from "../core/types";

export class DefeatedReasonModal extends Modal {
  private result: DefeatedSubmit | null = null;
  private contextFile: TFile;
  constructor(
    app: App,
    contextFile: TFile,
    private onSubmit: (data: DefeatedSubmit | null) => void
  ) {
    super(app);
    this.contextFile = contextFile;
  }
  onOpen(): void {
    const { contentEl } = this;
    contentEl.createEl("h3", { text: "Archive as defeated" });
    contentEl.createEl("p", { text: "Why was it defeated?" });

    let motivo = "false_positive";
    let sostituitaDa: string | null = null;

    // --- Motivo dropdown ---
    new Setting(contentEl).setName("Motive").addDropdown((dd) => {
      dd.addOption("false_positive", "false_positive");
      dd.addOption("elevated", "elevated");
      dd.addOption("genuinely_defeated", "genuinely_defeated");
      dd.setValue(motivo);
      dd.onChange((v) => {
        motivo = v;
        renderSostituitaSection();
      });
    });

    // --- Sostituita_da picker (only shown when motivo == "elevated") ---
    const sostBlock = contentEl.createEl("div");
    sostBlock.style.marginBottom = "10px";

    const labelEl = contentEl.createEl("div");
    labelEl.style.fontSize = "0.85em";
    labelEl.style.opacity = "0.7";
    labelEl.style.marginBottom = "12px";

    const renderSostituitaSection = () => {
      sostBlock.empty();
      labelEl.setText("");
      if (motivo !== "elevated") return;

      new Setting(sostBlock)
        .setName("Replaced by which principle")
        .setDesc(
          "Pick the principle that replaced this note. This closes the tension -> defeated -> principle cycle in the graph."
        )
        .addButton((b) => {
          b.setButtonText(
            sostituitaDa
              ? `Change (current: ${sostituitaDa})`
              : "Pick principle..."
          ).onClick(() => {
            new NotePickerModal(
              this.app,
              this.contextFile,
              (chosen) => {
                sostituitaDa = chosen.basename;
                renderSostituitaSection();
              },
              (f) => {
                const fm = this.app.metadataCache.getFileCache(f)?.frontmatter;
                return fm?.antinomia_type === TYPE.principle;
              },
              "Search for a principle..."
            ).open();
          });
        });

      if (sostituitaDa) {
        labelEl.setText(`Replaced by: [[${sostituitaDa}]]`);
      } else {
        labelEl.setText(
          "(No principle selected — you can still save, replaced_by stays empty.)"
        );
      }
    };
    renderSostituitaSection();

    new Setting(contentEl)
      .addButton((b) =>
        b.setButtonText("Cancel").onClick(() => {
          this.result = null;
          this.close();
        })
      )
      .addButton((b) =>
        b
          .setButtonText("Archive")
          .setCta()
          .onClick(() => {
            this.result = { motivo, replaced_by: sostituitaDa };
            this.close();
          })
      );
  }
  onClose(): void {
    this.contentEl.empty();
    this.onSubmit(this.result);
  }
}
