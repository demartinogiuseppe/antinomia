// Hunter results sidebar view. Extracted from main.ts (refactor v1.5).

import { ItemView, TFile, WorkspaceLeaf } from "obsidian";
import type AntinomiaPlugin from "../main";
import { CONFIDENCE_COLOR, CONFIDENCE_ORDER, TYPE, VIEW_TYPE_HUNTER_RESULTS } from "../core/constants";
import { humanTitle, readFrontmatter } from "../core/frontmatter";
import type { HunterRun } from "../core/types";
import { renderVaultLabel } from "../core/utils";
import { renderAntinomiaNav } from "../helpers/renderAntinomiaNav";
import { renderFrictionCard } from "../modals/FrictionCard";
import { OpenTensionsView } from "../views/OpenTensionsView";

export class HunterResultsView extends ItemView {
  private currentRun: HunterRun | null = null;
  private plugin: AntinomiaPlugin;
  private loadingStartedAt: number | null = null;
  private loadingTimer: number | null = null;
  private loadingNotesCount = 0;

  constructor(leaf: WorkspaceLeaf, plugin: AntinomiaPlugin) {
    super(leaf);
    this.plugin = plugin;
  }
  getViewType(): string {
    return VIEW_TYPE_HUNTER_RESULTS;
  }
  getDisplayText(): string {
    return "Antinomia — Contradiction Hunter";
  }
  getIcon(): string {
    return "search";
  }
  setRun(run: HunterRun): void {
    this.currentRun = run;
    this.render();
  }
  setLoading(active: boolean, notesCount = 0): void {
    if (active) {
      this.loadingStartedAt = Date.now();
      this.loadingNotesCount = notesCount;
      this.loadingTimer = window.setInterval(() => this.render(), 1000);
    } else {
      this.loadingStartedAt = null;
      this.loadingNotesCount = 0;
      if (this.loadingTimer !== null) {
        window.clearInterval(this.loadingTimer);
        this.loadingTimer = null;
      }
    }
    this.render();
  }
  async onOpen(): Promise<void> {
    this.render();
    this.registerEvent(
      this.app.metadataCache.on("changed", () => this.render())
    );
    // See OpenTensionsView for why we also listen to vault.modify.
    this.registerEvent(this.app.vault.on("modify", () => this.render()));
    this.registerEvent(this.app.vault.on("rename", () => this.render()));
  }
  async onClose(): Promise<void> {
    if (this.loadingTimer !== null) {
      window.clearInterval(this.loadingTimer);
      this.loadingTimer = null;
    }
  }
  private render(): void {
    const container = this.containerEl.children[1];
    container.empty();
    renderAntinomiaNav(this.plugin, container as HTMLElement, this.leaf);
    renderVaultLabel(container, this.plugin.settings.vaultDisplayName);
    container.createEl("h4", { text: "Contradiction Hunter" });

    // Disclaimer permanente sopra ogni run
    const warn = container.createEl("div");
    warn.setCssStyles({
      background: "rgba(220,53,69,0.08)",
      borderLeft: "3px solid #dc3545",
      padding: "6px 10px",
      marginBottom: "8px",
      borderRadius: "4px",
      fontSize: "0.78em",
      opacity: "0.9",
    });
    warn.setText(
      "⚠ Reflective prompts, not truths. The AI can hallucinate. Do not use to decide in real situations."
    );

    // ---- First-time hint banner ----
    if (!this.plugin.settings.hintsHunterShown) {
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
        "Tip: the Hunter scans open tensions + substrate, and proposes contradictory PAIRS. It does not resolve. Confidence high/medium/low, sorted by quality. × dismisses a false positive (persistent). Below each pair, Elevate/Resolved/Defeated buttons act directly on one of the two notes."
      );
      const dismissBtn = hint.createEl("button", { text: "Got it" });
      dismissBtn.setCssStyles({
        padding: "2px 10px",
        cursor: "pointer",
        fontSize: "0.85em",
      });
      dismissBtn.onclick = async () => {
        this.plugin.settings.hintsHunterShown = true;
        await this.plugin.saveSettings();
        this.render();
      };
    }

    const isLoading = this.loadingStartedAt !== null;

    const toolbar = container.createEl("div");
    toolbar.setCssStyles({ marginBottom: "8px" });
    const runBtn = toolbar.createEl("button", {
      text: isLoading ? "Hunter running..." : "Run Hunter",
    });
    runBtn.setCssStyles({ marginRight: "6px" });
    runBtn.disabled = isLoading;
    // Pass the run button so the token-usage badge attaches inline next to it
    // (same UX as the Title badge), complementing the run-metadata header.
    if (!isLoading) runBtn.onclick = () => this.plugin.runHunter(undefined, runBtn);

    if (isLoading) {
      const elapsed = Math.floor(
        (Date.now() - (this.loadingStartedAt ?? Date.now())) / 1000
      );
      const loadingBox = container.createEl("div");
      loadingBox.setCssStyles({
        padding: "12px",
        marginTop: "8px",
        border: "1px dashed var(--background-modifier-border)",
        borderRadius: "6px",
        textAlign: "center",
      });
      const spinner = loadingBox.createEl("div", { text: "⏳" });
      spinner.setCssStyles({
        fontSize: "1.6em",
        marginBottom: "6px",
      });
      const msg = loadingBox.createEl("div");
      msg.setText(
        `Hunter in corso (${this.loadingNotesCount} note inviate al modello)...`
      );
      msg.setCssStyles({ marginBottom: "4px" });
      const counter = loadingBox.createEl("div");
      counter.setCssStyles({
        fontSize: "0.9em",
        opacity: "0.7",
      });
      counter.setText(`${elapsed}s trascorsi`);

      const stopBtn = loadingBox.createEl("button", { text: "⛔ Stop Hunter" });
      stopBtn.setCssStyles({
        marginTop: "10px",
        padding: "4px 12px",
        cursor: "pointer",
        fontSize: "0.85em",
      });
      stopBtn.title =
        "Stop the running Hunter. (The HTTP request is not interrupted, but the result will be discarded.)";
      stopBtn.onclick = () => {
        this.plugin.abortHunter();
        this.setLoading(false);
      };
      if (this.currentRun) {
        const prev = container.createEl("p");
        prev.setCssStyles({
          fontSize: "0.8em",
          opacity: "0.5",
          marginTop: "12px",
        });
        prev.setText(
          "(Sotto: il run precedente, verra' sovrascritto al termine.)"
        );
      } else return;
    }

    if (!this.currentRun) {
      container.createEl("p", {
        text: "No scan yet. Press 'Run Hunter' or use Ctrl+P.",
      });
      return;
    }

    const meta = this.currentRun.meta;
    const metaEl = container.createEl("p");
    metaEl.setCssStyles({
      fontSize: "0.85em",
      opacity: "0.7",
    });
    let metaTxt = `${meta.timestamp} — examined ${meta.notesExamined}/${meta.totalCandidates} notes in ${meta.durationMs}ms with ${meta.model}`;
    if (meta.inputTokens !== undefined)
      metaTxt += ` (${meta.inputTokens}->${meta.outputTokens} tok)`;
    if (meta.dismissedFiltered > 0)
      metaTxt += ` — ${meta.dismissedFiltered} pairs hidden (already dismissed)`;
    metaEl.setText(metaTxt);
    if (meta.truncated) {
      const warn = container.createEl("p");
      warn.setCssStyles({ color: "var(--text-warning, orange)" });
      warn.setText(
        `Excluded ${meta.totalCandidates - meta.notesExamined} notes (over the limit).`
      );
    }

    // Friction card (PTM): one card for the whole run, above the pairs.
    if (this.plugin.lastFriction) {
      renderFrictionCard(
        container as HTMLElement,
        this.plugin.lastFriction,
        this.plugin.settings.aiFrictionLevel ?? "medium"
      );
    }

    const items = this.currentRun.result.pairs;
    if (items.length === 0) {
      container.createEl("p", {
        text: "No contradictions detected in this run.",
      });
      return;
    }

    const sorted = [...items].sort((a, b) => {
      const ca = CONFIDENCE_ORDER[a.confidence ?? "medium"];
      const cb = CONFIDENCE_ORDER[b.confidence ?? "medium"];
      if (ca !== cb) return ca - cb;
      return a.note_a.localeCompare(b.note_a);
    });

    const list = container.createEl("ol");
    for (const c of sorted) {
      const li = list.createEl("li");
      li.setCssStyles({ marginBottom: "14px" });

      const headerLine = li.createEl("div");
      headerLine.setCssStyles({
        display: "flex",
        alignItems: "center",
        gap: "6px",
        flexWrap: "wrap",
      });

      const confidence = c.confidence ?? "medium";
      const badge = headerLine.createEl("span", { text: confidence });
      badge.setCssStyles({
        fontSize: "0.7em",
        padding: "1px 6px",
        borderRadius: "8px",
        background: CONFIDENCE_COLOR[confidence],
        color: "white",
        fontWeight: "bold",
      });
      badge.title = `Confidence: ${confidence}`;

      this.appendNoteLink(headerLine, c.note_a);
      headerLine.appendText(" ⟷ ");
      this.appendNoteLink(headerLine, c.note_b);

      const dismissBtn = headerLine.createEl("button", { text: "×" });
      dismissBtn.setCssStyles({
        marginLeft: "auto",
        padding: "0 6px",
        cursor: "pointer",
      });
      dismissBtn.title = "Mark as false positive.";
      dismissBtn.onclick = async () => {
        await this.plugin.dismissContradiction(c.note_a, c.note_b);
        if (this.currentRun) {
          this.currentRun.result.pairs =
            this.currentRun.result.pairs.filter(
              (x) =>
                !(
                  (x.note_a === c.note_a && x.note_b === c.note_b) ||
                  (x.note_a === c.note_b && x.note_b === c.note_a)
                )
            );
          this.render();
        }
      };

      const desc = li.createEl("p");
      desc.setCssStyles({
        marginTop: "4px",
        fontStyle: "italic",
      });
      desc.setText(c.description);

      // ---- Per-note action rows (rendered only if the note exists) ----
      this.appendActionRow(li, c.note_a);
      this.appendActionRow(li, c.note_b);
    }
  }

  /**
   * Compact row of action buttons targeting a single note in a contradiction
   * pair. Buttons shown depend on the note's antinomia_type:
   *   - tensione (aperta): ↑ Eleva, ✓ Risolta, × Defeated
   *   - tensione (chiusa) / principio / substrate: × Defeated
   *   - other / missing: nothing
   */
  private appendActionRow(parent: HTMLElement, basename: string): void {
    const file = this.findFileByBasename(basename);
    if (!file) return;
    const fm = readFrontmatter(this.app, file);
    const t = fm?.antinomia_type;
    if (
      t !== TYPE.tension &&
      t !== TYPE.substrate &&
      t !== TYPE.principle
    )
      return;

    const row = parent.createEl("div");
    row.setCssStyles({
      display: "flex",
      alignItems: "center",
      gap: "5px",
      flexWrap: "wrap",
      marginTop: "3px",
      fontSize: "0.78em",
    });

    const labelEl = row.createEl("span");
    labelEl.setCssStyles({
      opacity: "0.65",
      minWidth: "0",
    });
    const shortLabel = (() => {
      const title = humanTitle(this.app, file);
      const max = 22;
      return title.length > max ? title.slice(0, max - 1) + "…" : title;
    })();
    labelEl.setText(`${shortLabel}:`);
    labelEl.title = basename;

    const mkBtn = (text: string, tooltip: string, onclick: () => void) => {
      const b = row.createEl("button", { text });
      b.setCssStyles({
        padding: "1px 6px",
        fontSize: "1em",
        cursor: "pointer",
      });
      b.title = tooltip;
      b.onclick = (e) => {
        e.stopPropagation();
        onclick();
      };
    };

    const isOpenTension = t === TYPE.tension && fm?.status === "open";
    if (isOpenTension) {
      mkBtn("↑ Elevate", "Elevate to principle (opens IF/THEN/GREY form)", () => {
        void this.plugin.openElevateModal(file);
      });
      mkBtn("✓ Resolved", "Mark as resolved", () => {
        void this.plugin.markResolved(file);
      });
    }
    mkBtn("× Defeated", "Archivia come defeated (apre modal motivo)", () => {
      void this.plugin.archiveAsDefeated(file);
    });
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
        void this.app.workspace.getLeaf(false).openFile(file);
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
