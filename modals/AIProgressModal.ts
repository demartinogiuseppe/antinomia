// Generic AI-progress modal: spinner-text + live elapsed timer + Stop button.
//
// The standard loading UI for AI command flows that have no host button to
// attach withLoadingButton to (command-palette / card-button launches). Owns
// an AbortController whose .signal is handed to callAI; the Stop button aborts
// the in-flight request. Callers update the phase line via setStatus().

import { App, Modal, Setting } from "obsidian";

export class AIProgressModal extends Modal {
  public controller: AbortController = new AbortController();
  private statusEl: HTMLElement | null = null;
  private elapsedEl: HTMLElement | null = null;
  private timerHandle: number | null = null;
  private t0: number = Date.now();

  constructor(
    app: App,
    private heading: string,
    private initialStatus: string
  ) {
    super(app);
  }

  /** Update the dynamic phase line (e.g. "Checking for similar presuppositions…"). */
  setStatus(text: string): void {
    if (this.statusEl) this.statusEl.setText(text);
  }

  onOpen(): void {
    const { contentEl, titleEl } = this;
    titleEl.setText(this.heading);

    this.statusEl = contentEl.createEl("p");
    this.statusEl.setCssStyles({
      fontSize: "0.9em",
      lineHeight: "1.5",
    });
    this.statusEl.setText(this.initialStatus);

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
          this.setStatus("Aborting…");
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
