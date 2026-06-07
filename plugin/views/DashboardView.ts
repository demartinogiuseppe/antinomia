// dashboard view. Extracted from main.ts (refactor v1.5).

import { ItemView, WorkspaceLeaf } from "obsidian";
import type AntinomiaPlugin from "../main";
import { TYPE, VIEW_TYPE_AUDIT, VIEW_TYPE_DASHBOARD, VIEW_TYPE_DEFEATED_LIST, VIEW_TYPE_GRAPH, VIEW_TYPE_OPEN_TENSIONS, VIEW_TYPE_PRINCIPLES_LIST, VIEW_TYPE_SUBSTRATE_LIST, VIEW_TYPE_UNCLASSIFIED } from "../core/constants";
import { humanTitle } from "../core/frontmatter";
import { substrateTemplate, tensionTemplate } from "../core/templates";
import type { Profile } from "../core/types";
import { renderVaultLabel } from "../core/utils";
import { renderAntinomiaNav } from "../helpers/renderAntinomiaNav";
import { GuidanceModal } from "../modals/GuidanceModal";
import { NewSubstrateModal } from "../modals/NewSubstrateModal";
import { NewTensionModal } from "../modals/NewTensionModal";

export class DashboardView extends ItemView {
  private plugin: AntinomiaPlugin;
  constructor(leaf: WorkspaceLeaf, plugin: AntinomiaPlugin) {
    super(leaf);
    this.plugin = plugin;
  }
  getViewType(): string {
    return VIEW_TYPE_DASHBOARD;
  }
  getDisplayText(): string {
    return "Antinomia — Dashboard";
  }
  getIcon(): string {
    return "layout-dashboard";
  }
  async onOpen(): Promise<void> {
    this.render();
    this.registerEvent(this.app.metadataCache.on("changed", () => this.render()));
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
    container.createEl("h4", { text: "Dashboard" });
    const ver = container.createEl("div", {
      text: `Antinomia v${this.plugin.manifest.version}`,
    });
    ver.style.cssText = "font-size:0.75em; opacity:0.5; margin:-6px 0 10px;";

    const files = this.app.vault.getMarkdownFiles();
    const byType = (t: string) =>
      files.filter((f) => {
        const fm = this.app.metadataCache.getFileCache(f)?.frontmatter;
        return fm?.antinomia_type === t;
      });
    const tensions = byType(TYPE.tension);
    const openTensions = tensions.filter((f) => {
      const fm = this.app.metadataCache.getFileCache(f)?.frontmatter;
      return fm?.status === "open";
    });
    const resolvedTensions = tensions.filter((f) => {
      const fm = this.app.metadataCache.getFileCache(f)?.frontmatter;
      return fm?.status === "resolved";
    });
    const substrates = byType(TYPE.substrate);
    const principles = byType(TYPE.principle);
    const defeated = byType(TYPE.defeated);
    const meta = byType(TYPE.meta);
    const unclassified = files.filter((f) => {
      const fm = this.app.metadataCache.getFileCache(f)?.frontmatter;
      return !fm || !fm.antinomia_type;
    });

    // ---- Counters grid ----
    const grid = container.createEl("div");
    grid.style.display = "grid";
    grid.style.gridTemplateColumns = "1fr 1fr";
    grid.style.gap = "6px";
    grid.style.marginBottom = "14px";

    const counter = (
      label: string,
      count: number,
      action?: () => void,
      sub?: string
    ) => {
      const card = grid.createEl("div");
      card.style.padding = "10px";
      card.style.background = "var(--background-secondary)";
      card.style.border = "1px solid var(--background-modifier-border)";
      card.style.borderRadius = "4px";
      if (action) {
        card.style.cursor = "pointer";
        card.onclick = action;
      }
      const num = card.createEl("div", { text: String(count) });
      num.style.fontSize = "1.8em";
      num.style.fontWeight = "700";
      num.style.lineHeight = "1.1";
      const lab = card.createEl("div", { text: label });
      lab.style.fontSize = "0.78em";
      lab.style.opacity = "0.8";
      if (sub) {
        const s = card.createEl("div", { text: sub });
        s.style.fontSize = "0.72em";
        s.style.opacity = "0.6";
        s.style.marginTop = "2px";
      }
    };

    counter(
      "Open tensions",
      openTensions.length,
      () => void this.plugin.activateViewExternal(VIEW_TYPE_OPEN_TENSIONS),
      `${tensions.length} total, ${resolvedTensions.length} resolved`
    );
    counter(
      "Substrate",
      substrates.length,
      () => void this.plugin.activateViewExternal(VIEW_TYPE_SUBSTRATE_LIST)
    );
    counter(
      "Principles",
      principles.length,
      () => void this.plugin.activateViewExternal(VIEW_TYPE_PRINCIPLES_LIST)
    );
    counter(
      "Defeated",
      defeated.length,
      () => void this.plugin.activateViewExternal(VIEW_TYPE_DEFEATED_LIST)
    );
    if (meta.length > 0) {
      counter("Meta-notes", meta.length);
    }
    if (unclassified.length > 0) {
      counter(
        "Unclassified",
        unclassified.length,
        () => void this.plugin.activateViewExternal(VIEW_TYPE_UNCLASSIFIED),
        "to classify"
      );
    }

    // ---- Hunter info ----
    container.createEl("h5", { text: "Hunter" });
    const hunterInfo = container.createEl("div");
    hunterInfo.style.padding = "8px 10px";
    hunterInfo.style.background = "var(--background-secondary)";
    hunterInfo.style.borderRadius = "4px";
    hunterInfo.style.fontSize = "0.85em";
    hunterInfo.style.marginBottom = "14px";
    const s = this.plugin.settings;
    if (s.lastHunterRunISO) {
      const line = hunterInfo.createEl("div");
      line.setText(`Last run: ${s.lastHunterRunISO}`);
      const count = hunterInfo.createEl("div");
      count.style.fontWeight = "600";
      count.setText(`Pairs found: ${s.lastHunterRunCount}`);
    } else {
      hunterInfo.setText("Hunter not yet run.");
    }

    // ---- Active profile ----
    container.createEl("h5", { text: "AI Profile" });
    const profInfo = container.createEl("div");
    profInfo.style.padding = "8px 10px";
    profInfo.style.background = "var(--background-secondary)";
    profInfo.style.borderRadius = "4px";
    profInfo.style.fontSize = "0.85em";
    profInfo.style.marginBottom = "14px";
    const activeP = this.plugin.activeProfile();
    profInfo.createEl("div", {
      text: `Active: ${activeP.name} (${activeP.model})`,
    });
    if (s.hunterProfileId) {
      const hp = s.profiles.find((p) => p.id === s.hunterProfileId);
      if (hp)
        profInfo.createEl("div", {
          text: `Hunter override: ${hp.name} (${hp.model})`,
        });
    }

    // ---- Recent activity ----
    container.createEl("h5", { text: "Recent activity" });
    const recent = [...files]
      .filter((f) => {
        const fm = this.app.metadataCache.getFileCache(f)?.frontmatter;
        return fm?.antinomia_type;
      })
      .sort((a, b) => b.stat.mtime - a.stat.mtime)
      .slice(0, 5);
    if (recent.length === 0) {
      container.createEl("p", {
        text: "No Antinomia notes yet.",
      });
    } else {
      const list = container.createEl("ul");
      list.style.paddingLeft = "20px";
      list.style.fontSize = "0.85em";
      for (const f of recent) {
        const li = list.createEl("li");
        const a = li.createEl("a", { text: humanTitle(this.app, f), href: "#" });
        a.style.cursor = "pointer";
        a.onclick = (e) => {
          e.preventDefault();
          this.app.workspace.getLeaf(false).openFile(f);
        };
      }
    }

    // ---- Quick actions ----
    container.createEl("h5", { text: "Quick actions" });
    const actions = container.createEl("div");
    actions.style.display = "flex";
    actions.style.flexWrap = "wrap";
    actions.style.gap = "6px";
    actions.style.marginTop = "8px";

    const mkAct = (text: string, onclick: () => void, cta = false) => {
      const b = actions.createEl("button", { text });
      b.style.padding = "4px 10px";
      b.style.fontSize = "0.85em";
      b.style.cursor = "pointer";
      if (cta) {
        b.style.background = "var(--interactive-accent)";
        b.style.color = "var(--text-on-accent)";
        b.style.fontWeight = "600";
      }
      b.onclick = onclick;
    };
    mkAct("✨ Free", () => this.plugin.openFreeInputModal(), true);
    mkAct("+ Tension", () => {
      new NewTensionModal(this.app, this.plugin, (fields, skipped) => {
        if (fields === null && !skipped) return;
        const content = fields ? tensionTemplate(fields) : tensionTemplate();
        void this.plugin.createNote("T", content);
      }).open();
    });
    mkAct("+ Substrate", () => {
      new NewSubstrateModal(this.app, this.plugin, (fields, skipped) => {
        if (fields === null && !skipped) return;
        const content = fields ? substrateTemplate(fields) : substrateTemplate();
        void this.plugin.createNote("S", content);
      }).open();
    });
    mkAct("🔍 Hunter", () => void this.plugin.runHunter());
    mkAct("🕸 Graph", () =>
      void this.plugin.activateViewExternal(VIEW_TYPE_GRAPH)
    );
    mkAct("Audit", () =>
      void this.plugin.activateViewExternal(VIEW_TYPE_AUDIT)
    );
    mkAct("Guide", () => new GuidanceModal(this.app, this.plugin).open());
  }
}
