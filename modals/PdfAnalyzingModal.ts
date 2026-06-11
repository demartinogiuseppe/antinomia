// PDF analyzing progress modal. Extracted from main.ts (refactor v1.5).

import { App, Modal, Setting } from "obsidian";

export class PdfAnalyzingModal extends Modal {
  public controller: AbortController = new AbortController();
  private timerHandle: number | null = null;
  private elapsedEl: HTMLElement | null = null;
  private t0: number = Date.now();
  constructor(
    app: App,
    private pdfName: string,
    private modelName: string
  ) {
    super(app);
  }
  onOpen(): void {
    const { contentEl, titleEl } = this;
    titleEl.setText(`Analyzing "${this.pdfName}" with AI…`);

    const msg = contentEl.createEl("p");
    msg.setCssStyles({
      fontSize: "0.9em",
      lineHeight: "1.5",
    });
    msg.setText(
      `Antinomia is asking ${this.modelName} to extract standalone concepts from the PDF. ` +
        `This usually takes 20–90 seconds depending on the model and PDF length. Click Stop to abort.`
    );

    this.elapsedEl = contentEl.createEl("div");
    this.elapsedEl.setCssStyles({
      fontFamily: "var(--font-monospace, monospace)",
      fontSize: "1.1em",
      textAlign: "center",
      padding: "12px",
      background: "var(--background-secondary)",
      borderRadius: "6px",
      margin: "8px 0",
    });
    this.elapsedEl.setText("⏳ 0s");

    this.t0 = Date.now();
    this.timerHandle = window.setInterval(() => {
      if (this.elapsedEl) {
        const s = Math.floor((Date.now() - this.t0) / 1000);
        this.elapsedEl.setText(`⏳ ${s}s`);
      }
    }, 1000);

    new Setting(contentEl).addButton((b) =>
      b
        .setButtonText("⛔ Stop")
        .setWarning()
        .onClick(() => {
          this.controller.abort();
          if (this.elapsedEl) this.elapsedEl.setText("Aborting…");
        })
    );
  }
  onClose(): void {
    if (this.timerHandle != null) {
      window.clearInterval(this.timerHandle);
      this.timerHandle = null;
    }
    this.contentEl.empty();
  }
}
