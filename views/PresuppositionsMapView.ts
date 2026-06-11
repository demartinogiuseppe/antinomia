// Antinomia — dedicated Presuppositions Map. Lists every presupposition (U-)
// with the principles that rest on it, foregrounding the load-bearing
// invariants (shared by >1 principle). Filter to load-bearing only, sort by
// support, click to open, or ask "what collapses if this fails?".

import { ItemView, TFile, WorkspaceLeaf } from "obsidian";
import type AntinomiaPlugin from "../main";
import { TYPE, VIEW_TYPE_PRESUPPOSITIONS_MAP, LAYER_COLORS } from "../core/constants";
import { humanTitle } from "../core/frontmatter";
import { renderVaultLabel } from "../core/utils";
import { renderAntinomiaNav } from "../helpers/renderAntinomiaNav";
import { principlesDependingOn, showCollapseImpact } from "../flows/presuppositionMap";

interface Row {
  file: TFile;
  title: string;
  status: string;
  confidence: string;
  supporters: TFile[];
  degree: number;
}

export class PresuppositionsMapView extends ItemView {
  private plugin: AntinomiaPlugin;
  private loadBearingOnly = false;
  private sortBySupport = true;

  constructor(leaf: WorkspaceLeaf, plugin: AntinomiaPlugin) {
    super(leaf);
    this.plugin = plugin;
  }
  getViewType(): string {
    return VIEW_TYPE_PRESUPPOSITIONS_MAP;
  }
  getDisplayText(): string {
    return "Antinomia — Presuppositions";
  }
  getIcon(): string {
    return "key";
  }
  async onOpen(): Promise<void> {
    this.render();
    this.registerEvent(this.app.metadataCache.on("changed", () => this.render()));
    this.registerEvent(this.app.vault.on("create", () => this.render()));
    this.registerEvent(this.app.vault.on("delete", () => this.render()));
    this.registerEvent(this.app.vault.on("rename", () => this.render()));
  }
  async onClose(): Promise<void> {}

  private rows(): Row[] {
    const out: Row[] = [];
    for (const f of this.app.vault.getMarkdownFiles()) {
      const fm = this.app.metadataCache.getFileCache(f)?.frontmatter;
      if (fm?.antinomia_type !== TYPE.presupposition) continue;
      const supporters = principlesDependingOn(this.app, f);
      out.push({
        file: f,
        title: humanTitle(this.app, f),
        status: String(fm.status ?? "active"),
        confidence: String(fm.confidence ?? "medium"),
        supporters,
        degree: supporters.length,
      });
    }
    return out;
  }

  private render(): void {
    const container = this.containerEl.children[1];
    container.empty();
    renderAntinomiaNav(this.plugin, container as HTMLElement, this.leaf);
    renderVaultLabel(container as HTMLElement, this.plugin.settings.vaultDisplayName);
    container.createEl("h4", { text: "Presuppositions Map" });

    // toolbar
    const bar = container.createDiv();
    bar.style.cssText = "display:flex; gap:12px; align-items:center; margin-bottom:10px; font-size:0.85em;";
    const lb = bar.createEl("label");
    lb.style.cssText = "cursor:pointer; display:flex; gap:4px; align-items:center;";
    const lbChk = lb.createEl("input", { type: "checkbox" });
    lbChk.checked = this.loadBearingOnly;
    lb.appendText("Load-bearing only (>1)");
    lbChk.onchange = () => {
      this.loadBearingOnly = lbChk.checked;
      this.render();
    };
    const sb = bar.createEl("label");
    sb.style.cssText = "cursor:pointer; display:flex; gap:4px; align-items:center;";
    const sbChk = sb.createEl("input", { type: "checkbox" });
    sbChk.checked = this.sortBySupport;
    sb.appendText("Sort by most-supported");
    sbChk.onchange = () => {
      this.sortBySupport = sbChk.checked;
      this.render();
    };

    let rows = this.rows();
    if (this.loadBearingOnly) rows = rows.filter((r) => r.degree > 1);
    if (this.sortBySupport) rows.sort((a, b) => b.degree - a.degree);

    if (rows.length === 0) {
      container.createEl("p", {
        text: "No presuppositions yet. Open a principle and run 'Map presuppositions of this principle'.",
      }).style.opacity = "0.7";
      return;
    }

    const gold = LAYER_COLORS.presupposition;
    for (const r of rows) {
      const loadBearing = r.degree > 1;
      const card = container.createDiv();
      card.style.cssText =
        `border:1px solid var(--background-modifier-border); border-left:${loadBearing ? "4px" : "1px"} solid ${loadBearing ? gold : "var(--background-modifier-border)"}; ` +
        `border-radius:6px; padding:8px 10px; margin-bottom:8px; ${loadBearing ? "background:rgba(251,191,36,0.06);" : ""}`;

      const head = card.createDiv();
      head.style.cssText = "display:flex; justify-content:space-between; align-items:baseline; gap:8px;";
      const titleEl = head.createEl("a", { text: `${loadBearing ? "⭐ " : ""}${r.title}` });
      titleEl.style.cssText = `cursor:pointer; font-weight:${loadBearing ? 700 : 500}; ${loadBearing ? `color:${gold};` : ""}`;
      titleEl.onclick = () => void this.app.workspace.getLeaf(false).openFile(r.file);
      const badge = head.createEl("span", {
        text: loadBearing ? `load-bearing · supports ${r.degree}` : `supports ${r.degree}`,
      });
      badge.style.cssText = "font-size:0.72em; opacity:0.7; white-space:nowrap;";

      const meta = card.createDiv();
      meta.style.cssText = "font-size:0.75em; opacity:0.65; margin-top:2px;";
      meta.setText(`status: ${r.status} · confidence: ${r.confidence}`);

      if (r.supporters.length > 0) {
        const sup = card.createDiv();
        sup.style.cssText = "font-size:0.8em; margin-top:4px;";
        sup.setText("Supports: " + r.supporters.map((s) => humanTitle(this.app, s)).join(", "));
      }

      const collapseBtn = card.createEl("button", { text: "What collapses?" });
      collapseBtn.style.cssText = "margin-top:6px; font-size:0.78em; padding:2px 8px; cursor:pointer;";
      collapseBtn.onclick = () => void showCollapseImpact(this.plugin, r.file);
    }
  }
}
