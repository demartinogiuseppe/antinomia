// Antinomia — "what collapses if this fails?" Lists the principles that rest on
// a presupposition; lets the user mark it undermined.

import { App, Modal, Setting, TFile } from "obsidian";
import type AntinomiaPlugin from "../main";
import { humanTitle, stripFrontmatter } from "../core/frontmatter";

export class CollapseImpactModal extends Modal {
  constructor(
    app: App,
    private plugin: AntinomiaPlugin,
    private presupFile: TFile,
    private principles: TFile[],
    private onUndermine: () => void | Promise<void>
  ) {
    super(app);
  }

  async onOpen(): Promise<void> {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h3", { text: "What collapses if this fails?" });
    contentEl.createEl("p", {
      text: humanTitle(this.app, this.presupFile),
    }).setCssStyles({ fontWeight: "bold" });

    if (this.principles.length === 0) {
      contentEl.createEl("p", {
        text: "No principles currently rest on this presupposition.",
      }).setCssStyles({ opacity: "0.7" });
    } else {
      contentEl.createEl("p", {
        text: `${this.principles.length} principle(s) depend on this assumption:`,
      });
      const list = contentEl.createEl("ul");
      for (const p of this.principles) {
        const li = list.createEl("li");
        li.setCssStyles({ marginBottom: "6px" });
        li.createEl("strong", { text: humanTitle(this.app, p) });
        let snippet = "";
        try {
          const body = stripFrontmatter(await this.app.vault.read(p));
          const m = body.match(/IF[^\n]*->[^\n]*/i);
          if (m) snippet = m[0].trim();
        } catch {
          /* ignore */
        }
        if (snippet) {
          const s = li.createEl("div");
          s.setCssStyles({
            fontSize: "0.82em",
            opacity: "0.7",
            marginTop: "2px",
          });
          s.setText(snippet);
        }
      }
    }

    new Setting(contentEl)
      .addButton((b) => b.setButtonText("Close").onClick(() => this.close()))
      .addButton((b) =>
        b
          .setButtonText("Mark this presupposition as undermined")
          .setWarning()
          .onClick(async () => {
            this.close();
            await this.onUndermine();
          })
      );
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
