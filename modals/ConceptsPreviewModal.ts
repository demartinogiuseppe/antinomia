// Concepts preview modal — source-agnostic (PDF, YouTube, …). Lets the user
// pick which AI-extracted concepts become substrates. Extracted from the
// former PdfConceptsPreviewModal and generalized over the source.

import { App, Modal, Notice, Setting } from "obsidian";
import type AntinomiaPlugin from "../main";
import { renderUsageMetaBanner } from "../ai/notifyUsage";
import type { AIUsageMeta, PdfConcept } from "../core/types";
import type { FrictionPayload } from "../core/aiFriction";
import { renderFrictionCard, gateAcceptButton } from "./FrictionCard";

export class ConceptsPreviewModal extends Modal {
  private selected: Set<number> = new Set();
  constructor(
    app: App,
    private plugin: AntinomiaPlugin,
    /** Human source label, e.g. a PDF basename or a video title. */
    private sourceName: string,
    /** Destination folder the substrates will be created in (display hint). */
    private folderName: string,
    private concepts: PdfConcept[],
    private extractionMeta: AIUsageMeta,
    private onConfirm: (selectedConcepts: PdfConcept[]) => void,
    /** Friction payload for the extraction run (one card for the whole run). */
    private friction?: FrictionPayload
  ) {
    super(app);
    // Default: all selected.
    this.concepts.forEach((_, i) => this.selected.add(i));
  }
  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.style.maxWidth = "780px";

    contentEl.createEl("h3", {
      text: `Concepts from "${this.sourceName}"`,
    });

    // Usage meta banner (persistent, clickable for details).
    renderUsageMetaBanner(contentEl, this.extractionMeta, this.app);

    // Friction card (PTM): one card for the whole extraction run.
    if (this.friction) {
      renderFrictionCard(
        contentEl,
        this.friction,
        this.plugin.settings.aiFrictionLevel ?? "medium"
      );
    }

    const intro = contentEl.createEl("p");
    intro.style.fontSize = "0.88em";
    intro.style.opacity = "0.8";
    intro.style.lineHeight = "1.5";
    intro.setText(
      `Antinomia extracted ${this.concepts.length} concept(s). ` +
        `Pick which ones to save as substrates. They will be created in ` +
        `${this.folderName}/.`
    );

    if (this.concepts.length === 0) {
      const empty = contentEl.createEl("p");
      empty.style.fontStyle = "italic";
      empty.style.opacity = "0.7";
      empty.setText("No concepts extracted. Try again, or the source is too thin.");
      new Setting(contentEl).addButton((b) =>
        b.setButtonText("Close").setCta().onClick(() => this.close())
      );
      return;
    }

    // Toolbar (select all / none + counter).
    const toolbar = contentEl.createEl("div");
    toolbar.style.display = "flex";
    toolbar.style.alignItems = "center";
    toolbar.style.gap = "8px";
    toolbar.style.margin = "8px 0";

    const counter = toolbar.createEl("span");
    counter.style.fontSize = "0.85em";
    counter.style.fontWeight = "bold";
    const updateCounter = () => {
      counter.setText(`${this.selected.size} of ${this.concepts.length} selected`);
    };
    updateCounter();

    const selAll = toolbar.createEl("button", { text: "Select all" });
    selAll.style.fontSize = "0.8em";
    selAll.style.padding = "2px 8px";
    selAll.style.cursor = "pointer";

    const deselAll = toolbar.createEl("button", { text: "Deselect all" });
    deselAll.style.fontSize = "0.8em";
    deselAll.style.padding = "2px 8px";
    deselAll.style.cursor = "pointer";

    // Scrollable list of concepts.
    const list = contentEl.createEl("div");
    list.style.maxHeight = "420px";
    list.style.overflowY = "auto";
    list.style.border = "1px solid var(--background-modifier-border)";
    list.style.borderRadius = "6px";
    list.style.padding = "4px";

    const itemEls: HTMLDivElement[] = [];

    this.concepts.forEach((c, i) => {
      const item = list.createEl("div");
      itemEls.push(item);
      item.style.display = "flex";
      item.style.gap = "8px";
      item.style.padding = "8px 10px";
      item.style.borderBottom = "1px solid var(--background-modifier-border)";
      item.style.alignItems = "flex-start";

      const checkbox = item.createEl("input", { type: "checkbox" });
      checkbox.checked = true;
      checkbox.style.marginTop = "4px";
      checkbox.style.cursor = "pointer";
      checkbox.addEventListener("change", () => {
        if (checkbox.checked) this.selected.add(i);
        else this.selected.delete(i);
        updateCounter();
      });

      const body = item.createEl("div");
      body.style.flex = "1";
      body.style.userSelect = "text";
      (body.style as any).webkitUserSelect = "text";

      const title = body.createEl("div");
      title.style.fontWeight = "bold";
      title.style.fontSize = "0.95em";
      title.style.marginBottom = "3px";
      title.setText(c.title);

      const content = body.createEl("div");
      content.style.fontSize = "0.85em";
      content.style.opacity = "0.85";
      content.style.lineHeight = "1.45";
      content.setText(c.content);
    });

    selAll.onclick = () => {
      this.concepts.forEach((_, i) => this.selected.add(i));
      itemEls.forEach((el) => {
        const cb = el.querySelector("input[type=checkbox]") as HTMLInputElement | null;
        if (cb) cb.checked = true;
      });
      updateCounter();
    };
    deselAll.onclick = () => {
      this.selected.clear();
      itemEls.forEach((el) => {
        const cb = el.querySelector("input[type=checkbox]") as HTMLInputElement | null;
        if (cb) cb.checked = false;
      });
      updateCounter();
    };

    new Setting(contentEl)
      .addButton((b) =>
        b.setButtonText("Cancel").onClick(() => this.close())
      )
      .addButton((b) => {
        b
          .setButtonText("Create selected")
          .setCta()
          .onClick(() => {
            if (this.selected.size === 0) {
              new Notice("Select at least one concept to create.");
              return;
            }
            const picks: PdfConcept[] = [];
            this.selected.forEach((i) => picks.push(this.concepts[i]));
            this.close();
            this.onConfirm(picks);
          });
        // High friction: gate "Create selected" behind an acknowledge checkbox.
        if (this.friction) {
          gateAcceptButton(b.buttonEl, this.plugin.settings.aiFrictionLevel ?? "medium");
        }
        return b;
      });
  }
  onClose(): void {
    this.contentEl.empty();
  }
}
