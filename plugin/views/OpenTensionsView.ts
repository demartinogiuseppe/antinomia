// open-tensions sidebar view. Extracted from main.ts (refactor v1.5).

import { ItemView, WorkspaceLeaf } from "obsidian";
import type AntinomiaPlugin from "../main";
import { TYPE, VIEW_TYPE_OPEN_TENSIONS } from "../core/constants";
import { humanTitle } from "../core/frontmatter";
import { substrateTemplate, tensionTemplate } from "../core/templates";
import { renderVaultLabel } from "../core/utils";
import { renderAntinomiaNav } from "../helpers/renderAntinomiaNav";
import { NewSubstrateModal } from "../modals/NewSubstrateModal";
import { NewTensionModal } from "../modals/NewTensionModal";
import { NotePickerModal } from "../modals/NotePickerModal";

export class OpenTensionsView extends ItemView {
  private plugin: AntinomiaPlugin;
  constructor(leaf: WorkspaceLeaf, plugin: AntinomiaPlugin) {
    super(leaf);
    this.plugin = plugin;
  }
  getViewType(): string {
    return VIEW_TYPE_OPEN_TENSIONS;
  }
  getDisplayText(): string {
    return "Antinomia — Open tensions";
  }
  getIcon(): string {
    return "git-pull-request";
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
    container.createEl("h4", { text: "Open tensions" });

    // ---- First-time hint banner ----
    if (!this.plugin.settings.hintsTensionsShown) {
      const hint = container.createEl("div");
      hint.style.padding = "8px 10px";
      hint.style.marginBottom = "10px";
      hint.style.background = "var(--background-modifier-success-hover, var(--background-secondary))";
      hint.style.borderLeft = "3px solid var(--interactive-accent)";
      hint.style.borderRadius = "4px";
      hint.style.fontSize = "0.85em";
      const txt = hint.createEl("div");
      txt.style.marginBottom = "6px";
      txt.setText(
        "Tip: each tension is a card with quick buttons (Title / Link / Presuppositions / ↑ Elevate / ✓ Resolved / × Defeated). Click the title to open the note. At the top of the sidebar, 4 toolbar buttons: '+ Tension', '+ Substrate', '✨ Free' (AI classifies), '🔍 Hunter'."
      );
      const dismissBtn = hint.createEl("button", { text: "Got it" });
      dismissBtn.style.padding = "2px 10px";
      dismissBtn.style.cursor = "pointer";
      dismissBtn.style.fontSize = "0.85em";
      dismissBtn.onclick = async () => {
        this.plugin.settings.hintsTensionsShown = true;
        await this.plugin.saveSettings();
        this.render();
      };
    }

    // ---- Quick-create toolbar (top) ----
    const toolbar = container.createEl("div");
    toolbar.style.display = "flex";
    toolbar.style.gap = "6px";
    toolbar.style.marginBottom = "12px";
    toolbar.style.flexWrap = "wrap";

    const newTBtn = toolbar.createEl("button", { text: "+ New tension" });
    newTBtn.style.padding = "4px 10px";
    newTBtn.style.fontSize = "0.85em";
    newTBtn.style.cursor = "pointer";
    newTBtn.style.fontWeight = "600";
    newTBtn.title = "Create a new tension (guided modal)";
    newTBtn.onclick = () => {
      new NewTensionModal(this.app, this.plugin, (fields, skipped) => {
        if (fields === null && !skipped) return;
        const content = fields ? tensionTemplate(fields) : tensionTemplate();
        void this.plugin.createNote("T", content);
      }).open();
    };

    const newSBtn = toolbar.createEl("button", { text: "+ New substrate" });
    newSBtn.style.padding = "4px 10px";
    newSBtn.style.fontSize = "0.85em";
    newSBtn.style.cursor = "pointer";
    newSBtn.title = "Create a new substrate (guided modal)";
    newSBtn.onclick = () => {
      new NewSubstrateModal(this.app, this.plugin, (fields, skipped) => {
        if (fields === null && !skipped) return;
        const content = fields ? substrateTemplate(fields) : substrateTemplate();
        void this.plugin.createNote("S", content);
      }).open();
    };

    const freeBtn = toolbar.createEl("button", { text: "✨ Free" });
    freeBtn.style.padding = "4px 10px";
    freeBtn.style.fontSize = "0.85em";
    freeBtn.style.cursor = "pointer";
    freeBtn.style.fontWeight = "600";
    freeBtn.title =
      "Free-form input: write anything, the AI figures out if it's a tension or substrate";
    freeBtn.onclick = () => this.plugin.openFreeInputModal();

    const clipBtn = toolbar.createEl("button", { text: "📋 Clipboard" });
    clipBtn.style.padding = "4px 10px";
    clipBtn.style.fontSize = "0.85em";
    clipBtn.style.cursor = "pointer";
    clipBtn.title = "Opens 'Free-form input' with clipboard text already pasted: the AI classifies as tension or substrate.";
    clipBtn.onclick = () => void this.plugin.openFreeInputFromClipboard();

    const pdfBtn = toolbar.createEl("button", { text: "📎 PDF" });
    pdfBtn.style.padding = "4px 10px";
    pdfBtn.style.fontSize = "0.85em";
    pdfBtn.style.cursor = "pointer";
    pdfBtn.title =
      "Substrate da un PDF nel vault (link + spazio per le tue note)";
    pdfBtn.onclick = () => void this.plugin.openSubstrateFromPDF();

    const ytBtn = toolbar.createEl("button", { text: "🎥 YouTube" });
    ytBtn.style.padding = "4px 10px";
    ytBtn.style.fontSize = "0.85em";
    ytBtn.style.cursor = "pointer";
    ytBtn.title =
      "Substrate da un video YouTube: chiede URL, scarica trascrizione (se disponibile)";
    ytBtn.onclick = () => void this.plugin.openSubstrateFromYouTube();

    // Spacer + Hunter button (visually separated from creation actions)
    const spacer = toolbar.createEl("span");
    spacer.style.flex = "1";

    const hunterBtn = toolbar.createEl("button", { text: "🔍 Hunter" });
    hunterBtn.style.padding = "4px 10px";
    hunterBtn.style.fontSize = "0.85em";
    hunterBtn.style.cursor = "pointer";
    hunterBtn.title =
      "Run the Contradiction Hunter (scans open tensions + substrate, identifies contradictory pairs)";
    hunterBtn.onclick = () => {
      void this.plugin.runHunter();
    };

    const open = this.app.vault.getMarkdownFiles().filter((f) => {
      const fm = this.app.metadataCache.getFileCache(f)?.frontmatter;
      return fm?.antinomia_type === TYPE.tension && fm?.status === "open";
    });
    if (open.length === 0) {
      container.createEl("p", { text: "No open tensions. Create the first one above." });
      return;
    }
    for (const file of open) {
      const card = container.createEl("div");
      card.style.padding = "8px 10px";
      card.style.marginBottom = "8px";
      card.style.border = "1px solid var(--background-modifier-border)";
      card.style.borderRadius = "5px";
      card.style.background = "var(--background-secondary)";

      const title = humanTitle(this.app, file);
      const link = card.createEl("a", { text: title, href: "#" });
      link.style.cursor = "pointer";
      link.style.display = "block";
      link.style.marginBottom = "6px";
      link.style.fontWeight = "600";
      link.title = `${file.basename} (clicca per aprire)`;
      link.onclick = (e) => {
        e.preventDefault();
        this.app.workspace.getLeaf(false).openFile(file);
      };

      const btnRow = card.createEl("div");
      btnRow.style.display = "flex";
      btnRow.style.gap = "4px";
      btnRow.style.flexWrap = "wrap";

      const mkBtn = (
        text: string,
        tooltip: string,
        onclick: () => void
      ): HTMLButtonElement => {
        const b = btnRow.createEl("button", { text });
        b.style.padding = "2px 8px";
        b.style.fontSize = "0.78em";
        b.style.cursor = "pointer";
        b.title = tooltip;
        b.onclick = (e) => {
          e.stopPropagation();
          onclick();
        };
        return b;
      };

      mkBtn("Title", "Set or edit the note title", () => {
        void this.plugin.setTitleOnActiveNote(file);
      });
      mkBtn("Link", "Link this tension to another note", () => {
        new NotePickerModal(this.plugin.app, file, (target) => {
          void this.plugin.linkActiveTo(file, target);
        }).open();
      });
      mkBtn("Presuppositions", "Map tension presuppositions A/B (AI-assisted)", () => {
        void this.plugin.openMapPresupposti(file);
      });
      const elBtn = mkBtn(
        "↑ Elevate",
        "Elevate to principle (opens IF/THEN/GREY form)",
        () => {
          void this.plugin.openElevateModal(file);
        }
      );
      elBtn.style.borderLeft = "2px solid var(--interactive-accent)";

      mkBtn("✓ Resolved", "Mark this tension as resolved", () => {
        void this.plugin.markResolved(file);
      });
      mkBtn("× Defeated", "Archive as defeated (opens motive modal)", () => {
        void this.plugin.archiveAsDefeated(file);
      });
    }
  }
}
