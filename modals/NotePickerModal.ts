// note fuzzy picker. Extracted from main.ts (refactor v1.5).

import { App, FuzzySuggestModal, TFile } from "obsidian";
import { humanTitle } from "../core/frontmatter";

export class NotePickerModal extends FuzzySuggestModal<TFile> {
  private exclude: TFile;
  private onChoose: (file: TFile) => void;
  private filterFn: ((f: TFile) => boolean) | undefined;
  constructor(
    app: App,
    exclude: TFile,
    onChoose: (file: TFile) => void,
    filterFn?: (f: TFile) => boolean,
    placeholder?: string
  ) {
    super(app);
    this.exclude = exclude;
    this.onChoose = onChoose;
    this.filterFn = filterFn;
    this.setPlaceholder(placeholder ?? "Search a note to link...");
  }
  getItems(): TFile[] {
    let files = this.app.vault
      .getMarkdownFiles()
      .filter((f) => f.path !== this.exclude.path);
    if (this.filterFn) files = files.filter(this.filterFn);
    return files;
  }
  getItemText(file: TFile): string {
    const title = humanTitle(this.app, file);
    return title === file.basename ? title : `${title}  —  ${file.basename}`;
  }
  onChooseItem(file: TFile): void {
    this.onChoose(file);
  }
}
