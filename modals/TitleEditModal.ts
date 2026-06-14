// AI title edit modal. Extracted from main.ts (refactor v1.5).

import { App, Modal, Setting } from "obsidian";
import { withLoadingButton } from "../helpers/withLoadingButton";
import type { FrictionLevel, FrictionPayload } from "../core/aiFriction";
import { renderFrictionCard } from "./FrictionCard";

export class TitleEditModal extends Modal {
  constructor(
    app: App,
    private initialValue: string,
    private headerText: string,
    private hintText: string,
    private onConfirm: (value: string | null) => void | Promise<void>,
    // Optional AI-suggest hook. When provided, an extra "Propose title (AI)"
    // button is rendered above the input. It must return the proposed title
    // (string) or null on failure.
    private aiSuggestFn?: () => Promise<string | null>,
    // Optional friction card (PTM) shown when the title came from the AI.
    private frictionOpts?: { friction: FrictionPayload; level: FrictionLevel }
  ) {
    super(app);
  }
  onOpen(): void {
    const { contentEl } = this;
    contentEl.createEl("h3", { text: this.headerText });
    if (this.hintText) {
      const hint = contentEl.createEl("p");
      hint.setCssStyles({
        fontSize: "0.85em",
        opacity: "0.7",
      });
      hint.setText(this.hintText);
    }
    if (this.frictionOpts) {
      renderFrictionCard(contentEl, this.frictionOpts.friction, this.frictionOpts.level);
    }
    let currentValue = this.initialValue;
    const input = contentEl.createEl("input", {
      type: "text",
      value: this.initialValue,
    });
    input.setCssStyles({
      width: "100%",
      padding: "6px",
      marginBottom: "10px",
    });
    input.addEventListener("input", (e) => {
      currentValue = (e.target as HTMLInputElement).value;
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        void this.onConfirm(currentValue.trim() || null);
        this.close();
      }
    });
    window.setTimeout(() => {
      input.focus();
      input.select();
    }, 0);

    // Optional AI suggestion button
    if (this.aiSuggestFn) {
      const aiBtn = contentEl.createEl("button", {
        text: "Propose title (AI)",
      });
      aiBtn.setCssStyles({
        marginBottom: "10px",
        padding: "4px 10px",
        cursor: "pointer",
      });
      aiBtn.title =
        "Ask the configured AI model to propose a title from the note's content.";
      aiBtn.onclick = async () => {
        const proposed = await withLoadingButton(
          aiBtn,
          "⏳ Generating...",
          () => this.aiSuggestFn!()
        );
        if (proposed) {
          input.value = proposed;
          currentValue = proposed;
          input.focus();
          input.select();
        }
      };
    }

    new Setting(contentEl)
      .addButton((b) =>
        b.setButtonText("Cancel").onClick(() => {
          void this.onConfirm(null);
          this.close();
        })
      )
      .addButton((b) =>
        b
          .setButtonText("Save")
          .setCta()
          .onClick(() => {
            void this.onConfirm(currentValue.trim() || null);
            this.close();
          })
      );
  }
  onClose(): void {
    this.contentEl.empty();
  }
}
