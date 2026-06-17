// generic confirm dialog. Extracted from main.ts (refactor v1.5).

import { App, Modal, Setting } from "obsidian";

export class ConfirmModal extends Modal {
  private decided = false;
  constructor(
    app: App,
    private titleText: string,
    private bodyText: string,
    private confirmLabel: string,
    private onConfirm: () => void,
    // Optional: fired when the user cancels / dismisses (Cancel button, Esc,
    // click-outside). Lets a caller offer a default fallback action.
    private onCancel?: () => void
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
            this.decided = true;
            this.close();
            this.onConfirm();
          })
      );
  }
  onClose(): void {
    this.contentEl.empty();
    if (!this.decided && this.onCancel) this.onCancel();
  }

  /**
   * Promise-based variant of the dialog: resolves `true` if the user confirms,
   * `false` if they cancel or dismiss. Lets callers keep a linear
   * `const ok = await ConfirmModal.confirm(...)` flow instead of restructuring
   * into nested callbacks.
   */
  static confirm(
    app: App,
    title: string,
    body: string,
    confirmLabel: string
  ): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      new ConfirmModal(
        app,
        title,
        body,
        confirmLabel,
        () => resolve(true),
        () => resolve(false)
      ).open();
    });
  }
}
