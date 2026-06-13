// onboarding checklist view. Extracted from main.ts (refactor v1.5).

import { ItemView, Notice, TFile, WorkspaceLeaf } from "obsidian";
import type AntinomiaPlugin from "../main";
import { TYPE, VIEW_TYPE_ONBOARDING, VIEW_TYPE_SUBSTRATE_LIST } from "../core/constants";
import { substrateTemplate, tensionTemplate } from "../core/templates";
import { renderVaultLabel } from "../core/utils";
import { renderAntinomiaNav } from "../helpers/renderAntinomiaNav";
import { NewSubstrateModal } from "../modals/NewSubstrateModal";
import { NewTensionModal } from "../modals/NewTensionModal";

export class OnboardingChecklistView extends ItemView {
  private plugin: AntinomiaPlugin;
  constructor(leaf: WorkspaceLeaf, plugin: AntinomiaPlugin) {
    super(leaf);
    this.plugin = plugin;
  }
  getViewType(): string {
    return VIEW_TYPE_ONBOARDING;
  }
  getDisplayText(): string {
    return "Antinomia — guida iniziale";
  }
  getIcon(): string {
    return "list-checks";
  }
  async onOpen(): Promise<void> {
    this.render();
    this.registerEvent(
      this.app.metadataCache.on("changed", () => this.render())
    );
    this.registerEvent(this.app.vault.on("create", () => this.render()));
    this.registerEvent(this.app.vault.on("delete", () => this.render()));
    this.registerEvent(this.app.vault.on("modify", () => this.render()));
    this.registerEvent(this.app.vault.on("rename", () => this.render()));
  }
  async onClose(): Promise<void> {}

  private countByType(type: string): number {
    return this.app.vault.getMarkdownFiles().filter((f) => {
      const fm = this.app.metadataCache.getFileCache(f)?.frontmatter;
      return fm?.antinomia_type === type;
    }).length;
  }

  private firstFileByType(type: string): TFile | null {
    return (
      this.app.vault.getMarkdownFiles().find((f) => {
        const fm = this.app.metadataCache.getFileCache(f)?.frontmatter;
        return fm?.antinomia_type === type;
      }) ?? null
    );
  }

  private hasAnyPresupposti(): boolean {
    return this.app.vault.getMarkdownFiles().some((f) => {
      const fm = this.app.metadataCache.getFileCache(f)?.frontmatter;
      if (fm?.antinomia_type !== TYPE.tension) return false;
      // Quick check: read file via cache (heading only) is async; we use
      // a lightweight heuristic — file body length > some threshold AND
      // metadata cache hints at presence is hard. Skip: rely on user
      // marking via the explicit metadata field instead.
      return false; // We'll detect via body scan in a sync wrapper below
    }) || this.scanBodyForPresupposti();
  }

  /**
   * Sync-ish body scan: uses Obsidian's cachedRead if available.
   * Note: this triggers an async read but render fires often via events,
   * so eventual consistency is fine for an "indicator".
   */
  private presuppostiDetected = false;
  private lastScannedKey = "";
  private scanBodyForPresupposti(): boolean {
    const tensions = this.app.vault.getMarkdownFiles().filter((f) => {
      const fm = this.app.metadataCache.getFileCache(f)?.frontmatter;
      return fm?.antinomia_type === TYPE.tension;
    });
    const key = tensions.map((f) => f.path + f.stat.mtime).join("|");
    if (key !== this.lastScannedKey) {
      this.lastScannedKey = key;
      this.presuppostiDetected = false;
      void Promise.all(
        tensions.map(async (f) => {
          try {
            const raw = await this.app.vault.cachedRead(f);
            // Match "**Presuppositions A:**" followed by non-empty content
            if (
              /\*\*Presuppositions A:\*\*\s+\S/.test(raw) ||
              /\*\*Presuppositions B:\*\*\s+\S/.test(raw)
            ) {
              if (!this.presuppostiDetected) {
                this.presuppostiDetected = true;
                this.render();
              }
            }
          } catch { /* intentionally ignored */ }
        })
      );
    }
    return this.presuppostiDetected;
  }

  private render(): void {
    const container = this.containerEl.children[1];
    container.empty();
    renderAntinomiaNav(this.plugin, container as HTMLElement, this.leaf);
    renderVaultLabel(container, this.plugin.settings.vaultDisplayName);
    container.createEl("h4", { text: "Getting Started" });

    const intro = container.createEl("p");
    intro.setCssStyles({
      fontSize: "0.85em",
      opacity: "0.7",
    });
    intro.setText(
      "Suggested steps to explore Antinomia. The checkmark appears automatically when you complete them. You can close this sidebar at any time — reopen it from Settings or the command palette."
    );

    interface Step {
      id: string;
      label: string;
      desc: string;
      done: boolean;
      actionLabel: string;
      action: () => void | Promise<void>;
    }

    const s = this.plugin.settings;
    const tensions = this.countByType(TYPE.tension);
    const substrates = this.countByType(TYPE.substrate);
    const principles = this.countByType(TYPE.principle);
    const hasPresup = this.scanBodyForPresupposti();

    const steps: Step[] = [
      {
        id: "tension",
        label: "Create your first tension",
        desc: "A contradiction between two positions A and B that bothers you.",
        done: tensions >= 1,
        actionLabel: "Create tension",
        action: () => {
          new NewTensionModal(this.app, this.plugin, (fields, skipped) => {
            if (fields === null && !skipped) return;
            const content = fields
              ? tensionTemplate(fields)
              : tensionTemplate();
            void this.plugin.createNote("T", content);
          }).open();
        },
      },
      {
        id: "substrate",
        label: "Create your first substrate",
        desc: "Raw material: a quote, a fact, a note.",
        done: substrates >= 1,
        actionLabel: "Create substrate",
        action: () => {
          new NewSubstrateModal(this.app, this.plugin, (fields, skipped) => {
            if (fields === null && !skipped) return;
            const content = fields
              ? substrateTemplate(fields)
              : substrateTemplate();
            void this.plugin.createNote("S", content);
          }).open();
        },
      },
      {
        id: "free",
        label: "Try free-form input (✨ AI)",
        desc: "Write any thought: the AI figures out if it's a tension or substrate and extracts the fields.",
        done: s.hasUsedFreeInput,
        actionLabel: "Open",
        action: () => this.plugin.openFreeInputModal(),
      },
      {
        id: "presupposti",
        label: "Map the presuppositions of a tension",
        desc: "Make explicit the epistemic/value assumptions that A and B take for granted.",
        done: hasPresup,
        actionLabel: "Map",
        action: () => {
          const file = this.firstFileByType(TYPE.tension);
          if (!file) {
            new Notice(
              "First create at least one tension (step 1)."
            );
            return;
          }
          void this.plugin.openMapPresupposti(file);
        },
      },
      {
        id: "hunter",
        label: "Run your first Hunter",
        desc: "Scan the vault to find contradictions even between notes you didn't link.",
        done: s.hasRunHunter,
        actionLabel: "Hunter",
        action: () => {
          const candidates = tensions + substrates;
          if (candidates < 2) {
            new Notice(
              "At least 2 notes (open tensions + substrate) are needed for the Hunter."
            );
            return;
          }
          void this.plugin.runHunter();
        },
      },
      {
        id: "elevate",
        label: "Elevate a tension to a principle",
        desc: "Turn a tension into an IF/THEN/GREY operational rule (the AI can propose it).",
        done: principles >= 1,
        actionLabel: "Elevate",
        action: () => {
          const file = this.firstFileByType(TYPE.tension);
          if (!file) {
            new Notice("First create at least one tension.");
            return;
          }
          void this.plugin.openElevateModal(file);
        },
      },
      {
        id: "explore",
        label: "Explore the other sidebars",
        desc: "Open 'list substrate', 'list principles' or 'list defeated archive' to see your vault by layer.",
        done: s.hasOpenedListSidebar,
        actionLabel: "Open lists",
        action: () => {
          void this.plugin.activateViewExternal(VIEW_TYPE_SUBSTRATE_LIST);
        },
      },
    ];

    const completed = steps.filter((x) => x.done).length;
    const progress = container.createEl("p");
    progress.setCssStyles({
      fontWeight: "600",
      marginBottom: "8px",
    });
    progress.setText(`Progresso: ${completed} / ${steps.length}`);

    for (const step of steps) {
      const card = container.createEl("div");
      card.setCssStyles({
        padding: "8px 10px",
        marginBottom: "6px",
        border: "1px solid var(--background-modifier-border)",
        borderRadius: "4px",
      });
      card.setCssStyles({
        background: step.done
          ? "var(--background-modifier-success-hover, var(--background-secondary))"
          : "var(--background-secondary)",
      });
      card.setCssStyles({ opacity: step.done ? "0.7" : "1" });

      const head = card.createEl("div");
      head.setCssStyles({
        display: "flex",
        alignItems: "center",
        gap: "6px",
        fontWeight: "600",
      });
      const icon = head.createEl("span", {
        text: step.done ? "✅" : "⬜",
      });
      icon.setCssStyles({ fontSize: "1.05em" });
      head.createEl("span", { text: step.label });

      const desc = card.createEl("div");
      desc.setCssStyles({
        fontSize: "0.82em",
        opacity: "0.75",
        margin: "4px 0 6px 22px",
      });
      desc.setText(step.desc);

      if (!step.done) {
        const btnRow = card.createEl("div");
        btnRow.setCssStyles({ marginLeft: "22px" });
        const goBtn = btnRow.createEl("button", { text: step.actionLabel });
        goBtn.setCssStyles({
          padding: "2px 10px",
          fontSize: "0.82em",
          cursor: "pointer",
        });
        goBtn.onclick = (e) => {
          e.stopPropagation();
          void step.action();
        };
      }
    }

    if (completed === steps.length) {
      const done = container.createEl("p");
      done.setCssStyles({
        marginTop: "12px",
        padding: "10px",
        background: "var(--background-modifier-success, var(--background-secondary))",
        borderRadius: "4px",
        textAlign: "center",
        fontWeight: "600",
      });
      done.setText(
        "🎉 You've completed onboarding! From here on it's real work."
      );
    }
  }
}
