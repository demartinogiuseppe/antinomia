// substrate list sidebar view. Extracted from main.ts (refactor v1.5).

import { ItemView, WorkspaceLeaf } from "obsidian";
import type AntinomiaPlugin from "../main";
import { TYPE, VIEW_TYPE_SUBSTRATE_LIST } from "../core/constants";
import { substrateTemplate } from "../core/templates";
import { renderVaultLabel } from "../core/utils";
import { renderAntinomiaNav } from "../helpers/renderAntinomiaNav";
import { renderNoteCard } from "../helpers/renderNoteCard";
import { NewSubstrateModal } from "../modals/NewSubstrateModal";

export class SubstrateListView extends ItemView {
  private plugin: AntinomiaPlugin;
  constructor(leaf: WorkspaceLeaf, plugin: AntinomiaPlugin) {
    super(leaf);
    this.plugin = plugin;
  }
  getViewType(): string {
    return VIEW_TYPE_SUBSTRATE_LIST;
  }
  getDisplayText(): string {
    return "Antinomia — substrate";
  }
  getIcon(): string {
    return "layers";
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
    container.createEl("h4", { text: "Substrate" });

    const toolbar = container.createEl("div");
    toolbar.style.marginBottom = "10px";
    const newBtn = toolbar.createEl("button", { text: "+ New substrate" });
    newBtn.style.padding = "4px 10px";
    newBtn.style.fontSize = "0.85em";
    newBtn.style.cursor = "pointer";
    newBtn.style.fontWeight = "600";
    newBtn.onclick = () => {
      new NewSubstrateModal(this.app, this.plugin, (fields, skipped) => {
        if (fields === null && !skipped) return;
        const content = fields
          ? substrateTemplate(fields)
          : substrateTemplate();
        void this.plugin.createNote("S", content);
      }).open();
    };

    const items = this.app.vault.getMarkdownFiles().filter((f) => {
      const fm = this.app.metadataCache.getFileCache(f)?.frontmatter;
      return fm?.antinomia_type === TYPE.substrate;
    });
    items.sort((a, b) => b.stat.mtime - a.stat.mtime);

    if (items.length === 0) {
      container.createEl("p", {
        text: "No substrate. Raw material (quotes, facts, notes) that can generate tensions.",
      });
      return;
    }
    for (const file of items) {
      renderNoteCard(container, this.app, this.plugin, file, {
        showCollega: true,
        showDefeated: true,
      });
    }
  }
}
