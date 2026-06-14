// Antinomia — dedicated Presuppositions Map. Lists every presupposition (U-)
// with the principles that rest on it, foregrounding the load-bearing
// invariants (shared by >1 principle). Filter to load-bearing only, sort by
// support, click to open, or ask "what collapses if this fails?".

import { ItemView, TFile, WorkspaceLeaf } from "obsidian";
import type AntinomiaPlugin from "../main";
import { TYPE, VIEW_TYPE_PRESUPPOSITIONS_MAP, LAYER_COLORS } from "../core/constants";
import { humanTitle, readFrontmatter } from "../core/frontmatter";
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
      const fm = readFrontmatter(this.app, f);
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
    bar.setCssStyles({
      display: "flex",
      gap: "12px",
      alignItems: "center",
      marginBottom: "10px",
      fontSize: "0.85em",
    });
    const lb = bar.createEl("label");
    lb.setCssStyles({
      cursor: "pointer",
      display: "flex",
      gap: "4px",
      alignItems: "center",
    });
    const lbChk = lb.createEl("input", { type: "checkbox" });
    lbChk.checked = this.loadBearingOnly;
    lb.appendText("Load-bearing only (>1)");
    lbChk.onchange = () => {
      this.loadBearingOnly = lbChk.checked;
      this.render();
    };
    const sb = bar.createEl("label");
    sb.setCssStyles({
      cursor: "pointer",
      display: "flex",
      gap: "4px",
      alignItems: "center",
    });
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
      }).setCssStyles({ opacity: "0.7" });
      return;
    }

    const gold = LAYER_COLORS.presupposition;
    for (const r of rows) {
      const loadBearing = r.degree > 1;
      const card = container.createDiv();
      card.setCssStyles({
        border: "1px solid var(--background-modifier-border)",
        borderLeft: `${loadBearing ? "4px" : "1px"} solid ${loadBearing ? gold : "var(--background-modifier-border)"}`,
        borderRadius: "6px",
        padding: "8px 10px",
        marginBottom: "8px",
        ...(loadBearing ? { background: "rgba(251,191,36,0.06)" } : {}),
      });

      const head = card.createDiv();
      head.setCssStyles({
        display: "flex",
        justifyContent: "space-between",
        alignItems: "baseline",
        gap: "8px",
      });
      const titleEl = head.createEl("a", { text: `${loadBearing ? "⭐ " : ""}${r.title}` });
      titleEl.setCssStyles({
        cursor: "pointer",
        fontWeight: `${loadBearing ? 700 : 500}`,
        ...(loadBearing ? { color: gold } : {}),
      });
      titleEl.onclick = () => void this.app.workspace.getLeaf(false).openFile(r.file);
      const badge = head.createEl("span", {
        text: loadBearing ? `load-bearing · supports ${r.degree}` : `supports ${r.degree}`,
      });
      badge.setCssStyles({
        fontSize: "0.72em",
        opacity: "0.7",
        whiteSpace: "nowrap",
      });

      const meta = card.createDiv();
      meta.setCssStyles({
        fontSize: "0.75em",
        opacity: "0.65",
        marginTop: "2px",
      });
      meta.setText(`status: ${r.status} · confidence: ${r.confidence}`);

      if (r.supporters.length > 0) {
        const sup = card.createDiv();
        sup.setCssStyles({
          fontSize: "0.8em",
          marginTop: "4px",
        });
        sup.setText("Supports: " + r.supporters.map((s) => humanTitle(this.app, s)).join(", "));
      }

      const collapseBtn = card.createEl("button", { text: "What collapses?" });
      collapseBtn.setCssStyles({
        marginTop: "6px",
        fontSize: "0.78em",
        padding: "2px 8px",
        cursor: "pointer",
      });
      collapseBtn.onclick = () => void showCollapseImpact(this.plugin, r.file);
    }
  }
}
