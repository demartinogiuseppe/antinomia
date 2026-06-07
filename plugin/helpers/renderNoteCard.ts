// note card renderer for list views. Extracted from main.ts (refactor v1.5).

import { App, TFile } from "obsidian";
import type AntinomiaPlugin from "../main";
import { humanTitle } from "../core/frontmatter";
import { NotePickerModal } from "../modals/NotePickerModal";

export function renderNoteCard(
  container: HTMLElement,
  app: App,
  plugin: AntinomiaPlugin,
  file: TFile,
  options: {
    showLink?: boolean;
    showCollega?: boolean;
    showDefeated?: boolean;
    extraInfo?: (card: HTMLElement, fm: Record<string, unknown> | undefined) => void;
  }
): void {
  const card = container.createEl("div");
  card.style.padding = "8px 10px";
  card.style.marginBottom = "8px";
  card.style.border = "1px solid var(--background-modifier-border)";
  card.style.borderRadius = "5px";
  card.style.background = "var(--background-secondary)";

  const title = humanTitle(app, file);
  const link = card.createEl("a", { text: title, href: "#" });
  link.style.cursor = "pointer";
  link.style.display = "block";
  link.style.marginBottom = "4px";
  link.style.fontWeight = "600";
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
  btnRow.style.display = "flex";
  btnRow.style.gap = "4px";
  btnRow.style.flexWrap = "wrap";
  btnRow.style.marginTop = "4px";

  const mkBtn = (text: string, tooltip: string, onclick: () => void) => {
    const b = btnRow.createEl("button", { text });
    b.style.padding = "2px 8px";
    b.style.fontSize = "0.78em";
    b.style.cursor = "pointer";
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
}
