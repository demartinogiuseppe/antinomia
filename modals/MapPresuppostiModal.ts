// map-presuppositions modal. Extracted from main.ts (refactor v1.5).

import { App, Modal, Setting, TFile } from "obsidian";
import type AntinomiaPlugin from "../main";
import { humanTitle, stripFrontmatter } from "../core/frontmatter";
import type { PresuppostiFields } from "../core/types";
import { renderTensionContext } from "../helpers/renderTensionContext";
import { withLoadingButton } from "../helpers/withLoadingButton";

export class MapPresuppostiModal extends Modal {
  private plugin: AntinomiaPlugin;
  private file: TFile;
  private existingA: string;
  private existingB: string;
  constructor(
    app: App,
    plugin: AntinomiaPlugin,
    file: TFile,
    existingA: string,
    existingB: string,
    private onSubmit: (fields: PresuppostiFields | null) => void
  ) {
    super(app);
    this.plugin = plugin;
    this.file = file;
    this.existingA = existingA;
    this.existingB = existingB;
  }
  onOpen(): void {
    const { contentEl } = this;
    contentEl.createEl("h3", {
      text: `Map presuppositions: ${humanTitle(this.app, this.file)}`,
    });
    const intro = contentEl.createEl("p");
    intro.setCssStyles({
      fontSize: "0.9em",
      opacity: "0.8",
    });
    intro.setText(
      `Identify the epistemic/metaphysical/value assumptions that A and B take for granted. Mapping them makes explicit why the tension doesn't dissolve on its own.`
    );

    // Show the tension content inline so the user can re-read it while
    // filling the form. The raw is loaded lazily on open.
    const ctxPlaceholder = contentEl.createEl("div");
    void this.app.vault.read(this.file).then((raw) => {
      renderTensionContext(ctxPlaceholder, raw);
    });

    let presupA = this.existingA;
    let presupB = this.existingB;

    const mkLabel = (text: string) => {
      const l = contentEl.createEl("label", { text });
      l.setCssStyles({
        display: "block",
        marginTop: "12px",
        fontWeight: "bold",
      });
      return l;
    };
    const mkHint = (text: string) => {
      const h = contentEl.createEl("div", { text });
      h.setCssStyles({
        fontSize: "0.8em",
        opacity: "0.6",
      });
      return h;
    };

    mkLabel("Presuppositions A");
    mkHint("The base assumptions that make side A possible.");
    const aTextarea = contentEl.createEl("textarea");
    aTextarea.setCssStyles({
      width: "100%",
      padding: "6px",
      marginTop: "4px",
      minHeight: "70px",
    });
    aTextarea.value = presupA;
    aTextarea.addEventListener("input", (e) => {
      presupA = (e.target as HTMLTextAreaElement).value;
    });

    mkLabel("Presuppositions B");
    mkHint("The base assumptions that make side B possible.");
    const bTextarea = contentEl.createEl("textarea");
    bTextarea.setCssStyles({
      width: "100%",
      padding: "6px",
      marginTop: "4px",
      minHeight: "70px",
    });
    bTextarea.value = presupB;
    bTextarea.addEventListener("input", (e) => {
      presupB = (e.target as HTMLTextAreaElement).value;
    });

    // ---- "Propose presuppositions (AI)" button ----
    const aiBtn = contentEl.createEl("button", {
      text: "Propose presuppositions (AI)",
    });
    aiBtn.setCssStyles({
      marginTop: "10px",
      fontSize: "0.85em",
      padding: "4px 12px",
      cursor: "pointer",
    });
    aiBtn.title =
      "Asks the AI model to propose the two fields by reading the tension's text.";
    aiBtn.onclick = async (e) => {
      e.preventDefault();
      const proposed = await withLoadingButton(
        aiBtn,
        "⏳ Generating...",
        async (signal) => {
          const raw = await this.app.vault.read(this.file);
          const body = stripFrontmatter(raw).trim();
          const content =
            "Map the epistemic/value presuppositions of the following Antinomia tension:\n\n" +
            body;
          return await this.plugin.proposePresuppostiFromContent(content, signal);
        }
      );
      if (!proposed) return;
      aTextarea.value = proposed.presupposizioniA ?? "";
      presupA = proposed.presupposizioniA ?? "";
      bTextarea.value = proposed.presupposizioniB ?? "";
      presupB = proposed.presupposizioniB ?? "";
    };

    new Setting(contentEl)
      .addButton((b) =>
        b.setButtonText("Cancel").onClick(() => {
          this.onSubmit(null);
          this.close();
        })
      )
      .addButton((b) =>
        b
          .setButtonText("Apply")
          .setCta()
          .onClick(() => {
            this.onSubmit({
              presupposizioniA: presupA,
              presupposizioniB: presupB,
            });
            this.close();
          })
      );
  }
  onClose(): void {
    this.contentEl.empty();
  }
}
