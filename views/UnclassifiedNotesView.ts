// unclassified notes view. Extracted from main.ts (refactor v1.5).

import { ItemView, WorkspaceLeaf } from "obsidian";
import type AntinomiaPlugin from "../main";
import { TYPE, VIEW_TYPE_UNCLASSIFIED } from "../core/constants";
import { humanTitle, readFrontmatter } from "../core/frontmatter";
import { renderVaultLabel } from "../core/utils";
import { renderAntinomiaNav } from "../helpers/renderAntinomiaNav";

export class UnclassifiedNotesView extends ItemView {
  private plugin: AntinomiaPlugin;
  constructor(leaf: WorkspaceLeaf, plugin: AntinomiaPlugin) {
    super(leaf);
    this.plugin = plugin;
  }
  getViewType(): string {
    return VIEW_TYPE_UNCLASSIFIED;
  }
  getDisplayText(): string {
    return "Antinomia — Unclassified";
  }
  getIcon(): string {
    return "help-circle";
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
    container.createEl("h4", { text: "Unclassified notes" });

    const desc = container.createEl("p");
    desc.setCssStyles({
      fontSize: "0.85em",
      opacity: "0.7",
    });
    desc.setText(
      "Note del vault senza antinomia_type. Utile per migrare un vault esistente: classifica una per una manualmente o con AI. 'Ignora' aggiunge antinomia_ignora: true (non riapparira'). I file in trash sono esclusi."
    );

    const all = this.app.vault.getMarkdownFiles();
    const items = all.filter((f) => {
      const fm = readFrontmatter(this.app, f);
      if (fm?.antinomia_type) return false;
      if (fm?.antinomia_ignora === true) return false;
      // skip files that are trashed (Obsidian trash convention varies)
      return true;
    });

    if (items.length === 0) {
      const ok = container.createEl("p");
      ok.setCssStyles({
        padding: "12px",
        background: "var(--background-modifier-success, var(--background-secondary))",
        borderRadius: "4px",
      });
      ok.setText(
        "✅ Tutte le note del vault sono classificate (o esplicitamente ignorate). Niente da migrare."
      );
      return;
    }

    const summary = container.createEl("p");
    summary.setCssStyles({
      fontWeight: "600",
      marginBottom: "10px",
    });
    summary.setText(
      `${items.length} note da classificare. Inizia dalle piu' recenti.`
    );

    // Sort by mtime descending
    items.sort((a, b) => b.stat.mtime - a.stat.mtime);

    // Limit visible to 50 to avoid huge DOM (with a "show more" if needed)
    const MAX = 50;
    const visible = items.slice(0, MAX);
    if (items.length > MAX) {
      const note = container.createEl("p");
      note.setCssStyles({
        fontSize: "0.78em",
        opacity: "0.7",
      });
      note.setText(
        `Showing the first ${MAX} of ${items.length}. Classify (or ignore) them to see the next ones.`
      );
    }

    for (const file of visible) {
      const card = container.createEl("div");
      card.setCssStyles({
        padding: "8px 10px",
        marginBottom: "8px",
        border: "1px solid var(--background-modifier-border)",
        borderRadius: "5px",
        background: "var(--background-secondary)",
      });

      const titleRow = card.createEl("div");
      titleRow.setCssStyles({ marginBottom: "6px" });
      const title = humanTitle(this.app, file);
      const link = titleRow.createEl("a", { text: title, href: "#" });
      link.setCssStyles({
        cursor: "pointer",
        fontWeight: "600",
      });
      link.title = `${file.path} (clicca per aprire)`;
      link.onclick = (e) => {
        e.preventDefault();
        void this.app.workspace.getLeaf(false).openFile(file);
      };
      const pathLine = card.createEl("div");
      pathLine.setCssStyles({
        fontSize: "0.75em",
        opacity: "0.55",
      });
      pathLine.setText(file.path);

      const btnRow = card.createEl("div");
      btnRow.setCssStyles({
        display: "flex",
        flexWrap: "wrap",
        gap: "4px",
        marginTop: "6px",
      });

      const mkBtn = (
        text: string,
        tooltip: string,
        onclick: () => void,
        warning = false
      ) => {
        const b = btnRow.createEl("button", { text });
        b.setCssStyles({
          padding: "2px 8px",
          fontSize: "0.78em",
          cursor: "pointer",
        });
        if (warning) b.setCssStyles({ opacity: "0.7" });
        b.title = tooltip;
        b.onclick = (e) => {
          e.stopPropagation();
          onclick();
        };
      };

      mkBtn("Tension", "Mark as tension (adds antinomia_type)", () =>
        void this.plugin.markAsType(file, TYPE.tension)
      );
      mkBtn("Substrate", "Mark as substrate", () =>
        void this.plugin.markAsType(file, TYPE.substrate)
      );
      mkBtn("Principle", "Mark as principle", () =>
        void this.plugin.markAsType(file, TYPE.principle)
      );
      mkBtn("Defeated", "Mark as defeated", () =>
        void this.plugin.markAsType(file, TYPE.defeated)
      );
      mkBtn("Meta", "Mark as meta_note", () =>
        void this.plugin.markAsType(file, TYPE.meta)
      );
      mkBtn("AI", "Classify with AI (asks confirmation)", () =>
        void this.plugin.classifyActiveNoteExternal(file)
      );
      mkBtn(
        "Ignore",
        "Adds antinomia_ignore: true (the note disappears from this list)",
        () => void this.plugin.ignoreNote(file),
        true
      );
    }
  }
}
