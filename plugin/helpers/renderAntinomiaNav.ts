// sidebar navigation bar renderer. Extracted from main.ts (refactor v1.5).

import { Menu, Notice, TFile, WorkspaceLeaf, setIcon } from "obsidian";
import type AntinomiaPlugin from "../main";
import { TYPE, VIEW_TYPE_AUDIT, VIEW_TYPE_DASHBOARD, VIEW_TYPE_DEFEATED_LIST, VIEW_TYPE_DISMISSED_PAIRS, VIEW_TYPE_GRAPH, VIEW_TYPE_HUNTER_RESULTS, VIEW_TYPE_ONBOARDING, VIEW_TYPE_OPEN_TENSIONS, VIEW_TYPE_PRESUPPOSITIONS_MAP, VIEW_TYPE_PRINCIPLES_LIST, VIEW_TYPE_SUBSTRATE_LIST, VIEW_TYPE_UNCLASSIFIED } from "../core/constants";
import { substrateTemplate, tensionTemplate } from "../core/templates";
import { FreeInputModal } from "../modals/FreeInputModal";
import { GuidanceModal } from "../modals/GuidanceModal";
import { NewSubstrateModal } from "../modals/NewSubstrateModal";
import { NewTensionModal } from "../modals/NewTensionModal";
import { NotePickerModal } from "../modals/NotePickerModal";
import { TutorialModal } from "../modals/TutorialModal";
import { runYouTubeConceptIngest } from "../flows/youtubeFetch";
import { WelcomeModal } from "../modals/WelcomeModal";

export function renderAntinomiaNav(
  plugin: AntinomiaPlugin,
  container: HTMLElement,
  leaf: WorkspaceLeaf
): void {
  const nav = container.createDiv({ cls: "antinomia-nav" });
  nav.style.cssText =
    "display:flex; gap:4px; padding:6px 8px; border-bottom:1px solid var(--background-modifier-border); flex-wrap:wrap; align-items:center; background:var(--background-secondary); flex-shrink:0;";

  // View che vogliono il main editor area (wide). Le altre vanno in sidebar destra.
  const WIDE_VIEWS = new Set<string>([VIEW_TYPE_GRAPH, VIEW_TYPE_AUDIT]);

  const goTo = (viewType: string): void => {
    const leafType: "tab" | "right" = WIDE_VIEWS.has(viewType) ? "tab" : "right";
    void plugin.activateView(viewType, leafType);
  };

  const mkBtn = (label: string, onClick: () => void): HTMLButtonElement => {
    const btn = nav.createEl("button", { text: label });
    btn.style.cssText =
      "font-size:0.8em; padding:3px 8px; cursor:pointer; background:transparent; border:1px solid var(--background-modifier-border); border-radius:4px;";
    btn.onclick = onClick;
    return btn;
  };

  const mkMenuBtn = (
    label: string,
    buildMenu: (m: Menu) => void
  ): HTMLButtonElement => {
    const btn = nav.createEl("button", { text: label });
    btn.style.cssText =
      "font-size:0.8em; padding:3px 8px; cursor:pointer; background:transparent; border:1px solid var(--background-modifier-border); border-radius:4px;";
    btn.onclick = () => {
      const m = new Menu();
      buildMenu(m);
      const rect = btn.getBoundingClientRect();
      m.showAtPosition({ x: rect.left, y: rect.bottom });
    };
    return btn;
  };

  // -- Dashboard
  mkBtn("📊 Dashboard", () => goTo(VIEW_TYPE_DASHBOARD));

  // -- Note (submenu)
  mkMenuBtn("📝 Notes ▾", (m) => {
    m.addItem((i) =>
      i.setTitle("Open tensions").setIcon("git-pull-request")
        .onClick(() => goTo(VIEW_TYPE_OPEN_TENSIONS))
    );
    m.addItem((i) =>
      i.setTitle("Substrate").setIcon("layers")
        .onClick(() => goTo(VIEW_TYPE_SUBSTRATE_LIST))
    );
    m.addItem((i) =>
      i.setTitle("Principles").setIcon("compass")
        .onClick(() => goTo(VIEW_TYPE_PRINCIPLES_LIST))
    );
    m.addItem((i) =>
      i.setTitle("Defeated archive").setIcon("archive")
        .onClick(() => goTo(VIEW_TYPE_DEFEATED_LIST))
    );
    m.addSeparator();
    m.addItem((i) =>
      i.setTitle("Unclassified notes").setIcon("help-circle")
        .onClick(() => goTo(VIEW_TYPE_UNCLASSIFIED))
    );
  });

  // -- Hunter (submenu)
  mkMenuBtn("🔍 Hunter ▾", (m) => {
    m.addItem((i) =>
      i.setTitle("Hunter results").setIcon("search")
        .onClick(() => goTo(VIEW_TYPE_HUNTER_RESULTS))
    );
    m.addItem((i) =>
      i.setTitle("False positives").setIcon("eye-off")
        .onClick(() => goTo(VIEW_TYPE_DISMISSED_PAIRS))
    );
    m.addSeparator();
    m.addItem((i) =>
      i.setTitle("Run Hunter now").setIcon("play")
        .onClick(() => void plugin.runHunter())
    );
    m.addItem((i) =>
      i.setTitle("Hunter on a note (focus)").setIcon("target")
        .onClick(() => {
          const isCandidate = (f: TFile): boolean => {
            if (f.extension !== "md") return false;
            const fm = plugin.app.metadataCache.getFileCache(f)?.frontmatter;
            const t = fm?.antinomia_type;
            const isOpenTension = t === TYPE.tension && fm?.status === "open";
            return isOpenTension || t === TYPE.substrate;
          };
          // Se la nota attiva e' una tensione aperta o un substrate, usala direttamente
          const active = plugin.app.workspace.getActiveFile();
          if (active && isCandidate(active)) {
            void plugin.runHunter(active);
            return;
          }
          // Altrimenti apri picker filtrato
          const candidates = plugin.app.vault.getMarkdownFiles().filter(isCandidate);
          if (candidates.length === 0) {
            new Notice("No open tensions or substrate in the vault.");
            return;
          }
          const dummy = plugin.app.vault.getMarkdownFiles().find((f) => !isCandidate(f)) ?? candidates[0];
          new NotePickerModal(
            plugin.app, dummy,
            (chosen) => void plugin.runHunter(chosen),
            isCandidate,
            "Choose a note (open tension or substrate) for Hunter focus..."
          ).open();
        })
    );
  });

  // -- Create (submenu)
  mkMenuBtn("➕ Create ▾", (m) => {
    m.addItem((i) =>
      i.setTitle("New tension (guided)").setIcon("git-pull-request")
        .onClick(() => {
          new NewTensionModal(plugin.app, plugin, (fields, skipped) => {
            if (fields === null && !skipped) return;
            const content = fields ? tensionTemplate(fields) : tensionTemplate();
            void plugin.createNote("T", content);
          }).open();
        })
    );
    m.addItem((i) =>
      i.setTitle("New substrate (guided)").setIcon("layers")
        .onClick(() => {
          new NewSubstrateModal(plugin.app, plugin, (fields, skipped) => {
            if (fields === null && !skipped) return;
            const content = fields
              ? substrateTemplate(fields)
              : substrateTemplate();
            void plugin.createNote("S", content);
          }).open();
        })
    );
    m.addSeparator();
    m.addItem((i) =>
      i.setTitle("Free-form input (AI classifies)").setIcon("sparkles")
        // Route through the plugin wrapper which supplies the required
        // `onAnalyzed` callback (otherwise FreeInputModal would crash with
        // "this.onAnalyzed is not a function" when the user clicks Analyze).
        .onClick(() => plugin.openFreeInputModal())
    );
    m.addItem((i) =>
      i.setTitle("Substrate from clipboard").setIcon("clipboard")
        .onClick(() => void plugin.openFreeInputFromClipboard())
    );
    m.addItem((i) =>
      i.setTitle("Substrate from PDF").setIcon("file")
        .onClick(() => void plugin.openSubstrateFromPDF())
    );
    m.addItem((i) =>
      i.setTitle("Substrate from YouTube").setIcon("youtube")
        .onClick(() => void plugin.openSubstrateFromYouTube())
    );
    m.addItem((i) =>
      i.setTitle("Substrate from YouTube — extract concepts (AI)").setIcon("sparkles")
        .onClick(() => void runYouTubeConceptIngest(plugin))
    );
  });

  // -- Graph (custom)
  mkBtn("🕸 Graph", () => goTo(VIEW_TYPE_GRAPH));

  // -- Presuppositions Map (opens in the right sidebar, like its ribbon icon)
  mkBtn("🔑 Presuppositions Map", () => goTo(VIEW_TYPE_PRESUPPOSITIONS_MAP));

  // -- Audit
  mkBtn("🩺 Audit", () => goTo(VIEW_TYPE_AUDIT));

  // -- Guide (submenu)
  mkMenuBtn("❓ Guide ▾", (m) => {
    m.addItem((i) =>
      i.setTitle("Getting Started checklist").setIcon("list-checks")
        .onClick(() => goTo(VIEW_TYPE_ONBOARDING))
    );
    m.addItem((i) =>
      i.setTitle("Key concepts tutorial").setIcon("book-open")
        .onClick(() => new TutorialModal(plugin.app).open())
    );
    m.addItem((i) =>
      i.setTitle("Welcome (restart)").setIcon("hand")
        .onClick(() => new WelcomeModal(plugin.app, plugin).open())
    );
    m.addSeparator();
    m.addItem((i) =>
      i.setTitle("Tell me what to do").setIcon("compass")
        .onClick(() => new GuidanceModal(plugin.app, plugin).open())
    );
  });

  // -- Spacer + Settings
  const spacer = nav.createDiv();
  spacer.style.flex = "1";

  const settingsBtn = mkBtn("⚙", () => {
    const setting = (plugin.app as any).setting;
    if (setting && typeof setting.open === "function") {
      setting.open();
      if (typeof setting.openTabById === "function") {
        setting.openTabById(plugin.manifest.id);
      }
    }
  });
  settingsBtn.title = "Open Antinomia settings";
}
