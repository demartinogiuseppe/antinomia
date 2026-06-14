// dismissed-pairs sidebar view. Extracted from main.ts (refactor v1.5).

import { ItemView, TFile, WorkspaceLeaf } from "obsidian";
import type AntinomiaPlugin from "../main";
import { VIEW_TYPE_DISMISSED_PAIRS } from "../core/constants";
import { humanTitle, readFrontmatter } from "../core/frontmatter";
import { renderVaultLabel } from "../core/utils";
import { renderAntinomiaNav } from "../helpers/renderAntinomiaNav";

export class DismissedPairsView extends ItemView {
  private plugin: AntinomiaPlugin;
  constructor(leaf: WorkspaceLeaf, plugin: AntinomiaPlugin) {
    super(leaf);
    this.plugin = plugin;
  }
  getViewType(): string {
    return VIEW_TYPE_DISMISSED_PAIRS;
  }
  getDisplayText(): string {
    return "Antinomia — falsi positivi";
  }
  getIcon(): string {
    return "list-x";
  }
  async onOpen(): Promise<void> {
    this.render();
    this.registerEvent(
      this.app.metadataCache.on("changed", () => this.render())
    );
    this.registerEvent(this.app.vault.on("modify", () => this.render()));
    this.registerEvent(this.app.vault.on("rename", () => this.render()));
    this.registerEvent(this.app.vault.on("delete", () => this.render()));
  }
  async onClose(): Promise<void> {}

  private render(): void {
    const container = this.containerEl.children[1];
    container.empty();
    renderAntinomiaNav(this.plugin, container as HTMLElement, this.leaf);
    renderVaultLabel(container, this.plugin.settings.vaultDisplayName);
    container.createEl("h4", { text: "Hunter false positives" });

    const desc = container.createEl("p");
    desc.setCssStyles({
      fontSize: "0.85em",
      opacity: "0.7",
    });
    desc.setText(
      "Pairs marked as false positives (via × in the Hunter sidebar). They won't be proposed again. Click 'Re-include' to remove the dismissal and have them reappear in the next runs."
    );

    // Collect all dismissed pairs. Stored as `hunter_false_positives: [basename, ...]`
    // in the frontmatter of the alphabetically smaller-basename note.
    interface Pair {
      ownerFile: TFile;
      ownerBasename: string;
      otherBasename: string;
    }
    const pairs: Pair[] = [];
    for (const f of this.app.vault.getMarkdownFiles()) {
      const fm = readFrontmatter(this.app, f);
      const list = fm?.hunter_false_positives;
      if (Array.isArray(list)) {
        for (const other of list) {
          if (typeof other === "string" && other.length > 0) {
            pairs.push({
              ownerFile: f,
              ownerBasename: f.basename,
              otherBasename: other,
            });
          }
        }
      }
    }

    if (pairs.length === 0) {
      container.createEl("p", {
        text: "No false positives recorded.",
      });
      return;
    }

    // sort by owner basename then other (stable, deterministic)
    pairs.sort((a, b) => {
      const c = a.ownerBasename.localeCompare(b.ownerBasename);
      if (c !== 0) return c;
      return a.otherBasename.localeCompare(b.otherBasename);
    });

    const list = container.createEl("ol");
    for (const p of pairs) {
      const li = list.createEl("li");
      li.setCssStyles({ marginBottom: "10px" });

      const row = li.createEl("div");
      row.setCssStyles({
        display: "flex",
        alignItems: "center",
        gap: "6px",
        flexWrap: "wrap",
      });

      this.appendNoteLink(row, p.ownerBasename);
      row.appendText(" ⟷ ");
      this.appendNoteLink(row, p.otherBasename);

      const undismissBtn = row.createEl("button", { text: "Reincludi" });
      undismissBtn.setCssStyles({
        marginLeft: "auto",
        padding: "0 8px",
        cursor: "pointer",
      });
      undismissBtn.title =
        "Rimuovi il dismiss: la coppia tornera' a essere candidata nei prossimi run del Hunter.";
      undismissBtn.onclick = async () => {
        await this.plugin.undismissContradiction(
          p.ownerBasename,
          p.otherBasename
        );
        this.render();
      };
    }
  }

  private appendNoteLink(parent: HTMLElement, basename: string): void {
    const file = this.findFileByBasename(basename);
    if (file) {
      const title = humanTitle(this.app, file);
      const a = parent.createEl("a", { text: title, href: "#" });
      a.setCssStyles({ cursor: "pointer" });
      a.title = `${basename} (clicca per aprire)`;
      a.onclick = (e) => {
        e.preventDefault();
        this.app.workspace.getLeaf(false).openFile(file);
      };
    } else {
      const span = parent.createEl("span", { text: basename + " (?)" });
      span.setCssStyles({ opacity: "0.5" });
      span.title = "Nota non trovata nel vault";
    }
  }

  private findFileByBasename(basename: string): TFile | null {
    return (
      this.app.vault.getMarkdownFiles().find((f) => f.basename === basename) ??
      null
    );
  }
}
