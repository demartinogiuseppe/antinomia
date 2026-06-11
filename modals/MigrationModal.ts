// Antinomia — v1.1 -> v1.4 schema migration modal. Three steps: confirm
// (with legacy count + backup notice), live progress, final report.

import { App, Modal, Setting } from "obsidian";
import type AntinomiaPlugin from "../main";
import {
  scanVaultForLegacyNotes,
  migrateVault,
  type MigrationReport,
} from "../flows/migration";

export class MigrationModal extends Modal {
  private plugin: AntinomiaPlugin;
  private legacyCount = 0;

  constructor(app: App, plugin: AntinomiaPlugin) {
    super(app);
    this.plugin = plugin;
  }

  async onOpen(): Promise<void> {
    const legacy = await scanVaultForLegacyNotes(this.app);
    this.legacyCount = legacy.length;
    this.renderConfirm();
  }

  onClose(): void {
    this.contentEl.empty();
  }

  private renderConfirm(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h3", { text: "Migrate vault to the v1.4 schema" });

    if (this.legacyCount === 0) {
      contentEl.createEl("p", {
        text: "No legacy v1.1 (Italian schema) notes found — your vault is already on the v1.4 schema. Nothing to do.",
      });
      new Setting(contentEl).addButton((b) =>
        b.setButtonText("Close").setCta().onClick(() => this.close())
      );
      return;
    }

    contentEl.createEl("p", {
      text: `Found ${this.legacyCount} notes with the legacy Italian schema (v1.1.x). Migration will rename frontmatter keys, enum values, and body markers to the v1.4 English schema.`,
    });
    const backup = contentEl.createEl("p");
    backup.setCssStyles({ opacity: "0.85" });
    backup.setText(
      "A complete backup is created first in notes/.antinomia-pre-migration-backup-<timestamp>/. You can undo anytime with 'Antinomia: Restore pre-migration backup'."
    );

    new Setting(contentEl)
      .addButton((b) => b.setButtonText("Cancel").onClick(() => this.close()))
      .addButton((b) =>
        b
          .setButtonText("Run Migration")
          .setCta()
          .onClick(() => void this.runMigration())
      );
  }

  private async runMigration(): Promise<void> {
    this.renderProgress(0, this.legacyCount);
    const report = await migrateVault(this.app, (done, total) =>
      this.renderProgress(done, total)
    );
    this.renderReport(report);
  }

  private renderProgress(done: number, total: number): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h3", { text: "Migrating…" });
    contentEl.createEl("p", { text: `Migrating ${done} of ${total}…` });
    const track = contentEl.createEl("div");
    track.setCssStyles({
      height: "8px",
      background: "var(--background-modifier-border)",
      borderRadius: "4px",
      overflow: "hidden",
      marginTop: "8px",
    });
    const fill = track.createEl("div");
    const pct = total > 0 ? Math.round((done / total) * 100) : 100;
    fill.setCssStyles({
      height: "100%",
      width: `${pct}%`,
      background: "var(--interactive-accent)",
      transition: "width 0.1s",
    });
  }

  private renderReport(report: MigrationReport): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h3", { text: "Migration complete" });
    contentEl.createEl("p", {
      text: `Migrated ${report.migrated} notes (${report.fmKeysChanged} frontmatter keys, ${report.bodyMarkersChanged} body markers updated). ${report.skipped} skipped (already v1.4). ${report.failed} failed.`,
    });
    if (report.backupPath) {
      const b = contentEl.createEl("p");
      b.setCssStyles({
        fontSize: "0.85em",
        opacity: "0.75",
        wordBreak: "break-all",
      });
      b.setText(`Backup at: ${report.backupPath}`);
    }
    const hint = contentEl.createEl("p");
    hint.setCssStyles({
      fontSize: "0.85em",
      opacity: "0.75",
    });
    hint.setText("Undo anytime with 'Antinomia: Restore pre-migration backup (latest)'.");

    new Setting(contentEl).addButton((b) =>
      b.setButtonText("Close").setCta().onClick(() => this.close())
    );
  }
}
