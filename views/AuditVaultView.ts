// audit vault view. Extracted from main.ts (refactor v1.5).

import { ItemView, TFile, WorkspaceLeaf } from "obsidian";
import type AntinomiaPlugin from "../main";
import { TYPE, VIEW_TYPE_AUDIT } from "../core/constants";
import { humanTitle, readFrontmatter } from "../core/frontmatter";
import { renderVaultLabel } from "../core/utils";
import { renderAntinomiaNav } from "../helpers/renderAntinomiaNav";

export class AuditVaultView extends ItemView {
  private plugin: AntinomiaPlugin;
  // Cached body scan results (async); recomputed via key.
  private bodyCache: Map<string, string> = new Map();
  private bodyCacheKey = "";
  constructor(leaf: WorkspaceLeaf, plugin: AntinomiaPlugin) {
    super(leaf);
    this.plugin = plugin;
  }
  getViewType(): string {
    return VIEW_TYPE_AUDIT;
  }
  getDisplayText(): string {
    return "Antinomia — Audit";
  }
  getIcon(): string {
    return "shield-alert";
  }
  async onOpen(): Promise<void> {
    await this.refreshBodyCache();
    this.render();
    this.registerEvent(
      this.app.metadataCache.on("changed", () => this.render())
    );
    this.registerEvent(this.app.vault.on("modify", () => this.refreshAndRender()));
    this.registerEvent(this.app.vault.on("create", () => this.refreshAndRender()));
    this.registerEvent(this.app.vault.on("delete", () => this.refreshAndRender()));
    this.registerEvent(this.app.vault.on("rename", () => this.refreshAndRender()));
  }
  async onClose(): Promise<void> {}

  private async refreshAndRender(): Promise<void> {
    await this.refreshBodyCache();
    this.render();
  }

  private async refreshBodyCache(): Promise<void> {
    const files = this.app.vault.getMarkdownFiles().filter((f) => {
      const fm = readFrontmatter(this.app, f);
      return fm?.antinomia_type;
    });
    const key = files.map((f) => f.path + ":" + f.stat.mtime).join("|");
    if (key === this.bodyCacheKey) return;
    this.bodyCacheKey = key;
    this.bodyCache.clear();
    await Promise.all(
      files.map(async (f) => {
        try {
          const raw = await this.app.vault.cachedRead(f);
          this.bodyCache.set(f.path, raw);
        } catch { /* intentionally ignored */ }
      })
    );
  }

  private render(): void {
    const container = this.containerEl.children[1];
    container.empty();
    renderAntinomiaNav(this.plugin, container as HTMLElement, this.leaf);
    renderVaultLabel(container, this.plugin.settings.vaultDisplayName);
    container.createEl("h4", { text: "Vault audit" });

    const desc = container.createEl("p");
    desc.setCssStyles({
      fontSize: "0.85em",
      opacity: "0.7",
    });
    desc.setText(
      "Health report: incomplete or malformed Antinomia notes. Click an issue to open the note and fix it."
    );

    const files = this.app.vault.getMarkdownFiles();
    const fmOf = (f: TFile) =>
      readFrontmatter(this.app, f);

    interface Issue {
      file: TFile;
      label: string;
    }

    // --- Categories ---
    const cat = {
      tensionMissingA: [] as Issue[],
      tensionMissingB: [] as Issue[],
      tensionNoPresupposti: [] as Issue[],
      principleNoIfThen: [] as Issue[],
      defeatedNoMotivo: [] as Issue[],
      noTitle: [] as Issue[],
      brokenWikilinks: [] as Issue[],
    };

    const hasContentAfter = (body: string, marker: RegExp): boolean => {
      const m = body.match(marker);
      if (!m) return false;
      const after = m[1] ?? "";
      return after.trim().length > 0;
    };

    for (const f of files) {
      const fm = fmOf(f);
      const tipo = fm?.antinomia_type;
      if (!tipo) continue;
      const body = this.bodyCache.get(f.path) ?? "";

      // No title (frontmatter `titolo` missing/empty AND no first heading)
      const explicitTitle =
        typeof fm?.title === "string" && fm.title.trim();
      const cache = this.app.metadataCache.getFileCache(f);
      const firstHeading = cache?.headings?.[0]?.heading;
      if (!explicitTitle && !firstHeading) {
        cat.noTitle.push({ file: f, label: f.basename });
      }

      if (tipo === TYPE.tension) {
        if (
          !hasContentAfter(body, /-\s*\*\*A \(base\):\*\*\s*([^\n]*)/)
        ) {
          cat.tensionMissingA.push({ file: f, label: humanTitle(this.app, f) });
        }
        if (
          !hasContentAfter(body, /-\s*\*\*B \(base\):\*\*\s*([^\n]*)/)
        ) {
          cat.tensionMissingB.push({ file: f, label: humanTitle(this.app, f) });
        }
        const presupA = hasContentAfter(
          body,
          /-\s*\*\*Presuppositions A:\*\*\s*([^\n]*)/
        );
        const presupB = hasContentAfter(
          body,
          /-\s*\*\*Presuppositions B:\*\*\s*([^\n]*)/
        );
        if (!presupA && !presupB) {
          cat.tensionNoPresupposti.push({
            file: f,
            label: humanTitle(this.app, f),
          });
        }
      }
      if (tipo === TYPE.principle) {
        // Body should contain compiled IF/THEN, not just placeholder
        const stillPlaceholder =
          body.includes("IF [condizione A] -> [esito X]") ||
          body.includes("IF [condizione B] -> [esito Y]");
        if (stillPlaceholder) {
          cat.principleNoIfThen.push({
            file: f,
            label: humanTitle(this.app, f),
          });
        }
      }
      if (tipo === TYPE.defeated) {
        if (!fm?.motive) {
          cat.defeatedNoMotivo.push({
            file: f,
            label: humanTitle(this.app, f),
          });
        }
      }
    }

    // ---- Render sections ----
    const sections: Array<{
      title: string;
      issues: Issue[];
      suggestion: string;
    }> = [
      {
        title: "Tensions missing statement A",
        issues: cat.tensionMissingA,
        suggestion: "Open and fill the 'A (base):' field.",
      },
      {
        title: "Tensions missing statement B",
        issues: cat.tensionMissingB,
        suggestion: "Open and fill the 'B (base):' field.",
      },
      {
        title: "Tensions without mapped presuppositions",
        issues: cat.tensionNoPresupposti,
        suggestion:
          "Use the 'Presuppositions' button on the tension card (the AI can propose them too).",
      },
      {
        title: "Principles with uncompiled IF/THEN/GREY template",
        issues: cat.principleNoIfThen,
        suggestion:
          "The principle still has '[condition A]' / '[outcome X]' as placeholders. Go fill them in.",
      },
      {
        title: "Defeated without motive",
        issues: cat.defeatedNoMotivo,
        suggestion:
          "Open the note and add the 'motive:' field in the frontmatter (false_positive / elevated / genuinely_defeated).",
      },
      {
        title: "Notes without human title",
        issues: cat.noTitle,
        suggestion:
          "Use 'Antinomia: set note title' or add 'title:' in the frontmatter.",
      },
    ];

    const totalIssues = sections.reduce((sum, s) => sum + s.issues.length, 0);
    const summary = container.createEl("p");
    summary.setCssStyles({
      fontWeight: "600",
      marginBottom: "10px",
    });
    if (totalIssues === 0) {
      summary.setCssStyles({ color: "var(--text-success, var(--text-accent))" });
      summary.setText("✅ No issues found. Vault is healthy.");
      return;
    }
    summary.setText(`${totalIssues} total issues across ${sections.filter((s) => s.issues.length > 0).length} categories.`);

    for (const sec of sections) {
      if (sec.issues.length === 0) continue;
      const box = container.createEl("div");
      box.setCssStyles({
        marginBottom: "12px",
        padding: "8px 10px",
        background: "var(--background-secondary)",
        borderLeft: "3px solid var(--text-warning, var(--text-accent))",
        borderRadius: "4px",
      });

      const head = box.createEl("div");
      head.setCssStyles({
        fontWeight: "600",
        marginBottom: "4px",
      });
      head.setText(`${sec.title} (${sec.issues.length})`);

      const tip = box.createEl("div");
      tip.setCssStyles({
        fontSize: "0.78em",
        opacity: "0.7",
        marginBottom: "6px",
      });
      tip.setText(sec.suggestion);

      const list = box.createEl("ul");
      list.setCssStyles({
        paddingLeft: "20px",
        fontSize: "0.85em",
        margin: "0",
      });
      for (const issue of sec.issues) {
        const li = list.createEl("li");
        const a = li.createEl("a", { text: issue.label, href: "#" });
        a.setCssStyles({ cursor: "pointer" });
        a.title = issue.file.basename;
        a.onclick = (e) => {
          e.preventDefault();
          void this.app.workspace.getLeaf(false).openFile(issue.file);
        };
      }
    }
  }
}
