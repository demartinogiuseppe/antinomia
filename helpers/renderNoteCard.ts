// note card renderer for list views. Extracted from main.ts (refactor v1.5).

import { App, TFile } from "obsidian";
import type AntinomiaPlugin from "../main";
import { humanTitle } from "../core/frontmatter";
import { NotePickerModal } from "../modals/NotePickerModal";
import { mapPresuppositionsOfPrinciple } from "../flows/presuppositionMap";

export function renderNoteCard(
  container: HTMLElement,
  app: App,
  plugin: AntinomiaPlugin,
  file: TFile,
  options: {
    showLink?: boolean;
    showCollega?: boolean;
    showDefeated?: boolean;
    showMapPresuppositions?: boolean;
    extraInfo?: (card: HTMLElement, fm: Record<string, unknown> | undefined) => void;
  }
): void {
  const card = container.createEl("div");
  // Tag the card with its file path so the cross-pane hover bus can match it.
  card.dataset.antinomiaPath = file.path;
  card.setCssStyles({
    padding: "8px 10px",
    marginBottom: "8px",
    border: "1px solid var(--background-modifier-border)",
    borderRadius: "5px",
    background: "var(--background-secondary)",
  });

  const title = humanTitle(app, file);
  const link = card.createEl("a", { text: title, href: "#" });
  link.setCssStyles({
    cursor: "pointer",
    display: "block",
    marginBottom: "4px",
    fontWeight: "600",
  });
  link.title = `${file.basename} (clicca per aprire)`;
  link.onclick = (e) => {
    e.preventDefault();
    app.workspace.getLeaf(false).openFile(file);
  };

  const fm = app.metadataCache.getFileCache(file)?.frontmatter as
    | Record<string, unknown>
    | undefined;
  if (options.extraInfo) options.extraInfo(card, fm);

  const btnRow = card.createEl("div");
  btnRow.setCssStyles({
    display: "flex",
    gap: "4px",
    flexWrap: "wrap",
    marginTop: "4px",
  });

  const mkBtn = (text: string, tooltip: string, onclick: () => void) => {
    const b = btnRow.createEl("button", { text });
    b.setCssStyles({
      padding: "2px 8px",
      fontSize: "0.78em",
      cursor: "pointer",
    });
    b.title = tooltip;
    b.onclick = (e) => {
      e.stopPropagation();
      onclick();
    };
  };

  mkBtn("Title", "Set or edit the title", () => {
    void plugin.setTitleOnActiveNote(file);
  });
  if (options.showCollega !== false) {
    mkBtn("Link", "Link this note to another one", () => {
      new NotePickerModal(app, file, (target) => {
        void plugin.linkActiveTo(file, target);
      }).open();
    });
  }
  if (options.showDefeated) {
    mkBtn("× Defeated", "Archive as defeated (opens motive modal)", () => {
      void plugin.archiveAsDefeated(file);
    });
  }
  if (options.showMapPresuppositions) {
    mkBtn("🔑 Presuppositions", "Map presuppositions of this principle (AI)", () => {
      void mapPresuppositionsOfPrinciple(plugin, file);
    });
  }
}
