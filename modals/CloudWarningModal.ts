// Antinomia — cloud-profile privacy warning. Shown when the active profile
// points at a third-party cloud backend (not a local LM Studio/Ollama server).

import { App, Modal, Setting } from "obsidian";
import type AntinomiaPlugin from "../main";

export class CloudWarningModal extends Modal {
  private plugin: AntinomiaPlugin;
  private onConfirm: (dontWarnAgain: boolean) => void | Promise<void>;
  private onCancel: () => void | Promise<void>;
  private dontWarnAgain = false;

  constructor(
    app: App,
    plugin: AntinomiaPlugin,
    onConfirm: (dontWarnAgain: boolean) => void | Promise<void>,
    onCancel: () => void | Promise<void>
  ) {
    super(app);
    this.plugin = plugin;
    this.onConfirm = onConfirm;
    this.onCancel = onCancel;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h3", { text: "Heads-up: a cloud profile is active" });

    contentEl.createEl("p", {
      text: "Your notes will be sent to an external AI provider. What that means:",
    });

    const ul = contentEl.createEl("ul");
    const point = (label: string, rest: string): void => {
      const li = ul.createEl("li");
      li.createEl("strong", { text: label });
      li.appendText(rest);
    };
    point("Third-party servers: ", "your text passes through the provider's infrastructure, subject to their Terms of Service and possible use as training data on your input.");
    point("Latency: ", "response time depends on your network connection.");
    point("Cost: ", "you are billed per token.");
    point("Privacy: ", "the provider can see your tensions, substrates and prompts.");

    contentEl.createEl("p", {
      text: "For full privacy and zero cost, use a local backend (LM Studio or Ollama).",
    }).setCssStyles({ opacity: "0.8" });

    new Setting(contentEl)
      .setName("Don't warn me again")
      .setDesc("Suppress this notice for cloud profiles from now on.")
      .addToggle((t) =>
        t.setValue(this.dontWarnAgain).onChange((v) => (this.dontWarnAgain = v))
      );

    const btns = contentEl.createDiv();
    btns.setCssStyles({
      display: "flex",
      gap: "8px",
      justifyContent: "flex-end",
      marginTop: "16px",
    });

    const cancel = btns.createEl("button", { text: "Cancel" });
    cancel.onclick = () => {
      this.close();
      void this.onCancel();
    };

    const ok = btns.createEl("button", { text: "I understand, continue" });
    ok.classList.add("mod-cta");
    ok.onclick = () => {
      this.close();
      void this.onConfirm(this.dontWarnAgain);
    };
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
