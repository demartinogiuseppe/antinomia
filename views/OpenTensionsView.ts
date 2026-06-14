// open-tensions sidebar view. Extracted from main.ts (refactor v1.5).

import { ItemView, WorkspaceLeaf } from "obsidian";
import type AntinomiaPlugin from "../main";
import { TYPE, VIEW_TYPE_OPEN_TENSIONS } from "../core/constants";
import { humanTitle, readFrontmatter } from "../core/frontmatter";
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
      hint.setCssStyles({
        padding: "8px 10px",
        marginBottom: "10px",
        background: "var(--background-modifier-success-hover, var(--background-secondary))",
        borderLeft: "3px solid var(--interactive-accent)",
        borderRadius: "4px",
        fontSize: "0.85em",
      });
      const txt = hint.createEl("div");
      txt.setCssStyles({ marginBottom: "6px" });
      txt.setText(
        "Tip: each tension is a card with quick buttons (Title / Link / Presuppositions / ↑ Elevate / ✓ Resolved / × Defeated). Click the title to open the note. At the top of the sidebar, 4 toolbar buttons: '+ Tension', '+ Substrate', '✨ Free' (AI classifies), '🔍 Hunter'."
      );
      const dismissBtn = hint.createEl("button", { text: "Got it" });
      dismissBtn.setCssStyles({
        padding: "2px 10px",
        cursor: "pointer",
        fontSize: "0.85em",
      });
      dismissBtn.onclick = async () => {
        this.plugin.settings.hintsTensionsShown = true;
        await this.plugin.saveSettings();
        this.render();
      };
    }

    // ---- Quick-create toolbar (top) ----
    const toolbar = container.createEl("div");
    toolbar.setCssStyles({
      display: "flex",
      gap: "6px",
      marginBottom: "12px",
      flexWrap: "wrap",
    });

    const newTBtn = toolbar.createEl("button", { text: "+ New tension" });
    newTBtn.setCssStyles({
      padding: "4px 10px",
      fontSize: "0.85em",
      cursor: "pointer",
      fontWeight: "600",
    });
    newTBtn.title = "Create a new tension (guided modal)";
    newTBtn.onclick = () => {
      new NewTensionModal(this.app, this.plugin, (fields, skipped) => {
        if (fields === null && !skipped) return;
        const content = fields ? tensionTemplate(fields) : tensionTemplate();
        void this.plugin.createNote("T", content);
      }).open();
    };

    const newSBtn = toolbar.createEl("button", { text: "+ New substrate" });
    newSBtn.setCssStyles({
      padding: "4px 10px",
      fontSize: "0.85em",
      cursor: "pointer",
    });
    newSBtn.title = "Create a new substrate (guided modal)";
    newSBtn.onclick = () => {
      new NewSubstrateModal(this.app, this.plugin, (fields, skipped) => {
        if (fields === null && !skipped) return;
        const content = fields ? substrateTemplate(fields) : substrateTemplate();
        void this.plugin.createNote("S", content);
      }).open();
    };

    const freeBtn = toolbar.createEl("button", { text: "✨ Free" });
    freeBtn.setCssStyles({
      padding: "4px 10px",
      fontSize: "0.85em",
      cursor: "pointer",
      fontWeight: "600",
    });
    freeBtn.title =
      "Free-form input: write anything, the AI figures out if it's a tension or substrate";
    freeBtn.onclick = () => this.plugin.openFreeInputModal();

    const clipBtn = toolbar.createEl("button", { text: "📋 Clipboard" });
    clipBtn.setCssStyles({
      padding: "4px 10px",
      fontSize: "0.85em",
      cursor: "pointer",
    });
    clipBtn.title = "Opens 'Free-form input' with clipboard text already pasted: the AI classifies as tension or substrate.";
    clipBtn.onclick = () => void this.plugin.openFreeInputFromClipboard();

    const pdfBtn = toolbar.createEl("button", { text: "📎 PDF" });
    pdfBtn.setCssStyles({
      padding: "4px 10px",
      fontSize: "0.85em",
      cursor: "pointer",
    });
    pdfBtn.title =
      "Substrate da un PDF nel vault (link + spazio per le tue note)";
    pdfBtn.onclick = () => void this.plugin.openSubstrateFromPDF();

    const ytBtn = toolbar.createEl("button", { text: "🎥 YouTube" });
    ytBtn.setCssStyles({
      padding: "4px 10px",
      fontSize: "0.85em",
      cursor: "pointer",
    });
    ytBtn.title =
      "Substrate da un video YouTube: chiede URL, scarica trascrizione (se disponibile)";
    ytBtn.onclick = () => void this.plugin.openSubstrateFromYouTube();

    // Spacer + Hunter button (visually separated from creation actions)
    const spacer = toolbar.createEl("span");
    spacer.setCssStyles({ flex: "1" });

    const hunterBtn = toolbar.createEl("button", { text: "🔍 Hunter" });
    hunterBtn.setCssStyles({
      padding: "4px 10px",
      fontSize: "0.85em",
      cursor: "pointer",
    });
    hunterBtn.title =
      "Run the Contradiction Hunter (scans open tensions + substrate, identifies contradictory pairs)";
    hunterBtn.onclick = () => {
      void this.plugin.runHunter();
    };

    const open = this.app.vault.getMarkdownFiles().filter((f) => {
      const fm = readFrontmatter(this.app, f);
      return fm?.antinomia_type === TYPE.tension && fm?.status === "open";
    });
    if (open.length === 0) {
      container.createEl("p", { text: "No open tensions. Create the first one above." });
      return;
    }
    for (const file of open) {
      const card = container.createEl("div");
      card.setCssStyles({
        padding: "8px 10px",
        marginBottom: "8px",
        border: "1px solid var(--background-modifier-border)",
        borderRadius: "5px",
        background: "var(--background-secondary)",
      });

      const title = humanTitle(this.app, file);
      const link = card.createEl("a", { text: title, href: "#" });
      link.setCssStyles({
        cursor: "pointer",
        display: "block",
        marginBottom: "6px",
        fontWeight: "600",
      });
      link.title = `${file.basename} (clicca per aprire)`;
      link.onclick = (e) => {
        e.preventDefault();
        void this.app.workspace.getLeaf(false).openFile(file);
      };

      const btnRow = card.createEl("div");
      btnRow.setCssStyles({
        display: "flex",
        gap: "4px",
        flexWrap: "wrap",
      });

      const mkBtn = (
        text: string,
        tooltip: string,
        onclick: () => void
      ): HTMLButtonElement => {
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
      elBtn.setCssStyles({ borderLeft: "2px solid var(--interactive-accent)" });

      mkBtn("✓ Resolved", "Mark this tension as resolved", () => {
        void this.plugin.markResolved(file);
      });
      mkBtn("× Defeated", "Archive as defeated (opens motive modal)", () => {
        void this.plugin.archiveAsDefeated(file);
      });
    }
  }
}
