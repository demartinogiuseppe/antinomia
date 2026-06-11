// generic confirm dialog. Extracted from main.ts (refactor v1.5).

import { App, Modal, Setting } from "obsidian";

export class ConfirmModal extends Modal {
  constructor(
    app: App,
    private titleText: string,
    private bodyText: string,
    private confirmLabel: string,
    private onConfirm: () => void
  ) {
    super(app);
  }
  onOpen(): void {
    const { contentEl } = this;
    contentEl.createEl("h3", { text: this.titleText });
    const p = contentEl.createEl("p");
    p.setCssStyles({ lineHeight: "1.5" });
    p.setText(this.bodyText);
    new Setting(contentEl)
      .addButton((b) =>
        b.setButtonText("Cancel").onClick(() => this.close())
      )
      .addButton((b) =>
        b
          .setButtonText(this.confirmLabel)
          .setCta()
          .onClick(() => {
            this.close();
            this.onConfirm();
          })
      );
  }
  onClose(): void {
    this.contentEl.empty();
  }
}
