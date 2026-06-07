// PDF source picker modal. Extracted from main.ts (refactor v1.5).

import { App, Modal, Setting, TFile } from "obsidian";
import { PdfPickerModal } from "./PdfPickerModal";
import type AntinomiaPlugin from "../main";

export class PdfSourcePickerModal extends Modal {
  constructor(
    app: App,
    private plugin: AntinomiaPlugin,
    private onPicked: (pdf: TFile) => void
  ) {
    super(app);
  }
  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h3", { text: "Choose PDF source" });

    const intro = contentEl.createEl("p");
    intro.style.fontSize = "0.88em";
    intro.style.opacity = "0.8";
    intro.setText(
      "Antinomia will extract text from the PDF and ask the AI to propose substrate concepts. You'll preview and pick which to save."
    );

    const vaultPdfs = this.app.vault.getFiles().filter((f) => f.extension === "pdf");

    new Setting(contentEl)
      .setName("Pick a PDF already in this vault")
      .setDesc(`${vaultPdfs.length} PDF(s) found in the vault`)
      .addButton((b) =>
        b
          .setButtonText(vaultPdfs.length === 0 ? "No PDFs in vault" : "Pick from vault…")
          .setDisabled(vaultPdfs.length === 0)
          .onClick(() => {
            this.close();
            new PdfPickerModal(this.app, vaultPdfs, (pdf) => this.onPicked(pdf)).open();
          })
      );

    new Setting(contentEl)
      .setName("Import a PDF from disk")
      .setDesc("Copies the file into the vault under attachments/, then processes it.")
      .addButton((b) =>
        b.setButtonText("Choose file…").onClick(async () => {
          this.close();
          const imported = await this.plugin.importPdfFromDisk();
          if (imported) this.onPicked(imported);
        })
      );

    new Setting(contentEl).addButton((b) =>
      b.setButtonText("Cancel").onClick(() => this.close())
    );
  }
  onClose(): void {
    this.contentEl.empty();
  }
}
