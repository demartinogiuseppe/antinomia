// elevate-to-principle modal. Extracted from main.ts (refactor v1.5).

import { App, Modal, Setting, TFile } from "obsidian";
import type AntinomiaPlugin from "../main";
import { humanTitle, stripFrontmatter } from "../core/frontmatter";
import type { PrincipleFields } from "../core/types";
import { renderTensionContext } from "../helpers/renderTensionContext";
import { withLoadingButton } from "../helpers/withLoadingButton";
import { renderFrictionCard } from "./FrictionCard";

export class ElevateToPrincipleModal extends Modal {
  private originBasename: string;
  private plugin: AntinomiaPlugin;
  private file: TFile;
  private tensionRaw: string;
  constructor(
    app: App,
    plugin: AntinomiaPlugin,
    file: TFile,
    tensionRaw: string,
    private onSubmit: (fields: PrincipleFields | null, skipped: boolean) => void
  ) {
    super(app);
    this.plugin = plugin;
    this.file = file;
    this.originBasename = file.basename;
    this.tensionRaw = tensionRaw;
  }
  onOpen(): void {
    const { contentEl } = this;
    contentEl.createEl("h3", { text: "Elevate to principle" });
    const intro = contentEl.createEl("p");
    intro.style.fontSize = "0.9em";
    intro.style.opacity = "0.8";
    intro.setText(
      `You're transforming the tension "${humanTitle(this.app, this.file)}" into an operational principle. Fill the fields below: they will become the new body. The original tension text will be preserved under the "## Origin (tension)" section.`
    );

    // Show the tension content inline (scrollable) so the user can re-read
    // it while filling the IF/THEN/GREY form, without closing the modal.
    renderTensionContext(contentEl, this.tensionRaw);

    let ifA = "";
    let thenA = "";
    let ifB = "";
    let thenB = "";
    let greyZone = "";

    const mkLabel = (text: string) => {
      const l = contentEl.createEl("label", { text });
      l.style.display = "block";
      l.style.marginTop = "12px";
      l.style.fontWeight = "bold";
      return l;
    };
    const mkHint = (text: string) => {
      const h = contentEl.createEl("div", { text });
      h.style.fontSize = "0.8em";
      h.style.opacity = "0.6";
      return h;
    };
    const mkTextarea = (minHeight: string, onInput: (v: string) => void) => {
      const t = contentEl.createEl("textarea");
      t.style.width = "100%";
      t.style.padding = "6px";
      t.style.marginTop = "4px";
      t.style.minHeight = minHeight;
      t.addEventListener("input", (e) => {
        onInput((e.target as HTMLTextAreaElement).value);
      });
      return t;
    };
    const mkInput = (onInput: (v: string) => void) => {
      const i = contentEl.createEl("input", { type: "text" });
      i.style.width = "100%";
      i.style.padding = "6px";
      i.style.marginTop = "4px";
      i.addEventListener("input", (e) => {
        onInput((e.target as HTMLInputElement).value);
      });
      return i;
    };

    mkLabel("IF — condition A");
    mkHint("The condition/context where outcome A applies.");
    const ifAInput = mkInput((v) => (ifA = v));

    mkLabel("THEN — outcome A");
    mkHint("The rule/action/conclusion that applies under condition A.");
    const thenAInput = mkInput((v) => (thenA = v));

    mkLabel("IF — condition B");
    mkHint("The opposite (or complementary) condition/context to A.");
    const ifBInput = mkInput((v) => (ifB = v));

    mkLabel("THEN — outcome B");
    mkHint("The rule/action/conclusion that applies under condition B.");
    const thenBInput = mkInput((v) => (thenB = v));

    mkLabel("GREY ZONE");
    mkHint(
      "Edge cases, ambiguous, where A and B touch. Leave blank if nothing comes to mind right away."
    );
    const greyTextarea = mkTextarea("60px", (v) => (greyZone = v));

    // ---- "Propose IF/THEN (AI)" button ----
    const aiBtn = contentEl.createEl("button", {
      text: "Propose IF/THEN (AI)",
    });
    aiBtn.style.marginTop = "10px";
    aiBtn.style.fontSize = "0.85em";
    aiBtn.style.padding = "4px 12px";
    aiBtn.style.cursor = "pointer";
    aiBtn.title =
      "Asks the AI model to propose the 5 IF/THEN/GREY fields by reading the tension's text.";
    // Friction card (PTM) container — populated after the AI proposes.
    const frictionContainer = contentEl.createEl("div");
    aiBtn.onclick = async (e) => {
      e.preventDefault();
      const proposed = await withLoadingButton(
        aiBtn,
        "⏳ Generating...",
        async (signal) => {
          const raw = await this.app.vault.read(this.file);
          const body = stripFrontmatter(raw).trim();
          const content =
            "I'm elevating this Antinomia tension into an operational IF/THEN/GREY principle. Here is the tension text:\n\n" +
            body;
          return await this.plugin.proposeIfThenFromContent(content, signal, aiBtn);
        }
      );
      if (!proposed) return;
      // Populate the inputs and the local state
      ifAInput.value = proposed.ifA ?? "";
      ifA = proposed.ifA ?? "";
      thenAInput.value = proposed.thenA ?? "";
      thenA = proposed.thenA ?? "";
      ifBInput.value = proposed.ifB ?? "";
      ifB = proposed.ifB ?? "";
      thenBInput.value = proposed.thenB ?? "";
      thenB = proposed.thenB ?? "";
      greyTextarea.value = proposed.greyZone ?? "";
      greyZone = proposed.greyZone ?? "";
      // Show the friction card for this proposal.
      frictionContainer.empty();
      if (this.plugin.lastFriction) {
        renderFrictionCard(
          frictionContainer,
          this.plugin.lastFriction,
          this.plugin.settings.aiFrictionLevel ?? "medium"
        );
      }
    };

    new Setting(contentEl)
      .addButton((b) =>
        b.setButtonText("Cancel").onClick(() => {
          this.onSubmit(null, false);
          this.close();
        })
      )
      .addButton((b) =>
        b.setButtonText("Skip and use empty template").onClick(() => {
          this.onSubmit(null, true);
          this.close();
        })
      )
      .addButton((b) =>
        b
          .setButtonText("Elevate")
          .setCta()
          .onClick(() => {
            this.onSubmit({ ifA, thenA, ifB, thenB, greyZone }, false);
            this.close();
          })
      );
  }
  onClose(): void {
    this.contentEl.empty();
  }
}
