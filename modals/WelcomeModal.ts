// Antinomia — first-run welcome modal. Extracted from main.ts (refactor v1.5).

import { App, Modal, Notice } from "obsidian";
import { readFrontmatter } from "../core/frontmatter";
import type AntinomiaPlugin from "../main";
import { VIEW_TYPE_ONBOARDING } from "../core/constants";
import { tensionTemplate } from "../core/templates";
import { NewTensionModal } from "./NewTensionModal";
import { ConfirmModal } from "./ConfirmModal";

export class WelcomeModal extends Modal {
  private plugin: AntinomiaPlugin;
  constructor(app: App, plugin: AntinomiaPlugin) {
    super(app);
    this.plugin = plugin;
  }
  onOpen(): void {
    const { contentEl } = this;
    // Make the modal a bit wider/taller-friendly by setting style on the container
    contentEl.setCssStyles({
      maxHeight: "70vh",
      overflowY: "auto",
      padding: "0 6px",
    });

    contentEl.createEl("h2", { text: "Welcome to Antinomia" });

    // Banner SICUREZZA: cosa Antinomia non e' (sempre visibile, in cima)
    const safety = contentEl.createDiv();
    safety.setCssStyles({
      background: "rgba(220,53,69,0.10)",
      borderLeft: "3px solid #dc3545",
      padding: "10px 12px",
      marginBottom: "12px",
      borderRadius: "4px",
      fontSize: "0.88em",
    });
    safety.createEl("strong", { text: "⚠ What Antinomia is NOT" });
    const safetyP = safety.createEl("p");
    safetyP.setCssStyles({ margin: "6px 0 0 0" });
    safetyP.setText(
      "This tool exists to help you understand the evolution of your own thinking by mapping tensions and contradictions you already carry inside. It is NOT a decision-support system. Do not use it to decide in real situations (work, health, finance, relationships). The pairs the Hunter proposes are prompts for reflection, not truths: the AI model can hallucinate, oversimplify, misinterpret. Any use other than 'personal reflective practice' is improper."
    );

    // Banner Front Matter Title: 3 states
    //   1. not installed → "Install Front Matter Title" button
    //   2. installed but not configured for Antinomia → "Configure FMT" button
    //   3. installed and configured → no banner
    const fmtEnabled = this.plugin.isFrontMatterTitleEnabled();
    const fmtConfigured = this.plugin.isFrontMatterTitleConfiguredForAntinomia();
    if (!fmtEnabled || !fmtConfigured) {
      const banner = contentEl.createDiv();
      banner.setCssStyles({
        background: "rgba(255,193,7,0.12)",
        borderLeft: "3px solid #ffc107",
        padding: "10px 12px",
        marginBottom: "12px",
        borderRadius: "4px",
        fontSize: "0.9em",
      });
      const headerText = !fmtEnabled
        ? "Recommended plugin missing: Front Matter Title"
        : "Front Matter Title not yet configured for Antinomia";
      banner.createEl("strong", { text: headerText });
      const p = banner.createEl("p");
      p.setCssStyles({ margin: "6px 0" });
      p.setText(
        !fmtEnabled
          ? "Without this plugin, the File Explorer shows technical basenames (T-20260530-091416) instead of the human titles of your notes. Antinomia still works, but seeing them is much more convenient."
          : "FMT is installed but doesn't read the `title` frontmatter field yet. One click configures it for Antinomia (Explorer + Graph + Tab features enabled, path = title)."
      );
      const btn = banner.createEl("button", {
        text: !fmtEnabled ? "Install Front Matter Title" : "Configure FMT for Antinomia",
      });
      btn.setCssStyles({
        marginTop: "4px",
        padding: "4px 10px",
        cursor: "pointer",
      });
      btn.onclick = async () => {
        if (!fmtEnabled) {
          // Open the FMT plugin page directly in the community browser
          try {
            window.open(
              "obsidian://show-plugin?id=obsidian-front-matter-title-plugin"
            );
          } catch {
            const setting = (this.app as unknown as {
              setting?: { open?: () => void; openTabById?: (id: string) => void };
            }).setting;
            if (setting?.open) {
              setting.open();
              if (setting.openTabById)
                setting.openTabById("community-plugins");
            }
          }
          return;
        }
        // Smart configure: if FMT was never set up for Antinomia, apply
        // directly. If it has any other configuration, ask for confirmation.
        const fmt = this.plugin.getFrontMatterTitlePlugin();
        const hasCustomSettings =
          fmt?.settings &&
          Object.keys(fmt.settings).length > 0 &&
          JSON.stringify(fmt.settings).length > 50;
        const doConfigure = async (): Promise<void> => {
          await this.plugin.configureFrontMatterTitleForAntinomia();
          // Reopen the welcome modal to refresh the banner
          this.close();
          new WelcomeModal(this.app, this.plugin).open();
        };
        if (hasCustomSettings) {
          new ConfirmModal(
            this.app,
            "Configure Front Matter Title for Antinomia?",
            "This sets the resolver path to \"title\" and enables the Explorer / Graph / Tab features. Any existing FMT settings for these fields will be overwritten. Continue?",
            "Configure",
            () => void doConfigure()
          ).open();
          return;
        }
        await doConfigure();
      };
    }

    const intro = contentEl.createEl("p");
    intro.setText(
      "Antinomia is a Personal Tension Management (PTM) system based on a counterintuitive idea: contradiction is the fundamental unit of thought. You don't build a hierarchy of ideas — you build a map of the tensions that structure how you think."
    );

    contentEl.createEl("h3", { text: "The 5 layers of the system" });

    const layers: Array<{ emoji: string; label: string; desc: string }> = [
      {
        emoji: "🔀",
        label: "Tension",
        desc: "Two positions in conflict (A vs B). The base unit of antinomian thinking.",
      },
      {
        emoji: "📚",
        label: "Substrate",
        desc: "Raw material: quotes, facts, observations, reading notes.",
      },
      {
        emoji: "🧭",
        label: "Principle",
        desc: "An operational IF/THEN rule that emerges from resolving a tension.",
      },
      {
        emoji: "📦",
        label: "Defeated",
        desc: "Archived beliefs (false positives, superseded, elevated to principle).",
      },
      {
        emoji: "📝",
        label: "Meta-note",
        desc: "Reflection on the use of the system itself (user-vault relationship).",
      },
    ];
    const layerList = contentEl.createEl("div");
    layerList.setCssStyles({
      display: "flex",
      flexDirection: "column",
      gap: "8px",
      marginBottom: "16px",
    });
    for (const l of layers) {
      const row = layerList.createEl("div");
      row.setCssStyles({
        padding: "8px 12px",
        background: "var(--background-secondary)",
        borderRadius: "4px",
        borderLeft: "3px solid var(--interactive-accent)",
      });
      const head = row.createEl("div");
      head.setCssStyles({ fontWeight: "bold" });
      head.setText(`${l.emoji} ${l.label}`);
      const d = row.createEl("div");
      d.setCssStyles({
        fontSize: "0.88em",
        opacity: "0.85",
        marginTop: "2px",
      });
      d.setText(l.desc);
    }

    contentEl.createEl("h3", { text: "How it works in practice" });
    const flow = contentEl.createEl("ol");
    flow.setCssStyles({
      lineHeight: "1.6",
      marginBottom: "16px",
    });
    const steps = [
      "Drop in substrate notes (quotes, observations) when you encounter them — '+ New substrate' button or '✨ Free' (AI classifies for you).",
      "When you see a contradiction, record it as a tension (statement A vs statement B).",
      "The Hunter (🔍 icon) scans the vault and finds contradictions even between notes you hadn't linked.",
      "When you understand a tension, elevate it to a principle (IF/THEN/GREY ZONE). The AI can propose the fields.",
      "Defeated beliefs go to the defeated archive as historical memory of what was NOT true.",
    ];
    for (const s of steps) flow.createEl("li", { text: s });

    contentEl.createEl("h3", { text: "An initial tip" });
    const tip = contentEl.createEl("p");
    tip.setCssStyles({
      fontSize: "0.92em",
      opacity: "0.85",
    });
    tip.setText(
      "Don't aim for perfection right away. Dump in raw material (substrate) and poorly-formed tensions. The system improves your formulations over time — the Hunter shows you things you hadn't seen, and mapping presuppositions forces you to make explicit what you take for granted. Antinomia is not a tool to fill up; it is a practice."
    );

    // ---- CTA: Create example vault (only if not already created) ----
    const exampleAlreadyExists = this.app.vault.getMarkdownFiles().some((f) => {
      const fm = readFrontmatter(this.app, f);
      return fm?.antinomia_example === true;
    });
    if (!exampleAlreadyExists) {
      const exBox = contentEl.createEl("div");
      exBox.setCssStyles({
        background: "rgba(13,110,253,0.10)",
        borderLeft: "3px solid #0d6efd",
        padding: "12px 14px",
        marginTop: "20px",
        borderRadius: "4px",
      });
      exBox.createEl("strong", { text: "🚀 Want to explore Antinomia quickly?" });
      const exDesc = exBox.createEl("p");
      exDesc.setCssStyles({
        margin: "6px 0 10px 0",
        fontSize: "0.9em",
      });
      exDesc.setText(
        "Generate the example vault: 21 demo notes (3 tensions + 15 substrate + 1 Design C principle + 1 defeated) with seeded contradictions ready for the Hunter to discover. The EXAMPLE-KEY.md note explains what's there and how to measure the Hunter. You can delete everything with one click anytime."
      );
      const exBtn = exBox.createEl("button", { text: "Create example vault" });
      exBtn.setCssStyles({
        padding: "6px 14px",
        cursor: "pointer",
        background: "var(--interactive-accent)",
        color: "var(--text-on-accent)",
        fontWeight: "600",
      });
      exBtn.title = "Adds 21 demo notes + EXAMPLE-KEY.md. Removable in one click via Settings -> Antinomia -> Delete examples.";
      exBtn.onclick = async () => {
        this.plugin.settings.onboardingCompleted = true;
        await this.plugin.saveSettings();
        this.close();
        await this.plugin.createExampleNotes();
      };
    }

    // ---- Action buttons ----
    const btnRow = contentEl.createEl("div");
    btnRow.setCssStyles({
      display: "flex",
      gap: "8px",
      flexWrap: "wrap",
      marginTop: "20px",
      justifyContent: "flex-end",
    });

    const mkBtn = (text: string, cta: boolean, tooltip: string) => {
      const b = btnRow.createEl("button", { text });
      b.setCssStyles({
        padding: "6px 14px",
        cursor: "pointer",
      });
      if (cta) {
        b.setCssStyles({
          background: "var(--interactive-accent)",
          color: "var(--text-on-accent)",
          fontWeight: "600",
        });
      }
      b.title = tooltip;
      return b;
    };

    const dontShowBtn = mkBtn(
      "Got it, don't show again",
      false,
      "Mark onboarding as completed. You can always reopen it from Ctrl+P -> Antinomia: show welcome."
    );
    dontShowBtn.onclick = async () => {
      this.plugin.settings.onboardingCompleted = true;
      await this.plugin.saveSettings();
      this.close();
      // Also open the checklist so the user has a starting point
      void this.plugin.activateViewExternal(VIEW_TYPE_ONBOARDING);
    };

    const exploreBtn = mkBtn(
      "Explore on my own",
      false,
      "Close the welcome without completing. It will reopen on next launch."
    );
    exploreBtn.onclick = () => {
      this.close();
    };

    const startBtn = mkBtn(
      "Create my first tension (guided)",
      true,
      "Opens the tension creation modal pre-filled with a clear example."
    );
    startBtn.onclick = async () => {
      this.plugin.settings.onboardingCompleted = true;
      await this.plugin.saveSettings();
      this.close();
      // Open the onboarding checklist sidebar so the user has a guide for next steps
      void this.plugin.activateViewExternal(VIEW_TYPE_ONBOARDING);
      // Then open NewTensionModal pre-filled with a worked example
      new NewTensionModal(
        this.app,
        this.plugin,
        (fields, skipped) => {
          if (fields === null && !skipped) return;
          const content = fields
            ? tensionTemplate(fields)
            : tensionTemplate();
          void this.plugin.createNote("T", content);
        },
        {
          title: "Example — Creative solitude vs social correction",
          statementA:
            "Deep creative work requires prolonged solitude. Original ideas are born in silence, away from the noise of others. The presence of others dilutes intuition and pushes toward conformism.",
          statementB:
            "Continuous sharing with other minds corrects errors and prevents thoughts from spinning in circles. Alone, you end up confirming your own biases: the quality of thinking depends on the contradictor.",
        }
      ).open();
      new Notice(
        "This is an example. Edit it, or press Cancel to create your own."
      );
    };
  }
  onClose(): void {
    this.contentEl.empty();
  }
}
