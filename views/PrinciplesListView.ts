// principles list sidebar view. Extracted from main.ts (refactor v1.5).

import { ItemView, WorkspaceLeaf } from "obsidian";
import { readFrontmatter } from "../core/frontmatter";
import type AntinomiaPlugin from "../main";
import { TYPE, VIEW_TYPE_PRINCIPLES_LIST } from "../core/constants";
import { renderVaultLabel } from "../core/utils";
import { renderAntinomiaNav } from "../helpers/renderAntinomiaNav";
import { renderNoteCard } from "../helpers/renderNoteCard";

export class PrinciplesListView extends ItemView {
  private plugin: AntinomiaPlugin;
  constructor(leaf: WorkspaceLeaf, plugin: AntinomiaPlugin) {
    super(leaf);
    this.plugin = plugin;
  }
  getViewType(): string {
    return VIEW_TYPE_PRINCIPLES_LIST;
  }
  getDisplayText(): string {
    return "Antinomia — principi";
  }
  getIcon(): string {
    return "compass";
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
    container.createEl("h4", { text: "Principles (Truth Archive)" });

    const desc = container.createEl("p");
    desc.setCssStyles({
      fontSize: "0.85em",
      opacity: "0.7",
    });
    desc.setText(
      "Operational IF/THEN/GREY rules emerged from resolving tensions."
    );

    const items = this.app.vault.getMarkdownFiles().filter((f) => {
      const fm = readFrontmatter(this.app, f);
      return fm?.antinomia_type === TYPE.principle;
    });
    items.sort((a, b) => b.stat.mtime - a.stat.mtime);

    if (items.length === 0) {
      container.createEl("p", {
        text: "No active principles. Elevate a resolved tension to create one.",
      });
      return;
    }
    for (const file of items) {
      renderNoteCard(container, this.app, this.plugin, file, {
        showCollega: true,
        showDefeated: true,
        showMapPresuppositions: true,
        extraInfo: (card, fm) => {
          const origin = fm?.origin_tension;
          if (typeof origin === "string" && origin.length > 0) {
            const o = card.createEl("div");
            o.setCssStyles({
              fontSize: "0.78em",
              opacity: "0.6",
            });
            o.setText(`Origin: ${origin}`);
          }
        },
      });
    }
  }
}
