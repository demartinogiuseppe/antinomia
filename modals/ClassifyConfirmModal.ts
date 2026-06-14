// classification confirm modal. Extracted from main.ts (refactor v1.5).

import { App, Modal, Setting } from "obsidian";

export class ClassifyConfirmModal extends Modal {
  constructor(
    app: App,
    private current: string,
    private proposed: string,
    private motivazione: string,
    private onConfirm: (apply: boolean) => void | Promise<void>
  ) {
    super(app);
  }
  onOpen(): void {
    const { contentEl } = this;
    contentEl.createEl("h3", { text: "Proposed classification" });
    contentEl.createEl("p", {
      text: `Tipo attuale: ${this.current || "(nessuno)"}`,
    });
    contentEl.createEl("p", { text: `Tipo proposto: ${this.proposed}` });
    contentEl.createEl("p").createEl("em", { text: this.motivazione });
    new Setting(contentEl)
      .addButton((b) =>
        b.setButtonText("Reject").onClick(() => {
          void this.onConfirm(false);
          this.close();
        })
      )
      .addButton((b) =>
        b
          .setButtonText("Apply")
          .setCta()
          .onClick(() => {
            void this.onConfirm(true);
            this.close();
          })
      );
  }
  onClose(): void {
    this.contentEl.empty();
  }
}
