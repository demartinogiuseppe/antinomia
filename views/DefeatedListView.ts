// defeated list sidebar view. Extracted from main.ts (refactor v1.5).

import { ItemView, WorkspaceLeaf } from "obsidian";
import { readFrontmatter } from "../core/frontmatter";
import type AntinomiaPlugin from "../main";
import { TYPE, VIEW_TYPE_DEFEATED_LIST } from "../core/constants";
import { renderVaultLabel } from "../core/utils";
import { renderAntinomiaNav } from "../helpers/renderAntinomiaNav";
import { renderNoteCard } from "../helpers/renderNoteCard";

export class DefeatedListView extends ItemView {
  private plugin: AntinomiaPlugin;
  constructor(leaf: WorkspaceLeaf, plugin: AntinomiaPlugin) {
    super(leaf);
    this.plugin = plugin;
  }
  getViewType(): string {
    return VIEW_TYPE_DEFEATED_LIST;
  }
  getDisplayText(): string {
    return "Antinomia — defeated";
  }
  getIcon(): string {
    return "archive";
  }
  async onOpen(): Promise<void> {
    this.render();
    this.registerEvent(
      this.app.metadataCache.on("changed", () => this.render())
    );
    this.registerEvent(this.app.vault.on("create", () => this.render()));
    this.registerEvent(this.app.vault.on("delete", () => this.render()));
    this.registerEvent(this.app.vault.on("rename", () => this.render()));
    this.registerEvent(this.app.vault.on("modify", () => this.render()));
  }
  async onClose(): Promise<void> {}
  private render(): void {
    const container = this.containerEl.children[1];
    container.empty();
    renderAntinomiaNav(this.plugin, container as HTMLElement, this.leaf);
    renderVaultLabel(container, this.plugin.settings.vaultDisplayName);
    container.createEl("h4", { text: "Defeated archive" });

    const desc = container.createEl("p");
    desc.setCssStyles({
      fontSize: "0.85em",
      opacity: "0.7",
    });
    desc.setText(
      "Defeated beliefs. Historical memory: they are not edited; they remain as a trace of what was NOT true."
    );

    const items = this.app.vault.getMarkdownFiles().filter((f) => {
      const fm = readFrontmatter(this.app, f);
      return fm?.antinomia_type === TYPE.defeated;
    });
    items.sort((a, b) => b.stat.mtime - a.stat.mtime);

    if (items.length === 0) {
      container.createEl("p", { text: "No defeated beliefs." });
      return;
    }
    for (const file of items) {
      renderNoteCard(container, this.app, this.plugin, file, {
        showCollega: true,
        showDefeated: false, // already defeated, can't re-defeat
        extraInfo: (card, fm) => {
          const motivo = fm?.motive;
          const sost = fm?.replaced_by;
          const meta = card.createEl("div");
          meta.setCssStyles({
            fontSize: "0.78em",
            opacity: "0.7",
            marginBottom: "4px",
          });
          const parts: string[] = [];
          if (typeof motivo === "string") parts.push(`motive: ${motivo}`);
          if (typeof sost === "string" && sost.length > 0)
            parts.push(`sostituita da: ${sost}`);
          meta.setText(parts.join("  |  "));
        },
      });
    }
  }
}
