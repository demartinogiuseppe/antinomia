// PDF file fuzzy picker. Extracted from main.ts (refactor v1.5).

import { App, FuzzySuggestModal, TFile } from "obsidian";

export class PdfPickerModal extends FuzzySuggestModal<TFile> {
  private pdfs: TFile[];
  private onChoose: (file: TFile) => void;
  constructor(app: App, pdfs: TFile[], onChoose: (file: TFile) => void) {
    super(app);
    this.pdfs = pdfs;
    this.onChoose = onChoose;
    this.setPlaceholder("Search a PDF in the vault...");
  }
  getItems(): TFile[] {
    return this.pdfs;
  }
  getItemText(file: TFile): string {
    return `${file.basename}  —  ${file.path}`;
  }
  onChooseItem(file: TFile): void {
    this.onChoose(file);
  }
}
