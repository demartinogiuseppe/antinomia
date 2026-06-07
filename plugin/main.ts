import cytoscape from "cytoscape";
// @ts-ignore — cytoscape-fcose has no types
import fcose from "cytoscape-fcose";
cytoscape.use(fcose as any);

import {
  App,
  FuzzySuggestModal,
  ItemView,
  Menu,
  Modal,
  Notice,
  Plugin,
  PluginSettingTab,
  Setting,
  TFile,
  WorkspaceLeaf,
  moment,
  requestUrl,
} from "obsidian";

import type {
  Profile,
  GraphColors,
  BackendPreset,
  TutorialStep,
  PdfExtractResult,
  ClassifyResult,
  TitleProposal,
  PresuppostiFields,
  PdfConcept,
  PdfConceptsResult,
  AIUsageMeta,
  FreeInputAnalysis,
  HunterConfidence,
  HunterContradiction,
  HunterResult,
  HunterRunMetadata,
  HunterRun,
  DefeatedSubmit,
  TensionFields,
  SubstrateFields,
  PrincipleFields,
  GraphFilters,
  ClaudeResponse,
} from "./core/types";

import {
  FOLDER,
  TYPE,
  VIEW_TYPE_OPEN_TENSIONS,
  VIEW_TYPE_HUNTER_RESULTS,
  VIEW_TYPE_DISMISSED_PAIRS,
  VIEW_TYPE_SUBSTRATE_LIST,
  VIEW_TYPE_PRINCIPLES_LIST,
  VIEW_TYPE_DEFEATED_LIST,
  VIEW_TYPE_ONBOARDING,
  VIEW_TYPE_DASHBOARD,
  VIEW_TYPE_AUDIT,
  VIEW_TYPE_GRAPH,
  VIEW_TYPE_UNCLASSIFIED,
  GRAPH_STYLE_PRESETS,
  DEFAULT_GRAPH_FILTERS,
  LAYER_COLORS,
  LAYER_SHAPES,
} from "./core/constants";

import {
  todayISO,
  timestampId,
  ensureFolder,
  truncate,
  extractYouTubeId,
  decodeHtmlEntities,
  alphabeticOwner,
  renderVaultLabel,
} from "./core/utils";

import {
  stripFrontmatter,
  yamlQuote,
  humanTitle,
} from "./core/frontmatter";

import {
  tensionTemplate,
  substrateTemplate,
  principleBodyTemplate,
} from "./core/templates";

import { DEFAULT_SETTINGS, type AntinomiaSettings } from "./core/settings";

import {
  CLASSIFY_SYSTEM,
  TITLE_SYSTEM,
  PRESUPPOSTI_SYSTEM,
  EXTRACT_CONCEPTS_SYSTEM,
  FREE_INPUT_SYSTEM,
  PRINCIPLE_SYSTEM,
  HUNTER_SYSTEM,
} from "./ai/prompts";

import {
  normalizeJsonQuotes,
  extractJson,
  parseAIResponse,
  parseTitleFromAIResponse,
} from "./ai/parseResponse";

import { callAI } from "./ai/callAI";

import {
  notifyAIUsage,
  renderUsageMetaBanner,
  ErrorAckModal,
  showErrorModal,
} from "./ai/notifyUsage";

// Antinomia V1 — Step 5e: guided creation modals + human titles + Hunter v2.1
//
// Design invariants (do not violate without explicit user reconfirmation):
//   - Layer of a note = `antinomia_type` frontmatter ONLY. Files never move.
//   - Hunter IDENTIFIES contradictions, does NOT propose resolutions.
//   - AI calls only on explicit user action (no background AI).
//   - Backend pluggable (Anthropic cloud / LM Studio / custom).
//   - Modals for new tension/substrate are opt-out: "Salta e apri nota vuota"
//     button lets the savvy user bypass and write directly in markdown.

const BACKEND_PRESETS: BackendPreset[] = [
  {
    id: "anthropic",
    label: "Anthropic Cloud",
    baseUrl: "https://api.anthropic.com",
    defaultModel: "claude-sonnet-4-6",
    defaultKey: "",
    helpKey: "Create the key at console.anthropic.com.",
  },
  {
    id: "groq",
    label: "Groq Cloud (free tier)",
    baseUrl: "https://api.groq.com/openai/v1",
    defaultModel: "llama-3.3-70b-versatile",
    defaultKey: "",
    helpKey: "Free tier with generous rate limits. Create the key at console.groq.com.",
  },
  {
    id: "openai",
    label: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-4o-mini",
    defaultKey: "",
    helpKey: "Create the key at platform.openai.com (paid, $5 credit on new accounts).",
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    defaultModel: "meta-llama/llama-3.1-8b-instruct:free",
    defaultKey: "",
    helpKey: "Aggregator with some free models. Create the key at openrouter.ai.",
  },
  {
    id: "lmstudio",
    label: "LM Studio (local, free)",
    baseUrl: "http://localhost:1234/v1",
    defaultModel: "qwen/qwen3.5-9b",
    defaultKey: "lmstudio",
    helpKey: "LM Studio ignores the key but the plugin requires it.",
  },
  {
    id: "ollama",
    label: "Ollama (local, free)",
    baseUrl: "http://localhost:11434/v1",
    defaultModel: "llama3.2",
    defaultKey: "ollama",
    helpKey: "Ollama ignores the key but the plugin requires it.",
  },
];

const MODEL_PRESETS: Array<{ id: string; label: string }> = [
  { id: "claude-sonnet-4-6", label: "Sonnet 4.6 (Anthropic)" },
  { id: "claude-opus-4-6", label: "Opus 4.6 (Anthropic)" },
  { id: "claude-haiku-4-5-20251001", label: "Haiku 4.5 (Anthropic)" },
  { id: "llama-3.3-70b-versatile", label: "Llama 3.3 70B (Groq, free)" },
  { id: "llama-3.1-8b-instant", label: "Llama 3.1 8B (Groq, free, faster)" },
  { id: "mixtral-8x7b-32768", label: "Mixtral 8x7B (Groq, free)" },
  { id: "gpt-4o-mini", label: "GPT-4o mini (OpenAI)" },
  { id: "gpt-4o", label: "GPT-4o (OpenAI)" },
  { id: "meta-llama/llama-3.1-8b-instruct:free", label: "Llama 3.1 8B free (OpenRouter)" },
  { id: "qwen/qwen3.5-9b", label: "Qwen 3.5 9B (LM Studio)" },
];

function detectBackend(baseUrl: string): string {
  const u = baseUrl.toLowerCase();
  if (u.includes("anthropic.com")) return "anthropic";
  if (u.includes("groq.com")) return "groq";
  if (u.includes("openai.com")) return "openai";
  if (u.includes("openrouter.ai")) return "openrouter";
  if (u.includes("localhost:1234") || u.includes("127.0.0.1:1234"))
    return "lmstudio";
  if (u.includes("localhost:11434") || u.includes("127.0.0.1:11434"))
    return "ollama";
  return "custom";
}

/**
 * Compact, consistent Notice shown after every successful AI call. Surfaces
 * the token usage and elapsed time so the user can see at a glance how
 * expensive each operation was (cloud cost / local time).
 *
 * If `context` is provided, the Notice becomes CLICKABLE: clicking it opens
 * an `ErrorAckModal` with full details (profile, model, URL, tokens, duration)
 * and a Copy button — useful for sharing/diagnosing without losing the info
 * when the Notice auto-dismisses.
 *
 * Examples:
 *   "Antinomia · Title · ↓ 42 in / ↑ 18 out · 2.1s"
 *   "Antinomia · Hunter · ↓ 1284 in / ↑ 312 out · 14.7s"
 *   "Antinomia · Title · 2.1s"           (when usage unavailable)
 */

/**
 * Render a small info banner at the top of a modal that was pre-filled from
 * an AI call (e.g. NewTensionModal / NewSubstrateModal after a Free input
 * classification). Shows operation, tokens, and duration; click opens the
 * full ErrorAckModal-style details view.
 *
 * The banner persists for as long as the parent modal stays open — fixing
 * the UX hole where the badge attached to the Free input button vanished
 * the instant that modal closed to spawn the next one.
 */

/**
 * Persistent error modal — replaces transient Notices for errors that the
 * user needs to actually read and acknowledge (failed AI calls, unreachable
 * backends, unparseable responses). Shows a clear human-readable message
 * plus a collapsible "Technical details" block with the raw error / payload.
 *
 * Use Notices for success/info ("Hunter: 3 pairs in 4s"); use this for
 * errors that require attention.
 */

/**
 * Helper: show a persistent error modal anywhere in the plugin. Title is
 * always prefixed with "Antinomia — ". Use for AI errors, network failures,
 * unparseable responses, missing config.
 */

/**
 * Modal to edit an AI profile (name, baseUrl, apiKey, model). Has a Backend
 * preset dropdown at the top that quickly populates the standard endpoints.
 */
class ProfileEditModal extends Modal {
  private current: Profile;
  constructor(
    app: App,
    initialProfile: Profile,
    private onSubmit: (saved: Profile | null) => void
  ) {
    super(app);
    // shallow clone so we don't mutate the original until saved
    this.current = { ...initialProfile };
  }
  onOpen(): void {
    const { contentEl } = this;
    contentEl.createEl("h3", { text: "Edit AI profile" });

    const profile = this.current;

    new Setting(contentEl)
      .setName("Backend preset")
      .setDesc("Pre-fills base URL + suggested model.")
      .addDropdown((dd) => {
        for (const p of BACKEND_PRESETS) dd.addOption(p.id, p.label);
        dd.addOption("custom", "Custom / other");
        dd.setValue(detectBackend(profile.baseUrl));
        dd.onChange((presetId) => {
          const preset = BACKEND_PRESETS.find((p) => p.id === presetId);
          if (preset) {
            profile.baseUrl = preset.baseUrl;
            profile.model = preset.defaultModel;
            if (preset.defaultKey && !profile.apiKey) {
              profile.apiKey = preset.defaultKey;
            }
            this.refresh();
          }
        });
      });

    new Setting(contentEl).setName("Name").addText((text) =>
      text
        .setPlaceholder("E.g. Sonnet Cloud, Qwen 14B local, ...")
        .setValue(profile.name)
        .onChange((v) => (profile.name = v))
    );

    new Setting(contentEl).setName("Base URL").addText((text) =>
      text
        .setPlaceholder("https://api.anthropic.com")
        .setValue(profile.baseUrl)
        .onChange(
          (v) => (profile.baseUrl = v.trim().replace(/\/$/, "") || profile.baseUrl)
        )
    );

    new Setting(contentEl).setName("API key").addText((text) =>
      text
        .setPlaceholder("sk-ant-... or lmstudio")
        .setValue(profile.apiKey)
        .onChange((v) => (profile.apiKey = v.trim()))
    );

    new Setting(contentEl)
      .setName("Model")
      .addDropdown((dd) => {
        for (const m of MODEL_PRESETS) dd.addOption(m.id, m.label);
        if (!MODEL_PRESETS.some((m) => m.id === profile.model)) {
          dd.addOption(profile.model, profile.model);
        }
        dd.setValue(profile.model);
        dd.onChange((v) => (profile.model = v));
      });

    new Setting(contentEl)
      .setName("Custom model")
      .setDesc("Free-form string (overrides dropdown). Empty = use dropdown.")
      .addText((text) =>
        text
          .setPlaceholder("exact-model-name")
          .setValue(profile.model)
          .onChange((v) => {
            const t = v.trim();
            if (t) profile.model = t;
          })
      );

    new Setting(contentEl)
      .addButton((b) =>
        b.setButtonText("Cancel").onClick(() => {
          this.onSubmit(null);
          this.close();
        })
      )
      .addButton((b) =>
        b
          .setButtonText("Save")
          .setCta()
          .onClick(() => {
            this.onSubmit(this.current);
            this.close();
          })
      );
  }
  refresh(): void {
    // simple way: close + reopen with updated state
    this.contentEl.empty();
    this.onOpen();
  }
  onClose(): void {
    this.contentEl.empty();
  }
}

/**
 * Welcome modal shown on first launch (when onboardingCompleted is false).
 * Explains Antinomia, the 5 layers, the basic workflow, and offers an
 * entry point: "Crea la mia prima tensione guidata" pre-fills NewTensionModal
 * with a worked example.
 */
class WelcomeModal extends Modal {
  private plugin: AntinomiaPlugin;
  constructor(app: App, plugin: AntinomiaPlugin) {
    super(app);
    this.plugin = plugin;
  }
  onOpen(): void {
    const { contentEl } = this;
    // Make the modal a bit wider/taller-friendly by setting style on the container
    contentEl.style.maxHeight = "70vh";
    contentEl.style.overflowY = "auto";
    contentEl.style.padding = "0 6px";

    contentEl.createEl("h2", { text: "Welcome to Antinomia" });

    // Banner SICUREZZA: cosa Antinomia non e' (sempre visibile, in cima)
    const safety = contentEl.createDiv();
    safety.style.cssText =
      "background:rgba(220,53,69,0.10); border-left:3px solid #dc3545; " +
      "padding:10px 12px; margin-bottom:12px; border-radius:4px; font-size:0.88em;";
    safety.createEl("strong", { text: "⚠ What Antinomia is NOT" });
    const safetyP = safety.createEl("p");
    safetyP.style.margin = "6px 0 0 0";
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
      banner.style.cssText =
        "background:rgba(255,193,7,0.12); border-left:3px solid #ffc107; " +
        "padding:10px 12px; margin-bottom:12px; border-radius:4px; font-size:0.9em;";
      const headerText = !fmtEnabled
        ? "Recommended plugin missing: Front Matter Title"
        : "Front Matter Title not yet configured for Antinomia";
      banner.createEl("strong", { text: headerText });
      const p = banner.createEl("p");
      p.style.margin = "6px 0";
      p.setText(
        !fmtEnabled
          ? "Without this plugin, the File Explorer shows technical basenames (T-20260530-091416) instead of the human titles of your notes. Antinomia still works, but seeing them is much more convenient."
          : "FMT is installed but doesn't read the `title` frontmatter field yet. One click configures it for Antinomia (Explorer + Graph + Tab features enabled, path = title)."
      );
      const btn = banner.createEl("button", {
        text: !fmtEnabled ? "Install Front Matter Title" : "Configure FMT for Antinomia",
      });
      btn.style.cssText = "margin-top:4px; padding:4px 10px; cursor:pointer;";
      btn.onclick = async () => {
        if (!fmtEnabled) {
          // Open the FMT plugin page directly in the community browser
          try {
            (window as any).open(
              "obsidian://show-plugin?id=obsidian-front-matter-title-plugin"
            );
          } catch {
            const setting = (this.app as any).setting;
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
        const fmt = (this.plugin as any).getFrontMatterTitlePlugin?.();
        const hasCustomSettings =
          fmt?.settings &&
          Object.keys(fmt.settings).length > 0 &&
          JSON.stringify(fmt.settings).length > 50;
        if (hasCustomSettings) {
          const ok = confirm(
            "Configure Front Matter Title for Antinomia?\n\n" +
              "This will set:\n" +
              "• Resolver path → `title`\n" +
              "• Features Explorer / Graph / Tab → enabled\n\n" +
              "Any existing FMT settings for these fields will be overwritten. Continue?"
          );
          if (!ok) return;
        }
        await this.plugin.configureFrontMatterTitleForAntinomia();
        // Reopen the welcome modal to refresh the banner
        this.close();
        new WelcomeModal(this.app, this.plugin).open();
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
    layerList.style.display = "flex";
    layerList.style.flexDirection = "column";
    layerList.style.gap = "8px";
    layerList.style.marginBottom = "16px";
    for (const l of layers) {
      const row = layerList.createEl("div");
      row.style.padding = "8px 12px";
      row.style.background = "var(--background-secondary)";
      row.style.borderRadius = "4px";
      row.style.borderLeft = "3px solid var(--interactive-accent)";
      const head = row.createEl("div");
      head.style.fontWeight = "bold";
      head.setText(`${l.emoji} ${l.label}`);
      const d = row.createEl("div");
      d.style.fontSize = "0.88em";
      d.style.opacity = "0.85";
      d.style.marginTop = "2px";
      d.setText(l.desc);
    }

    contentEl.createEl("h3", { text: "How it works in practice" });
    const flow = contentEl.createEl("ol");
    flow.style.lineHeight = "1.6";
    flow.style.marginBottom = "16px";
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
    tip.style.fontSize = "0.92em";
    tip.style.opacity = "0.85";
    tip.setText(
      "Don't aim for perfection right away. Dump in raw material (substrate) and poorly-formed tensions. The system improves your formulations over time — the Hunter shows you things you hadn't seen, and mapping presuppositions forces you to make explicit what you take for granted. Antinomia is not a tool to fill up; it is a practice."
    );

    // ---- CTA: Create example vault (only if not already created) ----
    const exampleAlreadyExists = this.app.vault.getMarkdownFiles().some((f) => {
      const fm = this.app.metadataCache.getFileCache(f)?.frontmatter;
      return fm?.antinomia_example === true;
    });
    if (!exampleAlreadyExists) {
      const exBox = contentEl.createEl("div");
      exBox.style.cssText =
        "background:rgba(13,110,253,0.10); border-left:3px solid #0d6efd; " +
        "padding:12px 14px; margin-top:20px; border-radius:4px;";
      exBox.createEl("strong", { text: "🚀 Want to explore Antinomia quickly?" });
      const exDesc = exBox.createEl("p");
      exDesc.style.margin = "6px 0 10px 0";
      exDesc.style.fontSize = "0.9em";
      exDesc.setText(
        "Generate the example vault: 21 demo notes (3 tensions + 15 substrate + 1 Design C principle + 1 defeated) with seeded contradictions ready for the Hunter to discover. The EXAMPLE-KEY.md note explains what's there and how to measure the Hunter. You can delete everything with one click anytime."
      );
      const exBtn = exBox.createEl("button", { text: "Create example vault" });
      exBtn.style.cssText =
        "padding:6px 14px; cursor:pointer; background:var(--interactive-accent); " +
        "color:var(--text-on-accent); font-weight:600;";
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
    btnRow.style.display = "flex";
    btnRow.style.gap = "8px";
    btnRow.style.flexWrap = "wrap";
    btnRow.style.marginTop = "20px";
    btnRow.style.justifyContent = "flex-end";

    const mkBtn = (text: string, cta: boolean, tooltip: string) => {
      const b = btnRow.createEl("button", { text });
      b.style.padding = "6px 14px";
      b.style.cursor = "pointer";
      if (cta) {
        b.style.background = "var(--interactive-accent)";
        b.style.color = "var(--text-on-accent)";
        b.style.fontWeight = "600";
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

const TUTORIAL_STEPS: TutorialStep[] = [
  {
    title: "1. Tension",
    paragraphs: [
      "A tension captures a contradiction between two positions A and B. The more incompatible they are, the more fertile the tension. The tension is the fundamental unit of antinomian thought — you don't start from 'clean' ideas, you start from conflicts.",
      "A tension is not necessarily resolved: some stay open for years, others get 'elevated' to operational principles, others archived as 'defeated'.",
    ],
    exampleTitle: "Example — Creative solitude",
    exampleLines: [
      "A: Deep creative work requires prolonged solitude.",
      "B: Continuous sharing with others corrects errors and prevents thoughts from spinning in circles.",
    ],
  },
  {
    title: "2. Substrate",
    paragraphs: [
      "A substrate is raw material: a quote, a fact, an observation, a reading note. It is not yet a tension nor a principle.",
      "Substrate notes are the reservoir from which tensions emerge. When the Hunter relates them to existing tensions, you discover contradictions you hadn't seen.",
    ],
    exampleTitle: "Example — Kahneman quote",
    exampleLines: [
      "\"In isolation the brain amplifies confirmation bias. Discussing with a peer reduces errors by 40%.\"",
    ],
  },
  {
    title: "3. Principle",
    paragraphs: [
      "A principle emerges from resolving a tension. It doesn't pick a side — it absorbs both sides as contextual cases.",
      "Standard form: IF/THEN/GREY ZONE. You identify the contexts where A wins and those where B wins. The GREY ZONE is the edge cases where the rule isn't enough.",
    ],
    exampleTitle: "Example — Processes vs judgment",
    exampleLines: [
      "IF [predictable risk, costly errors] -> codified processes, checklists",
      "IF [unique context, distributed local knowledge] -> decentralized judgment, exceptions",
      "GREY ZONE: complex projects where repeatability seems to exist but there is tacit knowledge",
    ],
  },
  {
    title: "4. Defeated",
    paragraphs: [
      "Defeated is the archive of defeated beliefs. They are NOT deleted: they remain as historical memory of what was NOT true.",
      "Three possible motives: 'false_positive' (it was a misjudgment), 'elevated' (it became a principle, link to the replacing principle), 'genuinely_defeated' (the evidence demolished it).",
    ],
    exampleTitle: "Example",
    exampleLines: [
      "Belief: 'Every important decision is better made in solitude.'",
      "Motive: genuinely_defeated (experience showed that decisions deliberated together were better).",
    ],
  },
  {
    title: "5. Presuppositions",
    paragraphs: [
      "Presuppositions are the epistemic / value / metaphysical assumptions that A and B take for granted, often unspoken.",
      "Mapping them makes explicit why A and B cannot coexist without trade-offs. And often it is in the presuppositions that the tension dissolves (or is found to be ill-posed).",
    ],
    exampleTitle: "Example — Creative solitude",
    exampleLines: [
      "Presuppositions A: the isolated individual has access to a better source of knowledge than the social one.",
      "Presuppositions B: individual thought, without external correction, systematically tends toward error.",
    ],
  },
  {
    title: "6. Hunter (Contradiction Hunter)",
    paragraphs: [
      "The Hunter scans open tensions + substrate notes in the vault and proposes contradictory PAIRS. The system's real value: it finds contradictions you had NOT seen.",
      "Important constraint: the Hunter IDENTIFIES, it does not resolve. The resolution is your work (through the dialogue on presuppositions). Having the AI suggest resolutions would destroy the epistemic value of the system.",
      "Pairs have confidence (high/medium/low) and can be dismissed if they are false positives.",
    ],
  },
  {
    title: "7. Graph and links",
    paragraphs: [
      "Obsidian's graph shows the wikilinks between notes. In Antinomia, links represent explicit epistemic relationships: a tension was born from which substrate, a principle derives from which tension, a defeated was replaced by which principle.",
      "When you elevate a tension the plugin writes 'Derived from: [[T-...]]' in the principle's body. When you archive a defeated as 'elevated', it writes 'Replaced by: [[P-...]]'. The 'Link this note to...' command adds bidirectional wikilinks.",
      "The resulting graph is NOT the network of contradictions found by the Hunter — that one is implicit. The graph is the map of connections that YOU have declared.",
    ],
  },
];

/**
 * Reusable yes/no confirmation modal.
 */
class ConfirmModal extends Modal {
  constructor(
    app: App,
    private titleText: string,
    private bodyText: string,
    private confirmLabel: string,
    private onConfirm: () => void
  ) {
    super(app);
  }
  onOpen(): void {
    const { contentEl } = this;
    contentEl.createEl("h3", { text: this.titleText });
    const p = contentEl.createEl("p");
    p.style.lineHeight = "1.5";
    p.setText(this.bodyText);
    new Setting(contentEl)
      .addButton((b) =>
        b.setButtonText("Cancel").onClick(() => this.close())
      )
      .addButton((b) =>
        b
          .setButtonText(this.confirmLabel)
          .setCta()
          .onClick(() => {
            this.close();
            this.onConfirm();
          })
      );
  }
  onClose(): void {
    this.contentEl.empty();
  }
}

/**
 * Context-aware "what should I do next?" modal. Inspects vault + settings
 * flags to suggest the most useful next step, with a "Vai" button.
 */
class GuidanceModal extends Modal {
  private plugin: AntinomiaPlugin;
  constructor(app: App, plugin: AntinomiaPlugin) {
    super(app);
    this.plugin = plugin;
  }
  onOpen(): void {
    const { contentEl } = this;
    contentEl.createEl("h3", { text: "What to do next" });

    const intro = contentEl.createEl("p");
    intro.style.fontSize = "0.9em";
    intro.style.opacity = "0.8";
    intro.setText(
      "Contextual hint based on the current state of your vault."
    );

    const suggestion = this.computeSuggestion();

    const box = contentEl.createEl("div");
    box.style.padding = "14px";
    box.style.marginTop = "12px";
    box.style.marginBottom = "16px";
    box.style.background = "var(--background-secondary)";
    box.style.borderLeft = "3px solid var(--interactive-accent)";
    box.style.borderRadius = "4px";

    const title = box.createEl("div");
    title.style.fontWeight = "600";
    title.style.marginBottom = "6px";
    title.setText(suggestion.headline);

    const body = box.createEl("div");
    body.style.fontSize = "0.9em";
    body.style.lineHeight = "1.5";
    body.setText(suggestion.body);

    const btnRow = contentEl.createEl("div");
    btnRow.style.display = "flex";
    btnRow.style.gap = "8px";
    btnRow.style.justifyContent = "flex-end";
    btnRow.style.marginTop = "12px";

    const closeBtn = btnRow.createEl("button", { text: "Close" });
    closeBtn.style.padding = "6px 12px";
    closeBtn.style.cursor = "pointer";
    closeBtn.onclick = () => this.close();

    if (suggestion.actionLabel && suggestion.action) {
      const goBtn = btnRow.createEl("button", { text: suggestion.actionLabel });
      goBtn.style.padding = "6px 14px";
      goBtn.style.cursor = "pointer";
      goBtn.style.background = "var(--interactive-accent)";
      goBtn.style.color = "var(--text-on-accent)";
      goBtn.style.fontWeight = "600";
      goBtn.onclick = () => {
        this.close();
        suggestion.action!();
      };
    }
  }

  /**
   * Compute a context-aware suggestion based on vault state.
   */
  private computeSuggestion(): {
    headline: string;
    body: string;
    actionLabel?: string;
    action?: () => void;
  } {
    const files = this.app.vault.getMarkdownFiles();
    const countByType = (t: string) =>
      files.filter((f) => {
        const fm = this.app.metadataCache.getFileCache(f)?.frontmatter;
        return fm?.antinomia_type === t;
      }).length;

    const tensions = countByType(TYPE.tension);
    const openTensions = files.filter((f) => {
      const fm = this.app.metadataCache.getFileCache(f)?.frontmatter;
      return fm?.antinomia_type === TYPE.tension && fm?.status === "open";
    }).length;
    const substrates = countByType(TYPE.substrate);
    const principles = countByType(TYPE.principle);
    const totalAntinomia = tensions + substrates + principles + countByType(TYPE.defeated);

    const s = this.plugin.settings;

    // No notes at all
    if (totalAntinomia === 0) {
      return {
        headline: "Empty vault: create your first tension",
        body: "Antinomia starts from a contradiction. Think of a dilemma you have (work, decisions, values) — two positions that both seem true but incompatible. That is the base material.",
        actionLabel: "Create first tension",
        action: () => {
          new NewTensionModal(this.app, this.plugin, (fields, skipped) => {
            if (fields === null && !skipped) return;
            const content = fields ? tensionTemplate(fields) : tensionTemplate();
            void this.plugin.createNote("T", content);
          }).open();
        },
      };
    }

    // 1+ tensioni ma 0 substrate
    if (tensions >= 1 && substrates === 0) {
      return {
        headline: "Add some raw material (substrate)",
        body: "You already have some tensions but no substrate. Substrate (quotes, facts, observations) is the raw material from which new contradictions emerge. The Hunter works much better when it has substrate to cross-reference with tensions.",
        actionLabel: "Create substrate",
        action: () => {
          new NewSubstrateModal(this.app, this.plugin, (fields, skipped) => {
            if (fields === null && !skipped) return;
            const content = fields ? substrateTemplate(fields) : substrateTemplate();
            void this.plugin.createNote("S", content);
          }).open();
        },
      };
    }

    // Hai materiale ma mai lanciato Hunter
    if (totalAntinomia >= 3 && !s.hasRunHunter) {
      return {
        headline: "Run your first Hunter",
        body: `You have ${totalAntinomia} notes in the vault. The Hunter scans open tensions + substrate and identifies contradictory pairs you may not have seen. For local models it takes a few minutes. Nothing destructive, just reading.`,
        actionLabel: "Run Hunter",
        action: () => void this.plugin.runHunter(),
      };
    }

    // You've run Hunter, have open tensions, but no principles
    if (s.hasRunHunter && openTensions >= 1 && principles === 0) {
      return {
        headline: "Consider elevating a tension to a principle",
        body: "You have open tensions and have already run the Hunter. If a tension feels clear enough, elevate it: turn the contradiction into an operational IF/THEN principle. It doesn't mean 'being right', it means 'having understood the contexts'.",
        actionLabel: "Open tensions sidebar",
        action: () => void this.plugin.activateViewExternal(VIEW_TYPE_OPEN_TENSIONS),
      };
    }

    // Several tensions but no presuppositions mapped (heuristic check)
    if (openTensions >= 2) {
      return {
        headline: "Map the presuppositions of a tension",
        body: "The most productive tensions emerge when you make explicit the epistemic/value presuppositions that A and B take for granted. The 'Presuppositions' button on an open tension opens a form with an AI button that proposes a mapping.",
        actionLabel: "Open active tensions",
        action: () => void this.plugin.activateViewExternal(VIEW_TYPE_OPEN_TENSIONS),
      };
    }

    // Mature vault (default fallback)
    return {
      headline: "Keep working with the system",
      body: `Status: ${tensions} tensions (${openTensions} open), ${substrates} substrate, ${principles} principles. The vault is working. When you want an overview of hidden contradictions, run the Hunter again. When you encounter new material, drop in a substrate via '✨ Free' (AI classifies for you).`,
      actionLabel: "Open tensions sidebar",
      action: () => void this.plugin.activateViewExternal(VIEW_TYPE_OPEN_TENSIONS),
    };
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

class TutorialModal extends Modal {
  private currentStep = 0;
  constructor(app: App) {
    super(app);
  }
  onOpen(): void {
    this.render();
  }
  private render(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.style.maxHeight = "70vh";
    contentEl.style.overflowY = "auto";

    const step = TUTORIAL_STEPS[this.currentStep];

    // Progress indicator
    const progress = contentEl.createEl("div");
    progress.style.fontSize = "0.8em";
    progress.style.opacity = "0.6";
    progress.style.marginBottom = "8px";
    progress.setText(
      `Step ${this.currentStep + 1} of ${TUTORIAL_STEPS.length}`
    );

    contentEl.createEl("h2", { text: step.title });

    for (const p of step.paragraphs) {
      const para = contentEl.createEl("p");
      para.style.lineHeight = "1.5";
      para.setText(p);
    }

    if (step.exampleTitle && step.exampleLines && step.exampleLines.length) {
      const box = contentEl.createEl("div");
      box.style.padding = "10px 12px";
      box.style.marginTop = "12px";
      box.style.background = "var(--background-secondary)";
      box.style.borderLeft = "3px solid var(--text-accent)";
      box.style.borderRadius = "4px";
      const exTitle = box.createEl("div");
      exTitle.style.fontWeight = "600";
      exTitle.style.marginBottom = "6px";
      exTitle.setText(step.exampleTitle);
      for (const line of step.exampleLines) {
        const l = box.createEl("div");
        l.style.fontSize = "0.9em";
        l.style.lineHeight = "1.5";
        l.style.marginBottom = "3px";
        l.setText(line);
      }
    }

    // Navigation buttons
    const navRow = contentEl.createEl("div");
    navRow.style.display = "flex";
    navRow.style.gap = "8px";
    navRow.style.justifyContent = "space-between";
    navRow.style.marginTop = "20px";

    const leftGroup = navRow.createEl("div");
    leftGroup.style.display = "flex";
    leftGroup.style.gap = "6px";

    const backBtn = leftGroup.createEl("button", { text: "← Back" });
    backBtn.style.padding = "6px 12px";
    backBtn.style.cursor = "pointer";
    backBtn.disabled = this.currentStep === 0;
    backBtn.onclick = () => {
      if (this.currentStep > 0) {
        this.currentStep--;
        this.render();
      }
    };

    const exitBtn = leftGroup.createEl("button", { text: "Exit" });
    exitBtn.style.padding = "6px 12px";
    exitBtn.style.cursor = "pointer";
    exitBtn.onclick = () => this.close();

    const rightGroup = navRow.createEl("div");
    const isLast = this.currentStep === TUTORIAL_STEPS.length - 1;
    const nextBtn = rightGroup.createEl("button", {
      text: isLast ? "Finish" : "Next →",
    });
    nextBtn.style.padding = "6px 14px";
    nextBtn.style.cursor = "pointer";
    nextBtn.style.background = "var(--interactive-accent)";
    nextBtn.style.color = "var(--text-on-accent)";
    nextBtn.style.fontWeight = "600";
    nextBtn.onclick = () => {
      if (isLast) {
        this.close();
      } else {
        this.currentStep++;
        this.render();
      }
    };
  }
  onClose(): void {
    this.contentEl.empty();
  }
}

class AntinomiaSettingTab extends PluginSettingTab {
  plugin: AntinomiaPlugin;
  constructor(app: App, plugin: AntinomiaPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Antinomia" });

    // Disclaimer permanente sull'uso appropriato dello strumento
    const disclaimer = containerEl.createDiv();
    disclaimer.style.cssText =
      "background:rgba(220,53,69,0.08); border-left:3px solid #dc3545; " +
      "padding:10px 12px; margin:8px 0 16px 0; border-radius:4px; font-size:0.88em;";
    disclaimer.createEl("strong", { text: "⚠ Intended use" });
    const dp = disclaimer.createEl("p");
    dp.style.margin = "6px 0 0 0";
    dp.setText(
      "Antinomia is a personal reflective practice, not a decision-support system. Do not use it to decide in real situations (work, health, finance, relationships). Hunter pairs are prompts, not truths: the AI can hallucinate. Any other use is improper."
    );
    containerEl.createEl("p", {
      text: "AI backends are configurable as profiles. You can have multiple profiles (e.g. LM Studio local + Anthropic Cloud) and switch which one is active, with optional override for the Hunter.",
    });

    // ---- Recommended companion plugin notice ----
    const recBox = containerEl.createEl("div");
    recBox.style.padding = "10px 12px";
    recBox.style.marginBottom = "16px";
    recBox.style.background = "var(--background-secondary)";
    recBox.style.border = "1px solid var(--background-modifier-border)";
    recBox.style.borderLeft = "3px solid var(--interactive-accent)";
    recBox.style.borderRadius = "4px";
    const recTitle = recBox.createEl("div");
    recTitle.style.fontWeight = "bold";
    recTitle.style.marginBottom = "4px";
    recTitle.setText("Recommended plugin: Front Matter Title");
    const recText = recBox.createEl("div");
    recText.style.fontSize = "0.85em";
    recText.style.opacity = "0.85";
    recText.setText(
      "Antinomia notes have timestamp basenames for ID stability. To see the human title also in the File Explorer, install 'Front Matter Title' from the community and configure it to read the 'title' property."
    );
    const fmtEnabledNow = this.plugin.isFrontMatterTitleEnabled();
    const fmtConfiguredNow =
      this.plugin.isFrontMatterTitleConfiguredForAntinomia();
    const fmtBtn = recBox.createEl("button", {
      text: !fmtEnabledNow
        ? "Install Front Matter Title"
        : !fmtConfiguredNow
        ? "Configure FMT for Antinomia"
        : "✓ Front Matter Title configured",
    });
    fmtBtn.style.cssText =
      "margin-top:8px; padding:4px 10px; cursor:pointer; font-size:0.85em;";
    if (fmtEnabledNow && fmtConfiguredNow) {
      fmtBtn.disabled = true;
      fmtBtn.style.opacity = "0.7";
    }
    fmtBtn.onclick = async () => {
      if (!fmtEnabledNow) {
        try {
          (window as any).open(
            "obsidian://show-plugin?id=obsidian-front-matter-title-plugin"
          );
        } catch {
          const setting = (this.app as any).setting;
          if (setting?.open) {
            setting.open();
            if (setting.openTabById) setting.openTabById("community-plugins");
          }
        }
        return;
      }
      if (fmtConfiguredNow) return;
      // Smart configure (see WelcomeModal for the same logic)
      const fmt = (this.plugin as any).getFrontMatterTitlePlugin?.();
      const hasCustomSettings =
        fmt?.settings &&
        Object.keys(fmt.settings).length > 0 &&
        JSON.stringify(fmt.settings).length > 50;
      if (hasCustomSettings) {
        const ok = confirm(
          "Configure Front Matter Title for Antinomia?\n\n" +
            "This will set:\n" +
            "• Resolver path → `title`\n" +
            "• Features Explorer / Graph / Tab → enabled\n\n" +
            "Any existing FMT settings for these fields will be overwritten. Continue?"
        );
        if (!ok) return;
      }
      await this.plugin.configureFrontMatterTitleForAntinomia();
      this.display(); // refresh the settings tab
    };

    new Setting(containerEl)
      .setName("Attachments folder (PDF, images, audio)")
      .setDesc(
        "Creates the 'attachments/' folder and sets it as Obsidian's default for new attachments. Keeps the 'notes/' folder (Antinomia notes) clean of binary files."
      )
      .addButton((b) =>
        b
          .setButtonText("Configure attachments/")
          .onClick(() => void this.plugin.setupAttachmentsFolder())
      );

    new Setting(containerEl)
      .setName("Antinomia vault name")
      .setDesc(
        "Human label shown at the top of sidebars (e.g. 'Philosophy brain', 'Work thinking'). Leave empty to hide."
      )
      .addText((text) =>
        text
          .setPlaceholder("(optional)")
          .setValue(this.plugin.settings.vaultDisplayName)
          .onChange(async (value) => {
            this.plugin.settings.vaultDisplayName = value.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Open Dashboard at startup")
      .setDesc(
        "When Obsidian starts, automatically show the Antinomia Dashboard in the right sidebar (if not already open)."
      )
      .addToggle((t) =>
        t
          .setValue(this.plugin.settings.autoOpenDashboard)
          .onChange(async (v) => {
            this.plugin.settings.autoOpenDashboard = v;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Tension → principle elevation mode")
      .setDesc(
        "split (design C, recommended): creates a new principle + converts the tension into defeated, shows a red edge in the graph. transform: changes type in-place (legacy, no edge)."
      )
      .addDropdown((dd) => {
        dd.addOption("split", "split (design C, default)");
        dd.addOption("transform", "transform (legacy)");
        dd.setValue(this.plugin.settings.elevationMode || "split");
        dd.onChange(async (v) => {
          this.plugin.settings.elevationMode = v === "transform" ? "transform" : "split";
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName("Migrate existing principles")
      .setDesc(
        "For every principle already in the vault that has the '## Origin (tension)' section in its body, create a retroactive defeated. Run once after enabling split."
      )
      .addButton((b) =>
        b.setButtonText("Run migration").onClick(() => void this.plugin.migrateExistingPrinciples())
      );

    new Setting(containerEl)
      .setName("Open Antinomia Graph at startup")
      .setDesc(
        "When Obsidian starts, also open the custom Antinomia graph in a main tab (if not already open)."
      )
      .addToggle((t) =>
        t
          .setValue(this.plugin.settings.autoOpenGraph)
          .onChange(async (v) => {
            this.plugin.settings.autoOpenGraph = v;
            await this.plugin.saveSettings();
          })
      );

    // ------ Stile grafico del Graph View ------
    containerEl.createEl("h3", { text: "Graph View style" });

    new Setting(containerEl)
      .setName("Preset style")
      .setDesc("Change graph palette. Custom = personalized colors below.")
      .addDropdown((dd) => {
        for (const k of Object.keys(GRAPH_STYLE_PRESETS)) dd.addOption(k, k);
        dd.addOption("custom", "custom");
        dd.setValue(this.plugin.settings.graphStyleName || "default");
        dd.onChange(async (v) => {
          this.plugin.settings.graphStyleName = v;
          await this.plugin.saveSettings();
          this.plugin.refreshOpenGraphViews();
          this.display(); // ridisegna per mostrare/nascondere i color picker
        });
      });

    new Setting(containerEl)
      .setName("Spacious layout (experimental)")
      .setDesc(
        "Spread nodes much further apart so edges are less likely to cross unrelated nodes. Slower initial layout, cleaner visual. Toggle off to revert to the standard layout."
      )
      .addToggle((tg) => {
        tg.setValue(!!this.plugin.settings.graphSpaciousLayout);
        tg.onChange(async (v) => {
          this.plugin.settings.graphSpaciousLayout = v;
          await this.plugin.saveSettings();
          this.plugin.refreshOpenGraphViews();
        });
      });

    if ((this.plugin.settings.graphStyleName || "default") === "custom") {
      const cust = this.plugin.settings.graphCustomColors;
      const colorRow = (key: keyof GraphColors, label: string): void => {
        new Setting(containerEl)
          .setName(label)
          .addColorPicker((cp) =>
            cp.setValue(cust[key] || "#888888").onChange(async (v) => {
              (cust as any)[key] = v;
              await this.plugin.saveSettings();
              this.plugin.refreshOpenGraphViews();
            })
          );
      };
      colorRow("tensione_aperta", "Open tensions");
      colorRow("tensione_risolta", "Resolved tensions");
      colorRow("tensione_elevata", "Elevated tensions");
      colorRow("substrate", "Substrate");
      colorRow("principle", "Principles");
      colorRow("defeated", "Defeated");
      colorRow("meta_note", "Meta note");
      colorRow("label", "Text (label)");
      // edge and background use generic color picker but support rgba; standard UI converts
      colorRow("edge", "Edges");
      colorRow("background", "Background");
    }

    new Setting(containerEl)
      .setDesc(
        "Reopen the Antinomia Graph tab after changing style/colors to see them applied."
      );

    containerEl.createEl("h3", { text: "AI Profiles" });

    // Info box su API costose vs locali gratuite
    const apiInfo = containerEl.createDiv();
    apiInfo.style.cssText =
      "background:rgba(13,110,253,0.08); border-left:3px solid #0d6efd; " +
      "padding:10px 12px; margin:4px 0 12px 0; border-radius:4px; font-size:0.86em;";
    apiInfo.createEl("strong", { text: "ℹ AI models: cloud vs local" });
    const aiP = apiInfo.createEl("p");
    aiP.style.margin = "6px 0 0 0";
    aiP.setText(
      "Antinomia uses AI models for the intelligent features (Hunter, propose IF/THEN, presuppositions, classify). Two options:"
    );
    const ul = apiInfo.createEl("ul");
    ul.style.cssText = "margin:6px 0 0 0; padding-left:22px;";
    const li1 = ul.createEl("li");
    li1.innerHTML =
      "<strong>Paid cloud APIs</strong> (Anthropic Claude, OpenAI GPT, Groq, OpenRouter): top quality, per-token cost. Account + API key required.";
    const li2 = ul.createEl("li");
    li2.innerHTML =
      "<strong>Free local models</strong> (LM Studio, Ollama): full privacy, zero cost, variable quality. Requires ~10GB of RAM/VRAM and an initial model download.";
    const aiP2 = apiInfo.createEl("p");
    aiP2.style.margin = "6px 0 0 0";
    aiP2.style.opacity = "0.85";
    aiP2.setText(
      "You can configure multiple profiles and switch them freely (e.g. LM Studio for daily use, Claude only for deep Hunter scans)."
    );

    // List existing profiles
    for (const profile of this.plugin.settings.profiles) {
      const row = new Setting(containerEl)
        .setName(profile.name)
        .setDesc(`${profile.baseUrl}  |  ${profile.model || "(no model)"}`);
      row.addButton((b) =>
        b.setButtonText("Test").onClick(async () => {
          await this.plugin.testConnection(profile.id);
        })
      );
      row.addButton((b) =>
        b.setButtonText("Edit").onClick(() => {
          new ProfileEditModal(this.app, profile, (updated) => {
            if (!updated) return;
            const idx = this.plugin.settings.profiles.findIndex(
              (p) => p.id === profile.id
            );
            if (idx >= 0) {
              this.plugin.settings.profiles[idx] = updated;
              void this.plugin.saveSettings().then(() => this.display());
            }
          }).open();
        })
      );
      row.addButton((b) => {
        b.setButtonText("Delete").onClick(async () => {
          if (this.plugin.settings.profiles.length <= 1) {
            new Notice("You must have at least one profile.");
            return;
          }
          this.plugin.settings.profiles = this.plugin.settings.profiles.filter(
            (p) => p.id !== profile.id
          );
          if (this.plugin.settings.activeProfileId === profile.id) {
            this.plugin.settings.activeProfileId =
              this.plugin.settings.profiles[0].id;
          }
          if (this.plugin.settings.hunterProfileId === profile.id) {
            this.plugin.settings.hunterProfileId = "";
          }
          await this.plugin.saveSettings();
          this.display();
        });
      });
    }

    new Setting(containerEl).addButton((b) =>
      b
        .setButtonText("+ Add profile")
        .setCta()
        .onClick(() => {
          const newProfile: Profile = {
            id: `profile-${Date.now()}`,
            name: "New profile",
            baseUrl: "https://api.anthropic.com",
            apiKey: "",
            model: "claude-sonnet-4-6",
          };
          new ProfileEditModal(this.app, newProfile, async (saved) => {
            if (!saved) return;
            this.plugin.settings.profiles.push(saved);
            await this.plugin.saveSettings();
            this.display();
          }).open();
        })
    );

    new Setting(containerEl)
      .setName("Active profile")
      .setDesc("Default for all AI commands.")
      .addDropdown((dd) => {
        for (const p of this.plugin.settings.profiles) {
          dd.addOption(p.id, p.name);
        }
        dd.setValue(this.plugin.settings.activeProfileId);
        dd.onChange(async (value) => {
          this.plugin.settings.activeProfileId = value;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName("Hunter profile (override)")
      .setDesc(
        "Leave 'use active profile' as default. Override is useful to use a bigger model (e.g. Sonnet cloud) only for the Hunter."
      )
      .addDropdown((dd) => {
        dd.addOption("", "(use active profile)");
        for (const p of this.plugin.settings.profiles) {
          dd.addOption(p.id, p.name);
        }
        dd.setValue(this.plugin.settings.hunterProfileId);
        dd.onChange(async (value) => {
          this.plugin.settings.hunterProfileId = value;
          await this.plugin.saveSettings();
        });
      });

    containerEl.createEl("h3", { text: "Contradiction Hunter" });

    new Setting(containerEl)
      .setName("Hunter reasoning style")
      .setDesc(
        "Concise: short 2-3 sentence descriptions, no exposed reasoning, ~3x faster. Verbose: the model shows its reasoning (useful when learning or debugging)."
      )
      .addDropdown((dd) => {
        dd.addOption("concise", "Concise (recommended)");
        dd.addOption("verbose", "Verbose (to see how it reasons)");
        dd.setValue(this.plugin.settings.hunterReasoningStyle);
        dd.onChange(async (value) => {
          this.plugin.settings.hunterReasoningStyle =
            value as "concise" | "verbose";
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName("Max notes per scan")
      .setDesc("Limited by the model's context window.")
      .addText((text) =>
        text
          .setPlaceholder("20")
          .setValue(String(this.plugin.settings.hunterMaxNotes))
          .onChange(async (value) => {
            const n = parseInt(value, 10);
            if (!isNaN(n) && n > 0 && n <= 500) {
              this.plugin.settings.hunterMaxNotes = n;
              await this.plugin.saveSettings();
            }
          })
      );

    new Setting(containerEl)
      .setName("Max chars per note in prompt")
      .addText((text) =>
        text
          .setPlaceholder("800")
          .setValue(String(this.plugin.settings.hunterNoteBodyLimit))
          .onChange(async (value) => {
            const n = parseInt(value, 10);
            if (!isNaN(n) && n >= 100 && n <= 10000) {
              this.plugin.settings.hunterNoteBodyLimit = n;
              await this.plugin.saveSettings();
            }
          })
      );

    // ---- Onboarding ----
    containerEl.createEl("h3", { text: "Onboarding" });

    const statusText = this.plugin.settings.onboardingCompleted
      ? "completed"
      : "not yet completed";
    const statusEl = containerEl.createEl("p");
    statusEl.style.fontSize = "0.85em";
    statusEl.style.opacity = "0.7";
    statusEl.setText(
      `Current status: onboarding ${statusText}. The welcome modal is shown automatically at launch if onboarding is not completed.`
    );

    new Setting(containerEl)
      .setName("Reopen welcome modal")
      .setDesc(
        "Immediately show the welcome modal with the Antinomia explanation and the 5 layers. Does not change the onboarding status."
      )
      .addButton((b) =>
        b.setButtonText("Open").onClick(() => {
          new WelcomeModal(this.app, this.plugin).open();
        })
      );

    new Setting(containerEl)
      .setName("Open Getting Started guide (checklist)")
      .setDesc(
        "Side sidebar with suggested steps to explore the system. Updates automatically as you complete them."
      )
      .addButton((b) =>
        b.setButtonText("Open checklist").onClick(() => {
          void this.plugin.activateViewExternal(VIEW_TYPE_ONBOARDING);
        })
      );

    new Setting(containerEl)
      .setName("Key concepts tutorial")
      .setDesc(
        "A sequence of 7 mini-cards explaining tension, substrate, principle, defeated, presuppositions, Hunter, graph. Navigate with Back/Next."
      )
      .addButton((b) =>
        b.setButtonText("Open tutorial").onClick(() => {
          new TutorialModal(this.app).open();
        })
      );

    new Setting(containerEl)
      .setName("Contextual hint")
      .setDesc(
        "Shows a hint based on the current vault state (e.g. 'create first tension' if empty, 'run Hunter' if you have material, etc.)."
      )
      .addButton((b) =>
        b.setButtonText("Tell me what to do").onClick(() => {
          new GuidanceModal(this.app, this.plugin).open();
        })
      );

    new Setting(containerEl)
      .setName("Reset sidebar tooltips")
      .setDesc(
        "Re-show the hint banners the next time you open Open Tensions and Contradiction Hunter."
      )
      .addButton((b) =>
        b.setButtonText("Reset hints").onClick(async () => {
          this.plugin.settings.hintsTensionsShown = false;
          this.plugin.settings.hintsHunterShown = false;
          await this.plugin.saveSettings();
          new Notice(
            "Sidebar tooltips reset. The banner will appear next time you open the sidebars."
          );
        })
      );

    new Setting(containerEl)
      .setName("Example vault")
      .setDesc(
        "Creates 21 notes (3 tensions + 15 substrate + 1 defeated + 1 Design C principle) + ESEMPIO-CHIAVE.md in the root with a beta-tester guide. The notes contain real contradictions for the Hunter to discover, plus control noise. All marked antinomia_example: true, removable in one click."
      )
      .addButton((b) =>
        b.setButtonText("Create examples").onClick(() => {
          new ConfirmModal(
            this.app,
            "Create example vault",
            "21 demo notes will be created (3 tensions + 15 substrate + 1 defeated + 1 Design C principle) + ESEMPIO-CHIAVE.md at the vault root. All removable in one click via 'Delete examples'.",
            "Create",
            () => void this.plugin.createExampleNotes()
          ).open();
        })
      )
      .addButton((b) =>
        b
          .setButtonText("Delete examples")
          .setWarning()
          .onClick(() => {
            const count = this.app.vault.getMarkdownFiles().filter((f) => {
              const fm = this.app.metadataCache.getFileCache(f)?.frontmatter;
              return fm?.antinomia_example === true;
            }).length;
            if (count === 0) {
              new Notice("No example notes in the vault.");
              return;
            }
            new ConfirmModal(
              this.app,
              "Delete examples",
              `${count} notes marked antinomia_example: true will be deleted.`,
              "Delete",
              () => void this.plugin.deleteExampleNotes()
            ).open();
          })
      );

    new Setting(containerEl)
      .setName("Reset onboarding")
      .setDesc(
        "Sets onboardingCompleted = false. The welcome modal will be shown automatically on the next Obsidian launch."
      )
      .addButton((b) =>
        b
          .setButtonText("Reset")
          .setWarning()
          .onClick(async () => {
            this.plugin.settings.onboardingCompleted = false;
            await this.plugin.saveSettings();
            new Notice(
              "Onboarding reset. It will appear on next launch (or click 'Open' above to see it now)."
            );
            this.display();
          })
      );
  }
}

// ---------- helpers ----------

/**
 * Normalize single-quoted string values to double-quoted, so that JSON-like
 * output with mixed quotes (common in models that try to handle apostrophes
 * inside Italian text) becomes parseable. Heuristic: only matches single
 * quotes that appear in "value position" (after `:`, `[`, or `,`).
 * Handles `\'` escape inside the string. Skips matches inside already
 * double-quoted strings.
 */



/**
 * Fetch YouTube transcript via Obsidian's requestUrl (bypasses CORS in
 * Desktop). Strategy: download the watch page HTML, find the
 * `captionTracks` array embedded in `ytInitialPlayerResponse`, then
 * download the chosen track's XML (timedtext) and parse the text nodes.
 *
 * Works today, may break if YouTube changes its embedded JSON structure.
 * Returns plain text (whitespace-joined) or null on failure (with Notice).
 */
async function fetchYouTubeTranscript(
  videoIdOrUrl: string,
  preferredLangs: string[] = ["it", "en"]
): Promise<{ text: string; lang: string; videoId: string } | null> {
  const videoId = extractYouTubeId(videoIdOrUrl);
  if (!videoId) {
    new Notice("YouTube URL not recognized.");
    return null;
  }
  let html = "";
  try {
    const res = await requestUrl({
      url: `https://www.youtube.com/watch?v=${videoId}`,
      method: "GET",
      headers: {
        // Pretend to be a regular browser; YouTube serves a different page to bots
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
        "accept-language": "it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7",
      },
      throw: false,
    });
    if (res.status < 200 || res.status >= 300) {
      new Notice(`Video fetch error (HTTP ${res.status}).`);
      return null;
    }
    html = res.text;
  } catch (e) {
    console.error("[Antinomia] fetchYouTubeTranscript page fetch failed", e);
    new Notice(`Network error: ${(e as Error).message}`);
    return null;
  }

  // Find captionTracks JSON array in the HTML
  const captionMatch = html.match(/"captionTracks":(\[.+?\])/);
  if (!captionMatch) {
    new Notice(
      "Transcript not available for this video (no captionTrack)."
    );
    return null;
  }
  let captionTracks: Array<Record<string, unknown>>;
  try {
    // YouTube escapes &amp; as \u0026; normalize before JSON.parse
    const raw = captionMatch[1].replace(/\\u0026/g, "&");
    captionTracks = JSON.parse(raw);
  } catch (e) {
    console.error("[Antinomia] captionTracks parse failed", e, captionMatch[1]);
    new Notice("Error parsing captionTracks (YouTube format changed).");
    return null;
  }

  if (!Array.isArray(captionTracks) || captionTracks.length === 0) {
    new Notice("No transcript available.");
    return null;
  }

  // Pick preferred language, fallback to first track
  const findLang = (lang: string) =>
    captionTracks.find((t) => (t.languageCode ?? t["languageCode"]) === lang);
  let track: Record<string, unknown> | undefined;
  for (const lang of preferredLangs) {
    track = findLang(lang);
    if (track) break;
  }
  if (!track) track = captionTracks[0];

  // Universal decoder for YouTube\'s JSON-embedded Unicode escapes:
  //   \\u0026 -> &, \\u003d -> =, \\u003f -> ?, \\u002f -> /, etc.
  const unescUnicode = (s: string): string =>
    s.replace(/\\u([0-9a-fA-F]{4})/g, (_m, hex) =>
      String.fromCharCode(parseInt(hex, 16))
    );

  const baseUrlRaw = String(track.baseUrl ?? "");
  const baseUrl = unescUnicode(baseUrlRaw);
  const lang = String(track.languageCode ?? "?");
  console.log("[Antinomia] track baseUrl (raw):", baseUrlRaw);
  console.log("[Antinomia] track baseUrl (decoded):", baseUrl);
  console.log("[Antinomia] track lang:", lang);
  if (!baseUrl) {
    new Notice("Track without baseUrl.");
    return null;
  }

  // Try multiple transcript formats. YouTube serves different things to
  // different requests; fmt=json3 is the most stable structured one.
  const formatsToTry: Array<{ url: string; format: "json3" | "srv3" | "xml" }> = [
    { url: baseUrl + "&fmt=json3", format: "json3" },
    { url: baseUrl + "&fmt=srv3", format: "srv3" },
    { url: baseUrl, format: "xml" },
  ];

  const parseLegacyXML = (xml: string): string[] => {
    const lines: string[] = [];
    // Tolerant regex: allow nested tags inside (e.g. <i>...</i>)
    const re = /<text[^>]*>([\s\S]*?)<\/text>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(xml)) !== null) {
      const stripped = m[1].replace(/<[^>]+>/g, "");
      const t = decodeHtmlEntities(stripped).trim();
      if (t) lines.push(t);
    }
    return lines;
  };

  const parseSrv3 = (xml: string): string[] => {
    const lines: string[] = [];
    // SRV3 uses <p t="..." d="...">text or <s>chunks</s></p>
    const re = /<p[^>]*>([\s\S]*?)<\/p>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(xml)) !== null) {
      const stripped = m[1].replace(/<[^>]+>/g, "");
      const t = decodeHtmlEntities(stripped).trim();
      if (t) lines.push(t);
    }
    return lines;
  };

  const parseJson3 = (raw: string): string[] => {
    try {
      const data = JSON.parse(raw) as { events?: Array<{ segs?: Array<{ utf8?: string }> }> };
      const events = data.events ?? [];
      const lines: string[] = [];
      for (const ev of events) {
        if (!ev.segs) continue;
        const txt = ev.segs.map((s) => s.utf8 ?? "").join("");
        const trimmed = txt.trim();
        if (trimmed) lines.push(trimmed);
      }
      return lines;
    } catch {
      return [];
    }
  };

  let lines: string[] = [];
  let chosen: string = "";
  for (const attempt of formatsToTry) {
    let raw = "";
    let status = -1;
    console.log(`[Antinomia] transcript fetching (${attempt.format}):`, attempt.url);
    try {
      const res = await requestUrl({
        url: attempt.url,
        method: "GET",
        headers: {
          "user-agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
          "accept-language": "it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7",
        },
        throw: false,
      });
      status = res.status;
      raw = res.text ?? "";
      console.log(
        `[Antinomia] transcript (${attempt.format}) HTTP ${status}, ${raw.length} bytes, headers:`,
        res.headers
      );
      if (status < 200 || status >= 300) {
        console.warn(
          `[Antinomia] transcript (${attempt.format}) HTTP ${status} -> skip`
        );
        continue;
      }
    } catch (e) {
      console.warn(`[Antinomia] transcript fetch (${attempt.format}) failed`, e);
      continue;
    }
    if (!raw || raw.length < 10) {
      console.warn(
        `[Antinomia] transcript (${attempt.format}) body too short (${raw.length} bytes), trying next`
      );
      continue;
    }
    // Try the corresponding parser
    if (attempt.format === "json3") lines = parseJson3(raw);
    else if (attempt.format === "srv3") lines = parseSrv3(raw);
    else lines = parseLegacyXML(raw);

    console.log(
      `[Antinomia] transcript ${attempt.format}: ${lines.length} lines, ${raw.length} bytes`
    );
    if (lines.length > 0) {
      chosen = attempt.format;
      break;
    }
    // If empty AND raw starts unexpectedly, log a sample for debugging
    if (raw.length > 0 && raw.length < 5000) {
      console.log(`[Antinomia] transcript raw (${attempt.format}):`, raw.slice(0, 500));
    }
  }

  if (lines.length === 0) {
    new Notice(
      "Empty transcript or unrecognized format across all 3 attempts (json3/srv3/xml). See DevTools console for raw data."
    );
    return null;
  }
  console.log(`[Antinomia] transcript parsed via ${chosen}: ${lines.length} lines`);
  return { text: lines.join(" "), lang, videoId };
}

// ---------- AI ----------

/**
 * Detect which API "wire format" a base URL speaks. We support two:
 *  - "anthropic": POST /v1/messages with { system, messages, max_tokens },
 *    header "anthropic-version" — used by api.anthropic.com.
 *  - "openai":    POST /chat/completions with { messages: [{role:"system"}, ...],
 *    max_tokens } — used by OpenAI, Groq, OpenRouter, LM Studio, Ollama, and
 *    any OpenAI-compatible gateway.
 * LM Studio at localhost defaults to OpenAI format too.
 */

// ---------- PDF text extraction via pdfjsLib (bundled in Obsidian) ----------

/**
 * Max characters of PDF text we feed to the AI in a single call (MVP — no
 * chunking yet). PDFs larger than this trigger a warning to the user; we
 * still process the first N characters and skip the rest.
 */
const PDF_TEXT_HARD_CAP_CHARS = 30_000;

/**
 * Extract plain text from a PDF binary using Obsidian's bundled pdfjsLib.
 *
 * pdfjsLib is lazy-loaded by Obsidian — it's only present after the user has
 * opened a PDF at least once in the current session. We check for it and
 * throw a friendly error if missing so we can guide the user.
 *
 * Returns concatenated page text with "\n\n--- Page N ---\n\n" separators
 * (helpful for debugging). Truncated to PDF_TEXT_HARD_CAP_CHARS to keep
 * the AI call cost predictable on very long documents.
 */
async function extractPdfText(
  binary: ArrayBuffer
): Promise<PdfExtractResult> {
  const pdfjsLib = (window as any).pdfjsLib;
  if (!pdfjsLib || typeof pdfjsLib.getDocument !== "function") {
    throw new Error(
      "pdfjs_not_loaded:Obsidian's PDF library is not loaded yet. Open any PDF in Obsidian once (just opening it is enough), then retry."
    );
  }

  const loadingTask = pdfjsLib.getDocument({ data: binary });
  const doc = await loadingTask.promise;
  const pageCount: number = doc.numPages;

  const pageTexts: string[] = [];
  let totalChars = 0;
  let truncated = false;

  for (let p = 1; p <= pageCount; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const pageText = content.items
      .map((it: any) => (typeof it.str === "string" ? it.str : ""))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();

    if (pageText.length === 0) continue;

    if (totalChars + pageText.length > PDF_TEXT_HARD_CAP_CHARS) {
      // Take only what fits, then stop
      const remaining = PDF_TEXT_HARD_CAP_CHARS - totalChars;
      if (remaining > 0) {
        pageTexts.push(`--- Page ${p} (truncated) ---\n${pageText.slice(0, remaining)}`);
        totalChars += remaining;
      }
      truncated = true;
      break;
    }

    pageTexts.push(`--- Page ${p} ---\n${pageText}`);
    totalChars += pageText.length;
  }

  return {
    text: pageTexts.join("\n\n"),
    pageCount,
    truncated,
    totalChars,
  };
}

// ---------- Model capability detection (autoadaptive AI behavior) ----------

/**
 * Identified model "families" we adapt to. Used to pick the right reasoning
 * vocabulary, sensible max_tokens budget per task class, and to warn the
 * user when a heavy reasoning model is used for trivial tasks.
 *
 * "unknown" = safe conservative defaults (no reasoning controls, mid-size
 * token budgets). Add a new family only when its reasoning vocabulary or
 * token-spending profile differs materially from the existing ones.
 */
/**
 * Pure function: classify a model by its name string. Operates on
 * `lowercase(model)` and uses ordered pattern matching — the most specific
 * patterns (e.g. `qwen3-reasoning`) come BEFORE the generic ones
 * (`qwen-instruct`) so they win.
 *
 * This is intentionally heuristic. If a model is misclassified, the user
 * can override `maxTokens` and `disableThinking` explicitly in their call
 * site; the helper is a sensible default, not a contract.
 */

// ---------- prompts ----------





/**
 * Parses a title out of an AI response that may be:
 *   - Clean JSON {"title": "..."}
 *   - JSON wrapped in markdown code fences ```json ... ```
 *   - Reasoning model output with <think>...</think> blocks (Qwen3, DeepSeek-R1)
 *   - Bold/markdown-wrapped labels like **Title:** "..."
 *   - Plain-text labeled "Title: ..." or "Titolo: ..."
 *   - A quoted string anywhere (including smart quotes)
 *   - Plain prose where the first short line is the title
 *
 * Returns the sanitized title (max 7 words / 60 chars), or null if nothing
 * usable can be extracted.
 *
 * Designed to be resilient to local backends (LM Studio / Ollama) and
 * reasoning models which often ignore the JSON-only instruction.
 */









/**
 * Wrap an async operation behind a button: disables it, ticks a live
 * elapsed-seconds counter on the label, restores everything on completion
 * (or error). Used by all "Proponi (AI)" buttons inside modals.
 */
async function withLoadingButton<T>(
  btn: HTMLButtonElement,
  loadingText: string,
  asyncFn: (signal: AbortSignal) => Promise<T>
): Promise<T | null> {
  const original = btn.textContent ?? "";
  btn.disabled = true;
  // Wipe any previous AI usage badge attached as sibling so the user
  // doesn't see stale token counts during the new generation. The badge
  // will be re-inserted by notifyAIUsage when the call completes.
  const prevBadge = btn.parentElement?.querySelector(
    ".antinomia-ai-usage-badge"
  );
  if (prevBadge) prevBadge.remove();
  const t0 = Date.now();
  btn.textContent = `${loadingText} 0s`;
  const interval = window.setInterval(() => {
    const elapsed = Math.floor((Date.now() - t0) / 1000);
    btn.textContent = `${loadingText} ${elapsed}s`;
  }, 1000);

  // Bottone Stop inserito accanto al bottone di loading
  const controller = new AbortController();
  const stopBtn = document.createElement("button");
  stopBtn.textContent = "⛔ Stop";
  stopBtn.style.marginLeft = "6px";
  stopBtn.style.padding = "2px 8px";
  stopBtn.style.fontSize = "0.85em";
  stopBtn.style.cursor = "pointer";
  stopBtn.title = "Ferma la generazione AI in corso.";
  stopBtn.onclick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    controller.abort();
  };
  btn.parentElement?.insertBefore(stopBtn, btn.nextSibling);

  const cleanup = (): void => {
    window.clearInterval(interval);
    btn.disabled = false;
    btn.textContent = original;
    stopBtn.remove();
  };

  try {
    const result = await asyncFn(controller.signal);
    cleanup();
    return result;
  } catch (e) {
    cleanup();
    if ((e as Error).message === "ai_aborted" || controller.signal.aborted) {
      new Notice("AI generation stopped.");
      return null;
    }
    throw e;
  }
}

/**
 * Render a compact, scrollable box showing the tension content (A, B,
 * presupposti). Used by ElevateToPrincipleModal and MapPresuppostiModal so
 * the user can re-read the tension WHILE filling the form, without closing
 * the modal. Empty fields are skipped.
 */
function renderTensionContext(parent: HTMLElement, rawContent: string): void {
  const body = stripFrontmatter(rawContent).trim();
  const extract = (re: RegExp): string =>
    (body.match(re)?.[1] ?? "").trim();
  const aBase = extract(/-\s*\*\*A \(base\):\*\*\s*([^\n]*)/);
  const aOrig = extract(/-\s*\*\*A \(originale\):\*\*\s*([^\n]*)/);
  const bBase = extract(/-\s*\*\*B \(base\):\*\*\s*([^\n]*)/);
  const bOrig = extract(/-\s*\*\*B \(originale\):\*\*\s*([^\n]*)/);
  const presupA = extract(/-\s*\*\*Presuppositions A:\*\*\s*([^\n]*)/);
  const presupB = extract(/-\s*\*\*Presuppositions B:\*\*\s*([^\n]*)/);

  const box = parent.createEl("div");
  box.style.padding = "10px 12px";
  box.style.marginBottom = "14px";
  box.style.background = "var(--background-secondary)";
  box.style.borderLeft = "3px solid var(--text-accent)";
  box.style.borderRadius = "4px";
  box.style.maxHeight = "240px";
  box.style.overflowY = "auto";
  box.style.fontSize = "0.88em";

  const header = box.createEl("div");
  header.style.fontWeight = "bold";
  header.style.marginBottom = "6px";
  header.setText("Origin tension");

  const mkRow = (label: string, value: string) => {
    if (!value) return;
    const r = box.createEl("div");
    r.style.marginBottom = "4px";
    r.style.lineHeight = "1.35";
    const lab = r.createEl("strong");
    lab.setText(`${label}: `);
    r.appendText(value);
  };

  if (aBase) mkRow("A", aBase);
  if (aOrig) mkRow("A (original)", aOrig);
  if (bBase) mkRow("B", bBase);
  if (bOrig) mkRow("B (original)", bOrig);
  if (presupA) mkRow("Presuppositions A", presupA);
  if (presupB) mkRow("Presuppositions B", presupB);

  // If absolutely nothing was extracted, show the whole body as fallback
  if (!aBase && !bBase && !presupA && !presupB) {
    const fallback = box.createEl("pre");
    fallback.style.whiteSpace = "pre-wrap";
    fallback.style.fontSize = "0.85em";
    fallback.style.margin = "0";
    fallback.setText(body.slice(0, 1000));
  }
}



/**
 * Build the Hunter system prompt for a given style. "concise" appends a strict
 * "no reasoning exposed" constraint that typically speeds up the model 2-3x.
 * "verbose" leaves the base prompt as-is so the model can chain-of-thought.
 */
function buildHunterSystem(style: "concise" | "verbose"): string {
  if (style === "verbose") return HUNTER_SYSTEM;
  return (
    HUNTER_SYSTEM +
    `\n\nAdditional constraint: description in 2-3 sentences MAX, straight to the point. NO exposed reasoning, NO phrases like "let's review", "let's consider", "however, let's see if", "although... while...". Go straight to the final conclusion on the contradiction.`
  );
}

const CONFIDENCE_ORDER: Record<HunterConfidence, number> = {
  high: 0,
  medium: 1,
  low: 2,
};
const CONFIDENCE_COLOR: Record<HunterConfidence, string> = {
  high: "var(--color-green, #2ecc71)",
  medium: "var(--color-yellow, #f1c40f)",
  low: "var(--color-orange, #e67e22)",
};

// ---------- modals ----------

class ClassifyConfirmModal extends Modal {
  constructor(
    app: App,
    private current: string,
    private proposed: string,
    private motivazione: string,
    private onConfirm: (apply: boolean) => void
  ) {
    super(app);
  }
  onOpen(): void {
    const { contentEl } = this;
    contentEl.createEl("h3", { text: "Proposed classification" });
    contentEl.createEl("p", {
      text: `Tipo attuale: ${this.current || "(nessuno)"}`,
    });
    contentEl.createEl("p", { text: `Tipo proposto: ${this.proposed}` });
    contentEl.createEl("p").createEl("em", { text: this.motivazione });
    new Setting(contentEl)
      .addButton((b) =>
        b.setButtonText("Reject").onClick(() => {
          this.onConfirm(false);
          this.close();
        })
      )
      .addButton((b) =>
        b
          .setButtonText("Apply")
          .setCta()
          .onClick(() => {
            this.onConfirm(true);
            this.close();
          })
      );
  }
  onClose(): void {
    this.contentEl.empty();
  }
}

class TitleEditModal extends Modal {
  constructor(
    app: App,
    private initialValue: string,
    private headerText: string,
    private hintText: string,
    private onConfirm: (value: string | null) => void,
    // Optional AI-suggest hook. When provided, an extra "Propose title (AI)"
    // button is rendered above the input. It must return the proposed title
    // (string) or null on failure.
    private aiSuggestFn?: () => Promise<string | null>
  ) {
    super(app);
  }
  onOpen(): void {
    const { contentEl } = this;
    contentEl.createEl("h3", { text: this.headerText });
    if (this.hintText) {
      const hint = contentEl.createEl("p");
      hint.style.fontSize = "0.85em";
      hint.style.opacity = "0.7";
      hint.setText(this.hintText);
    }
    let currentValue = this.initialValue;
    const input = contentEl.createEl("input", {
      type: "text",
      value: this.initialValue,
    });
    input.style.width = "100%";
    input.style.padding = "6px";
    input.style.marginBottom = "10px";
    input.addEventListener("input", (e) => {
      currentValue = (e.target as HTMLInputElement).value;
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        this.onConfirm(currentValue.trim() || null);
        this.close();
      }
    });
    setTimeout(() => {
      input.focus();
      input.select();
    }, 0);

    // Optional AI suggestion button
    if (this.aiSuggestFn) {
      const aiBtn = contentEl.createEl("button", {
        text: "Propose title (AI)",
      });
      aiBtn.style.marginBottom = "10px";
      aiBtn.style.padding = "4px 10px";
      aiBtn.style.cursor = "pointer";
      aiBtn.title =
        "Ask the configured AI model to propose a title from the note's content.";
      aiBtn.onclick = async () => {
        const proposed = await withLoadingButton(
          aiBtn,
          "⏳ Generating...",
          () => this.aiSuggestFn!()
        );
        if (proposed) {
          input.value = proposed;
          currentValue = proposed;
          input.focus();
          input.select();
        }
      };
    }

    new Setting(contentEl)
      .addButton((b) =>
        b.setButtonText("Cancel").onClick(() => {
          this.onConfirm(null);
          this.close();
        })
      )
      .addButton((b) =>
        b
          .setButtonText("Save")
          .setCta()
          .onClick(() => {
            this.onConfirm(currentValue.trim() || null);
            this.close();
          })
      );
  }
  onClose(): void {
    this.contentEl.empty();
  }
}

class DefeatedReasonModal extends Modal {
  private result: DefeatedSubmit | null = null;
  private contextFile: TFile;
  constructor(
    app: App,
    contextFile: TFile,
    private onSubmit: (data: DefeatedSubmit | null) => void
  ) {
    super(app);
    this.contextFile = contextFile;
  }
  onOpen(): void {
    const { contentEl } = this;
    contentEl.createEl("h3", { text: "Archive as defeated" });
    contentEl.createEl("p", { text: "Why was it defeated?" });

    let motivo = "false_positive";
    let sostituitaDa: string | null = null;

    // --- Motivo dropdown ---
    new Setting(contentEl).setName("Motive").addDropdown((dd) => {
      dd.addOption("false_positive", "false_positive");
      dd.addOption("elevated", "elevated");
      dd.addOption("genuinely_defeated", "genuinely_defeated");
      dd.setValue(motivo);
      dd.onChange((v) => {
        motivo = v;
        renderSostituitaSection();
      });
    });

    // --- Sostituita_da picker (only shown when motivo == "elevated") ---
    const sostBlock = contentEl.createEl("div");
    sostBlock.style.marginBottom = "10px";

    const labelEl = contentEl.createEl("div");
    labelEl.style.fontSize = "0.85em";
    labelEl.style.opacity = "0.7";
    labelEl.style.marginBottom = "12px";

    const renderSostituitaSection = () => {
      sostBlock.empty();
      labelEl.setText("");
      if (motivo !== "elevated") return;

      new Setting(sostBlock)
        .setName("Replaced by which principle")
        .setDesc(
          "Pick the principle that replaced this note. This closes the tension -> defeated -> principle cycle in the graph."
        )
        .addButton((b) => {
          b.setButtonText(
            sostituitaDa
              ? `Change (current: ${sostituitaDa})`
              : "Pick principle..."
          ).onClick(() => {
            new NotePickerModal(
              this.app,
              this.contextFile,
              (chosen) => {
                sostituitaDa = chosen.basename;
                renderSostituitaSection();
              },
              (f) => {
                const fm = this.app.metadataCache.getFileCache(f)?.frontmatter;
                return fm?.antinomia_type === TYPE.principle;
              },
              "Search for a principle..."
            ).open();
          });
        });

      if (sostituitaDa) {
        labelEl.setText(`Replaced by: [[${sostituitaDa}]]`);
      } else {
        labelEl.setText(
          "(No principle selected — you can still save, replaced_by stays empty.)"
        );
      }
    };
    renderSostituitaSection();

    new Setting(contentEl)
      .addButton((b) =>
        b.setButtonText("Cancel").onClick(() => {
          this.result = null;
          this.close();
        })
      )
      .addButton((b) =>
        b
          .setButtonText("Archive")
          .setCta()
          .onClick(() => {
            this.result = { motivo, replaced_by: sostituitaDa };
            this.close();
          })
      );
  }
  onClose(): void {
    this.contentEl.empty();
    this.onSubmit(this.result);
  }
}

// ---------- templates ----------

/**
 * Modal to compose a new principle (IF/THEN/GREY). Same visual style as
 * NewTensionModal: intro + labeled fields with hints + 3 buttons.
 * Two exit paths:
 *   - "Eleva" -> pass the filled fields to elevateToPrinciple
 *   - "Salta e usa template vuoto" -> elevate with empty placeholders (legacy)
 */
class ElevateToPrincipleModal extends Modal {
  private originBasename: string;
  private plugin: AntinomiaPlugin;
  private file: TFile;
  private tensionRaw: string;
  constructor(
    app: App,
    plugin: AntinomiaPlugin,
    file: TFile,
    tensionRaw: string,
    private onSubmit: (fields: PrincipleFields | null, skipped: boolean) => void
  ) {
    super(app);
    this.plugin = plugin;
    this.file = file;
    this.originBasename = file.basename;
    this.tensionRaw = tensionRaw;
  }
  onOpen(): void {
    const { contentEl } = this;
    contentEl.createEl("h3", { text: "Elevate to principle" });
    const intro = contentEl.createEl("p");
    intro.style.fontSize = "0.9em";
    intro.style.opacity = "0.8";
    intro.setText(
      `You're transforming the tension "${humanTitle(this.app, this.file)}" into an operational principle. Fill the fields below: they will become the new body. The original tension text will be preserved under the "## Origin (tension)" section.`
    );

    // Show the tension content inline (scrollable) so the user can re-read
    // it while filling the IF/THEN/GREY form, without closing the modal.
    renderTensionContext(contentEl, this.tensionRaw);

    let ifA = "";
    let thenA = "";
    let ifB = "";
    let thenB = "";
    let greyZone = "";

    const mkLabel = (text: string) => {
      const l = contentEl.createEl("label", { text });
      l.style.display = "block";
      l.style.marginTop = "12px";
      l.style.fontWeight = "bold";
      return l;
    };
    const mkHint = (text: string) => {
      const h = contentEl.createEl("div", { text });
      h.style.fontSize = "0.8em";
      h.style.opacity = "0.6";
      return h;
    };
    const mkTextarea = (minHeight: string, onInput: (v: string) => void) => {
      const t = contentEl.createEl("textarea");
      t.style.width = "100%";
      t.style.padding = "6px";
      t.style.marginTop = "4px";
      t.style.minHeight = minHeight;
      t.addEventListener("input", (e) => {
        onInput((e.target as HTMLTextAreaElement).value);
      });
      return t;
    };
    const mkInput = (onInput: (v: string) => void) => {
      const i = contentEl.createEl("input", { type: "text" });
      i.style.width = "100%";
      i.style.padding = "6px";
      i.style.marginTop = "4px";
      i.addEventListener("input", (e) => {
        onInput((e.target as HTMLInputElement).value);
      });
      return i;
    };

    mkLabel("IF — condition A");
    mkHint("The condition/context where outcome A applies.");
    const ifAInput = mkInput((v) => (ifA = v));

    mkLabel("THEN — outcome A");
    mkHint("The rule/action/conclusion that applies under condition A.");
    const thenAInput = mkInput((v) => (thenA = v));

    mkLabel("IF — condition B");
    mkHint("The opposite (or complementary) condition/context to A.");
    const ifBInput = mkInput((v) => (ifB = v));

    mkLabel("THEN — outcome B");
    mkHint("The rule/action/conclusion that applies under condition B.");
    const thenBInput = mkInput((v) => (thenB = v));

    mkLabel("GREY ZONE");
    mkHint(
      "Edge cases, ambiguous, where A and B touch. Leave blank if nothing comes to mind right away."
    );
    const greyTextarea = mkTextarea("60px", (v) => (greyZone = v));

    // ---- "Propose IF/THEN (AI)" button ----
    const aiBtn = contentEl.createEl("button", {
      text: "Propose IF/THEN (AI)",
    });
    aiBtn.style.marginTop = "10px";
    aiBtn.style.fontSize = "0.85em";
    aiBtn.style.padding = "4px 12px";
    aiBtn.style.cursor = "pointer";
    aiBtn.title =
      "Asks the AI model to propose the 5 IF/THEN/GREY fields by reading the tension's text.";
    aiBtn.onclick = async (e) => {
      e.preventDefault();
      const proposed = await withLoadingButton(
        aiBtn,
        "⏳ Generating...",
        async (signal) => {
          const raw = await this.app.vault.read(this.file);
          const body = stripFrontmatter(raw).trim();
          const content =
            "I'm elevating this Antinomia tension into an operational IF/THEN/GREY principle. Here is the tension text:\n\n" +
            body;
          return await this.plugin.proposeIfThenFromContent(content, signal, aiBtn);
        }
      );
      if (!proposed) return;
      // Populate the inputs and the local state
      ifAInput.value = proposed.ifA ?? "";
      ifA = proposed.ifA ?? "";
      thenAInput.value = proposed.thenA ?? "";
      thenA = proposed.thenA ?? "";
      ifBInput.value = proposed.ifB ?? "";
      ifB = proposed.ifB ?? "";
      thenBInput.value = proposed.thenB ?? "";
      thenB = proposed.thenB ?? "";
      greyTextarea.value = proposed.greyZone ?? "";
      greyZone = proposed.greyZone ?? "";
    };

    new Setting(contentEl)
      .addButton((b) =>
        b.setButtonText("Cancel").onClick(() => {
          this.onSubmit(null, false);
          this.close();
        })
      )
      .addButton((b) =>
        b.setButtonText("Skip and use empty template").onClick(() => {
          this.onSubmit(null, true);
          this.close();
        })
      )
      .addButton((b) =>
        b
          .setButtonText("Elevate")
          .setCta()
          .onClick(() => {
            this.onSubmit({ ifA, thenA, ifB, thenB, greyZone }, false);
            this.close();
          })
      );
  }
  onClose(): void {
    this.contentEl.empty();
  }
}

// ---------- guided creation modals ----------

class FreeInputModal extends Modal {
  private plugin: AntinomiaPlugin;
  private prefillText: string;
  constructor(
    app: App,
    plugin: AntinomiaPlugin,
    private onAnalyzed: (
      analysis: FreeInputAnalysis,
      originalText: string,
      meta?: AIUsageMeta
    ) => void,
    prefillText = ""
  ) {
    super(app);
    this.plugin = plugin;
    this.prefillText = prefillText;
  }
  onOpen(): void {
    const { contentEl } = this;
    contentEl.createEl("h3", { text: "Free-form input" });
    const intro = contentEl.createEl("p");
    intro.style.fontSize = "0.9em";
    intro.style.opacity = "0.8";
    intro.setText(
      "Write what you have in mind, without worrying about the type. The AI figures out if it's a tension or substrate, extracts the fields, and opens the matching modal pre-filled. You can always refine before saving."
    );

    let testo = this.prefillText;

    const labelEl = contentEl.createEl("label", { text: "Raw text" });
    labelEl.style.display = "block";
    labelEl.style.fontWeight = "bold";
    labelEl.style.marginTop = "10px";

    const hint = contentEl.createEl("div");
    hint.style.fontSize = "0.8em";
    hint.style.opacity = "0.6";
    hint.setText(
      "A quote, an observation, a doubt, a contradiction you see, a single thought. Anything: the AI figures it out."
    );

    const textarea = contentEl.createEl("textarea");
    textarea.style.width = "100%";
    textarea.style.minHeight = "180px";
    textarea.style.padding = "8px";
    textarea.style.marginTop = "4px";
    textarea.value = testo;
    textarea.addEventListener("input", (e) => {
      testo = (e.target as HTMLTextAreaElement).value;
    });

    setTimeout(() => textarea.focus(), 0);

    new Setting(contentEl)
      .addButton((b) =>
        b.setButtonText("Cancel").onClick(() => {
          this.close();
        })
      )
      .addButton((b) =>
        b
          .setButtonText("Analizza con AI")
          .setCta()
          .onClick(async () => {
            const t = testo.trim();
            if (!t) {
              new Notice("Write something before analyzing.");
              return;
            }
            const result = await withLoadingButton(
              b.buttonEl,
              "⏳ Analyzing...",
              (signal) => this.plugin.analyzeFreeInput(t, signal, b.buttonEl)
            );
            if (!result) return;
            this.close();
            this.onAnalyzed(result.analysis, t, result.meta);
          })
      );
  }
  onClose(): void {
    this.contentEl.empty();
  }
}

class NewTensionModal extends Modal {
  private plugin: AntinomiaPlugin;
  private prefill: TensionFields;
  private prefillUsageMeta?: AIUsageMeta;
  constructor(
    app: App,
    plugin: AntinomiaPlugin,
    private onSubmit: (fields: TensionFields | null, skipped: boolean) => void,
    prefill: TensionFields = {},
    prefillUsageMeta?: AIUsageMeta
  ) {
    super(app);
    this.plugin = plugin;
    this.prefill = prefill;
    this.prefillUsageMeta = prefillUsageMeta;
  }
  onOpen(): void {
    const { contentEl } = this;
    contentEl.createEl("h3", { text: "New tension" });
    if (this.prefillUsageMeta) renderUsageMetaBanner(contentEl, this.prefillUsageMeta, this.app);
    const intro = contentEl.createEl("p");
    intro.style.fontSize = "0.9em";
    intro.style.opacity = "0.8";
    intro.setText(
      "A tension captures a contradiction between two positions. The more incompatible, the more fertile. You'll map the presuppositions later, at your own pace."
    );

    let titolo = this.prefill.title ?? "";
    let statementA = this.prefill.statementA ?? "";
    let statementB = this.prefill.statementB ?? "";

    const mkLabel = (text: string) => {
      const l = contentEl.createEl("label", { text });
      l.style.display = "block";
      l.style.marginTop = "10px";
      l.style.fontWeight = "bold";
      return l;
    };
    const mkHint = (text: string) => {
      const h = contentEl.createEl("div", { text });
      h.style.fontSize = "0.8em";
      h.style.opacity = "0.6";
      return h;
    };

    mkLabel("Title (optional)");
    mkHint(
      "3-7 words, neutral (e.g. 'Creative solitude', 'Decision: instinct vs data')"
    );
    const titleInput = contentEl.createEl("input", { type: "text" });
    titleInput.style.width = "100%";
    titleInput.style.padding = "6px";
    titleInput.style.marginTop = "4px";
    titleInput.value = titolo;
    titleInput.addEventListener("input", (e) => {
      titolo = (e.target as HTMLInputElement).value;
    });

    // ---- "Proponi titolo (AI)" button right under the title input ----
    // Chiede al modello di proporre un titolo basandosi sui due statement
    // gia' digitati. Disabilitato se A e B sono entrambi vuoti.
    const aiBtn = contentEl.createEl("button", {
      text: "Propose title (AI)",
    });
    aiBtn.style.marginTop = "6px";
    aiBtn.style.fontSize = "0.85em";
    aiBtn.style.padding = "3px 10px";
    aiBtn.style.cursor = "pointer";
    aiBtn.title =
      "Asks the configured AI model to propose a title from the two filled statements.";
    aiBtn.onclick = async (e) => {
      e.preventDefault();
      const aTxt = statementA.trim();
      const bTxt = statementB.trim();
      if (!aTxt && !bTxt) {
        new Notice(
          "Fill at least one of Statement A or B before requesting a title."
        );
        return;
      }
      const content =
        "I'm creating a new Antinomia tension with these two statements (presuppositions are not yet mapped). Propose a neutral title for the tension's theme.\n\n" +
        `Statement A: ${aTxt || "(empty)"}\n\n` +
        `Statement B: ${bTxt || "(empty)"}`;
      const proposed = await withLoadingButton(
        aiBtn,
        "⏳ Generating...",
        (signal) => this.plugin.proposeTitleFromContent(content, signal, aiBtn)
      );
      if (proposed) {
        titleInput.value = proposed;
        titolo = proposed;
      }
    };

    mkLabel("Statement A");
    mkHint("The first position, clearly formulated.");
    const aInput = contentEl.createEl("textarea");
    aInput.style.width = "100%";
    aInput.style.padding = "6px";
    aInput.style.marginTop = "4px";
    aInput.style.minHeight = "70px";
    aInput.value = statementA;
    aInput.addEventListener("input", (e) => {
      statementA = (e.target as HTMLTextAreaElement).value;
    });

    mkLabel("Statement B");
    mkHint(
      "The opposing position. Must be semantically incompatible with A."
    );
    const bInput = contentEl.createEl("textarea");
    bInput.style.width = "100%";
    bInput.style.padding = "6px";
    bInput.style.marginTop = "4px";
    bInput.style.minHeight = "70px";
    bInput.value = statementB;
    bInput.addEventListener("input", (e) => {
      statementB = (e.target as HTMLTextAreaElement).value;
    });

    new Setting(contentEl)
      .addButton((b) =>
        b.setButtonText("Cancel").onClick(() => {
          this.onSubmit(null, false);
          this.close();
        })
      )
      .addButton((b) =>
        b.setButtonText("Skip and open empty note").onClick(() => {
          this.onSubmit(null, true);
          this.close();
        })
      )
      .addButton((b) =>
        b
          .setButtonText("Create")
          .setCta()
          .onClick(() => {
            this.onSubmit({ title: titolo, statementA, statementB }, false);
            this.close();
          })
      );

    setTimeout(() => titleInput.focus(), 0);
  }
  onClose(): void {
    this.contentEl.empty();
  }
}

class NewSubstrateModal extends Modal {
  private plugin: AntinomiaPlugin;
  private prefill: SubstrateFields;
  private prefillUsageMeta?: AIUsageMeta;
  constructor(
    app: App,
    plugin: AntinomiaPlugin,
    private onSubmit: (fields: SubstrateFields | null, skipped: boolean) => void,
    prefill: SubstrateFields = {},
    prefillUsageMeta?: AIUsageMeta
  ) {
    super(app);
    this.plugin = plugin;
    this.prefill = prefill;
    this.prefillUsageMeta = prefillUsageMeta;
  }
  onOpen(): void {
    const { contentEl } = this;
    contentEl.createEl("h3", { text: "New substrate" });
    if (this.prefillUsageMeta) renderUsageMetaBanner(contentEl, this.prefillUsageMeta, this.app);
    const intro = contentEl.createEl("p");
    intro.style.fontSize = "0.9em";
    intro.style.opacity = "0.8";
    intro.setText(
      "A substrate is raw material: a quote, a fact, a note. The raw stuff from which tensions and principles can emerge."
    );

    let titolo = this.prefill.title ?? "";
    let contenuto = this.prefill.contenuto ?? "";

    const mkLabel = (text: string) => {
      const l = contentEl.createEl("label", { text });
      l.style.display = "block";
      l.style.marginTop = "10px";
      l.style.fontWeight = "bold";
      return l;
    };
    const mkHint = (text: string) => {
      const h = contentEl.createEl("div", { text });
      h.style.fontSize = "0.8em";
      h.style.opacity = "0.6";
      return h;
    };

    mkLabel("Title (optional)");
    mkHint("Short label (e.g. 'Kahneman quote on confirmation bias').");
    const titleInput = contentEl.createEl("input", { type: "text" });
    titleInput.style.width = "100%";
    titleInput.style.padding = "6px";
    titleInput.style.marginTop = "4px";
    titleInput.value = titolo;
    titleInput.addEventListener("input", (e) => {
      titolo = (e.target as HTMLInputElement).value;
    });

    // ---- "Proponi titolo (AI)" button ----
    const aiBtn = contentEl.createEl("button", { text: "Propose title (AI)" });
    aiBtn.style.marginTop = "6px";
    aiBtn.style.fontSize = "0.85em";
    aiBtn.style.padding = "3px 10px";
    aiBtn.style.cursor = "pointer";
    aiBtn.title =
      "Asks the configured AI model to propose a title from the filled content.";
    aiBtn.onclick = async (e) => {
      e.preventDefault();
      const cTxt = contenuto.trim();
      if (!cTxt) {
        new Notice("Fill the content before requesting a title.");
        return;
      }
      const content =
        "I'm creating a new Antinomia substrate (raw material: quote, fact, note). Propose a neutral title that identifies the object, doesn't summarize it.\n\n" +
        `Content: ${cTxt}`;
      const proposed = await withLoadingButton(
        aiBtn,
        "⏳ Generating...",
        (signal) => this.plugin.proposeTitleFromContent(content, signal, aiBtn)
      );
      if (proposed) {
        titleInput.value = proposed;
        titolo = proposed;
      }
    };

    mkLabel("Content");
    mkHint("The quote, the fact, the observation. Without interpreting it.");
    const cInput = contentEl.createEl("textarea");
    cInput.style.width = "100%";
    cInput.style.padding = "6px";
    cInput.style.marginTop = "4px";
    cInput.style.minHeight = "100px";
    cInput.value = contenuto;
    cInput.addEventListener("input", (e) => {
      contenuto = (e.target as HTMLTextAreaElement).value;
    });

    new Setting(contentEl)
      .addButton((b) =>
        b.setButtonText("Cancel").onClick(() => {
          this.onSubmit(null, false);
          this.close();
        })
      )
      .addButton((b) =>
        b.setButtonText("Skip and open empty note").onClick(() => {
          this.onSubmit(null, true);
          this.close();
        })
      )
      .addButton((b) =>
        b
          .setButtonText("Create")
          .setCta()
          .onClick(() => {
            this.onSubmit({ title: titolo, content: contenuto }, false);
            this.close();
          })
      );

    setTimeout(() => titleInput.focus(), 0);
  }
  onClose(): void {
    this.contentEl.empty();
  }
}

/**
 * Fuzzy picker over all markdown notes in the vault. Used by the
 * "link-active-note-to" command. Displays the human title of each note as
 * the primary text and the basename as the secondary (for disambiguation).
 */
/**
 * Progress modal shown while the AI is analyzing a PDF and extracting
 * concepts. Has its own AbortController and a Stop button so the user
 * can cancel a long call (the source picker has already closed by this
 * point, so a withLoadingButton on a real button isn't available — this
 * modal IS the loading button).
 *
 * The lifecycle is owned by the caller: the caller opens it, polls
 * `controller.signal` from inside the async fn, and closes the modal
 * when done (success, error, or abort).
 */
class PdfAnalyzingModal extends Modal {
  public controller: AbortController = new AbortController();
  private timerHandle: number | null = null;
  private elapsedEl: HTMLElement | null = null;
  private t0: number = Date.now();
  constructor(
    app: App,
    private pdfName: string,
    private modelName: string
  ) {
    super(app);
  }
  onOpen(): void {
    const { contentEl, titleEl } = this;
    titleEl.setText(`Analyzing "${this.pdfName}" with AI…`);

    const msg = contentEl.createEl("p");
    msg.style.fontSize = "0.9em";
    msg.style.lineHeight = "1.5";
    msg.setText(
      `Antinomia is asking ${this.modelName} to extract standalone concepts from the PDF. ` +
        `This usually takes 20–90 seconds depending on the model and PDF length. Click Stop to abort.`
    );

    this.elapsedEl = contentEl.createEl("div");
    this.elapsedEl.style.fontFamily = "var(--font-monospace, monospace)";
    this.elapsedEl.style.fontSize = "1.1em";
    this.elapsedEl.style.textAlign = "center";
    this.elapsedEl.style.padding = "12px";
    this.elapsedEl.style.background = "var(--background-secondary)";
    this.elapsedEl.style.borderRadius = "6px";
    this.elapsedEl.style.margin = "8px 0";
    this.elapsedEl.setText("⏳ 0s");

    this.t0 = Date.now();
    this.timerHandle = window.setInterval(() => {
      if (this.elapsedEl) {
        const s = Math.floor((Date.now() - this.t0) / 1000);
        this.elapsedEl.setText(`⏳ ${s}s`);
      }
    }, 1000);

    new Setting(contentEl).addButton((b) =>
      b
        .setButtonText("⛔ Stop")
        .setWarning()
        .onClick(() => {
          this.controller.abort();
          if (this.elapsedEl) this.elapsedEl.setText("Aborting…");
        })
    );
  }
  onClose(): void {
    if (this.timerHandle != null) {
      window.clearInterval(this.timerHandle);
      this.timerHandle = null;
    }
    this.contentEl.empty();
  }
}

/**
 * Preview & selection modal for PDF concept extraction. Shows each
 * concept proposed by the AI with a checkbox (default selected), expandable
 * content, and lets the user pick which to materialize as substrates.
 *
 * Banner at the top shows tokens spent + duration of the extraction call.
 */
class PdfConceptsPreviewModal extends Modal {
  private selected: Set<number> = new Set();
  constructor(
    app: App,
    private plugin: AntinomiaPlugin,
    private pdfFile: TFile,
    private concepts: PdfConcept[],
    private extractionMeta: AIUsageMeta,
    private onConfirm: (selectedConcepts: PdfConcept[]) => void
  ) {
    super(app);
    // Default: all selected.
    this.concepts.forEach((_, i) => this.selected.add(i));
  }
  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.style.maxWidth = "780px";

    contentEl.createEl("h3", {
      text: `Concepts from "${this.pdfFile.basename}"`,
    });

    // Usage meta banner (persistent, clickable for details).
    renderUsageMetaBanner(contentEl, this.extractionMeta, this.app);

    const intro = contentEl.createEl("p");
    intro.style.fontSize = "0.88em";
    intro.style.opacity = "0.8";
    intro.style.lineHeight = "1.5";
    intro.setText(
      `Antinomia extracted ${this.concepts.length} concept(s) from the PDF. ` +
        `Pick which ones to save as substrates. They will be created in ` +
        `notes/from-pdf-${this.pdfFile.basename.replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, "_")}/.`
    );

    if (this.concepts.length === 0) {
      const empty = contentEl.createEl("p");
      empty.style.fontStyle = "italic";
      empty.style.opacity = "0.7";
      empty.setText("No concepts extracted. Try again, or the PDF is too thin / image-only.");
      new Setting(contentEl).addButton((b) =>
        b.setButtonText("Close").setCta().onClick(() => this.close())
      );
      return;
    }

    // Toolbar (select all / none + counter).
    const toolbar = contentEl.createEl("div");
    toolbar.style.display = "flex";
    toolbar.style.alignItems = "center";
    toolbar.style.gap = "8px";
    toolbar.style.margin = "8px 0";

    const counter = toolbar.createEl("span");
    counter.style.fontSize = "0.85em";
    counter.style.fontWeight = "bold";
    const updateCounter = () => {
      counter.setText(`${this.selected.size} of ${this.concepts.length} selected`);
    };
    updateCounter();

    const selAll = toolbar.createEl("button", { text: "Select all" });
    selAll.style.fontSize = "0.8em";
    selAll.style.padding = "2px 8px";
    selAll.style.cursor = "pointer";

    const deselAll = toolbar.createEl("button", { text: "Deselect all" });
    deselAll.style.fontSize = "0.8em";
    deselAll.style.padding = "2px 8px";
    deselAll.style.cursor = "pointer";

    // Scrollable list of concepts.
    const list = contentEl.createEl("div");
    list.style.maxHeight = "420px";
    list.style.overflowY = "auto";
    list.style.border = "1px solid var(--background-modifier-border)";
    list.style.borderRadius = "6px";
    list.style.padding = "4px";

    const itemEls: HTMLDivElement[] = [];

    this.concepts.forEach((c, i) => {
      const item = list.createEl("div");
      itemEls.push(item);
      item.style.display = "flex";
      item.style.gap = "8px";
      item.style.padding = "8px 10px";
      item.style.borderBottom = "1px solid var(--background-modifier-border)";
      item.style.alignItems = "flex-start";

      const checkbox = item.createEl("input", { type: "checkbox" });
      checkbox.checked = true;
      checkbox.style.marginTop = "4px";
      checkbox.style.cursor = "pointer";
      checkbox.addEventListener("change", () => {
        if (checkbox.checked) this.selected.add(i);
        else this.selected.delete(i);
        updateCounter();
      });

      const body = item.createEl("div");
      body.style.flex = "1";
      body.style.userSelect = "text";
      (body.style as any).webkitUserSelect = "text";

      const title = body.createEl("div");
      title.style.fontWeight = "bold";
      title.style.fontSize = "0.95em";
      title.style.marginBottom = "3px";
      title.setText(c.title);

      const content = body.createEl("div");
      content.style.fontSize = "0.85em";
      content.style.opacity = "0.85";
      content.style.lineHeight = "1.45";
      content.setText(c.content);
    });

    selAll.onclick = () => {
      this.concepts.forEach((_, i) => this.selected.add(i));
      itemEls.forEach((el) => {
        const cb = el.querySelector("input[type=checkbox]") as HTMLInputElement | null;
        if (cb) cb.checked = true;
      });
      updateCounter();
    };
    deselAll.onclick = () => {
      this.selected.clear();
      itemEls.forEach((el) => {
        const cb = el.querySelector("input[type=checkbox]") as HTMLInputElement | null;
        if (cb) cb.checked = false;
      });
      updateCounter();
    };

    new Setting(contentEl)
      .addButton((b) =>
        b.setButtonText("Cancel").onClick(() => this.close())
      )
      .addButton((b) =>
        b
          .setButtonText("Create selected")
          .setCta()
          .onClick(() => {
            if (this.selected.size === 0) {
              new Notice("Select at least one concept to create.");
              return;
            }
            const picks: PdfConcept[] = [];
            this.selected.forEach((i) => picks.push(this.concepts[i]));
            this.close();
            this.onConfirm(picks);
          })
      );
  }
  onClose(): void {
    this.contentEl.empty();
  }
}

/**
 * Source picker modal for PDF ingest: choose between picking a PDF already
 * in the vault OR importing a fresh PDF from disk (Electron file dialog,
 * desktop-only). Either choice ultimately yields a TFile inside the vault
 * that the AI flow can read.
 */
class PdfSourcePickerModal extends Modal {
  constructor(
    app: App,
    private plugin: AntinomiaPlugin,
    private onPicked: (pdf: TFile) => void
  ) {
    super(app);
  }
  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h3", { text: "Choose PDF source" });

    const intro = contentEl.createEl("p");
    intro.style.fontSize = "0.88em";
    intro.style.opacity = "0.8";
    intro.setText(
      "Antinomia will extract text from the PDF and ask the AI to propose substrate concepts. You'll preview and pick which to save."
    );

    const vaultPdfs = this.app.vault.getFiles().filter((f) => f.extension === "pdf");

    new Setting(contentEl)
      .setName("Pick a PDF already in this vault")
      .setDesc(`${vaultPdfs.length} PDF(s) found in the vault`)
      .addButton((b) =>
        b
          .setButtonText(vaultPdfs.length === 0 ? "No PDFs in vault" : "Pick from vault…")
          .setDisabled(vaultPdfs.length === 0)
          .onClick(() => {
            this.close();
            new PdfPickerModal(this.app, vaultPdfs, (pdf) => this.onPicked(pdf)).open();
          })
      );

    new Setting(contentEl)
      .setName("Import a PDF from disk")
      .setDesc("Copies the file into the vault under attachments/, then processes it.")
      .addButton((b) =>
        b.setButtonText("Choose file…").onClick(async () => {
          this.close();
          const imported = await this.plugin.importPdfFromDisk();
          if (imported) this.onPicked(imported);
        })
      );

    new Setting(contentEl).addButton((b) =>
      b.setButtonText("Cancel").onClick(() => this.close())
    );
  }
  onClose(): void {
    this.contentEl.empty();
  }
}

/**
 * Picker over all PDF files in the vault. Used by `openSubstrateFromPDF`.
 */
class PdfPickerModal extends FuzzySuggestModal<TFile> {
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

class NotePickerModal extends FuzzySuggestModal<TFile> {
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

/**
 * Modal for mapping presupposti A/B of a tension. Same visual style as the
 * other AI-assisted modals: form with 2 textareas + "Proponi (AI)" button
 * with live elapsed-seconds loader. Pre-fills with existing values if the
 * tension already has presupposti written.
 */
class MapPresuppostiModal extends Modal {
  private plugin: AntinomiaPlugin;
  private file: TFile;
  private existingA: string;
  private existingB: string;
  constructor(
    app: App,
    plugin: AntinomiaPlugin,
    file: TFile,
    existingA: string,
    existingB: string,
    private onSubmit: (fields: PresuppostiFields | null) => void
  ) {
    super(app);
    this.plugin = plugin;
    this.file = file;
    this.existingA = existingA;
    this.existingB = existingB;
  }
  onOpen(): void {
    const { contentEl } = this;
    contentEl.createEl("h3", {
      text: `Map presuppositions: ${humanTitle(this.app, this.file)}`,
    });
    const intro = contentEl.createEl("p");
    intro.style.fontSize = "0.9em";
    intro.style.opacity = "0.8";
    intro.setText(
      `Identify the epistemic/metaphysical/value assumptions that A and B take for granted. Mapping them makes explicit why the tension doesn't dissolve on its own.`
    );

    // Show the tension content inline so the user can re-read it while
    // filling the form. The raw is loaded lazily on open.
    const ctxPlaceholder = contentEl.createEl("div");
    void this.app.vault.read(this.file).then((raw) => {
      renderTensionContext(ctxPlaceholder, raw);
    });

    let presupA = this.existingA;
    let presupB = this.existingB;

    const mkLabel = (text: string) => {
      const l = contentEl.createEl("label", { text });
      l.style.display = "block";
      l.style.marginTop = "12px";
      l.style.fontWeight = "bold";
      return l;
    };
    const mkHint = (text: string) => {
      const h = contentEl.createEl("div", { text });
      h.style.fontSize = "0.8em";
      h.style.opacity = "0.6";
      return h;
    };

    mkLabel("Presuppositions A");
    mkHint("The base assumptions that make side A possible.");
    const aTextarea = contentEl.createEl("textarea");
    aTextarea.style.width = "100%";
    aTextarea.style.padding = "6px";
    aTextarea.style.marginTop = "4px";
    aTextarea.style.minHeight = "70px";
    aTextarea.value = presupA;
    aTextarea.addEventListener("input", (e) => {
      presupA = (e.target as HTMLTextAreaElement).value;
    });

    mkLabel("Presuppositions B");
    mkHint("The base assumptions that make side B possible.");
    const bTextarea = contentEl.createEl("textarea");
    bTextarea.style.width = "100%";
    bTextarea.style.padding = "6px";
    bTextarea.style.marginTop = "4px";
    bTextarea.style.minHeight = "70px";
    bTextarea.value = presupB;
    bTextarea.addEventListener("input", (e) => {
      presupB = (e.target as HTMLTextAreaElement).value;
    });

    // ---- "Propose presuppositions (AI)" button ----
    const aiBtn = contentEl.createEl("button", {
      text: "Propose presuppositions (AI)",
    });
    aiBtn.style.marginTop = "10px";
    aiBtn.style.fontSize = "0.85em";
    aiBtn.style.padding = "4px 12px";
    aiBtn.style.cursor = "pointer";
    aiBtn.title =
      "Asks the AI model to propose the two fields by reading the tension's text.";
    aiBtn.onclick = async (e) => {
      e.preventDefault();
      const proposed = await withLoadingButton(
        aiBtn,
        "⏳ Generating...",
        async (signal) => {
          const raw = await this.app.vault.read(this.file);
          const body = stripFrontmatter(raw).trim();
          const content =
            "Map the epistemic/value presuppositions of the following Antinomia tension:\n\n" +
            body;
          return await this.plugin.proposePresuppostiFromContent(content, signal);
        }
      );
      if (!proposed) return;
      aTextarea.value = proposed.presupposizioniA ?? "";
      presupA = proposed.presupposizioniA ?? "";
      bTextarea.value = proposed.presupposizioniB ?? "";
      presupB = proposed.presupposizioniB ?? "";
    };

    new Setting(contentEl)
      .addButton((b) =>
        b.setButtonText("Cancel").onClick(() => {
          this.onSubmit(null);
          this.close();
        })
      )
      .addButton((b) =>
        b
          .setButtonText("Apply")
          .setCta()
          .onClick(() => {
            this.onSubmit({
              presupposizioniA: presupA,
              presupposizioniB: presupB,
            });
            this.close();
          })
      );
  }
  onClose(): void {
    this.contentEl.empty();
  }
}

// ---------- sidebar views ----------

/**
 * Renders a global navigation bar at the top of an Antinomia view.
 * Clicking a leaf-level entry (Dashboard, Graph, Audit) replaces the
 * current leaf's view; submenu entries either replace the view or open
 * a modal / fire an action.
 */
function renderAntinomiaNav(
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
  });

  // -- Graph (custom)
  mkBtn("🕸 Graph", () => goTo(VIEW_TYPE_GRAPH));

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
        .onClick(() => new TutorialModal(plugin.app, plugin).open())
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

class OpenTensionsView extends ItemView {
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
      mkBtn("Presuppositions", "Map presuppositions A/B (AI-assisted)", () => {
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

class HunterResultsView extends ItemView {
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
    warn.style.cssText =
      "background:rgba(220,53,69,0.08); border-left:3px solid #dc3545; " +
      "padding:6px 10px; margin-bottom:8px; border-radius:4px; font-size:0.78em; opacity:0.9;";
    warn.setText(
      "⚠ Reflective prompts, not truths. The AI can hallucinate. Do not use to decide in real situations."
    );

    // ---- First-time hint banner ----
    if (!this.plugin.settings.hintsHunterShown) {
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
        "Tip: the Hunter scans open tensions + substrate, and proposes contradictory PAIRS. It does not resolve. Confidence high/medium/low, sorted by quality. × dismisses a false positive (persistent). Below each pair, Elevate/Resolved/Defeated buttons act directly on one of the two notes."
      );
      const dismissBtn = hint.createEl("button", { text: "Got it" });
      dismissBtn.style.padding = "2px 10px";
      dismissBtn.style.cursor = "pointer";
      dismissBtn.style.fontSize = "0.85em";
      dismissBtn.onclick = async () => {
        this.plugin.settings.hintsHunterShown = true;
        await this.plugin.saveSettings();
        this.render();
      };
    }

    const isLoading = this.loadingStartedAt !== null;

    const toolbar = container.createEl("div");
    toolbar.style.marginBottom = "8px";
    const runBtn = toolbar.createEl("button", {
      text: isLoading ? "Hunter running..." : "Run Hunter",
    });
    runBtn.style.marginRight = "6px";
    runBtn.disabled = isLoading;
    if (!isLoading) runBtn.onclick = () => this.plugin.runHunter();

    if (isLoading) {
      const elapsed = Math.floor(
        (Date.now() - (this.loadingStartedAt ?? Date.now())) / 1000
      );
      const loadingBox = container.createEl("div");
      loadingBox.style.padding = "12px";
      loadingBox.style.marginTop = "8px";
      loadingBox.style.border = "1px dashed var(--background-modifier-border)";
      loadingBox.style.borderRadius = "6px";
      loadingBox.style.textAlign = "center";
      const spinner = loadingBox.createEl("div", { text: "⏳" });
      spinner.style.fontSize = "1.6em";
      spinner.style.marginBottom = "6px";
      const msg = loadingBox.createEl("div");
      msg.setText(
        `Hunter in corso (${this.loadingNotesCount} note inviate al modello)...`
      );
      msg.style.marginBottom = "4px";
      const counter = loadingBox.createEl("div");
      counter.style.fontSize = "0.9em";
      counter.style.opacity = "0.7";
      counter.setText(`${elapsed}s trascorsi`);

      const stopBtn = loadingBox.createEl("button", { text: "⛔ Stop Hunter" });
      stopBtn.style.marginTop = "10px";
      stopBtn.style.padding = "4px 12px";
      stopBtn.style.cursor = "pointer";
      stopBtn.style.fontSize = "0.85em";
      stopBtn.title =
        "Stop the running Hunter. (The HTTP request is not interrupted, but the result will be discarded.)";
      stopBtn.onclick = () => {
        this.plugin.abortHunter();
        this.setLoading(false);
      };
      if (this.currentRun) {
        const prev = container.createEl("p");
        prev.style.fontSize = "0.8em";
        prev.style.opacity = "0.5";
        prev.style.marginTop = "12px";
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
    metaEl.style.fontSize = "0.85em";
    metaEl.style.opacity = "0.7";
    let metaTxt = `${meta.timestamp} — examined ${meta.notesExamined}/${meta.totalCandidates} notes in ${meta.durationMs}ms with ${meta.model}`;
    if (meta.inputTokens !== undefined)
      metaTxt += ` (${meta.inputTokens}->${meta.outputTokens} tok)`;
    if (meta.dismissedFiltered > 0)
      metaTxt += ` — ${meta.dismissedFiltered} pairs hidden (already dismissed)`;
    metaEl.setText(metaTxt);
    if (meta.truncated) {
      const warn = container.createEl("p");
      warn.style.color = "var(--text-warning, orange)";
      warn.setText(
        `Excluded ${meta.totalCandidates - meta.notesExamined} notes (over the limit).`
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
      li.style.marginBottom = "14px";

      const headerLine = li.createEl("div");
      headerLine.style.display = "flex";
      headerLine.style.alignItems = "center";
      headerLine.style.gap = "6px";
      headerLine.style.flexWrap = "wrap";

      const confidence = c.confidence ?? "medium";
      const badge = headerLine.createEl("span", { text: confidence });
      badge.style.fontSize = "0.7em";
      badge.style.padding = "1px 6px";
      badge.style.borderRadius = "8px";
      badge.style.background = CONFIDENCE_COLOR[confidence];
      badge.style.color = "white";
      badge.style.fontWeight = "bold";
      badge.title = `Confidence: ${confidence}`;

      this.appendNoteLink(headerLine, c.note_a);
      headerLine.appendText(" ⟷ ");
      this.appendNoteLink(headerLine, c.note_b);

      const dismissBtn = headerLine.createEl("button", { text: "×" });
      dismissBtn.style.marginLeft = "auto";
      dismissBtn.style.padding = "0 6px";
      dismissBtn.style.cursor = "pointer";
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
      desc.style.marginTop = "4px";
      desc.style.fontStyle = "italic";
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
    const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
    const t = fm?.antinomia_type;
    if (
      t !== TYPE.tension &&
      t !== TYPE.substrate &&
      t !== TYPE.principle
    )
      return;

    const row = parent.createEl("div");
    row.style.display = "flex";
    row.style.alignItems = "center";
    row.style.gap = "5px";
    row.style.flexWrap = "wrap";
    row.style.marginTop = "3px";
    row.style.fontSize = "0.78em";

    const labelEl = row.createEl("span");
    labelEl.style.opacity = "0.65";
    labelEl.style.minWidth = "0";
    const shortLabel = (() => {
      const title = humanTitle(this.app, file);
      const max = 22;
      return title.length > max ? title.slice(0, max - 1) + "…" : title;
    })();
    labelEl.setText(`${shortLabel}:`);
    labelEl.title = basename;

    const mkBtn = (text: string, tooltip: string, onclick: () => void) => {
      const b = row.createEl("button", { text });
      b.style.padding = "1px 6px";
      b.style.fontSize = "1em";
      b.style.cursor = "pointer";
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
      a.style.cursor = "pointer";
      a.title = `${basename} (clicca per aprire)`;
      a.onclick = (e) => {
        e.preventDefault();
        this.app.workspace.getLeaf(false).openFile(file);
      };
    } else {
      const span = parent.createEl("span", { text: basename + " (?)" });
      span.style.opacity = "0.5";
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

class DismissedPairsView extends ItemView {
  private plugin: AntinomiaPlugin;
  constructor(leaf: WorkspaceLeaf, plugin: AntinomiaPlugin) {
    super(leaf);
    this.plugin = plugin;
  }
  getViewType(): string {
    return VIEW_TYPE_DISMISSED_PAIRS;
  }
  getDisplayText(): string {
    return "Antinomia — falsi positivi";
  }
  getIcon(): string {
    return "list-x";
  }
  async onOpen(): Promise<void> {
    this.render();
    this.registerEvent(
      this.app.metadataCache.on("changed", () => this.render())
    );
    this.registerEvent(this.app.vault.on("modify", () => this.render()));
    this.registerEvent(this.app.vault.on("rename", () => this.render()));
    this.registerEvent(this.app.vault.on("delete", () => this.render()));
  }
  async onClose(): Promise<void> {}

  private render(): void {
    const container = this.containerEl.children[1];
    container.empty();
    renderAntinomiaNav(this.plugin, container as HTMLElement, this.leaf);
    renderVaultLabel(container, this.plugin.settings.vaultDisplayName);
    container.createEl("h4", { text: "Hunter false positives" });

    const desc = container.createEl("p");
    desc.style.fontSize = "0.85em";
    desc.style.opacity = "0.7";
    desc.setText(
      "Pairs marked as false positives (via × in the Hunter sidebar). They won't be proposed again. Click 'Re-include' to remove the dismissal and have them reappear in the next runs."
    );

    // Collect all dismissed pairs. Stored as `hunter_false_positives: [basename, ...]`
    // in the frontmatter of the alphabetically smaller-basename note.
    interface Pair {
      ownerFile: TFile;
      ownerBasename: string;
      otherBasename: string;
    }
    const pairs: Pair[] = [];
    for (const f of this.app.vault.getMarkdownFiles()) {
      const fm = this.app.metadataCache.getFileCache(f)?.frontmatter;
      const list = fm?.hunter_false_positives;
      if (Array.isArray(list)) {
        for (const other of list) {
          if (typeof other === "string" && other.length > 0) {
            pairs.push({
              ownerFile: f,
              ownerBasename: f.basename,
              otherBasename: other,
            });
          }
        }
      }
    }

    if (pairs.length === 0) {
      container.createEl("p", {
        text: "No false positives recorded.",
      });
      return;
    }

    // sort by owner basename then other (stable, deterministic)
    pairs.sort((a, b) => {
      const c = a.ownerBasename.localeCompare(b.ownerBasename);
      if (c !== 0) return c;
      return a.otherBasename.localeCompare(b.otherBasename);
    });

    const list = container.createEl("ol");
    for (const p of pairs) {
      const li = list.createEl("li");
      li.style.marginBottom = "10px";

      const row = li.createEl("div");
      row.style.display = "flex";
      row.style.alignItems = "center";
      row.style.gap = "6px";
      row.style.flexWrap = "wrap";

      this.appendNoteLink(row, p.ownerBasename);
      row.appendText(" ⟷ ");
      this.appendNoteLink(row, p.otherBasename);

      const undismissBtn = row.createEl("button", { text: "Reincludi" });
      undismissBtn.style.marginLeft = "auto";
      undismissBtn.style.padding = "0 8px";
      undismissBtn.style.cursor = "pointer";
      undismissBtn.title =
        "Rimuovi il dismiss: la coppia tornera' a essere candidata nei prossimi run del Hunter.";
      undismissBtn.onclick = async () => {
        await this.plugin.undismissContradiction(
          p.ownerBasename,
          p.otherBasename
        );
        this.render();
      };
    }
  }

  private appendNoteLink(parent: HTMLElement, basename: string): void {
    const file = this.findFileByBasename(basename);
    if (file) {
      const title = humanTitle(this.app, file);
      const a = parent.createEl("a", { text: title, href: "#" });
      a.style.cursor = "pointer";
      a.title = `${basename} (clicca per aprire)`;
      a.onclick = (e) => {
        e.preventDefault();
        this.app.workspace.getLeaf(false).openFile(file);
      };
    } else {
      const span = parent.createEl("span", { text: basename + " (?)" });
      span.style.opacity = "0.5";
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

/**
 * Generic helper to render a single note as a card with action buttons.
 * Used by SubstrateListView, PrinciplesListView, DefeatedListView.
 * The `extraInfo` callback can render type-specific metadata (e.g. defeated motivo).
 */
function renderNoteCard(
  container: HTMLElement,
  app: App,
  plugin: AntinomiaPlugin,
  file: TFile,
  options: {
    showLink?: boolean;
    showCollega?: boolean;
    showDefeated?: boolean;
    extraInfo?: (card: HTMLElement, fm: Record<string, unknown> | undefined) => void;
  }
): void {
  const card = container.createEl("div");
  card.style.padding = "8px 10px";
  card.style.marginBottom = "8px";
  card.style.border = "1px solid var(--background-modifier-border)";
  card.style.borderRadius = "5px";
  card.style.background = "var(--background-secondary)";

  const title = humanTitle(app, file);
  const link = card.createEl("a", { text: title, href: "#" });
  link.style.cursor = "pointer";
  link.style.display = "block";
  link.style.marginBottom = "4px";
  link.style.fontWeight = "600";
  link.title = `${file.basename} (clicca per aprire)`;
  link.onclick = (e) => {
    e.preventDefault();
    app.workspace.getLeaf(false).openFile(file);
  };

  const fm = app.metadataCache.getFileCache(file)?.frontmatter as
    | Record<string, unknown>
    | undefined;
  if (options.extraInfo) options.extraInfo(card, fm);

  const btnRow = card.createEl("div");
  btnRow.style.display = "flex";
  btnRow.style.gap = "4px";
  btnRow.style.flexWrap = "wrap";
  btnRow.style.marginTop = "4px";

  const mkBtn = (text: string, tooltip: string, onclick: () => void) => {
    const b = btnRow.createEl("button", { text });
    b.style.padding = "2px 8px";
    b.style.fontSize = "0.78em";
    b.style.cursor = "pointer";
    b.title = tooltip;
    b.onclick = (e) => {
      e.stopPropagation();
      onclick();
    };
  };

  mkBtn("Title", "Set or edit the title", () => {
    void plugin.setTitleOnActiveNote(file);
  });
  if (options.showCollega !== false) {
    mkBtn("Link", "Link this note to another one", () => {
      new NotePickerModal(app, file, (target) => {
        void plugin.linkActiveTo(file, target);
      }).open();
    });
  }
  if (options.showDefeated) {
    mkBtn("× Defeated", "Archive as defeated (opens motive modal)", () => {
      void plugin.archiveAsDefeated(file);
    });
  }
}

class SubstrateListView extends ItemView {
  private plugin: AntinomiaPlugin;
  constructor(leaf: WorkspaceLeaf, plugin: AntinomiaPlugin) {
    super(leaf);
    this.plugin = plugin;
  }
  getViewType(): string {
    return VIEW_TYPE_SUBSTRATE_LIST;
  }
  getDisplayText(): string {
    return "Antinomia — substrate";
  }
  getIcon(): string {
    return "layers";
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
    container.createEl("h4", { text: "Substrate" });

    const toolbar = container.createEl("div");
    toolbar.style.marginBottom = "10px";
    const newBtn = toolbar.createEl("button", { text: "+ New substrate" });
    newBtn.style.padding = "4px 10px";
    newBtn.style.fontSize = "0.85em";
    newBtn.style.cursor = "pointer";
    newBtn.style.fontWeight = "600";
    newBtn.onclick = () => {
      new NewSubstrateModal(this.app, this.plugin, (fields, skipped) => {
        if (fields === null && !skipped) return;
        const content = fields
          ? substrateTemplate(fields)
          : substrateTemplate();
        void this.plugin.createNote("S", content);
      }).open();
    };

    const items = this.app.vault.getMarkdownFiles().filter((f) => {
      const fm = this.app.metadataCache.getFileCache(f)?.frontmatter;
      return fm?.antinomia_type === TYPE.substrate;
    });
    items.sort((a, b) => b.stat.mtime - a.stat.mtime);

    if (items.length === 0) {
      container.createEl("p", {
        text: "No substrate. Raw material (quotes, facts, notes) that can generate tensions.",
      });
      return;
    }
    for (const file of items) {
      renderNoteCard(container, this.app, this.plugin, file, {
        showCollega: true,
        showDefeated: true,
      });
    }
  }
}

class PrinciplesListView extends ItemView {
  private plugin: AntinomiaPlugin;
  constructor(leaf: WorkspaceLeaf, plugin: AntinomiaPlugin) {
    super(leaf);
    this.plugin = plugin;
  }
  getViewType(): string {
    return VIEW_TYPE_PRINCIPLES_LIST;
  }
  getDisplayText(): string {
    return "Antinomia — principi";
  }
  getIcon(): string {
    return "compass";
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
    container.createEl("h4", { text: "Principles (Truth Archive)" });

    const desc = container.createEl("p");
    desc.style.fontSize = "0.85em";
    desc.style.opacity = "0.7";
    desc.setText(
      "Regole operative IF/THEN/GREY emerse dalla risoluzione delle tensioni."
    );

    const items = this.app.vault.getMarkdownFiles().filter((f) => {
      const fm = this.app.metadataCache.getFileCache(f)?.frontmatter;
      return fm?.antinomia_type === TYPE.principle;
    });
    items.sort((a, b) => b.stat.mtime - a.stat.mtime);

    if (items.length === 0) {
      container.createEl("p", {
        text: "No active principles. Elevate a resolved tension to create one.",
      });
      return;
    }
    for (const file of items) {
      renderNoteCard(container, this.app, this.plugin, file, {
        showCollega: true,
        showDefeated: true,
        extraInfo: (card, fm) => {
          const origin = fm?.origin_tension;
          if (typeof origin === "string" && origin.length > 0) {
            const o = card.createEl("div");
            o.style.fontSize = "0.78em";
            o.style.opacity = "0.6";
            o.setText(`Origine: ${origin}`);
          }
        },
      });
    }
  }
}

class DefeatedListView extends ItemView {
  private plugin: AntinomiaPlugin;
  constructor(leaf: WorkspaceLeaf, plugin: AntinomiaPlugin) {
    super(leaf);
    this.plugin = plugin;
  }
  getViewType(): string {
    return VIEW_TYPE_DEFEATED_LIST;
  }
  getDisplayText(): string {
    return "Antinomia — defeated";
  }
  getIcon(): string {
    return "archive";
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
    container.createEl("h4", { text: "Defeated archive" });

    const desc = container.createEl("p");
    desc.style.fontSize = "0.85em";
    desc.style.opacity = "0.7";
    desc.setText(
      "Defeated beliefs. Historical memory: they are not edited; they remain as a trace of what was NOT true."
    );

    const items = this.app.vault.getMarkdownFiles().filter((f) => {
      const fm = this.app.metadataCache.getFileCache(f)?.frontmatter;
      return fm?.antinomia_type === TYPE.defeated;
    });
    items.sort((a, b) => b.stat.mtime - a.stat.mtime);

    if (items.length === 0) {
      container.createEl("p", { text: "No defeated beliefs." });
      return;
    }
    for (const file of items) {
      renderNoteCard(container, this.app, this.plugin, file, {
        showCollega: true,
        showDefeated: false, // already defeated, can't re-defeat
        extraInfo: (card, fm) => {
          const motivo = fm?.motive;
          const sost = fm?.replaced_by;
          const meta = card.createEl("div");
          meta.style.fontSize = "0.78em";
          meta.style.opacity = "0.7";
          meta.style.marginBottom = "4px";
          const parts: string[] = [];
          if (typeof motivo === "string") parts.push(`motive: ${motivo}`);
          if (typeof sost === "string" && sost.length > 0)
            parts.push(`sostituita da: ${sost}`);
          meta.setText(parts.join("  |  "));
        },
      });
    }
  }
}

/**
 * Onboarding checklist sidebar. Shows a progressive list of steps with auto
 * detected completion (scans vault + tracks flags). Each step has a "Vai"
 * button that triggers the relevant command. Closes when all steps are done.
 */
class OnboardingChecklistView extends ItemView {
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
          } catch {}
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
    intro.style.fontSize = "0.85em";
    intro.style.opacity = "0.7";
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
    progress.style.fontWeight = "600";
    progress.style.marginBottom = "8px";
    progress.setText(`Progresso: ${completed} / ${steps.length}`);

    for (const step of steps) {
      const card = container.createEl("div");
      card.style.padding = "8px 10px";
      card.style.marginBottom = "6px";
      card.style.border = "1px solid var(--background-modifier-border)";
      card.style.borderRadius = "4px";
      card.style.background = step.done
        ? "var(--background-modifier-success-hover, var(--background-secondary))"
        : "var(--background-secondary)";
      card.style.opacity = step.done ? "0.7" : "1";

      const head = card.createEl("div");
      head.style.display = "flex";
      head.style.alignItems = "center";
      head.style.gap = "6px";
      head.style.fontWeight = "600";
      const icon = head.createEl("span", {
        text: step.done ? "✅" : "⬜",
      });
      icon.style.fontSize = "1.05em";
      head.createEl("span", { text: step.label });

      const desc = card.createEl("div");
      desc.style.fontSize = "0.82em";
      desc.style.opacity = "0.75";
      desc.style.margin = "4px 0 6px 22px";
      desc.setText(step.desc);

      if (!step.done) {
        const btnRow = card.createEl("div");
        btnRow.style.marginLeft = "22px";
        const goBtn = btnRow.createEl("button", { text: step.actionLabel });
        goBtn.style.padding = "2px 10px";
        goBtn.style.fontSize = "0.82em";
        goBtn.style.cursor = "pointer";
        goBtn.onclick = (e) => {
          e.stopPropagation();
          void step.action();
        };
      }
    }

    if (completed === steps.length) {
      const done = container.createEl("p");
      done.style.marginTop = "12px";
      done.style.padding = "10px";
      done.style.background = "var(--background-modifier-success, var(--background-secondary))";
      done.style.borderRadius = "4px";
      done.style.textAlign = "center";
      done.style.fontWeight = "600";
      done.setText(
        "🎉 You've completed onboarding! From here on it's real work."
      );
    }
  }
}


/**
 * Dashboard: vault status at a glance. Counters per layer + last Hunter run +
 * recent activity + quick action buttons. Refreshes on vault changes.
 */
class DashboardView extends ItemView {
  private plugin: AntinomiaPlugin;
  constructor(leaf: WorkspaceLeaf, plugin: AntinomiaPlugin) {
    super(leaf);
    this.plugin = plugin;
  }
  getViewType(): string {
    return VIEW_TYPE_DASHBOARD;
  }
  getDisplayText(): string {
    return "Antinomia — Dashboard";
  }
  getIcon(): string {
    return "layout-dashboard";
  }
  async onOpen(): Promise<void> {
    this.render();
    this.registerEvent(this.app.metadataCache.on("changed", () => this.render()));
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
    container.createEl("h4", { text: "Dashboard" });

    const files = this.app.vault.getMarkdownFiles();
    const byType = (t: string) =>
      files.filter((f) => {
        const fm = this.app.metadataCache.getFileCache(f)?.frontmatter;
        return fm?.antinomia_type === t;
      });
    const tensions = byType(TYPE.tension);
    const openTensions = tensions.filter((f) => {
      const fm = this.app.metadataCache.getFileCache(f)?.frontmatter;
      return fm?.status === "open";
    });
    const resolvedTensions = tensions.filter((f) => {
      const fm = this.app.metadataCache.getFileCache(f)?.frontmatter;
      return fm?.status === "resolved";
    });
    const substrates = byType(TYPE.substrate);
    const principles = byType(TYPE.principle);
    const defeated = byType(TYPE.defeated);
    const meta = byType(TYPE.meta);
    const unclassified = files.filter((f) => {
      const fm = this.app.metadataCache.getFileCache(f)?.frontmatter;
      return !fm || !fm.antinomia_type;
    });

    // ---- Counters grid ----
    const grid = container.createEl("div");
    grid.style.display = "grid";
    grid.style.gridTemplateColumns = "1fr 1fr";
    grid.style.gap = "6px";
    grid.style.marginBottom = "14px";

    const counter = (
      label: string,
      count: number,
      action?: () => void,
      sub?: string
    ) => {
      const card = grid.createEl("div");
      card.style.padding = "10px";
      card.style.background = "var(--background-secondary)";
      card.style.border = "1px solid var(--background-modifier-border)";
      card.style.borderRadius = "4px";
      if (action) {
        card.style.cursor = "pointer";
        card.onclick = action;
      }
      const num = card.createEl("div", { text: String(count) });
      num.style.fontSize = "1.8em";
      num.style.fontWeight = "700";
      num.style.lineHeight = "1.1";
      const lab = card.createEl("div", { text: label });
      lab.style.fontSize = "0.78em";
      lab.style.opacity = "0.8";
      if (sub) {
        const s = card.createEl("div", { text: sub });
        s.style.fontSize = "0.72em";
        s.style.opacity = "0.6";
        s.style.marginTop = "2px";
      }
    };

    counter(
      "Open tensions",
      openTensions.length,
      () => void this.plugin.activateViewExternal(VIEW_TYPE_OPEN_TENSIONS),
      `${tensions.length} total, ${resolvedTensions.length} resolved`
    );
    counter(
      "Substrate",
      substrates.length,
      () => void this.plugin.activateViewExternal(VIEW_TYPE_SUBSTRATE_LIST)
    );
    counter(
      "Principles",
      principles.length,
      () => void this.plugin.activateViewExternal(VIEW_TYPE_PRINCIPLES_LIST)
    );
    counter(
      "Defeated",
      defeated.length,
      () => void this.plugin.activateViewExternal(VIEW_TYPE_DEFEATED_LIST)
    );
    if (meta.length > 0) {
      counter("Meta-notes", meta.length);
    }
    if (unclassified.length > 0) {
      counter(
        "Unclassified",
        unclassified.length,
        () => void this.plugin.activateViewExternal(VIEW_TYPE_UNCLASSIFIED),
        "to classify"
      );
    }

    // ---- Hunter info ----
    container.createEl("h5", { text: "Hunter" });
    const hunterInfo = container.createEl("div");
    hunterInfo.style.padding = "8px 10px";
    hunterInfo.style.background = "var(--background-secondary)";
    hunterInfo.style.borderRadius = "4px";
    hunterInfo.style.fontSize = "0.85em";
    hunterInfo.style.marginBottom = "14px";
    const s = this.plugin.settings;
    if (s.lastHunterRunISO) {
      const line = hunterInfo.createEl("div");
      line.setText(`Last run: ${s.lastHunterRunISO}`);
      const count = hunterInfo.createEl("div");
      count.style.fontWeight = "600";
      count.setText(`Pairs found: ${s.lastHunterRunCount}`);
    } else {
      hunterInfo.setText("Hunter not yet run.");
    }

    // ---- Active profile ----
    container.createEl("h5", { text: "AI Profile" });
    const profInfo = container.createEl("div");
    profInfo.style.padding = "8px 10px";
    profInfo.style.background = "var(--background-secondary)";
    profInfo.style.borderRadius = "4px";
    profInfo.style.fontSize = "0.85em";
    profInfo.style.marginBottom = "14px";
    const activeP = this.plugin.activeProfile();
    profInfo.createEl("div", {
      text: `Active: ${activeP.name} (${activeP.model})`,
    });
    if (s.hunterProfileId) {
      const hp = s.profiles.find((p) => p.id === s.hunterProfileId);
      if (hp)
        profInfo.createEl("div", {
          text: `Hunter override: ${hp.name} (${hp.model})`,
        });
    }

    // ---- Recent activity ----
    container.createEl("h5", { text: "Recent activity" });
    const recent = [...files]
      .filter((f) => {
        const fm = this.app.metadataCache.getFileCache(f)?.frontmatter;
        return fm?.antinomia_type;
      })
      .sort((a, b) => b.stat.mtime - a.stat.mtime)
      .slice(0, 5);
    if (recent.length === 0) {
      container.createEl("p", {
        text: "No Antinomia notes yet.",
      });
    } else {
      const list = container.createEl("ul");
      list.style.paddingLeft = "20px";
      list.style.fontSize = "0.85em";
      for (const f of recent) {
        const li = list.createEl("li");
        const a = li.createEl("a", { text: humanTitle(this.app, f), href: "#" });
        a.style.cursor = "pointer";
        a.onclick = (e) => {
          e.preventDefault();
          this.app.workspace.getLeaf(false).openFile(f);
        };
      }
    }

    // ---- Quick actions ----
    container.createEl("h5", { text: "Quick actions" });
    const actions = container.createEl("div");
    actions.style.display = "flex";
    actions.style.flexWrap = "wrap";
    actions.style.gap = "6px";
    actions.style.marginTop = "8px";

    const mkAct = (text: string, onclick: () => void, cta = false) => {
      const b = actions.createEl("button", { text });
      b.style.padding = "4px 10px";
      b.style.fontSize = "0.85em";
      b.style.cursor = "pointer";
      if (cta) {
        b.style.background = "var(--interactive-accent)";
        b.style.color = "var(--text-on-accent)";
        b.style.fontWeight = "600";
      }
      b.onclick = onclick;
    };
    mkAct("✨ Free", () => this.plugin.openFreeInputModal(), true);
    mkAct("+ Tension", () => {
      new NewTensionModal(this.app, this.plugin, (fields, skipped) => {
        if (fields === null && !skipped) return;
        const content = fields ? tensionTemplate(fields) : tensionTemplate();
        void this.plugin.createNote("T", content);
      }).open();
    });
    mkAct("+ Substrate", () => {
      new NewSubstrateModal(this.app, this.plugin, (fields, skipped) => {
        if (fields === null && !skipped) return;
        const content = fields ? substrateTemplate(fields) : substrateTemplate();
        void this.plugin.createNote("S", content);
      }).open();
    });
    mkAct("🔍 Hunter", () => void this.plugin.runHunter());
    mkAct("🕸 Graph", () =>
      void this.plugin.activateViewExternal(VIEW_TYPE_GRAPH)
    );
    mkAct("Audit", () =>
      void this.plugin.activateViewExternal(VIEW_TYPE_AUDIT)
    );
    mkAct("Guide", () => new GuidanceModal(this.app, this.plugin).open());
  }
}

/**
 * Audit Vault: scans the vault for incomplete or malformed Antinomia notes
 * and surfaces them in actionable categories. Each issue links to the file
 * and (where relevant) has a quick action.
 */
class AuditVaultView extends ItemView {
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
      const fm = this.app.metadataCache.getFileCache(f)?.frontmatter;
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
        } catch {}
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
    desc.style.fontSize = "0.85em";
    desc.style.opacity = "0.7";
    desc.setText(
      "Health report: incomplete or malformed Antinomia notes. Click an issue to open the note and fix it."
    );

    const files = this.app.vault.getMarkdownFiles();
    const fmOf = (f: TFile) =>
      this.app.metadataCache.getFileCache(f)?.frontmatter as
        | Record<string, unknown>
        | undefined;

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
        typeof fm?.title === "string" && (fm.title as string).trim();
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
    summary.style.fontWeight = "600";
    summary.style.marginBottom = "10px";
    if (totalIssues === 0) {
      summary.style.color = "var(--text-success, var(--text-accent))";
      summary.setText("✅ No issues found. Vault is healthy.");
      return;
    }
    summary.setText(`${totalIssues} total issues across ${sections.filter((s) => s.issues.length > 0).length} categories.`);

    for (const sec of sections) {
      if (sec.issues.length === 0) continue;
      const box = container.createEl("div");
      box.style.marginBottom = "12px";
      box.style.padding = "8px 10px";
      box.style.background = "var(--background-secondary)";
      box.style.borderLeft = "3px solid var(--text-warning, var(--text-accent))";
      box.style.borderRadius = "4px";

      const head = box.createEl("div");
      head.style.fontWeight = "600";
      head.style.marginBottom = "4px";
      head.setText(`${sec.title} (${sec.issues.length})`);

      const tip = box.createEl("div");
      tip.style.fontSize = "0.78em";
      tip.style.opacity = "0.7";
      tip.style.marginBottom = "6px";
      tip.setText(sec.suggestion);

      const list = box.createEl("ul");
      list.style.paddingLeft = "20px";
      list.style.fontSize = "0.85em";
      list.style.margin = "0";
      for (const issue of sec.issues) {
        const li = list.createEl("li");
        const a = li.createEl("a", { text: issue.label, href: "#" });
        a.style.cursor = "pointer";
        a.title = issue.file.basename;
        a.onclick = (e) => {
          e.preventDefault();
          this.app.workspace.getLeaf(false).openFile(issue.file);
        };
      }
    }
  }
}

/**
 * Migration helper: shows every markdown note in the vault that does NOT have
 * `antinomia_type` (and is not flagged `antinomia_ignora`). For each one, the
 * user can: mark as a specific layer, classify via AI, or ignore.
 */
class UnclassifiedNotesView extends ItemView {
  private plugin: AntinomiaPlugin;
  constructor(leaf: WorkspaceLeaf, plugin: AntinomiaPlugin) {
    super(leaf);
    this.plugin = plugin;
  }
  getViewType(): string {
    return VIEW_TYPE_UNCLASSIFIED;
  }
  getDisplayText(): string {
    return "Antinomia — Unclassified";
  }
  getIcon(): string {
    return "help-circle";
  }
  async onOpen(): Promise<void> {
    this.render();
    this.registerEvent(this.app.metadataCache.on("changed", () => this.render()));
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
    container.createEl("h4", { text: "Unclassified notes" });

    const desc = container.createEl("p");
    desc.style.fontSize = "0.85em";
    desc.style.opacity = "0.7";
    desc.setText(
      "Note del vault senza antinomia_type. Utile per migrare un vault esistente: classifica una per una manualmente o con AI. 'Ignora' aggiunge antinomia_ignora: true (non riapparira'). I file in trash sono esclusi."
    );

    const all = this.app.vault.getMarkdownFiles();
    const items = all.filter((f) => {
      const fm = this.app.metadataCache.getFileCache(f)?.frontmatter;
      if (fm?.antinomia_type) return false;
      if (fm?.antinomia_ignora === true) return false;
      // skip files that are trashed (Obsidian trash convention varies)
      return true;
    });

    if (items.length === 0) {
      const ok = container.createEl("p");
      ok.style.padding = "12px";
      ok.style.background = "var(--background-modifier-success, var(--background-secondary))";
      ok.style.borderRadius = "4px";
      ok.setText(
        "✅ Tutte le note del vault sono classificate (o esplicitamente ignorate). Niente da migrare."
      );
      return;
    }

    const summary = container.createEl("p");
    summary.style.fontWeight = "600";
    summary.style.marginBottom = "10px";
    summary.setText(
      `${items.length} note da classificare. Inizia dalle piu' recenti.`
    );

    // Sort by mtime descending
    items.sort((a, b) => b.stat.mtime - a.stat.mtime);

    // Limit visible to 50 to avoid huge DOM (with a "show more" if needed)
    const MAX = 50;
    const visible = items.slice(0, MAX);
    if (items.length > MAX) {
      const note = container.createEl("p");
      note.style.fontSize = "0.78em";
      note.style.opacity = "0.7";
      note.setText(
        `Showing the first ${MAX} of ${items.length}. Classify (or ignore) them to see the next ones.`
      );
    }

    for (const file of visible) {
      const card = container.createEl("div");
      card.style.padding = "8px 10px";
      card.style.marginBottom = "8px";
      card.style.border = "1px solid var(--background-modifier-border)";
      card.style.borderRadius = "5px";
      card.style.background = "var(--background-secondary)";

      const titleRow = card.createEl("div");
      titleRow.style.marginBottom = "6px";
      const title = humanTitle(this.app, file);
      const link = titleRow.createEl("a", { text: title, href: "#" });
      link.style.cursor = "pointer";
      link.style.fontWeight = "600";
      link.title = `${file.path} (clicca per aprire)`;
      link.onclick = (e) => {
        e.preventDefault();
        this.app.workspace.getLeaf(false).openFile(file);
      };
      const pathLine = card.createEl("div");
      pathLine.style.fontSize = "0.75em";
      pathLine.style.opacity = "0.55";
      pathLine.setText(file.path);

      const btnRow = card.createEl("div");
      btnRow.style.display = "flex";
      btnRow.style.flexWrap = "wrap";
      btnRow.style.gap = "4px";
      btnRow.style.marginTop = "6px";

      const mkBtn = (
        text: string,
        tooltip: string,
        onclick: () => void,
        warning = false
      ) => {
        const b = btnRow.createEl("button", { text });
        b.style.padding = "2px 8px";
        b.style.fontSize = "0.78em";
        b.style.cursor = "pointer";
        if (warning) b.style.opacity = "0.7";
        b.title = tooltip;
        b.onclick = (e) => {
          e.stopPropagation();
          onclick();
        };
      };

      mkBtn("Tension", "Mark as tension (adds antinomia_type)", () =>
        void this.plugin.markAsType(file, TYPE.tension)
      );
      mkBtn("Substrate", "Mark as substrate", () =>
        void this.plugin.markAsType(file, TYPE.substrate)
      );
      mkBtn("Principle", "Mark as principle", () =>
        void this.plugin.markAsType(file, TYPE.principle)
      );
      mkBtn("Defeated", "Mark as defeated", () =>
        void this.plugin.markAsType(file, TYPE.defeated)
      );
      mkBtn("Meta", "Mark as meta_note", () =>
        void this.plugin.markAsType(file, TYPE.meta)
      );
      mkBtn("AI", "Classify with AI (asks confirmation)", () =>
        void this.plugin.classifyActiveNoteExternal(file)
      );
      mkBtn(
        "Ignore",
        "Adds antinomia_ignore: true (the note disappears from this list)",
        () => void this.plugin.ignoreNote(file),
        true
      );
    }
  }
}

// ---------- plugin entry point ----------


// ============================================================================
// Antinomia Graph View — vista grafo custom con filtri per layer
// ============================================================================

class AntinomiaGraphView extends ItemView {
  plugin: AntinomiaPlugin;
  filters: GraphFilters = { ...DEFAULT_GRAPH_FILTERS };
  layoutName = "clusters";
  cy: any = null; // cytoscape Core, kept any for build size
  graphContainer: HTMLElement | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: AntinomiaPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return VIEW_TYPE_GRAPH;
  }
  getDisplayText(): string {
    return "Antinomia Graph";
  }
  getIcon(): string {
    return "git-fork";
  }

  async onOpen(): Promise<void> {
    this.render();
    // Refresh when vault changes
    this.registerEvent(
      this.app.metadataCache.on("changed", () => this.scheduleRefresh())
    );
    this.registerEvent(
      this.app.vault.on("delete", () => this.scheduleRefresh())
    );
    this.registerEvent(
      this.app.vault.on("rename", () => this.scheduleRefresh())
    );
  }

  private refreshTimer: number | null = null;
  private scheduleRefresh(): void {
    if (this.refreshTimer) window.clearTimeout(this.refreshTimer);
    this.refreshTimer = window.setTimeout(() => {
      this.refreshTimer = null;
      this.rebuildGraph();
    }, 400);
  }

  async onClose(): Promise<void> {
    this.stopContinuousPhysics();
    if (this.cy) {
      this.cy.destroy();
      this.cy = null;
    }
  }

  render(): void {
    const { contentEl } = this;
    contentEl.empty();
    renderAntinomiaNav(this.plugin, contentEl, this.leaf);
    contentEl.style.padding = "0";
    contentEl.style.display = "flex";
    contentEl.style.flexDirection = "column";
    contentEl.style.height = "100%";
    contentEl.style.overflow = "hidden"; // niente scrollbar lampeggiante quando i nodi fluttuano
    // Anche il parent .view-content puo' avere overflow:auto di default
    const viewContent = contentEl.closest(".view-content") as HTMLElement | null;
    if (viewContent) viewContent.style.overflow = "hidden";

    // Toolbar
    const toolbar = contentEl.createDiv();
    toolbar.style.padding = "8px 12px";
    toolbar.style.borderBottom = "1px solid var(--background-modifier-border)";
    toolbar.style.display = "flex";
    toolbar.style.flexWrap = "wrap";
    toolbar.style.gap = "8px";
    toolbar.style.alignItems = "center";

    const label = toolbar.createSpan({ text: "Antinomia Graph" });
    label.style.fontWeight = "bold";
    label.style.marginRight = "12px";

    const mkChk = (
      key: keyof GraphFilters,
      txt: string,
      colorKey: string
    ): void => {
      const wrap = toolbar.createSpan();
      wrap.style.display = "inline-flex";
      wrap.style.alignItems = "center";
      wrap.style.gap = "4px";
      wrap.style.padding = "2px 6px";
      wrap.style.borderRadius = "4px";
      wrap.style.background = "var(--background-secondary)";
      const cb = wrap.createEl("input", { type: "checkbox" });
      cb.checked = this.filters[key];
      cb.id = `cb-${String(key)}`;
      const dot = wrap.createSpan();
      dot.style.width = "10px";
      dot.style.height = "10px";
      dot.style.borderRadius = "50%";
      dot.style.background = this.activeLayerColor(colorKey);
      dot.style.display = "inline-block";
      const lab = wrap.createEl("label", { text: txt });
      lab.htmlFor = cb.id;
      lab.style.fontSize = "0.85em";
      lab.style.cursor = "pointer";
      cb.onchange = () => {
        this.filters[key] = cb.checked;
        this.rebuildGraph();
        // rebuildGraph() now adds new nodes at layer-specific positions
        // (not at (0,0)) and the existing continuous physics simulation
        // integrates them naturally. No full fcose re-layout — that was
        // causing the "pallini swarm to center then expand" effect because
        // fcose internally repositions all nodes when run with animation.
        (this as any).startContinuousPhysics?.();
        // Run edge-node repulsion immediately to push nodes off the new
        // edges. Then a second pass after the physics has briefly settled
        // to clean up any residual overlaps the physics may have re-created.
        // Physics keeps running so movement stays smooth (no freeze).
        try {
          (this as any).applyEdgeNodeRepulsion?.();
        } catch {
          /* ignore */
        }
        window.setTimeout(() => {
          try {
            (this as any).applyEdgeNodeRepulsion?.();
          } catch {
            /* ignore */
          }
        }, 600);
      };
    };

    mkChk("tensione_aperta", "Open tensions", "tensione_aperta");
    mkChk("tensione_risolta", "Resolved", "tensione_risolta");
    mkChk("tensione_elevata", "Elevated", "tensione_elevata");
    mkChk("substrate", "Substrate", "substrate");
    mkChk("principle", "Principles", "principle");
    mkChk("defeated", "Defeated", "defeated");
    mkChk("meta_note", "Meta", "meta_note");

    // Spacer
    const spacer = toolbar.createDiv();
    spacer.style.flex = "1";

    // Layout dropdown
    const layoutSel = toolbar.createEl("select");
    layoutSel.style.padding = "2px 4px";
    [
      ["clusters", "Clusters by layer"],
      ["fcose", "Force-directed (free)"],
      ["concentric", "Concentric"],
      ["grid", "Grid"],
      ["circle", "Circle"],
      ["breadthfirst", "Tree"],
    ].forEach(([v, t]) => {
      const opt = layoutSel.createEl("option", { value: v, text: t });
      if (v === this.layoutName) opt.selected = true;
    });
    layoutSel.onchange = () => {
      this.layoutName = layoutSel.value;
      this.applyLayout();
    };

    const fitBtn = toolbar.createEl("button", { text: "Fit" });
    fitBtn.onclick = () => this.cy?.fit(undefined, 40);

    const resetBtn = toolbar.createEl("button", { text: "Reset filters" });
    resetBtn.onclick = () => {
      this.filters = { ...DEFAULT_GRAPH_FILTERS };
      this.render();
    };

    // Graph container
    const container = contentEl.createDiv();
    container.style.flex = "1";
    container.style.minHeight = "0"; // permette al flex item di restringersi
    container.style.background = "var(--background-primary)";
    container.style.overflow = "hidden";
    container.style.position = "relative";
    this.graphContainer = container;

    // Zoom slider verticale: figlio di contentEl (NON di container) cosi'
    // non viene coperto dai canvas Cytoscape che vivono dentro container.
    // Posizionato assoluto rispetto a contentEl con riferimento al container.
    const sliderWrap = contentEl.createDiv();
    sliderWrap.style.cssText =
      "position:absolute; right:18px; top:50%; transform:translateY(-50%); " +
      "display:flex; flex-direction:column; align-items:center; gap:6px; " +
      "background:var(--background-secondary); padding:8px 6px; border-radius:6px; " +
      "z-index:9999; pointer-events:auto; opacity:0.9;";
    const plusBtn = sliderWrap.createEl("button", { text: "+" });
    plusBtn.style.cssText =
      "width:24px; height:24px; padding:0; cursor:pointer; font-weight:bold;";
    const slider = sliderWrap.createEl("input");
    slider.type = "range";
    slider.min = "0";
    slider.max = "100";
    slider.step = "1";
    slider.value = "50";
    // Vertical slider: the legacy `appearance: slider-vertical` keyword is
    // deprecated in Chromium. Use the standard alternative (vertical
    // writing-mode + RTL direction) which works in all current browsers.
    slider.style.cssText =
      "writing-mode: vertical-lr; direction: rtl; " +
      "width: 8px; height: 160px; cursor: pointer; pointer-events: auto;";
    (slider as any).orient = "vertical";
    const minusBtn = sliderWrap.createEl("button", { text: "−" });
    minusBtn.style.cssText =
      "width:24px; height:24px; padding:0; cursor:pointer; font-weight:bold;";

    // Conversione: slider 0-100 <-> zoom 0.02-8 (log scale)
    const LN_MIN = Math.log(0.02);
    const LN_MAX = Math.log(8);
    const sliderToZoom = (v: number): number =>
      Math.exp(LN_MIN + (v / 100) * (LN_MAX - LN_MIN));
    const zoomToSlider = (z: number): number =>
      ((Math.log(z) - LN_MIN) / (LN_MAX - LN_MIN)) * 100;

    const applySliderZoom = (val: number): void => {
      if (!this.cy) return;
      const newZoom = sliderToZoom(val);
      // Centra sul centro viewport (non sul cursore)
      const w = this.cy.width();
      const h = this.cy.height();
      this.cy.stop(true, false);
      this.cy.animate({
        zoom: { level: newZoom, renderedPosition: { x: w / 2, y: h / 2 } },
        duration: 180,
        easing: "ease-out",
        queue: false,
      });
    };

    slider.addEventListener("input", () => {
      applySliderZoom(parseFloat(slider.value));
    });
    plusBtn.onclick = () => {
      const newVal = Math.min(100, parseFloat(slider.value) + 6);
      slider.value = String(newVal);
      applySliderZoom(newVal);
    };
    minusBtn.onclick = () => {
      const newVal = Math.max(0, parseFloat(slider.value) - 6);
      slider.value = String(newVal);
      applySliderZoom(newVal);
    };

    // Sync slider quando l'utente usa la rotella
    const updateSliderFromCy = (): void => {
      if (!this.cy) return;
      const v = Math.max(0, Math.min(100, zoomToSlider(this.cy.zoom())));
      slider.value = String(v);
    };
    // Wait per cy creato, poi aggancia listener
    window.setTimeout(() => {
      if (this.cy) {
        this.cy.on("zoom", updateSliderFromCy);
        updateSliderFromCy();
      }
    }, 200);

    // Wait one tick so container has dimensions
    window.setTimeout(() => this.rebuildGraph(), 50);
  }

  private collectGraphData(): { nodes: any[]; edges: any[] } {
    const nodes: any[] = [];
    const edges: any[] = [];
    const seenEdges = new Set<string>();
    const includedBasenames = new Set<string>();

    const layerKey = (
      fm: any
    ): keyof GraphFilters | null => {
      const t = fm?.antinomia_type;
      if (t === TYPE.tension) {
        const stato = fm?.status;
        // Legacy: tension+status=elevated (rare; the normal Design C flow
        // converts an elevated tension into a defeated+motive=elevated +
        // a new principle).
        if (stato === "elevated") return "tensione_elevata";
        if (stato === "resolved") return "tensione_risolta";
        return "tensione_aperta";
      }
      if (t === TYPE.substrate) return "substrate";
      if (t === TYPE.principle) return "principle";
      if (t === TYPE.defeated) {
        // A defeated with motive=elevated is the *original* tension that
        // gave birth to a principle (Design C). Treat it as the "elevated"
        // layer so the "Elevated" filter checkbox shows these notes — the
        // ones that have actually been elevated, not the rare legacy state.
        const motive = fm?.motive;
        if (motive === "elevated") return "tensione_elevata";
        return "defeated";
      }
      if (t === TYPE.meta) return "meta_note";
      return null;
    };

    const colorKey = (key: keyof GraphFilters): string => {
      // Identity mapping (kept as a function for potential future remapping).
      return String(key);
    };

    const allFiles = this.app.vault.getMarkdownFiles();
    const fileByBasename = new Map<string, TFile>();
    for (const f of allFiles) fileByBasename.set(f.basename, f);

    // Pass 1: nodes
    for (const f of allFiles) {
      const fm = this.app.metadataCache.getFileCache(f)?.frontmatter;
      const key = layerKey(fm);
      if (!key) continue;
      if (!this.filters[key]) continue;
      includedBasenames.add(f.basename);
      const title = humanTitle(this.app, f);
      const ck = colorKey(key);
      // Tronca a 22 char per leggibilita'; full title resta nei tooltip
      const shortLabel =
        title.length > 22 ? title.slice(0, 20).trimEnd() + "..." : title;
      const nodeColor = this.activeLayerColor(ck);
      nodes.push({
        data: {
          id: f.basename,
          label: shortLabel,
          fullTitle: title,
          layer: key,
          color: nodeColor,
          shape: LAYER_SHAPES[ck] || "ellipse",
          glow: this.glowSvgDataUri(nodeColor),
          glowBright: this.glowSvgDataUri(nodeColor, true),
        },
      });
    }

    // Pass 2: edges from frontmatter + body wikilinks
    const wikilinkRe = /\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]+)?\]\]/g;
    const addEdge = (src: string, tgt: string, kind: string): void => {
      if (!src || !tgt) return;
      if (src === tgt) return; // skip self-loops
      if (!includedBasenames.has(src) || !includedBasenames.has(tgt)) return;
      const key = `${src}->${tgt}`;
      if (seenEdges.has(key)) return;
      seenEdges.add(key);
      // ID semantico stabile cosi' il diff funziona tra rebuild consecutivi.
      edges.push({
        data: { id: `e-${src}-${kind}->${tgt}`, source: src, target: tgt, kind },
      });
    };

    const extractBasenameFromWikilink = (raw: any): string | null => {
      if (typeof raw !== "string") return null;
      const m = raw.match(/\[\[([^\]|#]+)/);
      if (!m) return null;
      // could be "T-foo" or a full path "notes/T-foo"; take the last segment
      const last = m[1].split("/").pop() || m[1];
      return last.trim();
    };

    for (const f of allFiles) {
      if (!includedBasenames.has(f.basename)) continue;
      const fm = this.app.metadataCache.getFileCache(f)?.frontmatter;
      if (!fm) continue;

      // origin_tension: scalar "[[X]]"
      const origine = extractBasenameFromWikilink(fm.origin_tension);
      if (origine) addEdge(f.basename, origine, "origin");

      // replaced_by: scalar "[[X]]"
      const sost = extractBasenameFromWikilink(fm.replaced_by);
      if (sost) addEdge(f.basename, sost, "sostituita");

      // links: array of "[[X]]"
      if (Array.isArray(fm.links)) {
        for (const c of fm.links) {
          const b = extractBasenameFromWikilink(c);
          if (b) addEdge(f.basename, b, "collegamento");
        }
      }

      // wikilinks in body (resolved via metadataCache.links is better but we keep simple)
      const cache = this.app.metadataCache.getFileCache(f);
      if (cache?.links) {
        for (const lk of cache.links) {
          const target = lk.link.split("/").pop() || lk.link;
          addEdge(f.basename, target, "body");
        }
      }
    }

    return { nodes, edges };
  }

  /**
   * Angolo (rad) del centroide per ogni layer — usato per posizionare
   * i nuovi nodi che entrano dal toggle dei checkbox filtri.
   */
  /**
   * Restituisce il colore attivo per un layer leggendo dal preset selezionato
   * (o dal custom). Fallback al LAYER_COLORS default se chiave sconosciuta.
   */
  /**
   * Force full rebuild: destroy cy e ricostruisci, cosi' i preset/custom
   * colors vengono riapplicati. Chiamato quando l'utente cambia stile.
   */
  applyStyleChange(): void {
    this.stopContinuousPhysics();
    if (this.cy) {
      this.cy.destroy();
      this.cy = null;
    }
    this.rebuildGraph();
  }

  private activeLayerColor(colorKey: string): string {
    const styleName = this.plugin.settings.graphStyleName || "default";
    const palette: GraphColors =
      styleName === "custom"
        ? this.plugin.settings.graphCustomColors
        : (GRAPH_STYLE_PRESETS[styleName] || GRAPH_STYLE_PRESETS.default);
    return (palette as any)[colorKey] || LAYER_COLORS[colorKey] || "#888";
  }

  /**
   * Build an inline SVG data URI that renders a solid colored disc with a
   * soft radial-gradient halo around it (neon glow effect). The image is
   * used as the node's background-image so each node carries its own
   * per-color glow without external dependencies.
   *
   * The viewBox is 100x100; the inner disc has r=18 and the glow extends
   * out to r=50. Combined with `background-clip: none` and a 300% bg width,
   * the visible disc stays ~18px while the glow spreads ~27px beyond.
   */
  private glowSvgDataUri(color: string, bright = false): string {
    // Explicit width/height (not just viewBox) so Cytoscape rasterizes the
    // SVG at a stable pixel size and the halo stays centered during zoom.
    // Quadratic falloff (1-t)^2 with many stops, so the gradient blends
    // smoothly into the background without creating a perceived dark ring
    // (Mach band) where the alpha approaches zero.
    // `bright` variant: stronger stops + larger inner disc, used on hover.
    const stops = bright
      ? [
          [0, 1], [15, 0.92], [30, 0.72], [45, 0.50],
          [60, 0.32], [75, 0.18], [90, 0.06], [100, 0],
        ]
      : [
          [0, 1], [15, 0.72], [30, 0.49], [45, 0.30],
          [60, 0.16], [75, 0.06], [90, 0.01], [100, 0],
        ];
    const innerR = bright ? 16 : 14;
    const stopXml = stops
      .map(
        ([o, a]) =>
          `<stop offset="${o}%" stop-color="${color}" stop-opacity="${a}"/>`
      )
      .join("");
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100">' +
      '<defs><radialGradient id="g" cx="50" cy="50" r="50" gradientUnits="userSpaceOnUse">' +
      stopXml +
      '</radialGradient></defs>' +
      '<circle cx="50" cy="50" r="50" fill="url(#g)"/>' +
      `<circle cx="50" cy="50" r="${innerR}" fill="${color}"/>` +
      "</svg>";
    return "data:image/svg+xml;utf8," + encodeURIComponent(svg);
  }

  /**
   * Two SVG overlays:
   *  - edgePathsSvg: lives BELOW the Cytoscape canvases (so edges appear
   *    behind the nodes), holds the gradient/blur defs and the edge paths.
   *  - edgeLabelsSvg: lives ABOVE the canvases, holds only the node labels
   *    so they are never covered by edges or nodes.
   */
  private edgePathsSvg: SVGSVGElement | null = null;
  private edgeLabelsSvg: SVGSVGElement | null = null;

  /**
   * Create an absolutely-positioned SVG inside graphContainer that re-draws
   * every edge with a linear gradient (source-color -> target-color) and a
   * gaussian-blur halo, producing the neon "color-bleeding" look that the
   * Cytoscape canvas renderer can't produce natively.
   *
   * The SVG sits over Cytoscape's canvases (pointer-events: none) and is
   * kept in sync via `cy.on('render pan zoom position')`.
   */
  private setupEdgeGlowOverlay(): void {
    if (!this.cy || !this.graphContainer) return;
    const SVG_NS = "http://www.w3.org/2000/svg";

    // Make sure the container is a positioning context so absolute SVG fits.
    if (getComputedStyle(this.graphContainer).position === "static") {
      this.graphContainer.style.position = "relative";
    }

    // (Re)create both overlays
    if (this.edgePathsSvg && this.edgePathsSvg.parentNode) {
      this.edgePathsSvg.parentNode.removeChild(this.edgePathsSvg);
    }
    if (this.edgeLabelsSvg && this.edgeLabelsSvg.parentNode) {
      this.edgeLabelsSvg.parentNode.removeChild(this.edgeLabelsSvg);
    }
    const mkOverlaySvg = (zIndex: string): SVGSVGElement => {
      const s = document.createElementNS(SVG_NS, "svg");
      s.style.position = "absolute";
      s.style.top = "0";
      s.style.left = "0";
      s.style.width = "100%";
      s.style.height = "100%";
      s.style.pointerEvents = "none";
      s.style.zIndex = zIndex;
      return s;
    };
    // Paths SVG (BEHIND Cytoscape canvases): zIndex 0, prepended in DOM
    const pathsSvg = mkOverlaySvg("0");
    // Labels SVG (ABOVE Cytoscape canvases): zIndex 10, appended
    const labelsSvg = mkOverlaySvg("10");
    const svg = pathsSvg;
    // Two shared gaussian-blur filters (strong + mild). Per-edge color
    // comes from the linearGradient we generate dynamically below.
    const defs = document.createElementNS(SVG_NS, "defs");
    defs.setAttribute("id", "ant-edge-defs");
    const mkBlur = (id: string, stdDev: string): SVGFilterElement => {
      const f = document.createElementNS(SVG_NS, "filter");
      f.setAttribute("id", id);
      f.setAttribute("x", "-100%");
      f.setAttribute("y", "-100%");
      f.setAttribute("width", "300%");
      f.setAttribute("height", "300%");
      const b = document.createElementNS(SVG_NS, "feGaussianBlur");
      b.setAttribute("stdDeviation", stdDev);
      f.appendChild(b);
      return f;
    };
    // Edge halo blur — dialed back further: 7/2.5 → 4/1.5 → 2.5/1.
    // The glow is now a faint accent rather than an effect; the readable
    // line is the sharp core path drawn on top.
    defs.appendChild(mkBlur("ant-edge-blur-strong", "2.5"));
    defs.appendChild(mkBlur("ant-edge-blur-mild", "1"));
    svg.appendChild(defs);
    // <g> for edge paths inside pathsSvg
    const g = document.createElementNS(SVG_NS, "g");
    g.setAttribute("id", "ant-edge-paths");
    pathsSvg.appendChild(g);
    // <g> for node labels inside labelsSvg
    const gLabels = document.createElementNS(SVG_NS, "g");
    gLabels.setAttribute("id", "ant-node-labels");
    labelsSvg.appendChild(gLabels);

    // pathsSvg goes BEFORE the Cytoscape canvases in DOM order (so it renders behind)
    this.graphContainer.insertBefore(pathsSvg, this.graphContainer.firstChild);
    // labelsSvg goes AFTER (so it renders on top of nodes)
    this.graphContainer.appendChild(labelsSvg);
    this.edgePathsSvg = pathsSvg;
    this.edgeLabelsSvg = labelsSvg;

    const update = (): void => {
      if (!this.cy || !this.edgePathsSvg || !this.edgeLabelsSvg) return;
      const defsEl = this.edgePathsSvg.querySelector("#ant-edge-defs");
      const group = this.edgePathsSvg.querySelector("#ant-edge-paths");
      if (!defsEl || !group) return;
      // Resize both SVGs to match container
      const w = this.graphContainer!.clientWidth;
      const h = this.graphContainer!.clientHeight;
      this.edgePathsSvg.setAttribute("viewBox", `0 0 ${w} ${h}`);
      this.edgeLabelsSvg.setAttribute("viewBox", `0 0 ${w} ${h}`);
      // Clear existing per-edge gradients and paths
      Array.from(defsEl.querySelectorAll("linearGradient")).forEach((el) =>
        el.remove()
      );
      while (group.firstChild) group.removeChild(group.firstChild);
      // Compute the visible disc radius (in screen pixels) for a node,
      // based on its current state. The inner disc in our glow SVG is
      // r=14 normally and r=16 in the bright variant (hover-focus only).
      const cyZoom = this.cy.zoom();
      const discRadiusOf = (n: any): number => {
        const innerR = n.hasClass("hover-focus") ? 16 : 14;
        const nodeWidth = n.width() || 44;
        return (innerR / 100) * nodeWidth * cyZoom;
      };

      // Re-draw every edge with src->tgt linear gradient
      let i = 0;
      this.cy.edges().forEach((edge: any) => {
        const src = edge.source();
        const tgt = edge.target();
        const sp = src.renderedPosition();
        const tp = tgt.renderedPosition();
        if (!sp || !tp) return;
        const srcColor = src.data("color") || "#9e9e9e";
        const tgtColor = tgt.data("color") || "#9e9e9e";
        // Shrink the line so it stops at the outer edge of each disc
        // instead of running into the node centers.
        const dx = tp.x - sp.x;
        const dy = tp.y - sp.y;
        const dist = Math.hypot(dx, dy);
        const rSrc = discRadiusOf(src);
        const rTgt = discRadiusOf(tgt);
        if (dist <= rSrc + rTgt + 1) return; // nodes overlap, skip
        const ux = dx / dist;
        const uy = dy / dist;
        const sx = sp.x + ux * rSrc;
        const sy = sp.y + uy * rSrc;
        const tx = tp.x - ux * rTgt;
        const ty = tp.y - uy * rTgt;
        // No more dimming on hover — every edge stays at full brightness.
        const fadeFactor = 1;
        const gradId = `ant-grad-${i++}`;
        // Linear gradient running along the edge line
        const grad = document.createElementNS(SVG_NS, "linearGradient");
        grad.setAttribute("id", gradId);
        grad.setAttribute("gradientUnits", "userSpaceOnUse");
        grad.setAttribute("x1", String(sx));
        grad.setAttribute("y1", String(sy));
        grad.setAttribute("x2", String(tx));
        grad.setAttribute("y2", String(ty));
        const stop1 = document.createElementNS(SVG_NS, "stop");
        stop1.setAttribute("offset", "0%");
        stop1.setAttribute("stop-color", srcColor);
        const stop2 = document.createElementNS(SVG_NS, "stop");
        stop2.setAttribute("offset", "100%");
        stop2.setAttribute("stop-color", tgtColor);
        grad.appendChild(stop1);
        grad.appendChild(stop2);
        defsEl.appendChild(grad);

        const d = `M ${sx} ${sy} L ${tx} ${ty}`;
        // Strong outer halo — thinner: stroke 4→3.
        const haloOuter = document.createElementNS(SVG_NS, "path");
        haloOuter.setAttribute("d", d);
        haloOuter.setAttribute("stroke", `url(#${gradId})`);
        haloOuter.setAttribute("stroke-width", "3");
        haloOuter.setAttribute("stroke-linecap", "round");
        haloOuter.setAttribute("fill", "none");
        haloOuter.setAttribute("opacity", String(0.12 * fadeFactor));
        haloOuter.setAttribute("filter", "url(#ant-edge-blur-strong)");
        group.appendChild(haloOuter);
        // Inner halo — thinner: stroke 2.5→1.8.
        const haloInner = document.createElementNS(SVG_NS, "path");
        haloInner.setAttribute("d", d);
        haloInner.setAttribute("stroke", `url(#${gradId})`);
        haloInner.setAttribute("stroke-width", "1.8");
        haloInner.setAttribute("stroke-linecap", "round");
        haloInner.setAttribute("fill", "none");
        haloInner.setAttribute("opacity", String(0.22 * fadeFactor));
        haloInner.setAttribute("filter", "url(#ant-edge-blur-mild)");
        group.appendChild(haloInner);
        // Core (sharp, opaque) — thinner: stroke 1.4→0.9 for a subtler
        // overall line weight. Opacity kept high so the line stays crisp.
        const core = document.createElementNS(SVG_NS, "path");
        core.setAttribute("d", d);
        core.setAttribute("stroke", `url(#${gradId})`);
        core.setAttribute("stroke-width", "0.9");
        core.setAttribute("stroke-linecap", "round");
        core.setAttribute("fill", "none");
        core.setAttribute("opacity", String(0.85 * fadeFactor));
        group.appendChild(core);
      });

      // ---- Pass 2: node labels in the ABOVE SVG (always on top) ----
      const labelsGroup = this.edgeLabelsSvg.querySelector("#ant-node-labels");
      if (!labelsGroup) return;
      while (labelsGroup.firstChild) labelsGroup.removeChild(labelsGroup.firstChild);
      // Labels are forced white so they stay legible on the dark canvas
      // regardless of the active Obsidian theme.
      const labelColor = "#ffffff";
      const zoom = this.cy.zoom();
      // Skip rendering if the label would be too small to read (matches the
      // min-zoomed-font-size: 8 we used on the cy style).
      const minReadable = zoom * 10 >= 8;
      if (!minReadable) return;
      this.cy.nodes().forEach((node: any) => {
        const label = node.data("label");
        if (!label) return;
        const pos = node.renderedPosition();
        if (!pos) return;
        // Bottom of the node disc in screen pixels (node is 32 graph-units)
        const halfHeight = 16 * zoom;
        const textY = pos.y + halfHeight + 4 + 9; // +text-margin-y +font-ascender
        const isHighlight =
          node.hasClass("hover-focus") || node.hasClass("hover-neighbor");
        // No more fade on hover — all labels stay at full opacity.
        const opacity = 1;
        const text = document.createElementNS(SVG_NS, "text");
        text.setAttribute("x", String(pos.x));
        text.setAttribute("y", String(textY));
        text.setAttribute("text-anchor", "middle");
        text.setAttribute("font-size", "10");
        text.setAttribute(
          "font-family",
          "var(--font-text), -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
        );
        text.setAttribute("font-weight", isHighlight ? "600" : "400");
        text.setAttribute("fill", labelColor);
        text.setAttribute("opacity", String(opacity));
        text.setAttribute("paint-order", "stroke");
        text.setAttribute("stroke", "rgba(0,0,0,0.55)");
        text.setAttribute("stroke-width", "3");
        text.setAttribute("stroke-linejoin", "round");
        text.textContent = label;
        labelsGroup.appendChild(text);
      });
    };

    // Keep the overlay in sync with Cytoscape's viewport and node positions.
    // Throttle through requestAnimationFrame so we redraw at most once per
    // browser frame (~16ms / 60fps). Without this, with many edges the SVG
    // overlay re-renders multiple times per frame as the physics simulation
    // updates positions, causing visible lag.
    let rafPending = false;
    const scheduledUpdate = (): void => {
      if (rafPending) return;
      rafPending = true;
      requestAnimationFrame(() => {
        rafPending = false;
        try {
          update();
        } catch {
          /* ignore */
        }
      });
    };
    this.cy.on("render pan zoom position", scheduledUpdate);
    // First draw
    window.setTimeout(update, 50);
  }

  private layerAngleFor(layer: string): number {
    const A: Record<string, number> = {
      tensione_aperta: -Math.PI / 2,
      tensione_risolta: -Math.PI / 2 + 0.6,
      tensione_elevata: -Math.PI / 2 + 1.2,
      principio: 0,
      substrate: Math.PI,
      defeated: Math.PI / 2,
      meta_nota: Math.PI / 2 + 0.9,
    };
    return A[layer] ?? 0;
  }

  rebuildGraph(): void {
    if (!this.graphContainer) return;
    const { nodes, edges } = this.collectGraphData();
    const newElements = [...nodes, ...edges];

    // CASO A: grafo gia' esistente -> differential add/remove con animazione,
    // viewport preservato, niente destroy/rebuild
    if (this.cy) {
      const newIds = new Set(newElements.map((e: any) => e.data.id));
      const currentIds = new Set<string>();
      this.cy.elements().forEach((el: any) => currentIds.add(el.id()));

      // UPDATE: per gli elementi che esistono in entrambi (stesso id),
      // aggiorna i data attributi (color, layer, label) cosi' i nodi
      // che cambiano tipo (es. tensione -> principio) vedono il nuovo colore.
      for (const el of newElements) {
        if (!currentIds.has(el.data.id)) continue;
        if ("source" in el.data) continue; // edge: non aggiornare
        const cyNode = this.cy.getElementById(el.data.id);
        if (cyNode && cyNode.length > 0) {
          cyNode.data({
            color: el.data.color,
            layer: el.data.layer,
            label: el.data.label,
            fullTitle: el.data.fullTitle,
            glow: el.data.glow,
            glowBright: el.data.glowBright,
          });
        }
      }

      const toRemove = this.cy.elements().filter(
        (el: any) => !newIds.has(el.id())
      );
      if (toRemove.length > 0) {
        toRemove.animate(
          { style: { opacity: 0 } },
          {
            duration: 280,
            easing: "ease-out",
            complete: () => {
              try {
                this.cy?.remove(toRemove);
              } catch {
                /* ok */
              }
            },
          }
        );
      }

      const toAdd = newElements.filter(
        (e: any) => !currentIds.has(e.data.id)
      );
      if (toAdd.length > 0) {
        const positioned = toAdd.map((e: any) => {
          if ("source" in e.data) return e;
          const layer = e.data.layer || "unknown";
          const ang = this.layerAngleFor(layer);
          return {
            ...e,
            position: {
              x: Math.cos(ang) * 130 + (Math.random() - 0.5) * 40,
              y: Math.sin(ang) * 130 + (Math.random() - 0.5) * 40,
            },
          };
        });
        const added = this.cy.add(positioned);
        added.style({ opacity: 0 });
        added.animate(
          { style: { opacity: 1 } },
          { duration: 320, easing: "ease-out" }
        );
      }
      return;
    }

    if (nodes.length === 0) {
      this.graphContainer.empty();
      const msg = this.graphContainer.createDiv();
      msg.style.padding = "20px";
      msg.style.textAlign = "center";
      msg.style.opacity = "0.6";
      msg.setText(
        "No note matches active filters. Enable more layers above."
      );
      return;
    }

    // Cytoscape non parsea ne' var(...) ne' hsl(calc(...)) di Obsidian.
    // Trick: applica il valore a un div temporaneo e leggi il computed style,
    // che il browser ha gia' risolto a rgb(R,G,B).
    const resolveColor = (cssExpr: string, fallback: string): string => {
      const tmp = document.createElement("div");
      tmp.style.color = cssExpr;
      tmp.style.display = "none";
      document.body.appendChild(tmp);
      const computed = getComputedStyle(tmp).color;
      tmp.remove();
      return computed && computed !== "rgba(0, 0, 0, 0)" ? computed : fallback;
    };
    const TEXT_NORMAL = resolveColor("var(--text-normal)", "#dcddde");
    const ACCENT = resolveColor("var(--interactive-accent)", "#7c3aed");

    // Risolve i colori del grafo dal preset attivo (o dal custom).
    const styleName = this.plugin.settings.graphStyleName || "default";
    const C: GraphColors =
      styleName === "custom"
        ? this.plugin.settings.graphCustomColors
        : (GRAPH_STYLE_PRESETS[styleName] || GRAPH_STYLE_PRESETS.default);
    const TEXT_MUTED = C.label;
    // Applica background al container se il preset lo definisce, altrimenti usa il tema Obsidian
    if (this.graphContainer) {
      this.graphContainer.style.background = C.background || "var(--background-primary)";
    }

    this.cy = cytoscape({
      container: this.graphContainer,
      elements: [...nodes, ...edges],
      style: [
        // Smooth transitions per fade graduale (hover, filtri, ecc.)
        {
          selector: "node",
          style: {
            // The whole node (visible disc + glow halo) is rendered by the
            // SVG background-image. The Cytoscape node is sized to match
            // the FULL halo (54x54) so the gradient stays uniform on every
            // side; edges are pulled inward via target-distance-from-node
            // so they appear to connect to the inner disc, not the halo.
            // Cytoscape ignores the alpha channel of background-color in
            // some builds, so we use background-opacity: 0 explicitly to
            // suppress the node fill — only the SVG glow image is visible.
            "background-color": "#000000",
            "background-opacity": 0,
            "background-image": "data(glow)",
            "background-fit": "contain",
            // Suppress the default Cytoscape grab/active overlay (a dark
            // square halo that appears when dragging a node).
            "overlay-opacity": 0,
            "overlay-padding": 0,
            shape: "ellipse",
            // Labels are rendered by the SVG overlay (above the canvases),
            // not by Cytoscape — otherwise they paint on the same canvas
            // as edges and end up underneath the SVG paths.
            label: "",
            "text-opacity": 0,
            color: TEXT_MUTED,
            "font-size": "10px",
            "font-weight": 400,
            "text-valign": "bottom",
            "text-halign": "center",
            "text-margin-y": 4,
            "text-wrap": "ellipsis",
            "text-max-width": "120px",
            "min-zoomed-font-size": 8,
            width: 32,
            height: 32,
            // Transparent border to expand the hit-area by 18px on each
            // side without changing the visible disc. Total hoverable
            // diameter = 32 + 18*2 = 68px while the visible pallino is 32.
            "border-width": 18,
            "border-color": "rgba(0,0,0,0)",
            "border-opacity": 0,
            // Base: glow rendered at full opacity. Hover state still
            // brightens further by switching to the glowBright SVG variant
            // (more opaque gradient stops + larger inner disc).
            "background-image-opacity": 1,
            "transition-property":
              "opacity, text-opacity, background-image-opacity, width, height, color",
            "transition-duration": 130,
            "transition-timing-function": "ease-out",
          },
        },
        // All edges are kept in the graph (for the layout engine and
        // hit-testing) but invisible on the Cytoscape canvas. The SVG
        // overlay (see setupEdgeGlowOverlay) re-draws every edge with a
        // linear gradient running source-color -> target-color, plus a
        // gaussian-blur halo for the neon look. `visibility: hidden` is
        // stronger than `opacity: 0` and is respected in all cy states
        // (highlight, selected, active, faded).
        {
          selector: "edge",
          style: {
            width: 0.8,
            "line-color": C.edge,
            "curve-style": "bezier",
            "source-distance-from-node": -11,
            "target-distance-from-node": -11,
            visibility: "hidden",
          },
        },
        {
          selector: "node:selected",
          style: {
            "border-width": 2,
            "border-color": ACCENT,
            color: TEXT_NORMAL,
            "font-weight": 600,
          },
        },
        // Note: the previous Obsidian-like ".faded" fade-the-rest behavior
        // has been removed. Focus is now communicated by the hovered node
        // brightening (.highlight) instead of dimming everything else.
        // Hover focus: the node directly under the cursor — bigger + brighter
        {
          selector: "node.hover-focus",
          style: {
            "background-image": "data(glowBright)",
            "background-image-opacity": 1,
            width: 60,
            height: 60,
            color: TEXT_NORMAL,
            "font-weight": 600,
          },
        },
        // Hover neighbor: nodes connected to the focus — same size as base,
        // brighter glow than normal but kept BELOW the focus brightness
        // (uses the normal glow image at full opacity, not the bright one).
        {
          selector: "node.hover-neighbor",
          style: {
            "background-image-opacity": 1,
            color: TEXT_NORMAL,
            "font-weight": 600,
          },
        },
        {
          selector: "edge.highlight",
          style: {
            width: 1.8,
            "line-color": ACCENT,
            visibility: "hidden",
          },
        },
        // Hide edges in EVERY cy state — the SVG overlay is the only
        // renderer of edges in this graph view.
        {
          selector: "edge:selected, edge:active",
          style: {
            visibility: "hidden",
          },
        },
        // Suppress Cytoscape's default grab/active overlay on nodes too —
        // it's the dark square halo that shows up when dragging.
        {
          selector: "node:active, node:grabbed, node:selected",
          style: {
            "overlay-opacity": 0,
            "overlay-padding": 0,
          },
        },
      ],
      layout: { name: "preset" }, // placeholder; we'll apply real layout below
      userZoomingEnabled: false, // gestiamo lo zoom a mano per il raddoppio per step
      minZoom: 0.02,
      maxZoom: 8,
      zoom: 1.0,
    });

    // SVG overlay for principle-related edges. Cytoscape edges are flat
    // rectangles with hard caps; to get a real per-color gaussian glow we
    // hide those edges (opacity 0 in the cy style block above) and re-draw
    // them as <path> elements inside an absolutely-positioned SVG that sits
    // on top of the Cytoscape canvases. Each path is wrapped in an SVG
    // <filter> with <feGaussianBlur>, which gives a true gradient halo.
    this.setupEdgeGlowOverlay();

    // Custom wheel handler: ogni step della rotella raddoppia/dimezza lo zoom,
    // centrato sulla posizione del cursore (zoom-to-pointer).
    const onWheel = (e: WheelEvent): void => {
      if (!this.cy || !this.graphContainer) return;
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.6 : 0.625;
      const currentZoom = this.cy.zoom();
      const newZoom = Math.max(0.02, Math.min(8, currentZoom * factor));
      const rect = this.graphContainer.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      // Stop animazione corrente lasciandola al punto attuale (no jumpToEnd)
      this.cy.stop(true, false);
      this.cy.animate({
        zoom: { level: newZoom, renderedPosition: { x: mx, y: my } },
        duration: 320,
        easing: "ease-out",
        queue: false,
      });
    };
    this.graphContainer?.addEventListener("wheel", onWheel, { passive: false });

    // Apply the chosen layout (clusters is a 2-step pipeline; others single-pass)
    this.applyLayoutToCy();

    // Click → open note
    this.cy.on("tap", "node", (evt: any) => {
      const basename = evt.target.id();
      this.app.workspace.openLinkText(basename, "", false);
    });

    // Note: il riassetto post-drag dei NODI e' gestito dal physics loop continuo.

    // ---- Inerzia sul pan del viewport (drag del background) ----
    let panVx = 0;
    let panVy = 0;
    let lastPanTime = 0;
    let lastPanPos = { x: 0, y: 0 };
    let inertiaRAF: number | null = null;

    const cancelInertia = (): void => {
      if (inertiaRAF !== null) {
        cancelAnimationFrame(inertiaRAF);
        inertiaRAF = null;
      }
    };

    this.cy.on("tapstart", (evt: any) => {
      if (evt.target !== this.cy) return; // solo drag del background, non dei nodi
      cancelInertia();
      panVx = 0;
      panVy = 0;
      lastPanTime = performance.now();
      const pan = this.cy.pan();
      lastPanPos = { x: pan.x, y: pan.y };
    });

    this.cy.on("tapdrag", (evt: any) => {
      if (evt.target !== this.cy) return;
      const now = performance.now();
      const dt = Math.max(now - lastPanTime, 1);
      const pan = this.cy.pan();
      // Velocita' in px per frame (16ms a 60fps)
      panVx = ((pan.x - lastPanPos.x) / dt) * 16;
      panVy = ((pan.y - lastPanPos.y) / dt) * 16;
      lastPanPos = { x: pan.x, y: pan.y };
      lastPanTime = now;
    });

    this.cy.on("tapend", (evt: any) => {
      if (evt.target !== this.cy) return;
      if (Math.abs(panVx) < 0.8 && Math.abs(panVy) < 0.8) return;
      const decay = (): void => {
        if (!this.cy) return;
        this.cy.panBy({ x: panVx, y: panVy });
        panVx *= 0.92;
        panVy *= 0.92;
        if (Math.abs(panVx) > 0.15 || Math.abs(panVy) > 0.15) {
          inertiaRAF = requestAnimationFrame(decay);
        } else {
          inertiaRAF = null;
        }
      };
      inertiaRAF = requestAnimationFrame(decay);
    });

    // Hover: tooltip + fade non-neighbors (Obsidian-like)
    this.cy.on("mouseover", "node", (evt: any) => {
      const node = evt.target;
      const fullTitle = node.data("fullTitle");
      const layer = node.data("layer");
      if (this.graphContainer)
        this.graphContainer.title = `${fullTitle}\n[${layer}]`;
      if (!this.cy) return;
      // The hovered node gets `hover-focus` (size bump + brighter glow);
      // its connected neighbors get `hover-neighbor` (brighter glow only,
      // no size change). The rest of the graph stays untouched.
      node.addClass("hover-focus");
      node.openNeighborhood().nodes().addClass("hover-neighbor");
    });
    this.cy.on("mouseout", "node", () => {
      if (this.graphContainer) this.graphContainer.title = "";
      if (!this.cy) return;
      this.cy.elements().removeClass("hover-focus hover-neighbor");
    });
  }

  /**
   * Cluster layout: pre-posiziona i nodi per layer in 7 "petali" radiali
   * intorno a un centro, poi rilascia fcose con randomize=false per fine-tuning.
   * Risultato: nodi sparsi in modo Obsidian-like, ma raggruppati per colore.
   */
  private applyClustersLayout(): void {
    if (!this.cy) return;

    // Angoli (in radianti) di ciascun layer attorno al centro del canvas
    const LAYER_ANGLE: Record<string, number> = {
      tensione_aperta: -Math.PI / 2,            // alto
      tensione_risolta: -Math.PI / 2 + 0.6,     // alto-destra
      tensione_elevata: -Math.PI / 2 + 1.2,     // destra-alto
      principio: 0,                              // destra
      substrate: Math.PI,                        // sinistra
      defeated: Math.PI / 2,                     // basso
      meta_nota: Math.PI / 2 + 0.9,              // basso-sinistra
    };

    // Conta i nodi per layer per calibrare il raggio del singolo cluster
    const byLayer: Record<string, any[]> = {};
    this.cy.nodes().forEach((n: any) => {
      const layer = n.data("layer") || "unknown";
      (byLayer[layer] ??= []).push(n);
    });

    // Layout radiale: ogni layer e' un piccolo cerchio attorno al suo centroide
    const GLOBAL_R = 130;       // distanza del centroide dal centro
    const CLUSTER_R = 38;       // raggio interno del cluster del singolo layer
    const positions: Record<string, { x: number; y: number }> = {};

    for (const [layer, nodes] of Object.entries(byLayer)) {
      const ang = LAYER_ANGLE[layer] ?? 0;
      const cx = Math.cos(ang) * GLOBAL_R;
      const cy = Math.sin(ang) * GLOBAL_R;
      const r = CLUSTER_R + Math.sqrt(nodes.length) * 12; // scale by count
      nodes.forEach((n: any, i: number) => {
        const inner = (i / Math.max(nodes.length, 1)) * Math.PI * 2;
        positions[n.id()] = {
          x: cx + Math.cos(inner) * r + (Math.random() - 0.5) * 30,
          y: cy + Math.sin(inner) * r + (Math.random() - 0.5) * 30,
        };
      });
    }

    // Pre-posiziona, poi avvia la fisica continua: niente riassetto duro,
    // i nodi restano sparsi nei loro cluster e fluttuano.
    this.cy
      .layout({
        name: "preset",
        positions: (n: any) => positions[n.id()] || { x: 0, y: 0 },
        animate: true,
        animationDuration: 400,
        fit: false, // niente auto-fit: vogliamo zoom medio, non panoramico
      })
      .run();

    // Fit-to-content con padding generoso → centra la nuvola nel viewport,
    // poi cap dello zoom per non avvicinare troppo se ci sono pochi nodi.
    window.setTimeout(() => {
      if (!this.cy) return;
      this.cy.fit(undefined, 80);
      if (this.cy.zoom() > 1.4) this.cy.zoom(1.4);
      this.cy.center();
      this.startContinuousPhysics();
    }, 450);
  }

  // ---- Continuous physics ("fluttuante") ----
  private physicsRAF: number | null = null;
  private velocities: Map<string, { vx: number; vy: number }> = new Map();

  private startContinuousPhysics(): void {
    this.stopContinuousPhysics();
    if (!this.cy) return;

    // Init velocities
    this.velocities.clear();
    this.cy.nodes().forEach((n: any) => {
      this.velocities.set(n.id(), { vx: 0, vy: 0 });
    });

    const REPULSE = 5500;     // forza repulsiva tra nodi (dimezzata)
    const SPRING_K = 0.018;   // attrazione lungo edge (più rapida)
    const IDEAL_LEN = 55;     // distanza target lungo edge (dimezzata)
    const GRAVITY = 0.002;    // gravita' al centro piu' forte per cluster compatti
    const DAMPING = 0.78;     // smorzamento velocita' (meno smorzato = più snap)
    const MAX_SPEED = 6.0;    // velocità massima (raddoppiata per movimenti rapidi)

    const step = (): void => {
      if (!this.cy) return;
      const nodes = this.cy.nodes();
      const edges = this.cy.edges();
      const arr = nodes.toArray();

      // Forces accumulator
      const forces = new Map<string, { fx: number; fy: number }>();
      arr.forEach((n: any) => forces.set(n.id(), { fx: 0, fy: 0 }));

      // Pairwise repulsion (O(n^2) — fine fino a ~150 nodi)
      for (let i = 0; i < arr.length; i++) {
        const a = arr[i];
        const ap = a.position();
        for (let j = i + 1; j < arr.length; j++) {
          const b = arr[j];
          const bp = b.position();
          const dx = bp.x - ap.x;
          const dy = bp.y - ap.y;
          const distSq = dx * dx + dy * dy + 4;
          const dist = Math.sqrt(distSq);
          const k = REPULSE / distSq;
          const fxa = (dx / dist) * k;
          const fya = (dy / dist) * k;
          const fa = forces.get(a.id())!;
          const fb = forces.get(b.id())!;
          fa.fx -= fxa;
          fa.fy -= fya;
          fb.fx += fxa;
          fb.fy += fya;
        }
      }

      // Spring force on edges
      edges.forEach((e: any) => {
        const s = e.source();
        const t = e.target();
        const sp = s.position();
        const tp = t.position();
        const dx = tp.x - sp.x;
        const dy = tp.y - sp.y;
        const dist = Math.sqrt(dx * dx + dy * dy + 1);
        const stretch = dist - IDEAL_LEN;
        const k = SPRING_K * stretch;
        const fx = (dx / dist) * k;
        const fy = (dy / dist) * k;
        const fs = forces.get(s.id())!;
        const ft = forces.get(t.id())!;
        fs.fx += fx;
        fs.fy += fy;
        ft.fx -= fx;
        ft.fy -= fy;
      });

      // Light center gravity
      arr.forEach((n: any) => {
        const p = n.position();
        const f = forces.get(n.id())!;
        f.fx -= p.x * GRAVITY;
        f.fy -= p.y * GRAVITY;
      });

      // Integrate velocity + position. Skip nodes the user is dragging.
      // Lazy-init velocity for nodes that joined the graph after
      // startContinuousPhysics() (e.g. a substrate created via PDF ingest
      // while the graph view was already open). Without this, the next
      // physics tick crashes on `velocities.get(n.id()).vx` because the
      // new node was never registered.
      arr.forEach((n: any) => {
        const nid = n.id();
        let v = this.velocities.get(nid);
        if (!v) {
          v = { vx: 0, vy: 0 };
          this.velocities.set(nid, v);
        }
        if (n.grabbed()) {
          v.vx = 0;
          v.vy = 0;
          return;
        }
        const f = forces.get(nid)!;
        v.vx = (v.vx + f.fx) * DAMPING;
        v.vy = (v.vy + f.fy) * DAMPING;
        const speed = Math.sqrt(v.vx * v.vx + v.vy * v.vy);
        if (speed > MAX_SPEED) {
          v.vx = (v.vx / speed) * MAX_SPEED;
          v.vy = (v.vy / speed) * MAX_SPEED;
        }
        const p = n.position();
        n.position({ x: p.x + v.vx, y: p.y + v.vy });
      });

      // Garbage-collect velocities for nodes that have been removed from
      // the graph so the Map doesn't grow unbounded across rebuilds.
      if (this.velocities.size > arr.length + 50) {
        const alive = new Set(arr.map((n: any) => n.id()));
        for (const k of Array.from(this.velocities.keys())) {
          if (!alive.has(k)) this.velocities.delete(k);
        }
      }

      this.physicsRAF = requestAnimationFrame(step);
    };

    this.physicsRAF = requestAnimationFrame(step);
  }

  private stopContinuousPhysics(): void {
    if (this.physicsRAF !== null) {
      cancelAnimationFrame(this.physicsRAF);
      this.physicsRAF = null;
    }
  }

  private layoutOptions(): any {
    if (this.layoutName === "fcose") {
      // Spacious mode: much stronger repulsion + longer edges → nodes
      // spread far apart so edges are less likely to cross unrelated
      // nodes. Slower initial layout, cleaner visual. Toggle in Settings.
      const spacious = !!this.plugin.settings.graphSpaciousLayout;
      // Detect: is this the FIRST layout (no existing positions) or a
      // RE-LAYOUT after a filter toggle / change? In re-layout mode the
      // user expects existing nodes to STAY PUT — only new nodes should
      // get positioned, and the viewport should not snap-zoom.
      const hasExistingPositions =
        !!this.cy &&
        this.cy.nodes().length > 0 &&
        this.cy
          .nodes()
          .some((n: any) => {
            const p = n.position();
            return p && (p.x !== 0 || p.y !== 0);
          });
      if (hasExistingPositions) {
        // INCREMENTAL re-layout: minimal disturbance.
        // - randomize: false → start from existing positions
        // - fit: false → don't re-zoom the viewport (no "centering" effect)
        // - packComponents: false → don't recompact disconnected clusters
        // - few iterations → just enough to integrate new nodes
        // - quality "default" → faster, no need for full convergence
        return {
          name: "fcose",
          animate: true,
          animationDuration: 400,
          nodeRepulsion: spacious ? 55000 : 18000,
          idealEdgeLength: spacious ? 340 : 190,
          edgeElasticity: spacious ? 0.50 : 0.55,
          nodeSeparation: spacious ? 280 : 160,
          numIter: 800,
          gravity: 0,
          gravityRangeCompound: 1.5,
          gravityCompound: 1.0,
          gravityRange: 0,
          packComponents: false,
          randomize: false,
          fit: false,
          padding: 60,
          quality: "default",
        };
      }
      // FIRST layout: full fcose run, picks positions from scratch.
      return {
        name: "fcose",
        animate: true,
        animationDuration: 1000,
        nodeRepulsion: spacious ? 55000 : 18000,
        idealEdgeLength: spacious ? 340 : 190,
        edgeElasticity: spacious ? 0.50 : 0.55,
        nodeSeparation: spacious ? 280 : 160,
        numIter: spacious ? 6500 : 5000,
        gravity: spacious ? 0.10 : 0.18,
        gravityRangeCompound: 1.5,
        gravityCompound: 1.0,
        gravityRange: spacious ? 4.5 : 3.8,
        packComponents: true,
        randomize: true,
        fit: true,
        padding: 60,
        quality: "proof",
      };
    }
    if (this.layoutName === "concentric") {
      return {
        name: "concentric",
        concentric: (n: any) => {
          const order: Record<string, number> = {
            principio: 4,
            tensione_elevata: 3,
            tensione_aperta: 2,
            tensione_risolta: 2,
            substrate: 1,
            defeated: 0,
            meta_nota: 0,
          };
          return order[n.data("layer")] ?? 0;
        },
        levelWidth: () => 1,
        minNodeSpacing: 30,
        animate: true,
      };
    }
    if (this.layoutName === "breadthfirst") {
      return {
        name: "breadthfirst",
        directed: true,
        spacingFactor: 1.2,
        animate: true,
      };
    }
    return { name: this.layoutName, animate: true, padding: 40 };
  }

  applyLayoutToCy(): void {
    if (!this.cy) return;
    // Stop any running physics before switching layout
    this.stopContinuousPhysics();
    if (this.layoutName === "clusters") {
      this.applyClustersLayout();
      return;
    }
    const layout = this.cy.layout(this.layoutOptions());
    // Hook a post-processing edge-node repulsion pass if the user
    // enabled the spacious-layout experimental toggle. This runs AFTER
    // fcose converges and nudges nodes away from edges that don't touch
    // them — the only way to get true edge-node repulsion in fcose.
    if (this.plugin.settings.graphSpaciousLayout) {
      (layout as any).on?.("layoutstop", () => {
        try {
          this.applyEdgeNodeRepulsion();
        } catch (e) {
          console.warn("[Antinomia] edge-node repulsion failed:", e);
        }
      });
    }
    layout.run();
  }

  /**
   * Post-layout pass: nudges each node away from edges that do NOT touch
   * it. cytoscape-fcose has no native edge-node repulsion; we simulate it
   * with a few iterations of perpendicular pushes. Stops early if no node
   * needed to move.
   */
  private applyEdgeNodeRepulsion(): void {
    if (!this.cy) return;
    const cy = this.cy;
    const MIN_DIST = 85; // graph-units: minimum allowed node-edge distance
    const MAX_ITER = 8;
    const PUSH_FACTOR = 0.9; // 0..1 how much of the deficit to apply per iter

    type Pt = { x: number; y: number };
    const distPointToSegment = (
      p: Pt,
      a: Pt,
      b: Pt
    ): { dist: number; cx: number; cy: number } => {
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const lenSq = dx * dx + dy * dy;
      if (lenSq < 0.0001) {
        return { dist: Math.hypot(p.x - a.x, p.y - a.y), cx: a.x, cy: a.y };
      }
      let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
      t = Math.max(0, Math.min(1, t));
      const cx = a.x + t * dx;
      const cy2 = a.y + t * dy;
      return { dist: Math.hypot(p.x - cx, p.y - cy2), cx, cy: cy2 };
    };

    const nodes = cy.nodes().toArray();
    const edges = cy.edges().toArray();
    // Wrap all position updates in cy.batch() so Cytoscape renders ONCE
    // per iteration instead of per-node — much smoother visually.
    for (let iter = 0; iter < MAX_ITER; iter++) {
      let totalMoved = 0;
      cy.batch(() => {
      for (const n of nodes) {
        const np = n.position() as Pt;
        let pushX = 0;
        let pushY = 0;
        for (const e of edges) {
          const s = e.source();
          const t = e.target();
          if (s.id() === n.id() || t.id() === n.id()) continue;
          const sp = s.position() as Pt;
          const tp = t.position() as Pt;
          const { dist, cx, cy: cyClosest } = distPointToSegment(np, sp, tp);
          if (dist < MIN_DIST && dist > 0.0001) {
            // Push perpendicular to the edge, away from the closest point
            const deficit = MIN_DIST - dist;
            const nx = (np.x - cx) / dist;
            const ny = (np.y - cyClosest) / dist;
            pushX += nx * deficit * PUSH_FACTOR;
            pushY += ny * deficit * PUSH_FACTOR;
          }
        }
        if (Math.abs(pushX) > 0.1 || Math.abs(pushY) > 0.1) {
          n.position({ x: np.x + pushX, y: np.y + pushY });
          totalMoved += Math.hypot(pushX, pushY);
        }
      }
      });
      if (totalMoved < 1) break;
    }
    // No cy.fit() here: keep the user's current viewport. fit() would
    // re-zoom and create the "swarm to center" effect we explicitly want
    // to avoid in re-layout after a filter toggle.
  }

  // Backward-compatible alias used by toolbar dropdown
  applyLayout(): void {
    this.applyLayoutToCy();
  }
}


export default class AntinomiaPlugin extends Plugin {
  settings: AntinomiaSettings = DEFAULT_SETTINGS;
  statusBarEl: HTMLElement | null = null;
  // AbortController active while a Hunter run is in progress, null otherwise
  hunterAbortController: AbortController | null = null;

  /**
   * Signal an in-progress Hunter run to stop. The HTTP request itself
   * cannot be cancelled (Obsidian's requestUrl does not support AbortSignal),
   * but the result is discarded and the UI returns to idle.
   */
  abortHunter(): void {
    if (this.hunterAbortController) {
      this.hunterAbortController.abort();
      this.hunterAbortController = null;
    }
  }

  /**
   * True se il plugin community "Front Matter Title" (Snezhig) e' installato
   * e attivo. Usato per mostrare warning nel WelcomeModal e nella Dashboard.
   * Accede a app.plugins.enabledPlugins (API interna, ma stabile).
   */
  isFrontMatterTitleEnabled(): boolean {
    try {
      const ep = (this.app as any).plugins?.enabledPlugins;
      if (!ep) return false;
      return ep.has("obsidian-front-matter-title-plugin");
    } catch {
      return false;
    }
  }

  /**
   * Return the FMT plugin instance if installed+enabled, else null.
   */
  private getFrontMatterTitlePlugin(): any | null {
    try {
      const plugins = (this.app as any).plugins?.plugins;
      return plugins?.["obsidian-front-matter-title-plugin"] ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Returns true when FMT is already configured for Antinomia: the resolver
   * path/rule contains "title" and at least the explorer feature is on.
   * We use this to skip the confirm dialog when nothing meaningful would change.
   */
  isFrontMatterTitleConfiguredForAntinomia(): boolean {
    try {
      const fmt = this.getFrontMatterTitlePlugin();
      if (!fmt?.settings) return false;
      const s = fmt.settings;
      // Different FMT versions store the path in different places. Sniff for
      // any key/value pair that mentions "title" in the resolver rules.
      const json = JSON.stringify(s);
      const hasTitlePath = /"path"\s*:\s*"title"/i.test(json);
      const explorerOn = /"explorer"[\s\S]*?"enabled"\s*:\s*true/i.test(json);
      return hasTitlePath && explorerOn;
    } catch {
      return false;
    }
  }

  /**
   * Configure Front Matter Title for Antinomia: set the resolver path to
   * `title` and enable the Explorer / Graph / Tab features so the human
   * title (in the frontmatter) replaces the timestamp basename everywhere.
   *
   * Strategy: merge into the existing FMT settings (don't blindly overwrite),
   * save through FMT's own saveSettings if available, then disable+reenable
   * the plugin so changes take effect. If FMT is not reachable, fall back
   * to writing data.json directly.
   *
   * Returns: true on success, false on error (a Notice is shown).
   */
  async configureFrontMatterTitleForAntinomia(): Promise<boolean> {
    const fmt = this.getFrontMatterTitlePlugin();
    if (!fmt) {
      new Notice("Front Matter Title is not installed/enabled.");
      return false;
    }
    try {
      // Path A: mutate the live settings object on the plugin instance,
      // then call its own saveSettings() if exposed.
      const s = fmt.settings ?? {};
      // --- resolver rule: read the `title` frontmatter field ---
      s.rules = s.rules ?? {};
      s.rules.items = s.rules.items ?? {};
      // FMT v3.x stores the active rule under `rules.items.title`. Adding
      // this key (or overwriting it) is the canonical way to set the path.
      s.rules.items.title = {
        ...(s.rules.items.title ?? {}),
        path: "title",
        enabled: true,
      };
      // --- features ---
      s.features = s.features ?? {};
      for (const f of ["explorer", "graph", "tab"]) {
        s.features[f] = { ...(s.features[f] ?? {}), enabled: true };
      }
      fmt.settings = s;
      // Try the plugin's own saveSettings (best path — it triggers UI refresh)
      if (typeof fmt.saveSettings === "function") {
        await fmt.saveSettings();
      } else {
        // Fallback: write data.json directly via the vault adapter
        const dataPath =
          ".obsidian/plugins/obsidian-front-matter-title-plugin/data.json";
        const adapter = (this.app.vault as any).adapter;
        if (adapter?.write) {
          await adapter.write(dataPath, JSON.stringify(s, null, 2));
        }
      }
      // Disable + reenable to apply the new settings (FMT reads them on boot)
      const pluginsApi = (this.app as any).plugins;
      if (
        pluginsApi?.disablePlugin &&
        pluginsApi?.enablePlugin
      ) {
        await pluginsApi.disablePlugin(
          "obsidian-front-matter-title-plugin"
        );
        await pluginsApi.enablePlugin(
          "obsidian-front-matter-title-plugin"
        );
      }
      new Notice("Front Matter Title configured for Antinomia ✓");
      return true;
    } catch (e) {
      console.error("[Antinomia] FMT auto-config failed:", e);
      new Notice(
        `Could not auto-configure Front Matter Title: ${(e as Error).message}. Configure manually via Settings → Front Matter Title.`
      );
      return false;
    }
  }

  /**
   * Contradiction Hunter: scansiona tensioni aperte + substrate, manda al
   * modello, parsea coppie contraddittorie, filtra falsi positivi gia'
   * dismissati, salva ultimo run nei settings, mostra in HunterResultsView.
   * Supporta cancellazione via Stop button (AbortController).
   */
  async runHunter(focusFile?: TFile): Promise<void> {
    const profile = this.profileFor("hunter");
    if (!profile.apiKey) {
      new Notice("API key missing in the Hunter profile (or active one). Settings -> Antinomia.");
      return;
    }
    if (!this.settings.hasRunHunter) {
      this.settings.hasRunHunter = true;
      void this.saveSettings();
    }
    const all = this.app.vault.getMarkdownFiles();
    const candidates: TFile[] = [];
    for (const f of all) {
      const fm = this.app.metadataCache.getFileCache(f)?.frontmatter;
      const t = fm?.antinomia_type;
      const isOpenTension = t === TYPE.tension && fm?.status === "open";
      const isSubstrate = t === TYPE.substrate;
      if (isOpenTension || isSubstrate) candidates.push(f);
    }
    if (candidates.length < 2) {
      new Notice(`Hunter: at least 2 notes needed. Found: ${candidates.length}.`);
      return;
    }
    candidates.sort((a, b) => b.stat.mtime - a.stat.mtime);
    const cap = this.settings.hunterMaxNotes;
    let selected: TFile[];
    let truncated = false;
    if (focusFile) {
      // Modalita' focalizzata: target + altri candidati per riempire fino al cap
      const others = candidates.filter((f) => f.path !== focusFile.path);
      truncated = others.length > cap - 1;
      selected = [focusFile, ...others.slice(0, cap - 1)];
    } else {
      truncated = candidates.length > cap;
      selected = candidates.slice(0, cap);
    }

    // Conta tipi per il prompt (cosi' il modello sa quante substrate ci sono)
    let nTensions = 0, nSubstrates = 0;
    for (const f of selected) {
      const fm = this.app.metadataCache.getFileCache(f)?.frontmatter;
      if (fm?.antinomia_type === TYPE.tension) nTensions++;
      else if (fm?.antinomia_type === TYPE.substrate) nSubstrates++;
    }

    const bodyLimit = this.settings.hunterNoteBodyLimit;
    const noteBlocks: string[] = [];
    for (const f of selected) {
      const raw = await this.app.vault.read(f);
      const fm = this.app.metadataCache.getFileCache(f)?.frontmatter;
      const body = stripFrontmatter(raw).trim();
      const truncBody = body.length > bodyLimit ? body.slice(0, bodyLimit) + "..." : body;
      const tipo = fm?.antinomia_type || "?";
      noteBlocks.push(`### ${f.basename} [${tipo}]\n${truncBody}`);
    }
    const nTotal = selected.length;
    const userContent = focusFile
      ? `Analizza queste ${nTotal} note Antinomia. La nota FOCUS e' "${focusFile.basename}" (la prima sotto). ` +
        `Identifica SOLO coppie contraddittorie che COINVOLGONO "${focusFile.basename}" — cioe' coppie (FOCUS, altra). ` +
        `NON includere coppie tra le altre note tra loro. Rispondi SOLO con JSON conforme allo schema.\n\n` +
        noteBlocks.join("\n\n")
      : `Analizza queste ${nTotal} note Antinomia (${nTensions} tensioni, ${nSubstrates} substrate) ` +
        `e identifica coppie contraddittorie. ESAMINA TUTTE le ${(nTotal * (nTotal - 1)) / 2} coppie possibili, ` +
        `incluse substrate-substrate. Rispondi SOLO con JSON conforme allo schema.\n\n` +
        noteBlocks.join("\n\n");

    await this.activateView(VIEW_TYPE_HUNTER_RESULTS);
    const hunterLeaf = this.app.workspace.getLeavesOfType(VIEW_TYPE_HUNTER_RESULTS)[0];
    const hunterView =
      hunterLeaf && hunterLeaf.view instanceof HunterResultsView
        ? hunterLeaf.view
        : null;

    new Notice(`Hunter${focusFile ? ` su ${focusFile.basename}` : ""}: invio ${selected.length} note (${nTensions}T + ${nSubstrates}S)...${truncated ? " (troncate)" : ""}`);
    hunterView?.setLoading(true, selected.length);

    this.hunterAbortController = new AbortController();
    const abortSignal = this.hunterAbortController.signal;

    const t0 = Date.now();
    let result: { text: string; usage?: ClaudeResponse["usage"] };
    try {
      const aiPromise = callAI({
        baseUrl: profile.baseUrl,
        apiKey: profile.apiKey,
        model: profile.model,
        format: profile.format,
        system: buildHunterSystem(this.settings.hunterReasoningStyle),
        messages: [{ role: "user", content: userContent }],
        // Hunter is a "deep" task — the model has to compare many notes
        // pairwise and emit a structured list. Autoadaptive budget per
        // family (e.g. ~2000 for Llama/Anthropic, ~10000 for reasoning
        // models that need room for both <think> and the JSON output).
        taskClass: "deep",
        // Hunter benefits from reasoning when the model supports it
        // (substrate↔substrate is genuinely subtle work), so we leave
        // extended thinking ON for deep tasks.
        disableThinking: false,
        signal: abortSignal,
      });
      const abortPromise = new Promise<never>((_, reject) => {
        abortSignal.addEventListener("abort", () => reject(new Error("hunter_aborted")));
      });
      result = await Promise.race([aiPromise, abortPromise]);
    } catch (e) {
      hunterView?.setLoading(false);
      this.hunterAbortController = null;
      if ((e as Error).message === "hunter_aborted") {
        new Notice("Hunter stopped by user.");
        console.log("[Antinomia] hunter aborted by user");
      } else {
        showErrorModal(
          this.app,
          "Hunter error",
          `The Hunter run failed. ${(e as Error).message.includes("not reachable") ? "Your local AI backend doesn't seem to be running." : "Check that the backend is reachable and the API key is valid."}`,
          `Profile: ${profile.name} (${profile.model})\nURL: ${profile.baseUrl}\n\n${(e as Error).message}`
        );
        console.error("[Antinomia] hunter call failed", e);
      }
      return;
    }
    hunterView?.setLoading(false);
    this.hunterAbortController = null;
    const durationMs = Date.now() - t0;

    const parsedRaw = extractJson<any>(result.text);
    // Normalize: the AI is asked for English keys (pairs/note_a/note_b/
    // description/confidence: high|medium|low). We accept legacy Italian
    // keys (contraddizioni/nota_a/nota_b/descrizione/alta|media|bassa) for
    // backward-compat with older runs and Anthropic responses that still
    // mirror the older schema.
    const normalizePair = (c: any): HunterContradiction => ({
      note_a: c?.note_a ?? c?.nota_a ?? "",
      note_b: c?.note_b ?? c?.nota_b ?? "",
      description: c?.description ?? c?.descrizione ?? "",
      confidence: ((): HunterConfidence | undefined => {
        const raw = String(c?.confidence ?? "").toLowerCase().trim();
        if (raw === "high" || raw === "medium" || raw === "low") return raw as HunterConfidence;
        if (raw === "alta") return "high";
        if (raw === "media") return "medium";
        if (raw === "bassa") return "low";
        return undefined;
      })(),
    });
    let rawPairs: any[] | null = null;
    if (parsedRaw && Array.isArray(parsedRaw.pairs)) rawPairs = parsedRaw.pairs;
    else if (parsedRaw && Array.isArray(parsedRaw.contraddizioni)) rawPairs = parsedRaw.contraddizioni;
    if (!rawPairs) {
      console.error("[Antinomia] hunter unparseable:", result.text);
      showErrorModal(
        this.app,
        "Hunter response not parseable",
        "The AI replied but didn't return a valid pairs[] structure. This often happens with local reasoning models that spend all tokens on internal <think> blocks, or with very strict JSON-mode responses.",
        `Profile: ${profile.name} (${profile.model})\nResponse length: ${result.text?.length ?? 0}\n\n--- RAW RESPONSE ---\n${result.text?.slice(0, 3000) ?? "(empty)"}`
      );
      return;
    }
    const parsed: HunterResult = { pairs: rawPairs.map(normalizePair) };

    // Anti-hallucination validation: discard invented basenames, self-pairs, empty descriptions
    const realBasenames = new Set(selected.map((f) => f.basename));
    let halluFiltered = 0;
    const validated = parsed.pairs.filter((c) => {
      const a = String(c.note_a || "").trim();
      const b = String(c.note_b || "").trim();
      const desc = String(c.description || "").trim();
      if (!a || !b || a === b) { halluFiltered++; return false; }
      if (!desc || desc === "undefined") { halluFiltered++; return false; }
      if (!realBasenames.has(a) || !realBasenames.has(b)) {
        halluFiltered++;
        console.warn("[Antinomia] hunter: discarded pair with non-existent basenames:", a, "<->", b);
        return false;
      }
      // In focus mode, discard pairs that do NOT involve the focusFile
      if (focusFile && a !== focusFile.basename && b !== focusFile.basename) {
        halluFiltered++;
        return false;
      }
      return true;
    });
    if (halluFiltered > 0) {
      console.log(`[Antinomia] hunter: filtered ${halluFiltered} hallucinated/invalid pairs`);
    }

    // Filter out already-dismissed false positives
    const dismissedSet = new Set<string>();
    for (const f of selected) {
      const fm = this.app.metadataCache.getFileCache(f)?.frontmatter;
      const fp = fm?.hunter_false_positives;
      if (Array.isArray(fp)) {
        for (const peer of fp) {
          const key = [f.basename, String(peer)].sort().join("|");
          dismissedSet.add(key);
        }
      }
    }
    let dismissedFiltered = 0;
    const filtered = validated.filter((c) => {
      const key = [c.note_a, c.note_b].sort().join("|");
      if (dismissedSet.has(key)) {
        dismissedFiltered++;
        return false;
      }
      return true;
    });

    const meta: HunterRunMetadata = {
      timestamp: new Date().toISOString(),
      notesExamined: selected.length,
      totalCandidates: candidates.length,
      truncated,
      durationMs,
      model: profile.model,
      inputTokens: result.usage?.input_tokens,
      outputTokens: result.usage?.output_tokens,
      dismissedFiltered,
    };
    const run: HunterRun = { meta, result: { pairs: filtered } };

    this.settings.lastHunterRunISO = meta.timestamp;
    this.settings.lastHunterRunCount = filtered.length;
    void this.saveSettings();

    hunterView?.setRun(run);
    new Notice(`Hunter: ${filtered.length} pairs in ${(durationMs / 1000).toFixed(1)}s.`);
    notifyAIUsage(
      "Hunter",
      result.usage
        ? { input_tokens: result.usage.input_tokens, output_tokens: result.usage.output_tokens }
        : undefined,
      durationMs,
      {
        app: this.app,
        profile: profile.name,
        model: profile.model,
        url: profile.baseUrl,
      }
    );
    console.log("[Antinomia] hunter run", meta);
  }

  /**
   * Refresh the status bar to reflect the current vault display name.
   * Called on load and whenever settings change.
   */
  refreshStatusBar(): void {
    if (!this.statusBarEl) return;
    const name = this.settings.vaultDisplayName?.trim();
    this.statusBarEl.setText(
      name ? `Antinomia · ${name}` : "Antinomia: ready"
    );
  }

  async onload(): Promise<void> {
    console.log("[Antinomia] onload — step 6 (multi-profile + welcome)");
    await this.loadSettings();
    this.addSettingTab(new AntinomiaSettingTab(this.app, this));

    // Show welcome modal on first launch only. Slight delay so Obsidian
    // finishes setting up the workspace and doesn't fight for focus.
    if (!this.settings.onboardingCompleted) {
      window.setTimeout(() => {
        new WelcomeModal(this.app, this).open();
      }, 800);
    }

    this.registerView(
      VIEW_TYPE_OPEN_TENSIONS,
      (leaf) => new OpenTensionsView(leaf, this)
    );
    this.registerView(
      VIEW_TYPE_HUNTER_RESULTS,
      (leaf) => new HunterResultsView(leaf, this)
    );
    this.registerView(
      VIEW_TYPE_DISMISSED_PAIRS,
      (leaf) => new DismissedPairsView(leaf, this)
    );
    this.registerView(
      VIEW_TYPE_SUBSTRATE_LIST,
      (leaf) => new SubstrateListView(leaf, this)
    );
    this.registerView(
      VIEW_TYPE_PRINCIPLES_LIST,
      (leaf) => new PrinciplesListView(leaf, this)
    );
    this.registerView(
      VIEW_TYPE_DEFEATED_LIST,
      (leaf) => new DefeatedListView(leaf, this)
    );
    this.registerView(
      VIEW_TYPE_ONBOARDING,
      (leaf) => new OnboardingChecklistView(leaf, this)
    );
    this.registerView(
      VIEW_TYPE_DASHBOARD,
      (leaf) => new DashboardView(leaf, this)
    );
    this.registerView(
      VIEW_TYPE_AUDIT,
      (leaf) => new AuditVaultView(leaf, this)
    );
    this.registerView(
      VIEW_TYPE_UNCLASSIFIED,
      (leaf) => new UnclassifiedNotesView(leaf, this)
    );
    this.registerView(
      VIEW_TYPE_GRAPH,
      (leaf) => new AntinomiaGraphView(leaf, this)
    );

    this.addRibbonIcon("git-pull-request", "Antinomia: Open tensions", () =>
      this.activateView(VIEW_TYPE_OPEN_TENSIONS)
    );
    this.addRibbonIcon("search", "Antinomia: Contradiction Hunter", () =>
      this.activateView(VIEW_TYPE_HUNTER_RESULTS)
    );
    this.addRibbonIcon("layout-dashboard", "Antinomia: Dashboard", () =>
      this.activateView(VIEW_TYPE_DASHBOARD)
    );
    this.addRibbonIcon("git-fork", "Antinomia: Graph View", () =>
      this.activateView(VIEW_TYPE_GRAPH, "tab")
    );

    // Auto-open Dashboard + Graph on startup if their settings are on.
    // Must run AFTER registerView() so Obsidian knows how to instantiate them.
    // onLayoutReady fires after Obsidian restores the saved workspace,
    // so we only open if no relevant leaf already exists.
    this.app.workspace.onLayoutReady(() => {
      if (this.settings.autoOpenDashboard) {
        const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_DASHBOARD);
        if (existing.length > 0) {
          this.app.workspace.revealLeaf(existing[0]);
        } else {
          void this.activateViewExternal(VIEW_TYPE_DASHBOARD);
        }
      }
      if (this.settings.autoOpenGraph) {
        const existingGraph = this.app.workspace.getLeavesOfType(VIEW_TYPE_GRAPH);
        if (existingGraph.length > 0) {
          this.app.workspace.revealLeaf(existingGraph[0]);
        } else {
          void this.activateView(VIEW_TYPE_GRAPH, "tab");
        }
      }
    });

    // ---- Creation (guided + bypass) ----
    this.addCommand({
      id: "new-tension",
      name: "new tension",
      callback: () => {
        new NewTensionModal(this.app, this, (fields, skipped) => {
          if (fields === null && !skipped) return; // cancelled
          const content = fields ? tensionTemplate(fields) : tensionTemplate();
          void this.createNote("T", content);
        }).open();
      },
    });
    this.addCommand({
      id: "new-tension-empty",
      name: "new tension (empty, no modal)",
      callback: () => this.createNote("T", tensionTemplate()),
    });
    this.addCommand({
      id: "new-substrate",
      name: "new substrate",
      callback: () => {
        new NewSubstrateModal(this.app, this, (fields, skipped) => {
          if (fields === null && !skipped) return;
          const content = fields
            ? substrateTemplate(fields)
            : substrateTemplate();
          void this.createNote("S", content);
        }).open();
      },
    });
    this.addCommand({
      id: "new-substrate-empty",
      name: "new substrate (empty, no modal)",
      callback: () => this.createNote("S", substrateTemplate()),
    });
    this.addCommand({
      id: "free-input",
      name: "free-form input (AI classifies)",
      callback: () => this.openFreeInputModal(),
    });
    this.addCommand({
      id: "free-input-from-clipboard",
      name: "free-form input from clipboard (AI classifies)",
      callback: () => void this.openFreeInputFromClipboard(),
    });
    this.addCommand({
      id: "substrate-from-pdf",
      name: "substrate from PDF (link a vault PDF)",
      callback: () => void this.openSubstrateFromPDF(),
    });
    this.addCommand({
      id: "substrate-from-youtube",
      name: "substrate from YouTube (fetch transcript)",
      callback: () => void this.openSubstrateFromYouTube(),
    });
    this.addCommand({
      id: "setup-attachments-folder",
      name: "configure attachments folder (attachments/)",
      callback: () => void this.setupAttachmentsFolder(),
    });
    this.addCommand({
      id: "list-open-tensions",
      name: "list open tensions",
      callback: () => this.activateView(VIEW_TYPE_OPEN_TENSIONS),
    });

    // ---- Layer transitions ----
    this.addCommand({
      id: "elevate-to-principle",
      name: "elevate tension to principle",
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        if (!file) return false;
        const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
        if (fm?.antinomia_type !== TYPE.tension) return false;
        if (!checking) void this.openElevateModal(file);
        return true;
      },
    });
    this.addCommand({
      id: "mark-resolved",
      name: "mark tension as resolved",
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        if (!file) return false;
        const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
        if (fm?.antinomia_type !== TYPE.tension || fm?.status !== "open")
          return false;
        if (!checking) void this.markResolved(file);
        return true;
      },
    });
    this.addCommand({
      id: "archive-as-defeated",
      name: "archive as defeated",
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        if (!file) return false;
        const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
        const t = fm?.antinomia_type;
        if (
          t !== TYPE.tension &&
          t !== TYPE.principle &&
          t !== TYPE.substrate
        )
          return false;
        if (!checking) void this.archiveAsDefeated(file);
        return true;
      },
    });

    // ---- AI commands ----
    this.addCommand({
      id: "classify-active-note",
      name: "classify active note (AI)",
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        if (!file || file.extension !== "md") return false;
        if (!checking) void this.classifyActiveNote(file);
        return true;
      },
    });
    this.addCommand({
      id: "hunt-contradictions",
      name: "find contradictions (Hunter)",
      callback: () => this.runHunter(),
    });
    this.addCommand({
      id: "hunt-contradictions-on-active",
      name: "find contradictions involving the active note (Hunter focus)",
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        if (!file || file.extension !== "md") return false;
        const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
        const t = fm?.antinomia_type;
        const isOpenTension = t === TYPE.tension && fm?.status === "open";
        const isSubstrate = t === TYPE.substrate;
        if (!isOpenTension && !isSubstrate) return false;
        if (!checking) void this.runHunter(file);
        return true;
      },
    });
    this.addCommand({
      id: "list-dismissed-pairs",
      name: "list Hunter false positives",
      callback: () => this.activateView(VIEW_TYPE_DISMISSED_PAIRS),
    });
    this.addCommand({
      id: "migrate-existing-principles",
      name: "migrate existing principles (generate retroactive defeated)",
      callback: () => void this.migrateExistingPrinciples(),
    });
    this.addCommand({
      id: "create-defeated-for-orphan-principle",
      name: "create origin defeated for orphan principle",
      callback: () => {
        const all = this.app.vault.getMarkdownFiles();
        const orphans = all.filter((f) => {
          const fm = this.app.metadataCache.getFileCache(f)?.frontmatter;
          if (fm?.antinomia_type !== TYPE.principle) return false;
          const ot = fm?.origin_tension;
          if (typeof ot !== "string") return true;
          const m = ot.match(/\[\[([^\]|]+)/);
          if (!m) return true;
          const refBase = m[1].split("/").pop() || m[1];
          const refFile = all.find((f2) => f2.basename === refBase);
          if (!refFile) return true;
          const refFm = this.app.metadataCache.getFileCache(refFile)?.frontmatter;
          return refFm?.antinomia_type !== TYPE.defeated;
        });
        if (orphans.length === 0) {
          new Notice("No orphan principles in the vault.");
          return;
        }
        const dummy = all.find((f) => {
          const fm = this.app.metadataCache.getFileCache(f)?.frontmatter;
          return fm?.antinomia_type !== TYPE.principle;
        }) ?? orphans[0];
        new NotePickerModal(
          this.app, dummy,
          (p) => void this.createDefeatedForPrinciple(p),
          (f) => orphans.some((o) => o.path === f.path),
          "Scegli un principio orfano (senza defeated linkato)..."
        ).open();
      },
    });
    this.addCommand({
      id: "merge-defeated",
      name: "merge two defeated into one (case B)",
      callback: () => {
        const all = this.app.vault.getMarkdownFiles();
        const defs = all.filter((f) => {
          const fm = this.app.metadataCache.getFileCache(f)?.frontmatter;
          return fm?.antinomia_type === TYPE.defeated;
        });
        if (defs.length < 2) {
          new Notice("At least 2 defeated notes needed in the vault.");
          return;
        }
        const dummy = all.find((f) => {
          const fm = this.app.metadataCache.getFileCache(f)?.frontmatter;
          return fm?.antinomia_type !== TYPE.defeated;
        }) ?? defs[0];
        const isDefeated = (f: TFile): boolean => {
          const fm = this.app.metadataCache.getFileCache(f)?.frontmatter;
          return fm?.antinomia_type === TYPE.defeated;
        };
        new NotePickerModal(
          this.app, dummy,
          (keep) => {
            new NotePickerModal(
              this.app, keep,
              (remove) => void this.mergeDefeated(keep, remove),
              isDefeated,
              "Defeated DA UNIRE (verra' cancellato)..."
            ).open();
          },
          isDefeated,
          "Defeated DA MANTENERE..."
        ).open();
      },
    });
    this.addCommand({
      id: "open-graph",
      name: "open Antinomia Graph (custom)",
      callback: () => this.activateView(VIEW_TYPE_GRAPH, "tab"),
    });
    this.addCommand({
      id: "list-substrate",
      name: "list substrate",
      callback: () => this.activateView(VIEW_TYPE_SUBSTRATE_LIST),
    });
    this.addCommand({
      id: "list-principles",
      name: "list principles",
      callback: () => this.activateView(VIEW_TYPE_PRINCIPLES_LIST),
    });
    this.addCommand({
      id: "list-defeated",
      name: "list defeated archive",
      callback: () => this.activateView(VIEW_TYPE_DEFEATED_LIST),
    });
    this.addCommand({
      id: "show-onboarding-checklist",
      name: "open Getting Started guide (checklist)",
      callback: () => this.activateView(VIEW_TYPE_ONBOARDING),
    });
    this.addCommand({
      id: "show-dashboard",
      name: "open Dashboard",
      callback: () => this.activateView(VIEW_TYPE_DASHBOARD),
    });
    this.addCommand({
      id: "show-audit",
      name: "vault audit (health report)",
      callback: () => this.activateView(VIEW_TYPE_AUDIT),
    });
    this.addCommand({
      id: "show-unclassified",
      name: "import existing vault (unclassified notes)",
      callback: () => this.activateView(VIEW_TYPE_UNCLASSIFIED),
    });

    // ---- Graph / collegamenti ----
    this.addCommand({
      id: "link-active-note-to",
      name: "link this note to...",
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        if (!file || file.extension !== "md") return false;
        if (!checking) {
          new NotePickerModal(this.app, file, (target) => {
            void this.linkActiveTo(file, target);
          }).open();
        }
        return true;
      },
    });

    // ---- Title management ----
    this.addCommand({
      id: "set-title",
      name: "set note title",
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        if (!file || file.extension !== "md") return false;
        if (!checking) void this.setTitleOnActiveNote(file);
        return true;
      },
    });
    this.addCommand({
      id: "show-welcome",
      name: "show welcome (restart onboarding)",
      callback: () => {
        new WelcomeModal(this.app, this).open();
      },
    });
    this.addCommand({
      id: "show-tutorial",
      name: "key concepts tutorial",
      callback: () => {
        new TutorialModal(this.app).open();
      },
    });
    this.addCommand({
      id: "guidance-next-step",
      name: "tell me what to do next (contextual hint)",
      callback: () => {
        new GuidanceModal(this.app, this).open();
      },
    });
    this.addCommand({
      id: "create-example-notes",
      name: "create example vault (3 tensions + 2 substrate)",
      callback: () => {
        new ConfirmModal(
          this.app,
          "Create example vault",
          "Verranno create 21 note demo + ESEMPIO-CHIAVE.md per i beta tester. Tutte marcate antinomia_example: true, cancellabili in 1 click col comando 'cancella esempi'.",
          "Create",
          () => void this.createExampleNotes()
        ).open();
      },
    });
    this.addCommand({
      id: "delete-example-notes",
      name: "delete examples (notes marked antinomia_example)",
      callback: () => {
        const count = this.app.vault.getMarkdownFiles().filter((f) => {
          const fm = this.app.metadataCache.getFileCache(f)?.frontmatter;
          return fm?.antinomia_example === true;
        }).length;
        if (count === 0) {
          new Notice("No example notes in the vault.");
          return;
        }
        new ConfirmModal(
          this.app,
          "Delete examples",
          `Verranno cancellate ${count} note marcate antinomia_example: true. Vanno nel cestino di Obsidian (recuperabili).`,
          "Delete",
          () => void this.deleteExampleNotes()
        ).open();
      },
    });
    this.addCommand({
      id: "propose-title-ai",
      name: "propose title (AI)",
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        if (!file || file.extension !== "md") return false;
        if (!checking) void this.proposeTitleAI(file);
        return true;
      },
    });

    this.addCommand({
      id: "map-presupposti",
      name: "map presuppositions (AI)",
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        if (!file) return false;
        const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
        if (fm?.antinomia_type !== TYPE.tension) return false;
        if (!checking) void this.openMapPresupposti(file);
        return true;
      },
    });

    this.statusBarEl = this.addStatusBarItem();
    this.refreshStatusBar();
  }

  onunload(): void {
    console.log("[Antinomia] onunload");
    this.app.workspace.detachLeavesOfType(VIEW_TYPE_OPEN_TENSIONS);
    this.app.workspace.detachLeavesOfType(VIEW_TYPE_HUNTER_RESULTS);
    this.app.workspace.detachLeavesOfType(VIEW_TYPE_DISMISSED_PAIRS);
    this.app.workspace.detachLeavesOfType(VIEW_TYPE_SUBSTRATE_LIST);
    this.app.workspace.detachLeavesOfType(VIEW_TYPE_PRINCIPLES_LIST);
    this.app.workspace.detachLeavesOfType(VIEW_TYPE_DEFEATED_LIST);
    this.app.workspace.detachLeavesOfType(VIEW_TYPE_ONBOARDING);
    this.app.workspace.detachLeavesOfType(VIEW_TYPE_DASHBOARD);
    this.app.workspace.detachLeavesOfType(VIEW_TYPE_AUDIT);
    this.app.workspace.detachLeavesOfType(VIEW_TYPE_UNCLASSIFIED);
  }

  async loadSettings(): Promise<void> {
    const data = (await this.loadData()) ?? {};
    // Migration: v1 (top-level baseUrl/apiKey/model) -> v2 (profiles[])
    if (
      (!data.profiles ||
        !Array.isArray(data.profiles) ||
        data.profiles.length === 0) &&
      (data.baseUrl || data.apiKey || data.model)
    ) {
      data.profiles = [
        {
          id: "default",
          name: "Default",
          baseUrl: data.baseUrl || DEFAULT_SETTINGS.profiles[0].baseUrl,
          apiKey: data.apiKey || "",
          model: data.model || DEFAULT_SETTINGS.profiles[0].model,
        },
      ];
      data.activeProfileId = "default";
      delete data.baseUrl;
      delete data.apiKey;
      delete data.model;
    }
    this.settings = Object.assign({}, DEFAULT_SETTINGS, data);
    // Sanity: always at least one profile
    if (!this.settings.profiles || this.settings.profiles.length === 0) {
      this.settings.profiles = JSON.parse(
        JSON.stringify(DEFAULT_SETTINGS.profiles)
      );
    }
    // Sanity: activeProfileId must reference an existing profile
    if (
      !this.settings.profiles.find((p) => p.id === this.settings.activeProfileId)
    ) {
      this.settings.activeProfileId = this.settings.profiles[0].id;
    }
    // hunterProfileId can be "" (use active), otherwise must exist
    if (
      this.settings.hunterProfileId &&
      !this.settings.profiles.find(
        (p) => p.id === this.settings.hunterProfileId
      )
    ) {
      this.settings.hunterProfileId = "";
    }
  }
  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
    this.refreshStatusBar();
  }

  /**
   * Get the active profile (the one used for all AI commands by default).
   */
  activeProfile(): Profile {
    return (
      this.settings.profiles.find(
        (p) => p.id === this.settings.activeProfileId
      ) ?? this.settings.profiles[0]
    );
  }

  /**
   * Get the profile to use for a given command type. Currently only "hunter"
   * has its own override; everything else uses the active profile.
   */
  profileFor(commandType: "hunter" | "default"): Profile {
    if (commandType === "hunter" && this.settings.hunterProfileId) {
      const p = this.settings.profiles.find(
        (x) => x.id === this.settings.hunterProfileId
      );
      if (p) return p;
    }
    return this.activeProfile();
  }

  async testConnection(profileId?: string): Promise<void> {
    const profile = profileId
      ? this.settings.profiles.find((p) => p.id === profileId) ??
        this.activeProfile()
      : this.activeProfile();
    new Notice(`Testing ${profile.name} (${profile.baseUrl}) ...`);
    try {
      const t0 = Date.now();
      const r = await callAI({
        baseUrl: profile.baseUrl,
        apiKey: profile.apiKey,
        model: profile.model,
        system: "Rispondi con la parola: pong",
        messages: [{ role: "user", content: "ping" }],
        maxTokens: 16,
      });
      const ms = Date.now() - t0;
      new Notice(`OK (${ms}ms): ${r.text.trim().slice(0, 80)}`);
    } catch (e) {
      new Notice(`Test failed: ${(e as Error).message}`);
    }
  }

  /**
   * Create a rich example vault for beta testers:
   *   - 18 note (3 tensioni aperte + 15 substrate) tratte dal test_vault_disordinato
   *   - 2 note Design C: 1 principio P + 1 defeated D collegati (motive: elevata)
   *   - 1 ESEMPIO-CHIAVE.md nella root del vault (documentazione contraddizioni seminate)
   * Tutte marcate `antinomia_example: true` per cancellazione one-click.
   */
  async createExampleNotes(): Promise<void> {
    await ensureFolder(this.app, FOLDER.notes);
    const today = todayISO();
    const stamp = () => moment().format("YYYYMMDD-HHmmss");

    const tensionTpl = (
      title: string,
      a: string,
      b: string,
      presupA = "",
      presupB = ""
    ) => `---
antinomia_type: ${TYPE.tension}
title: ${yamlQuote(title)}
status: open
base_language: english
creation_date: ${today}
modified_date: ${today}
origin: example
antinomia_example: true
links: []
---
- **A (base):** ${a}
- **A (original):**
- **B (base):** ${b}
- **B (original):**
- **Presuppositions A:** ${presupA}
- **Presuppositions B:** ${presupB}
`;

    const substrateTpl = (title: string, contenuto: string) => `---
antinomia_type: ${TYPE.substrate}
title: ${yamlQuote(title)}
base_language: english
original_language: english
source: example
date: ${today}
antinomia_example: true
---
- **Content (base):** ${contenuto}
- **Original:**
`;

    // Principle template (Design C: separate file, origin_tension points to defeated)
    const principleTpl = (
      title: string,
      ifA: string, thenA: string,
      ifB: string, thenB: string,
      grey: string,
      origineBasename: string
    ) => `---
antinomia_type: ${TYPE.principle}
title: ${yamlQuote(title)}
date: ${today}
modified_date: ${today}
origin_tension: "[[${origineBasename}]]"
antinomia_example: true
links: []
---
## IF / THEN

- **IF (A):** ${ifA}
- **THEN (A):** ${thenA}

- **IF (B):** ${ifB}
- **THEN (B):** ${thenB}

## GREY ZONE

${grey}

## Origin (tension)

> Derived from: [[${origineBasename}]]

_(original text preserved in the linked defeated)_
`;

    // Defeated template motive=elevated (Design C: original tension converted into defeated)
    const defeatedTpl = (
      title: string,
      a: string, b: string,
      sostituitaDaBasename: string
    ) => `---
antinomia_type: ${TYPE.defeated}
title: ${yamlQuote(title)}
motive: elevated
date: ${today}
modified_date: ${today}
replaced_by: "[[${sostituitaDaBasename}]]"
antinomia_example: true
links: []
---
- **A (original):** ${a}
- **B (original):** ${b}

> Replaced by: [[${sostituitaDaBasename}]]
`;

    // 18 messy-vault notes + 2 Design C (P + D linked).
    // Basenames use the EXAMPLE- prefix for easy visual identification.
    const PRINC_ID = "EXAMPLE-P-quantity-quality";
    const DEF_ID = "EXAMPLE-D-quantity-quality";
    type Item = { id: string; content: string };
    const items: Item[] = [
      // ====== 3 declared tensions ======
      { id: "EXAMPLE-T-02-remote-vs-office",
        content: tensionTpl(
          "EXAMPLE - Remote work vs office",
          "Remote work makes me more productive because no one interrupts me.",
          "In the office I get much more done; direct exchange unblocks things."
        )},
      { id: "EXAMPLE-T-08-experiences-vs-things",
        content: tensionTpl(
          "EXAMPLE - Experiences vs material goods",
          "Spending on experiences (travel, courses) is worth more than accumulating material goods.",
          "Goods last, experiences fade; investing in solid things is wiser."
        )},
      { id: "EXAMPLE-T-15-social-time-vs-brand",
        content: tensionTpl(
          "EXAMPLE - Social media: waste of time vs personal brand",
          "Social media is a waste of time that should be eliminated.",
          "Social media helped me grow professionally; it's an investment in my personal brand."
        )},

      // ====== 15 substrate ======
      { id: "EXAMPLE-S-01-gut-decisions",
        content: substrateTpl("EXAMPLE - Gut decisions",
          "Important decisions should be made by gut feeling; instinct rarely fails.")},
      { id: "EXAMPLE-S-03-impulse-decisions-data",
        content: substrateTpl("EXAMPLE - Impulse decisions — data",
          "Quote from a management book: data shows that impulse decisions have an error rate three times higher than those weighed with analysis.")},
      { id: "EXAMPLE-S-04-shopping",
        content: substrateTpl("EXAMPLE - Operational note: shopping",
          "Today I bought milk and bread. I need to remember to call the plumber.")},
      { id: "EXAMPLE-S-05-discipline-beats-talent",
        content: substrateTpl("EXAMPLE - Discipline beats talent",
          "Discipline counts more than talent: those who commit consistently always surpass the lazy prodigy.")},
      { id: "EXAMPLE-S-06-productivity-results",
        content: substrateTpl("EXAMPLE - Productivity = results",
          "Productivity is not measured in hours but in results. Spending more time at the desk doesn't mean producing more.")},
      { id: "EXAMPLE-S-07-talent-is-everything",
        content: substrateTpl("EXAMPLE - Talent is everything",
          "Talent is everything. Without a natural gift, no matter how hard you try, you stay mediocre in the things that matter.")},
      { id: "EXAMPLE-S-09-preferences",
        content: substrateTpl("EXAMPLE - Neutral preferences",
          "I like coffee in the morning. Blue is my favorite color.")},
      { id: "EXAMPLE-S-10-seneca",
        content: substrateTpl("EXAMPLE - Seneca quote on time",
          "Seneca: we don't have too little time, we waste a lot. Life is long enough if you know how to use it.")},
      { id: "EXAMPLE-S-11-carpe-diem",
        content: substrateTpl("EXAMPLE - Carpe diem",
          "Life is too short to plan for the long term; you have to enjoy the moment because you don't know what tomorrow brings.")},
      { id: "EXAMPLE-S-12-delegate-grow",
        content: substrateTpl("EXAMPLE - Delegate = growth",
          "Delegating is the key to growth: those who want to do everything alone never scale beyond themselves.")},
      { id: "EXAMPLE-S-13-do-it-yourself",
        content: substrateTpl("EXAMPLE - Do it yourself to do it well",
          "If you want something done well, do it yourself. Others never have your same care.")},
      { id: "EXAMPLE-S-14-sleep",
        content: substrateTpl("EXAMPLE - Operational note: sleep",
          "Slept badly last night. Meeting tomorrow at 10.")},
      { id: "EXAMPLE-S-16-frugal-false-economy",
        content: substrateTpl("EXAMPLE - Obsessive saving = false economy",
          "Saving obsessively on everything is a false economy: time spent chasing discounts is worth more than the discount itself.")},
      { id: "EXAMPLE-S-17-buy-cheapest",
        content: substrateTpl("EXAMPLE - I always buy the cheapest",
          "I always buy the cheapest product available, regardless. Every penny saved is a penny earned.")},
      { id: "EXAMPLE-S-18-ai-changes-everything",
        content: substrateTpl("EXAMPLE - AI will change everything",
          "AI will change everything in the coming years; it's the biggest revolution since the internet.")},

      // ====== 2 Design C notes: defeated <- principle (to show red edge in the graph) ======
      { id: DEF_ID,
        content: defeatedTpl(
          "EXAMPLE - Quantity vs quality (original tension)",
          "To grow you need to produce a lot: more output, more iterations, more speed.",
          "Quantity without care dilutes the result; better less and done well.",
          PRINC_ID
        )},
      { id: PRINC_ID,
        content: principleTpl(
          "EXAMPLE - Principle: quantity or quality depending on context",
          "exploratory phase, low production cost, fast feedback",
          "prefer volume: iterate a lot, discard fast",
          "consolidation phase, high cost, lasting consequences",
          "prefer care: less output but high quality",
          "There is a grey zone when exploration and consolidation overlap (e.g. professional creative work): in that case the criterion becomes the cost of a single error.",
          DEF_ID
        )},
    ];

    let created = 0;
    for (const it of items) {
      const path = `${FOLDER.notes}/${it.id}.md`;
      try {
        await this.app.vault.create(path, it.content);
        created++;
      } catch (e) {
        console.error("[Antinomia] example create failed for", it.id, e);
      }
    }

    // ====== EXAMPLE-KEY.md in the ROOT of the vault (NOT in notes/) ======
    const chiaveContent = `---
antinomia_example: true
title: "EXAMPLE — Key to the seeded contradictions"
---
# Example vault — key

> This file accompanies the EXAMPLE-* notes in your vault. It explains which contradictions were seeded, what the Hunter should find, and what counts as control noise.
>
> Delete this file (and all EXAMPLE-* notes) via: Settings -> Antinomia -> "Delete examples" or command palette "Antinomia: delete examples".

---

## REAL contradictions seeded (what the Hunter SHOULD find)

### CN1 — SHARP. Gut decisions vs deliberated
- **Gut decisions** ↔ **Impulse decisions — data**
- Frontal contradiction, almost explicit. Expected confidence: **alta**.

### CN2 — SHARP. Talent vs discipline
- **Discipline beats talent** ↔ **Talent is everything**
- Direct opposition on which factor counts. Expected confidence: **alta**.

### CN3 — MEDIUM. Do it yourself vs delegate
- **Delegate = growth** ↔ **Do it yourself to do it well**
- Clear contradiction but expressed in different registers. Expected confidence: **medium-high**.

### CN4 — MEDIUM, substrate↔substrate. Saving
- **Obsessive saving = false economy** ↔ **I always buy the cheapest**
- Test of substrate↔substrate scanning. Expected confidence: **media**.

### CN5 — SUBTLE. Time: Seneca vs carpe diem
- **Seneca quote on time** ↔ **Carpe diem**
- Philosophical contradiction, less lexically evident. Expected confidence: **low-medium**.

---

## NOISE — elements that should NOT generate contradictions

- **Operational note: shopping** (milk, bread, plumber)
- **Neutral preferences** (coffee, blue color)
- **Operational note: sleep** (slept badly, meeting tomorrow)
- **AI will change everything** (isolated opinion, no opposite in the vault)

If the Hunter pairs any of these as "contradiction", it's a FALSE POSITIVE.

---

## Tensions already declared (NOT for the Hunter to discover — already open)

- **Remote work vs office**
- **Experiences vs material goods**
- **Social media: waste of time vs personal brand**

NB: "Productivity = results" touches the same theme as "Remote work vs office". The Hunter MIGHT link them — legitimate weak connection, not an error.

---

## Design C example (visible in the graph)

- **Defeated**: EXAMPLE - Quantity vs quality (original tension)
- **Principle**: EXAMPLE - Principle: quantity or quality depending on context

Open the Antinomia Graph — you'll see the two nodes connected by a red edge (defeated → replaced_by → principle). This is an example of a tension already elevated: the operational principle emerges from resolving the tension, the defeated preserves the history.

---

## How to measure the Hunter

- **Recall on CN1, CN2** (sharp): if even one is missed, serious model problem.
- **CN4 substrate↔substrate**: does it find it? -> full scanning works.
- **CN5 subtle**: does it find it? -> the model reasons well; if it skips it -> model limit, not design.
- **False positives on noise**: zero is ideal.
- **Confidence ordering**: the sharp ones (CN1, CN2) should rank above the subtle one (CN5).
`;
    try {
      await this.app.vault.create("EXAMPLE-KEY.md", chiaveContent);
      created++;
    } catch (e) {
      console.error("[Antinomia] example key create failed", e);
    }

    new Notice(
      `Examples created: ${created} notes (18 messy + 2 Design C + 1 KEY). Removable via 'delete examples'.`
    );
    await this.activateView(VIEW_TYPE_OPEN_TENSIONS);

    // Force a relayout of any open Graph view: a batch of 20+ new nodes added
    // at (0,0) collapses into a single cluster otherwise. Small delay gives
    // Obsidian's metadataCache time to process the newly created notes.
    setTimeout(() => this.refreshOpenGraphViews(), 300);
  }

  /**
   * Delete every note flagged with `antinomia_example: true` in frontmatter.
   */
  async deleteExampleNotes(): Promise<void> {
    const toDelete = this.app.vault.getMarkdownFiles().filter((f) => {
      const fm = this.app.metadataCache.getFileCache(f)?.frontmatter;
      return fm?.antinomia_example === true;
    });
    if (toDelete.length === 0) {
      new Notice("No example notes found.");
      return;
    }
    let deleted = 0;
    for (const f of toDelete) {
      try {
        await this.app.vault.trash(f, true);
        deleted++;
      } catch (e) {
        console.error("[Antinomia] example delete failed", e);
      }
    }
    new Notice(`Deleted ${deleted} example notes.`);
  }

  /**
   * Read the system clipboard and open FreeInputModal with the text
   * pre-populated. The AI then classifies it as tensione or substrate
   * and routes to the correct creation modal.
   */
  async openFreeInputFromClipboard(): Promise<void> {
    let clip = "";
    let source = "unknown";

    // Try Electron clipboard first (Obsidian Desktop). Available via require.
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const electron = (window as any).require?.("electron");
      if (electron?.clipboard?.readText) {
        clip = electron.clipboard.readText() ?? "";
        source = "electron";
      }
    } catch (e) {
      // electron not available (mobile? web?), fall through
      console.debug("[Antinomia] electron clipboard not available", e);
    }

    // Fallback to web clipboard API
    if (!clip) {
      try {
        clip = await navigator.clipboard.readText();
        source = "navigator";
      } catch (e) {
        console.error("[Antinomia] navigator.clipboard.readText failed", e);
      }
    }

    console.log(
      `[Antinomia] clipboard read via ${source}: ${clip.length} chars`
    );

    if (!clip.trim()) {
      new Notice(
        "Clipboard empty or unreadable. Opening empty free-form modal: you can paste manually (Ctrl+V)."
      );
      this.openFreeInputModal();
      return;
    }

    // Special handling: if the clipboard contains a single YouTube URL,
    // offer to fetch the transcript directly into a substrate.
    const ytId = extractYouTubeId(clip.trim());
    if (ytId && clip.trim().length < 200) {
      const proceed = window.confirm(
        "Il contenuto della clipboard sembra un URL YouTube. Vuoi scaricare la trascrizione e creare un substrate pre-popolato?\n\nOK = scarica trascrizione.\nAnnulla = procedi con l'inserimento libero (AI classifica)."
      );
      if (proceed) {
        await this.openSubstrateFromYouTube(clip.trim());
        return;
      }
    }

    new Notice(
      `Read ${clip.length} characters. The AI will classify as tension or substrate.`
    );

    // Route through FreeInputModal so the AI decides tipo (tension/substrate)
    new FreeInputModal(
      this.app,
      this,
      (analysis, originalText, meta) => {
        if (analysis.tipo === "tension") {
          new NewTensionModal(
            this.app,
            this,
            (fields, skipped) => {
              if (fields === null && !skipped) return;
              const content = fields
                ? tensionTemplate(fields)
                : tensionTemplate();
              void this.createNote("T", content);
            },
            {
              title: analysis.title,
              statementA: analysis.statementA,
              statementB: analysis.statementB,
            },
            meta
          ).open();
        } else {
          new NewSubstrateModal(
            this.app,
            this,
            (fields, skipped) => {
              if (fields === null && !skipped) return;
              const content = fields
                ? substrateTemplate(fields)
                : substrateTemplate();
              void this.createNote("S", content);
            },
            {
              title: analysis.title,
              contenuto: analysis.contenuto || originalText,
            },
            meta
          ).open();
        }
      },
      clip
    ).open();
  }

  /**
   * Create an `attachments/` folder if missing, and set Obsidian's
   * "default location for new attachments" to point there. This keeps
   * `notes/` (the Antinomia notes folder) clean from binary files.
   * Uses app.vault.setConfig (internal API): may break across major
   * Obsidian versions but is the simplest way to do this programmatically.
   */
  async setupAttachmentsFolder(): Promise<void> {
    const folder = "attachments";
    try {
      const existing = this.app.vault.getAbstractFileByPath(folder);
      if (!existing) {
        await this.app.vault.createFolder(folder);
        new Notice(`Folder '${folder}/' created.`);
      } else {
        new Notice(`Folder '${folder}/' already exists.`);
      }
    } catch (e) {
      console.error("[Antinomia] createFolder attachments failed", e);
      new Notice(`Folder creation error: ${(e as Error).message}`);
      return;
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const vaultAny = this.app.vault as any;
      if (typeof vaultAny.setConfig === "function") {
        vaultAny.setConfig("attachmentFolderPath", folder);
        new Notice(
          `New attachments will save to '${folder}/'. (Obsidian setting updated.)`
        );
      } else {
        new Notice(
          `Folder '${folder}/' ready. To make it the default, go to Obsidian Settings → Files and links → 'Default location for new attachments' → select '${folder}'.`
        );
      }
    } catch (e) {
      console.error("[Antinomia] setConfig attachmentFolderPath failed", e);
      new Notice(
        `Folder created but could not set as default. Configure manually in Obsidian Settings → Files and links.`
      );
    }
  }

  /**
   * Prompt for a YouTube URL, fetch the transcript, and create a substrate
   * pre-populated with the URL + transcript text. Title suggested from
   * "Video YouTube — <id>" (user can override before saving).
   */
  async openSubstrateFromYouTube(prefillUrl = ""): Promise<void> {
    // Mini prompt modal for the URL
    const askUrl = (): Promise<string | null> =>
      new Promise((resolve) => {
        const modal = new Modal(this.app);
        modal.onOpen = () => {
          const c = modal.contentEl;
          c.createEl("h3", { text: "Substrate from YouTube" });
          const p = c.createEl("p");
          p.style.fontSize = "0.88em";
          p.style.opacity = "0.8";
          p.setText(
            "Incolla l'URL del video. Scarichero' la trascrizione (se disponibile) tramite l'API timedtext di YouTube."
          );
          let url = prefillUrl;
          const input = c.createEl("input", { type: "text" });
          input.style.width = "100%";
          input.style.padding = "6px";
          input.style.marginBottom = "10px";
          input.value = url;
          input.placeholder = "https://www.youtube.com/watch?v=...";
          input.addEventListener("input", (e) => {
            url = (e.target as HTMLInputElement).value;
          });
          input.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
              modal.close();
              resolve(url.trim() || null);
            }
          });
          setTimeout(() => {
            input.focus();
            input.select();
          }, 0);
          new Setting(c)
            .addButton((b) =>
              b.setButtonText("Cancel").onClick(() => {
                modal.close();
                resolve(null);
              })
            )
            .addButton((b) =>
              b
                .setButtonText("Scarica trascrizione")
                .setCta()
                .onClick(() => {
                  modal.close();
                  resolve(url.trim() || null);
                })
            );
        };
        modal.open();
      });

    const url = await askUrl();
    if (!url) return;

    new Notice("Attempting automatic YouTube transcript fetch...");
    const result = await fetchYouTubeTranscript(url);

    if (result) {
      // Auto-fetch success
      new Notice(
        `Transcript downloaded: ${result.text.length} characters (language: ${result.lang}).`
      );
      const titoloSuggerito = `Video YouTube — ${result.videoId}`;
      const contenutoIniziale = `> Video: ${url}\n\n${result.text}`;
      new NewSubstrateModal(
        this.app,
        this,
        (fields, skipped) => {
          if (fields === null && !skipped) return;
          const content = fields
            ? substrateTemplate(fields)
            : substrateTemplate();
          void this.createNote("S", content);
        },
        { title: titoloSuggerito, contenuto: contenutoIniziale }
      ).open();
      return;
    }

    // ---- Auto-fetch failed: paste-assisted fallback ----
    const videoId = extractYouTubeId(url) ?? "video";
    const fallbackModal = new Modal(this.app);
    fallbackModal.onOpen = () => {
      const c = fallbackModal.contentEl;
      c.createEl("h3", { text: "Automatic fetch failed" });
      const p = c.createEl("p");
      p.style.fontSize = "0.9em";
      p.style.lineHeight = "1.5";
      p.setText(
        "YouTube blocca il fetch diretto della trascrizione (richiede sessione autenticata). Workaround in 3 click:"
      );
      const steps = c.createEl("ol");
      steps.style.lineHeight = "1.5";
      steps.style.marginBottom = "12px";
      steps.createEl("li", {
        text: "Click sul bottone qui sotto per aprire youtubetotranscript.com nel browser.",
      });
      steps.createEl("li", {
        text: "Sul sito, l'URL del video e' gia' incollato. Click 'Get Transcript'.",
      });
      steps.createEl("li", {
        text: "Seleziona tutta la trascrizione, Ctrl+C, torna qui e incollala nel campo sotto.",
      });

      new Setting(c)
        .setName("Open external service")
        .addButton((b) =>
          b
            .setButtonText("Open youtubetotranscript.com")
            .setCta()
            .onClick(() => {
              const externalUrl = `https://youtubetotranscript.com/transcript?v=${videoId}`;
              try {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const electron = (window as any).require?.("electron");
                if (electron?.shell?.openExternal) {
                  electron.shell.openExternal(externalUrl);
                } else {
                  window.open(externalUrl, "_blank");
                }
              } catch (e) {
                window.open(externalUrl, "_blank");
              }
            })
        );

      const label = c.createEl("label", {
        text: "Incolla qui la trascrizione",
      });
      label.style.display = "block";
      label.style.fontWeight = "bold";
      label.style.marginTop = "10px";

      const textarea = c.createEl("textarea");
      textarea.style.width = "100%";
      textarea.style.minHeight = "200px";
      textarea.style.padding = "8px";
      textarea.style.marginTop = "4px";
      let pasted = "";
      textarea.addEventListener("input", (e) => {
        pasted = (e.target as HTMLTextAreaElement).value;
      });

      new Setting(c)
        .addButton((b) =>
          b.setButtonText("Cancel").onClick(() => fallbackModal.close())
        )
        .addButton((b) =>
          b
            .setButtonText("Create substrate")
            .setCta()
            .onClick(() => {
              const txt = pasted.trim();
              if (!txt) {
                new Notice("Paste the transcript before saving.");
                return;
              }
              fallbackModal.close();
              const titoloSuggerito = `Video YouTube — ${videoId}`;
              const contenutoIniziale = `> Video: ${url}\n\n${txt}`;
              new NewSubstrateModal(
                this.app,
                this,
                (fields, skipped) => {
                  if (fields === null && !skipped) return;
                  const content = fields
                    ? substrateTemplate(fields)
                    : substrateTemplate();
                  void this.createNote("S", content);
                },
                { title: titoloSuggerito, contenuto: contenutoIniziale }
              ).open();
            })
        );
    };
    fallbackModal.onClose = () => fallbackModal.contentEl.empty();
    fallbackModal.open();
  }

  /**
   * Apre il MapPresuppostiModal per una tensione. Estrae i presupposti
   * gia' presenti (frontmatter o body) e li pre-popola; sul submit li
   * applica via applyPresupposti.
   */
  // Guardia anti-doppia-apertura: alcuni click handler/re-render della sidebar
  // possono triggerare due volte openElevateModal in rapida sequenza.
  private elevateModalOpen = false;

  async openElevateModal(file: TFile): Promise<void> {
    if (this.elevateModalOpen) {
      console.warn("[Antinomia] openElevateModal: gia' aperto, ignoro richiesta duplicata");
      return;
    }
    const fm0 = this.app.metadataCache.getFileCache(file)?.frontmatter;
    if (fm0?.antinomia_type !== TYPE.tension) {
      new Notice("Elevate: active note is not a tension.");
      return;
    }
    let rawElev = "";
    try {
      rawElev = await this.app.vault.read(file);
    } catch (e) {
      new Notice(`Read error: ${(e as Error).message}`);
      return;
    }
    this.elevateModalOpen = true;
    const modal = new ElevateToPrincipleModal(
      this.app,
      this,
      file,
      rawElev,
      async (fields, skipped) => {
        if (fields === null && !skipped) return;
        await this.elevateToPrinciple(file, fields ?? undefined);
      }
    );
    // Sblocca il guard quando il modal si chiude (qualsiasi via)
    const originalOnClose = modal.onClose?.bind(modal);
    modal.onClose = () => {
      this.elevateModalOpen = false;
      if (originalOnClose) originalOnClose();
    };
    modal.open();
  }

  /**
   * Rimuove una coppia dai falsi positivi dell'Hunter. Cerca tra entrambi
   * i file (a e b) ed elimina il basename dell'altro dall'array
   * `hunter_false_positives`. Se l'array diventa vuoto, rimuove il campo.
   */
  async undismissContradiction(
    aBasename: string,
    bBasename: string
  ): Promise<void> {
    const findFile = (bn: string): TFile | null => {
      const all = this.app.vault.getMarkdownFiles();
      return all.find((f) => f.basename === bn) ?? null;
    };
    const cleanOne = async (
      file: TFile | null,
      peer: string
    ): Promise<boolean> => {
      if (!file) return false;
      let modified = false;
      await this.app.fileManager.processFrontMatter(file, (fm) => {
        const arr = fm.hunter_false_positives;
        if (!Array.isArray(arr)) return;
        const filtered = arr.filter((x: any) => String(x) !== peer);
        if (filtered.length !== arr.length) {
          modified = true;
          if (filtered.length === 0) delete fm.hunter_false_positives;
          else fm.hunter_false_positives = filtered;
        }
      });
      return modified;
    };
    const a = findFile(aBasename);
    const b = findFile(bBasename);
    const mA = await cleanOne(a, bBasename);
    const mB = await cleanOne(b, aBasename);
    if (mA || mB) {
      new Notice(`Reincluso: ${aBasename} <-> ${bBasename}`);
    } else {
      new Notice("Nessun dismiss trovato per questa coppia.");
    }
  }

  async openMapPresupposti(file: TFile): Promise<void> {
    const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
    if (fm?.antinomia_type !== TYPE.tension) {
      new Notice("Mappa presupposti: la nota attiva non e' una tensione.");
      return;
    }
    let raw = "";
    try {
      raw = await this.app.vault.read(file);
    } catch (e) {
      new Notice(`Read error: ${(e as Error).message}`);
      return;
    }
    // Pre-fill: prima frontmatter, poi fallback al body "**Presuppositions A:** ..."
    let existingA: string =
      typeof fm?.presupposizioniA === "string" ? fm.presupposizioniA : "";
    let existingB: string =
      typeof fm?.presupposizioniB === "string" ? fm.presupposizioniB : "";
    if (!existingA) {
      const m = raw.match(/\*\*Presuppositions A:\*\*\s*([^\n]*)/);
      if (m && m[1].trim() && !m[1].includes("[da mappare]")) {
        existingA = m[1].trim();
      }
    }
    if (!existingB) {
      const m = raw.match(/\*\*Presuppositions B:\*\*\s*([^\n]*)/);
      if (m && m[1].trim() && !m[1].includes("[da mappare]")) {
        existingB = m[1].trim();
      }
    }
    new MapPresuppostiModal(
      this.app,
      this,
      file,
      existingA,
      existingB,
      async (fields) => {
        if (!fields) return;
        await this.applyPresupposti(file, fields);
      }
    ).open();
  }

  /**
   * Open the PDF picker; on selection, create a substrate with a wikilink
   * to the PDF + an empty Contenuto for the user's reading notes.
   */
  /**
   * AI helper: extract distinct standalone concepts from a chunk of text
   * (typically PDF body). Returns an array of substrate proposals — title +
   * content — that the caller can review and bulk-create.
   *
   * Uses the EXTRACT_CONCEPTS_SYSTEM prompt, taskClass "deep" (large output),
   * disableThinking left undefined (defaults to false for "deep" → reasoning
   * stays on, useful for deduplicating semantically-similar concepts).
   */
  async extractConceptsFromPdfText(
    text: string,
    signal?: AbortSignal,
    attachUsageTo?: HTMLButtonElement
  ): Promise<{ concepts: PdfConcept[]; meta: AIUsageMeta } | null> {
    const profile = this.profileFor("default");
    if (!profile.apiKey) {
      showErrorModal(
        this.app,
        "API key missing",
        "The active AI profile has no API key. Open Settings → Antinomia and add one (or switch profile)."
      );
      return null;
    }
    const t0 = Date.now();
    try {
      const result = await callAI({
        baseUrl: profile.baseUrl,
        apiKey: profile.apiKey,
        model: profile.model,
        system: EXTRACT_CONCEPTS_SYSTEM,
        messages: [{ role: "user", content: text }],
        taskClass: "deep",
        signal,
      });
      notifyAIUsage(
        "PDF concepts",
        result.usage,
        Date.now() - t0,
        {
          app: this.app,
          profile: profile.name,
          model: profile.model,
          url: profile.baseUrl,
        },
        attachUsageTo
      );
      if (signal?.aborted) return null;
      const parsed = extractJson<PdfConceptsResult>(result.text);
      if (!parsed || !Array.isArray(parsed.concepts)) {
        console.error("[Antinomia] extractConceptsFromPdfText unparseable:", result.text);
        showErrorModal(
          this.app,
          "AI concept extraction not parseable",
          "The AI replied but the response wasn't a valid JSON array of concepts. Try again, or shorten the PDF section.",
          `Profile: ${profile.name} (${profile.model})\n\n--- RAW RESPONSE ---\n${result.text?.slice(0, 2000) ?? "(empty)"}`
        );
        return null;
      }
      // Sanitize: drop concepts with empty title/content, trim, cap title length.
      const cleaned = parsed.concepts
        .map((c) => ({
          title: String(c.title ?? "").trim().slice(0, 120),
          content: String(c.content ?? "").trim(),
        }))
        .filter((c) => c.title.length > 0 && c.content.length > 0);
      const meta: AIUsageMeta = {
        usage: result.usage,
        durationMs: Date.now() - t0,
        profile: profile.name,
        model: profile.model,
        url: profile.baseUrl,
        operation: "PDF concepts",
      };
      return { concepts: cleaned, meta };
    } catch (e) {
      const msg = (e as Error).message;
      if (msg === "hunter_aborted" || msg === "ai_aborted" || signal?.aborted) {
        return null;
      }
      showErrorModal(
        this.app,
        "AI concept extraction error",
        `Couldn't extract concepts from the PDF. ${msg.includes("not reachable") ? "Your local AI backend doesn't seem to be running." : "Check that the backend is reachable and the API key is valid."}`,
        `Profile: ${profile.name} (${profile.model})\nURL: ${profile.baseUrl}\n\n${msg}`
      );
      return null;
    }
  }

  /**
   * Bulk-create substrate notes from a list of concepts extracted from a
   * specific PDF. Each substrate goes into a dedicated subfolder
   * `notes/from-pdf-<basename>/` and is linked back to the source PDF via
   * a wikilink in the body AND a `source` frontmatter field.
   *
   * Returns the count of substrates actually created (the caller may have
   * already validated selection).
   */
  async bulkCreateSubstratesFromConcepts(
    concepts: PdfConcept[],
    pdfFile: TFile
  ): Promise<number> {
    if (concepts.length === 0) return 0;

    // Sanitize the PDF basename for use as folder name (Obsidian-safe).
    const safeName = pdfFile.basename
      .replace(/[\\/:*?"<>|]/g, "-")
      .slice(0, 60)
      .trim()
      .replace(/\s+/g, "_");
    const folder = `notes/from-pdf-${safeName}`;

    // Ensure subfolder exists.
    if (!this.app.vault.getAbstractFileByPath(folder)) {
      try {
        await this.app.vault.createFolder(folder);
      } catch (e) {
        console.warn(`[Antinomia] folder create failed (may exist):`, e);
      }
    }

    // STEP 1 — Create the PDF hub note (an Antinomia meta_note that acts as
    // the central node in the graph for this PDF). Concepts will link to
    // this hub via `links` frontmatter; the hub in turn links to the PDF.
    // Result in the graph view: hub at the center, N concept satellites.
    const hubFile = await this.createOrUpdatePdfHubNote(pdfFile, folder, []);
    const hubBasename = hubFile?.basename ?? `PDF-${safeName}`;
    // Use a short, human-friendly alias for body wikilinks so Front Matter
    // Title doesn't pop up an "Approve changes" dialog for every concept
    // proposing to promote `[[H-xxx]]` → `[[H-xxx|<long PDF title>]]`.
    const hubAlias = `PDF: ${pdfFile.basename}`;

    // STEP 2 — Create one substrate per concept, each linked to the hub.
    const createdFiles: TFile[] = [];
    for (const c of concepts) {
      const fields: SubstrateFields = {
        title: c.title,
        content: c.content,
      };
      const body = substrateTemplate(fields);
      // Post-process the template:
      // - Replace `source: user_input` with `source: "PDF: <basename>"`
      // - Add `origin: pdf_extraction`
      // - Add `links: ["[[<hub basename>]]"]` so the graph wires this
      //   substrate to the PDF hub node (cluster effect). Frontmatter
      //   links stay basename-only (YAML, not body — no FMT prompt).
      // - Append a body footer wikilink WITH ALIAS back to the hub and the
      //   PDF, so Front Matter Title doesn't propose alias promotion every
      //   time the user opens a concept note.
      const enriched = body
        .replace(
          /^source:\s*user_input$/m,
          `source: "PDF: ${pdfFile.basename}"\norigin: "pdf_extraction"\nlinks:\n  - "[[${hubBasename}]]"`
        )
        .replace(
          /\n*$/,
          `\n\n> Extracted from: [[${hubBasename}|${hubAlias}]]\n> See PDF: [[${pdfFile.basename}|${pdfFile.basename}]]\n`
        );

      try {
        const file = await this.createNote("S", enriched, folder, false);
        if (file) createdFiles.push(file);
      } catch (e) {
        console.error(`[Antinomia] failed to create substrate from concept "${c.title}":`, e);
      }
    }

    // STEP 3 — Refresh the hub note's body to list all the actual concept
    // wikilinks (we couldn't write them in step 1 because the files didn't
    // exist yet).
    if (hubFile && createdFiles.length > 0) {
      await this.createOrUpdatePdfHubNote(pdfFile, folder, createdFiles, hubFile);
    }

    new Notice(
      `Created ${createdFiles.length} of ${concepts.length} substrates from "${pdfFile.basename}" in ${folder}/`
    );
    return createdFiles.length;
  }

  /**
   * Create (or refresh the body of) the meta_note that acts as a graph hub
   * for substrates extracted from a specific PDF. Idempotent: if a hub for
   * this PDF already exists in the folder, we reuse it (rewriting the body
   * with the new list of concepts) instead of creating duplicates.
   *
   * The hub is named `H-<safename>.md` (H for Hub) and lives at the root
   * of the per-PDF folder.
   */
  private async createOrUpdatePdfHubNote(
    pdfFile: TFile,
    folder: string,
    conceptFiles: TFile[],
    existing?: TFile
  ): Promise<TFile | null> {
    const safeName = pdfFile.basename
      .replace(/[\\/:*?"<>|]/g, "-")
      .slice(0, 60)
      .trim()
      .replace(/\s+/g, "_");
    const hubPath = `${folder}/H-${safeName}.md`;

    // Each concept wikilink uses an explicit alias (the human title from the
    // concept's frontmatter, falling back to its basename) so Front Matter
    // Title doesn't trigger an "Approve changes" prompt for each one.
    const conceptLinks =
      conceptFiles.length > 0
        ? conceptFiles
            .map((f) => {
              const fm = this.app.metadataCache.getFileCache(f)?.frontmatter;
              const title =
                typeof fm?.title === "string" && fm.title.trim()
                  ? String(fm.title).trim()
                  : f.basename;
              return `- [[${f.basename}|${title}]]`;
            })
            .join("\n")
        : "_(no concepts yet — will be populated after bulk creation)_";

    const today = todayISO();
    const hubContent = `---
antinomia_type: meta_note
title: "PDF source: ${pdfFile.basename.replace(/"/g, '\\"')}"
source: "PDF: ${pdfFile.basename}"
origin: pdf_extraction_hub
date: ${today}
modified_date: ${today}
---

# PDF source: ${pdfFile.basename}

> Original file: [[${pdfFile.basename}]]
> Extracted concepts: **${conceptFiles.length}**

## Concepts extracted

${conceptLinks}

---

_This is an Antinomia meta_note acting as a graph hub for substrates extracted from the PDF above. Concepts link back to this hub via their \`links\` frontmatter — the Antinomia Graph view will show them as a cluster around this node._
`;

    try {
      // Find existing hub: prefer the one passed in, otherwise look up by path.
      const target =
        existing ??
        (this.app.vault.getAbstractFileByPath(hubPath) as TFile | null);
      if (target) {
        await this.app.vault.modify(target, hubContent);
        return target;
      }
      const file = await this.app.vault.create(hubPath, hubContent);
      return file;
    } catch (e) {
      console.error(`[Antinomia] PDF hub note create/update failed:`, e);
      return null;
    }
  }

  /**
   * Import a PDF from disk into the vault. Uses Electron's file dialog on
   * desktop (Obsidian is desktop-only per manifest.isDesktopOnly). Copies
   * the file into `attachments/` (creating the folder if missing) and
   * returns the resulting TFile.
   *
   * Returns null if the user cancelled, or shows an error modal on failure.
   */
  /**
   * Import a PDF from disk into the vault using the standard HTML5 file
   * picker (more portable than Electron's deprecated `remote.dialog` and
   * works on any Obsidian build, mobile included if isDesktopOnly were
   * ever relaxed). Copies the picked file into `attachments/` and returns
   * the resulting TFile.
   *
   * Returns null if the user cancels or on read failure.
   */
  async importPdfFromDisk(): Promise<TFile | null> {
    return new Promise((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "application/pdf,.pdf";
      input.style.display = "none";
      document.body.appendChild(input);

      let resolved = false;
      const cleanup = () => {
        try {
          input.remove();
        } catch {
          /* ignore */
        }
      };

      input.addEventListener("change", async () => {
        const file = input.files?.[0];
        if (!file) {
          if (!resolved) {
            resolved = true;
            cleanup();
            resolve(null);
          }
          return;
        }
        try {
          const buffer = await file.arrayBuffer();
          const basename = file.name.replace(/\.pdf$/i, "");
          const folder = "attachments";
          await ensureFolder(this.app, folder);
          let destPath = `${folder}/${basename}.pdf`;
          let i = 1;
          while (this.app.vault.getAbstractFileByPath(destPath)) {
            destPath = `${folder}/${basename} (${i}).pdf`;
            i++;
          }
          const tFile = await this.app.vault.createBinary(destPath, buffer);
          new Notice(`Imported PDF to ${destPath}`);
          resolved = true;
          cleanup();
          resolve(tFile);
        } catch (e) {
          console.error("[Antinomia] importPdfFromDisk failed:", e);
          showErrorModal(
            this.app,
            "PDF import failed",
            "Couldn't copy the PDF into the vault.",
            (e as Error).message
          );
          resolved = true;
          cleanup();
          resolve(null);
        }
      });

      // Cancel detection: HTML5 file input doesn't fire any event on cancel.
      // Use the body's `focus` event as a heuristic — when the dialog
      // closes, focus returns to the window. We wait a beat then check.
      const onFocus = () => {
        window.removeEventListener("focus", onFocus);
        setTimeout(() => {
          if (!resolved && !input.files?.length) {
            resolved = true;
            cleanup();
            resolve(null);
          }
        }, 300);
      };
      window.addEventListener("focus", onFocus);

      input.click();
    });
  }

  /**
   * Full PDF ingest flow:
   *   1. Source pick (vault PDF or import from disk)
   *   2. Extract text via pdfjsLib (Obsidian bundled)
   *   3. Warn if too long (hard cap at PDF_TEXT_HARD_CAP_CHARS)
   *   4. AI extract distinct concepts (EXTRACT_CONCEPTS_SYSTEM)
   *   5. Preview modal: pick which to materialize
   *   6. Bulk create substrate notes in notes/from-pdf-<basename>/ folder
   *      with frontmatter source + body wikilink back to the PDF.
   *
   * Heavy AI call (taskClass deep). Stop button works via withLoadingButton.
   */
  async openSubstrateFromPDF(): Promise<void> {
    new PdfSourcePickerModal(this.app, this, async (pdf) => {
      await this.runPdfIngest(pdf);
    }).open();
  }

  private async runPdfIngest(pdf: TFile): Promise<void> {
    // Step 1: extract text from PDF binary.
    const extractingNotice = new Notice(
      `Extracting text from "${pdf.basename}"…`,
      0
    );
    let extracted: PdfExtractResult;
    try {
      const binary = await this.app.vault.readBinary(pdf);
      extracted = await extractPdfText(binary);
    } catch (e) {
      extractingNotice.hide();
      const msg = (e as Error).message;
      if (msg.startsWith("pdfjs_not_loaded:")) {
        showErrorModal(
          this.app,
          "PDF library not loaded yet",
          msg.replace(/^pdfjs_not_loaded:/, ""),
          msg
        );
      } else {
        showErrorModal(
          this.app,
          "PDF text extraction failed",
          "Couldn't extract text from this PDF. It may be scanned (image-only) or corrupt. OCR support is planned for v1.5.",
          msg
        );
      }
      return;
    }
    extractingNotice.hide();

    if (extracted.text.trim().length === 0) {
      showErrorModal(
        this.app,
        "Empty PDF text",
        `No extractable text in "${pdf.basename}". This is usually a scanned PDF (image-only). OCR is planned for v1.5.`,
        `Pages: ${extracted.pageCount}\nTotal chars: ${extracted.totalChars}`
      );
      return;
    }

    if (extracted.truncated) {
      const proceed = window.confirm(
        `The PDF is longer than ${PDF_TEXT_HARD_CAP_CHARS.toLocaleString()} characters.\n\n` +
          `Only the first ${PDF_TEXT_HARD_CAP_CHARS.toLocaleString()} chars will be analyzed; the rest will be skipped.\n\n` +
          `Chunking support (full coverage) is planned for v1.5.\n\n` +
          `OK = proceed with truncated text.\nCancel = abort.`
      );
      if (!proceed) return;
    }

    // Step 2: AI concept extraction with a dedicated progress modal that
    // exposes a Stop button. The source picker has already closed, so we
    // cannot use withLoadingButton — this modal IS the loading UI.
    const profile = this.profileFor("default");
    const progressModal = new PdfAnalyzingModal(this.app, pdf.basename, profile.model);
    progressModal.open();
    let result: { concepts: PdfConcept[]; meta: AIUsageMeta } | null = null;
    try {
      result = await this.extractConceptsFromPdfText(
        extracted.text,
        progressModal.controller.signal
      );
    } finally {
      progressModal.close();
    }
    if (!result) return; // error modal already shown by extractConcepts (or silent abort)

    // Step 3: preview & let the user pick.
    new PdfConceptsPreviewModal(
      this.app,
      this,
      pdf,
      result.concepts,
      result.meta,
      async (picks) => {
        await this.bulkCreateSubstratesFromConcepts(picks, pdf);
        // Wait a beat so Obsidian's metadataCache picks up the new
        // frontmatter (otherwise sidebars would show basenames instead of
        // human titles until the next interaction). Then refresh both
        // Substrate and Graph views so the user sees the cluster.
        setTimeout(() => {
          void this.activateView(VIEW_TYPE_SUBSTRATE_LIST);
          this.refreshOpenGraphViews();
        }, 700);
      }
    ).open();
  }

  openFreeInputModal(): void {
    new FreeInputModal(this.app, this, (analysis, originalText, meta) => {
      if (analysis.tipo === "tension") {
        new NewTensionModal(
          this.app,
          this,
          (fields, skipped) => {
            if (fields === null && !skipped) return;
            const content = fields
              ? tensionTemplate(fields)
              : tensionTemplate();
            void this.createNote("T", content);
          },
          {
            title: analysis.title,
            statementA: analysis.statementA,
            statementB: analysis.statementB,
          },
          meta
        ).open();
      } else {
        new NewSubstrateModal(
          this.app,
          this,
          (fields, skipped) => {
            if (fields === null && !skipped) return;
            const content = fields
              ? substrateTemplate(fields)
              : substrateTemplate();
            void this.createNote("S", content);
          },
          {
            title: analysis.title,
            contenuto: analysis.contenuto || originalText,
          },
          meta
        ).open();
      }
    }).open();
  }

  /**
   * Per ogni AntinomiaGraphView aperta, forza il rebuild con il nuovo stile
   * (preset o custom). Chiamato dai setting cambio stile/colori cosi' il
   * grafo si aggiorna in tempo reale senza dover chiudere/riaprire il tab.
   */
  refreshOpenGraphViews(): void {
    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_GRAPH);
    for (const leaf of leaves) {
      const view = leaf.view as any;
      if (view && typeof view.applyStyleChange === "function") {
        view.applyStyleChange();
      }
    }
  }

  /**
   * Create a new Antinomia note with the standard `<prefix>-<timestamp>.md`
   * naming, in the standard `notes/` folder OR an optional subfolder (used
   * by the PDF-ingest flow which groups generated substrates by source PDF).
   *
   * When `openAfterCreate` is false (used during bulk creation) we skip
   * opening the file in the workspace to avoid stealing focus N times in
   * a row.
   */
  async createNote(
    prefix: string,
    content: string,
    folderOverride?: string,
    openAfterCreate: boolean = true
  ): Promise<TFile | null> {
    try {
      const folder = folderOverride ?? FOLDER.notes;
      await ensureFolder(this.app, folder);
      // timestampId() has 1-second resolution. When creating multiple notes
      // in the same second (bulk PDF ingest, batch imports, etc.) we would
      // collide. Append `-001`, `-002`, ... suffixes until we find a free
      // path. Cap at 9999 to avoid an infinite loop on a clock anomaly.
      const baseId = `${prefix}-${timestampId()}`;
      let id = baseId;
      let path = `${folder}/${id}.md`;
      let suffix = 1;
      while (this.app.vault.getAbstractFileByPath(path)) {
        id = `${baseId}-${String(suffix).padStart(3, "0")}`;
        path = `${folder}/${id}.md`;
        suffix++;
        if (suffix > 9999) {
          throw new Error(
            `Too many collisions for timestamp ID ${baseId} in ${folder}/`
          );
        }
      }
      const file = await this.app.vault.create(path, content);
      if (openAfterCreate) {
        await this.app.workspace.getLeaf(false).openFile(file);
        new Notice(`Created: ${id}`);
      }
      return file;
    } catch (e) {
      new Notice(`Error: ${(e as Error).message}`);
      return null;
    }
  }

  async elevateToPrinciple(
    file: TFile,
    fields?: PrincipleFields
  ): Promise<void> {
    try {
      if (this.settings.elevationMode === "split") {
        await this.elevateSplit(file, fields);
      } else {
        await this.elevateTransform(file, fields);
      }
    } catch (e) {
      new Notice(`Errore elevazione: ${(e as Error).message}`);
    }
  }

  private async elevateTransform(file: TFile, fields?: PrincipleFields): Promise<void> {
    const raw = await this.app.vault.read(file);
    const oldBody = stripFrontmatter(raw).trim();
    const originBasename = file.basename;
    const today = todayISO();
    await this.app.fileManager.processFrontMatter(file, (fm) => {
      fm.antinomia_type = TYPE.principle;
      fm.data = today;
      fm.modified_date = today;
      fm.origin_tension = `[[${originBasename}]]`;
      delete fm.status;
      delete fm.origin;
    });
    const afterFm = await this.app.vault.read(file);
    const fmEnd = afterFm.indexOf("\n---", 3);
    if (fmEnd === -1) {
      new Notice("Errore: frontmatter non leggibile.");
      return;
    }
    const fmBlock = afterFm.slice(0, fmEnd + 4);
    const newBody =
      "\n\n" +
      principleBodyTemplate(fields) +
      "\n## Origin (tension)\n\n" +
      `> Derived from: [[${originBasename}]]\n\n` +
      oldBody +
      "\n";
    await this.app.vault.modify(file, fmBlock + newBody);
    new Notice(`Elevata (transform): ${file.basename}`);
  }

  private async elevateSplit(file: TFile, fields?: PrincipleFields): Promise<void> {
    const oldFm = this.app.metadataCache.getFileCache(file)?.frontmatter ?? {};
    const tensionBasename = file.basename;
    const today = todayISO();
    const tensionTitle = typeof oldFm.title === "string" ? oldFm.title : tensionBasename;
    const existingLinks: string[] = Array.isArray(oldFm.links)
      ? oldFm.links.map((s: any) => String(s))
      : [];
    const collegamentiYaml = existingLinks.length > 0
      ? `links:\n${existingLinks.map((l) => "  - " + JSON.stringify(l)).join("\n")}\n`
      : "links: []\n";
    const principleContent =
      "---\n" +
      `antinomia_type: ${TYPE.principle}\n` +
      `title: ${yamlQuote("Principio da " + tensionTitle)}\n` +
      `data: ${today}\n` +
      `modified_date: ${today}\n` +
      `origin_tension: "[[${tensionBasename}]]"\n` +
      collegamentiYaml +
      "---\n\n" +
      principleBodyTemplate(fields) +
      "\n## Origin (tension)\n\n" +
      `> Derived from: [[${tensionBasename}]]\n\n` +
      "_(testo originale conservato nel defeated linkato)_\n";
    const principleFile = await this.createNote("P", principleContent);
    if (!principleFile) {
      new Notice("Errore: impossibile creare il principio.");
      return;
    }
    const principleBasename = principleFile.basename;
    await this.app.fileManager.processFrontMatter(file, (fm) => {
      fm.antinomia_type = TYPE.defeated;
      fm.motive = "elevated";
      fm.replaced_by = `[[${principleBasename}]]`;
      fm.modified_date = today;
      delete fm.status;
    });
    const afterFm = await this.app.vault.read(file);
    if (!afterFm.includes(`> Replaced by: [[${principleBasename}]]`)) {
      await this.app.vault.modify(file, afterFm + `\n\n> Replaced by: [[${principleBasename}]]\n`);
    }
    new Notice(`Elevata (split): ${tensionBasename} -> defeated, principio ${principleBasename}`);
  }

  /**
   * Migrazione retroattiva: per ogni principio gia' esistente, legge la
   * sezione "## Origin (tension)" dal body, crea un defeated D-... con
   * quel contenuto e linka bidirezionalmente (replaced_by + origin_tension).
   */
  async migrateExistingPrinciples(): Promise<void> {
    const all = this.app.vault.getMarkdownFiles();
    const principles = all.filter((f) => {
      const fm = this.app.metadataCache.getFileCache(f)?.frontmatter;
      return fm?.antinomia_type === TYPE.principle;
    });
    if (principles.length === 0) {
      new Notice("Nessun principio nel vault.");
      return;
    }
    const alreadyLinked = new Set<string>();
    for (const p of principles) {
      const fm = this.app.metadataCache.getFileCache(p)?.frontmatter;
      const ot = fm?.origin_tension;
      if (typeof ot === "string") {
        const m = ot.match(/\[\[([^\]|]+)/);
        if (m) {
          const refBase = m[1].split("/").pop() || m[1];
          const refFile = all.find((f) => f.basename === refBase);
          const refFm = refFile ? this.app.metadataCache.getFileCache(refFile)?.frontmatter : null;
          if (refFm?.antinomia_type === TYPE.defeated) {
            alreadyLinked.add(p.basename);
          }
        }
      }
    }
    let migrated = 0;
    let skipped = 0;
    const today = todayISO();
    for (const p of principles) {
      if (alreadyLinked.has(p.basename)) { skipped++; continue; }
      const raw = await this.app.vault.read(p);
      const originMatch = raw.match(/## Origine \(tensione\)\s*([\s\S]*?)(?=\n## |\n---|$)/);
      const originContent = originMatch ? originMatch[1].trim() : "";
      if (!originContent) { skipped++; continue; }
      const pFm = this.app.metadataCache.getFileCache(p)?.frontmatter ?? {};
      const title = typeof pFm.title === "string"
        ? `Tensione originaria di ${pFm.title}`
        : `Tensione originaria di ${p.basename}`;
      const defeatedContent =
        "---\n" +
        `antinomia_type: ${TYPE.defeated}\n` +
        `title: ${yamlQuote(title)}\n` +
        `motive: elevata\n` +
        `data: ${today}\n` +
        `modified_date: ${today}\n` +
        `replaced_by: "[[${p.basename}]]"\n` +
        "links: []\n" +
        "---\n\n" +
        originContent +
        `\n\n> Replaced by: [[${p.basename}]]\n` +
        `\n_(generato da migrazione retroattiva ${today})_\n`;
      const defeatedFile = await this.createNote("D", defeatedContent);
      if (!defeatedFile) { skipped++; continue; }
      await this.app.fileManager.processFrontMatter(p, (fm) => {
        fm.origin_tension = `[[${defeatedFile.basename}]]`;
        fm.modified_date = today;
      });
      migrated++;
    }
    new Notice(`Migrazione: ${migrated} defeated creati, ${skipped} principi saltati.`);
  }

  /**
   * Crea un defeated vuoto come "origine" di un principio orfano (cioe' un
   * principio senza ## Origin (tension) nel body). L'utente puo' poi
   * compilare a mano il body del defeated con la tensione originale che
   * ricorda. Linka bidirezionalmente al principio.
   */
  async createDefeatedForPrinciple(principleFile: TFile): Promise<void> {
    const fm = this.app.metadataCache.getFileCache(principleFile)?.frontmatter;
    if (fm?.antinomia_type !== TYPE.principle) {
      new Notice("Selezione: la nota non e' un principio.");
      return;
    }
    const today = todayISO();
    const title = typeof fm?.title === "string"
      ? `Tensione originaria di ${fm.title}`
      : `Tensione originaria di ${principleFile.basename}`;
    const defeatedContent =
      "---\n" +
      `antinomia_type: ${TYPE.defeated}\n` +
      `title: ${yamlQuote(title)}\n` +
      `motive: elevata\n` +
      `data: ${today}\n` +
      `modified_date: ${today}\n` +
      `replaced_by: "[[${principleFile.basename}]]"\n` +
      "links: []\n" +
      "---\n\n" +
      "**A (original):** [da compilare]\n\n" +
      "**B (original):** [da compilare]\n\n" +
      "_(Defeated creato manualmente per agganciare un principio orfano al grafo. " +
      "Compila A/B con la tensione che ricordi essere all'origine di questo principio.)_\n\n" +
      `> Replaced by: [[${principleFile.basename}]]\n`;
    const defeatedFile = await this.createNote("D", defeatedContent);
    if (!defeatedFile) {
      new Notice("Errore: impossibile creare il defeated.");
      return;
    }
    await this.app.fileManager.processFrontMatter(principleFile, (frontm) => {
      frontm.origin_tension = `[[${defeatedFile.basename}]]`;
      frontm.modified_date = today;
    });
    new Notice(`Creato defeated ${defeatedFile.basename} per ${principleFile.basename}.`);
  }

  /**
   * Unisce due defeated in uno (caso B condiviso): ridireziona tutti i
   * principi che puntavano a `removeFile` verso `keepFile`, poi cancella
   * `removeFile`.
   */
  async mergeDefeated(keepFile: TFile, removeFile: TFile): Promise<void> {
    if (keepFile.path === removeFile.path) {
      new Notice("Non puoi unire un defeated con se stesso.");
      return;
    }
    const today = todayISO();
    const all = this.app.vault.getMarkdownFiles();
    let updated = 0;
    for (const f of all) {
      const fm = this.app.metadataCache.getFileCache(f)?.frontmatter;
      if (fm?.antinomia_type !== TYPE.principle) continue;
      const ot = fm?.origin_tension;
      if (typeof ot !== "string") continue;
      if (ot.includes(removeFile.basename)) {
        await this.app.fileManager.processFrontMatter(f, (frontm) => {
          frontm.origin_tension = `[[${keepFile.basename}]]`;
          frontm.modified_date = today;
        });
        updated++;
      }
    }
    const rawKeep = await this.app.vault.read(keepFile);
    await this.app.vault.modify(
      keepFile,
      rawKeep + `\n\n_(unito con ${removeFile.basename} il ${today})_\n`
    );
    await this.app.vault.trash(removeFile, false);
    new Notice(`Uniti: ${removeFile.basename} -> ${keepFile.basename} (${updated} principi ridirettori).`);
  }

  async markResolved(file: TFile): Promise<void> {
    try {
      await this.app.fileManager.processFrontMatter(file, (fm) => {
        fm.status = "resolved";
        fm.modified_date = todayISO();
      });
      new Notice(`Risolta: ${file.basename}`);
    } catch (e) {
      new Notice(`Errore: ${(e as Error).message}`);
    }
  }

  async archiveAsDefeated(file: TFile): Promise<void> {
    new DefeatedReasonModal(this.app, file, async (data) => {
      if (!data) {
        new Notice("Archiving cancelled.");
        return;
      }
      const { motivo, replaced_by } = data;
      try {
        await this.app.fileManager.processFrontMatter(file, (fm) => {
          fm.antinomia_type = TYPE.defeated;
          fm.motive = motivo;
          fm.modified_date = todayISO();
          delete fm.status;
          delete fm.origin;
          if (replaced_by) {
            fm.replaced_by = `[[${replaced_by}]]`;
          }
        });
        // If a substitute principle is set, add a body line so the link
        // is indexed by Obsidian's graph + backlinks immediately.
        if (replaced_by) {
          const raw = await this.app.vault.read(file);
          const marker = `> Replaced by: [[${replaced_by}]]`;
          if (!raw.includes(marker)) {
            const trimmed = raw.endsWith("\n") ? raw : raw + "\n";
            await this.app.vault.modify(file, trimmed + "\n" + marker + "\n");
          }
        }
        const subMsg = replaced_by ? `, sostituita da ${replaced_by}` : "";
        new Notice(
          `Archived as defeated (${motivo}${subMsg}): ${file.basename}`
        );
      } catch (e) {
        new Notice(`Errore: ${(e as Error).message}`);
      }
    }).open();
  }

  /**
   * Set antinomia_type on a note. For tensions/substrates we also add basic
   * default fields to avoid downstream surprises (status: aperta, data, ...).
   */
  async markAsType(file: TFile, tipo: string): Promise<void> {
    try {
      const today = todayISO();
      await this.app.fileManager.processFrontMatter(file, (fm) => {
        fm.antinomia_type = tipo;
        fm.modified_date = today;
        if (tipo === TYPE.tension && !fm.status) fm.status = "open";
        if (!fm.base_language) fm.base_language = "italiano";
        if (tipo === TYPE.tension && !fm.creation_date)
          fm.creation_date = today;
        if (
          (tipo === TYPE.substrate ||
            tipo === TYPE.principle ||
            tipo === TYPE.meta) &&
          !fm.data
        )
          fm.data = today;
      });
      new Notice(`Marcata come ${tipo}: ${file.basename}`);
    } catch (e) {
      console.error("[Antinomia] markAsType failed", e);
      new Notice(`Errore: ${(e as Error).message}`);
    }
  }

  /**
   * Mark a note as "ignored by Antinomia" (won't appear in unclassified list).
   */
  async ignoreNote(file: TFile): Promise<void> {
    try {
      await this.app.fileManager.processFrontMatter(file, (fm) => {
        fm.antinomia_ignora = true;
      });
      new Notice(`Ignorata: ${file.basename}`);
    } catch (e) {
      new Notice(`Errore: ${(e as Error).message}`);
    }
  }

  /**
   * Public wrapper to call classifyActiveNote from views.
   */
  classifyActiveNoteExternal(file: TFile): Promise<void> {
    return this.classifyActiveNote(file);
  }

  private async classifyActiveNote(file: TFile): Promise<void> {
    const profile = this.profileFor("default");
    if (!profile.apiKey) {
      new Notice("API key missing in the active profile. Settings -> Antinomia.");
      return;
    }
    const raw = await this.app.vault.read(file);
    const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
    const currentTipo = fm?.antinomia_type ?? "";
    new Notice("Antinomia: classificazione in corso...");
    let result: { text: string; usage?: ClaudeResponse["usage"] };
    try {
      result = await callAI({
        baseUrl: profile.baseUrl,
        apiKey: profile.apiKey,
        model: profile.model,
        system: CLASSIFY_SYSTEM,
        messages: [
          {
            role: "user",
            content:
              "Nome file: " +
              file.basename +
              "\n\n=== CONTENUTO NOTA ===\n\n" +
              raw,
          },
        ],
        maxTokens: 400,
      });
    } catch (e) {
      new Notice(`Errore AI: ${(e as Error).message}`);
      return;
    }
    const parsed = extractJson<ClassifyResult>(result.text);
    if (!parsed?.tipo || !parsed?.motivazione) {
      console.error("[Antinomia] unparseable:", result.text);
      new Notice("Risposta AI non parseable. Vedi console.");
      return;
    }
    const validTypes = Object.values(TYPE) as string[];
    if (!validTypes.includes(parsed.tipo)) {
      new Notice(`Tipo non valido: ${parsed.tipo}.`);
      return;
    }
    new ClassifyConfirmModal(
      this.app,
      currentTipo,
      parsed.tipo,
      parsed.motivazione,
      async (apply) => {
        if (!apply) {
          new Notice("Classificazione rifiutata.");
          return;
        }
        try {
          await this.app.fileManager.processFrontMatter(file, (frontm) => {
            frontm.antinomia_type = parsed.tipo;
            frontm.modified_date = todayISO();
          });
          new Notice(`Applicato: antinomia_type = ${parsed.tipo}`);
        } catch (e) {
          new Notice(`Errore: ${(e as Error).message}`);
        }
      }
    ).open();
  }

  async setTitleOnActiveNote(file: TFile): Promise<void> {
    const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
    const current = (fm?.title as string | undefined) ?? "";
    new TitleEditModal(
      this.app,
      current,
      `Title for ${file.basename}`,
      "3-7 words capturing the THEME. Leave empty to remove.",
      async (value) => {
        if (value === null) return;
        try {
          await this.app.fileManager.processFrontMatter(file, (frontm) => {
            if (value === "") delete frontm.title;
            else frontm.title = value;
            frontm.modified_date = todayISO();
          });
          new Notice(value ? `Title: ${value}` : "Title removed");
        } catch (e) {
          new Notice(`Error: ${(e as Error).message}`);
        }
      },
      // AI suggestion: read the note body and ask the AI to propose a title
      async () => {
        try {
          const body = await this.app.vault.read(file);
          return await this.proposeTitleFromContent(body);
        } catch {
          return null;
        }
      }
    ).open();
  }

  async proposeTitleAI(file: TFile): Promise<void> {
    const profile = this.profileFor("default");
    if (!profile.apiKey) {
      showErrorModal(
        this.app,
        "API key missing",
        "The active AI profile has no API key. Open Settings → Antinomia and add one (or switch profile)."
      );
      return;
    }
    const raw = await this.app.vault.read(file);
    new Notice("Antinomia: proposing title (AI)...");
    const t0 = Date.now();
    let result: { text: string; usage?: ClaudeResponse["usage"] };
    try {
      result = await callAI({
        baseUrl: profile.baseUrl,
        apiKey: profile.apiKey,
        model: profile.model,
        system: TITLE_SYSTEM,
        messages: [
          {
            role: "user",
            content:
              "Filename: " +
              file.basename +
              "\n\n=== NOTE CONTENT ===\n\n" +
              raw,
          },
        ],
        taskClass: "short",
      });
      notifyAIUsage("Title", result.usage, Date.now() - t0, {
        app: this.app,
        profile: profile.name,
        model: profile.model,
        url: profile.baseUrl,
      });
    } catch (e) {
      showErrorModal(
        this.app,
        "AI title error",
        `Couldn't get a title from the AI. ${(e as Error).message.includes("not reachable") ? "Your local AI backend doesn't seem to be running." : "Check that the backend is reachable and the API key is valid."}`,
        `Profile: ${profile.name} (${profile.model})\nURL: ${profile.baseUrl}\n\n${(e as Error).message}`
      );
      return;
    }
    const proposed = parseTitleFromAIResponse(result.text);
    if (!proposed) {
      const responseLen = result.text?.length ?? 0;
      console.error(
        "[Antinomia] proposeTitleAI unparseable. Length=" + responseLen,
        result.text
      );
      const message =
        responseLen === 0
          ? "The AI returned an empty response. This usually happens with reasoning models (Qwen3, DeepSeek-R1, o-series) that consume all tokens on internal <think> blocks before producing output. The plugin already tries to disable extended reasoning, but some distilled models force it. Try a non-reasoning model (Llama 3.x, Mistral, Phi) for short tasks like titles."
          : "The AI replied but the response didn't contain a usable title (no valid JSON, no recognizable title pattern). Try a different model.";
      showErrorModal(
        this.app,
        "AI title not parseable",
        message,
        `Profile: ${profile.name} (${profile.model})\nResponse length: ${responseLen}\n\n--- RAW RESPONSE ---\n${result.text?.slice(0, 2000) ?? "(empty)"}`
      );
      return;
    }
    new TitleEditModal(
      this.app,
      proposed,
      `Proposed title for ${file.basename}`,
      "AI suggestion. Edit freely before saving.",
      async (value) => {
        if (value === null || value === "") return;
        try {
          await this.app.fileManager.processFrontMatter(file, (frontm) => {
            frontm.title = value;
            frontm.modified_date = todayISO();
          });
          new Notice(`Title: ${value}`);
        } catch (e) {
          new Notice(`Error: ${(e as Error).message}`);
        }
      }
    ).open();
  }

  /**
   * AI helper: propone un titolo dato un contenuto arbitrario (non legato a file).
   * Usato dai modal di creazione per pre-popolare il campo titolo.
   */
  async proposeTitleFromContent(
    content: string,
    signal?: AbortSignal,
    attachUsageTo?: HTMLButtonElement
  ): Promise<string | null> {
    const profile = this.profileFor("default");
    if (!profile.apiKey) {
      showErrorModal(
        this.app,
        "API key missing",
        "The active AI profile has no API key. Open Settings → Antinomia and add one (or switch profile)."
      );
      return null;
    }
    const t0 = Date.now();
    try {
      const result = await callAI({
        baseUrl: profile.baseUrl,
        apiKey: profile.apiKey,
        model: profile.model,
        system: TITLE_SYSTEM,
        messages: [{ role: "user", content }],
        // Autoadaptive: titles = short task. Per model family:
        //  - Anthropic/Llama/Mistral/Phi  → ~200 max_tokens, no reasoning controls
        //  - OpenAI o-series              → 4000, reasoning_effort=low
        //  - Qwen3 reasoning / DeepSeek-R1 → 4000, reasoning_effort=off + enable_thinking=false
        //  - Qwen instruct                → ~300
        taskClass: "short",
        signal,
      });
      notifyAIUsage(
        "Title",
        result.usage,
        Date.now() - t0,
        {
          app: this.app,
          profile: profile.name,
          model: profile.model,
          url: profile.baseUrl,
        },
        attachUsageTo
      );
      // If the user clicked Stop *after* the backend already started
      // streaming a response, callAI may still resolve successfully with a
      // partial / empty body. Don't show an "unparseable" error modal in
      // that case — the user knows they aborted.
      if (signal?.aborted) return null;
      const title = parseTitleFromAIResponse(result.text);
      if (title) return title;
      const responseLen = result.text?.length ?? 0;
      console.error(
        "[Antinomia] proposeTitleFromContent unparseable. Length=" + responseLen,
        result.text
      );
      const message =
        responseLen === 0
          ? "The AI returned an empty response. This usually happens with reasoning models (Qwen3, DeepSeek-R1, o-series) that consume all tokens on internal <think> blocks before producing output. The plugin already tries to disable extended reasoning, but some distilled models force it. Try a non-reasoning model (Llama 3.x, Mistral, Phi) for short tasks like titles."
          : "The AI replied but the response didn't contain a usable title (no valid JSON, no recognizable title pattern). Try a different model.";
      showErrorModal(
        this.app,
        "AI title not parseable",
        message,
        `Profile: ${profile.name} (${profile.model})\nResponse length: ${responseLen}\n\n--- RAW RESPONSE ---\n${result.text?.slice(0, 2000) ?? "(empty)"}`
      );
      return null;
    } catch (e) {
      const msg = (e as Error).message;
      // Silent abort: user clicked Stop. No error modal.
      if (msg === "hunter_aborted" || msg === "ai_aborted" || signal?.aborted) {
        return null;
      }
      showErrorModal(
        this.app,
        "AI title error",
        `Couldn't get a title from the AI. ${msg.includes("not reachable") ? "Your local AI backend doesn't seem to be running." : "Check that the backend is reachable and the API key is valid."}`,
        `Profile: ${profile.name} (${profile.model})\nURL: ${profile.baseUrl}\n\n${msg}`
      );
      return null;
    }
  }

  /**
   * AI helper: propone IF/THEN/GREY zone dato il contenuto di una tensione.
   * Usato dal modal Eleva con bottone "Proponi IF/THEN (AI)".
   */
  async proposeIfThenFromContent(
    content: string,
    signal?: AbortSignal,
    attachUsageTo?: HTMLButtonElement
  ): Promise<PrincipleFields | null> {
    const profile = this.profileFor("default");
    if (!profile.apiKey) {
      showErrorModal(
        this.app,
        "API key missing",
        "The active AI profile has no API key. Open Settings → Antinomia and add one (or switch profile)."
      );
      return null;
    }
    const t0 = Date.now();
    try {
      const result = await callAI({
        baseUrl: profile.baseUrl,
        apiKey: profile.apiKey,
        model: profile.model,
        system: PRINCIPLE_SYSTEM,
        messages: [{ role: "user", content }],
        taskClass: "medium",
        signal,
      });
      notifyAIUsage(
        "IF/THEN",
        result.usage,
        Date.now() - t0,
        {
          app: this.app,
          profile: profile.name,
          model: profile.model,
          url: profile.baseUrl,
        },
        attachUsageTo
      );
      // Silent abort if user clicked Stop after backend started streaming.
      if (signal?.aborted) return null;
      const parsed = extractJson<PrincipleFields>(result.text);
      if (!parsed) {
        console.error("[Antinomia] proposeIfThenFromContent unparseable:", result.text);
        showErrorModal(
          this.app,
          "AI principle proposal not parseable",
          "The AI replied but the response wasn't valid JSON with IF/THEN/GREY fields. Try again or switch model.",
          `Profile: ${profile.name} (${profile.model})\n\n--- RAW RESPONSE ---\n${result.text?.slice(0, 2000) ?? "(empty)"}`
        );
        return null;
      }
      return parsed;
    } catch (e) {
      const msg = (e as Error).message;
      if (msg === "hunter_aborted" || msg === "ai_aborted" || signal?.aborted) {
        return null;
      }
      showErrorModal(
        this.app,
        "AI principle error",
        `Couldn't get a principle proposal from the AI. ${msg.includes("not reachable") ? "Your local AI backend doesn't seem to be running." : "Check that the backend is reachable and the API key is valid."}`,
        `Profile: ${profile.name} (${profile.model})\nURL: ${profile.baseUrl}\n\n${msg}`
      );
      return null;
    }
  }

  /**
   * AI helper: propone Presuppositions A/B per una tensione.
   */
  async proposePresuppostiFromContent(
    content: string,
    signal?: AbortSignal
  ): Promise<PresuppostiFields | null> {
    const profile = this.profileFor("default");
    console.log("[Antinomia] presupposti START profile:", profile.name, profile.format, profile.model);
    if (!profile.apiKey) {
      showErrorModal(
        this.app,
        "API key missing",
        "The active AI profile has no API key. Open Settings → Antinomia and add one (or switch profile)."
      );
      return null;
    }
    const t0 = Date.now();
    try {
      const result = await callAI({
        baseUrl: profile.baseUrl,
        apiKey: profile.apiKey,
        model: profile.model,
        format: profile.format,
        system: PRESUPPOSTI_SYSTEM,
        messages: [{ role: "user", content }],
        taskClass: "medium",
        signal,
      });
      notifyAIUsage("Presuppositions", result.usage, Date.now() - t0, {
        app: this.app,
        profile: profile.name,
        model: profile.model,
        url: profile.baseUrl,
      });
      console.log("[Antinomia] presupposti response len:", result.text.length);
      console.log("[Antinomia] presupposti response full:", result.text);
      const parsed = extractJson<PresuppostiFields>(result.text);
      console.log("[Antinomia] presupposti parsed:", parsed);
      if (!parsed) {
        console.error("[Antinomia] presupposti UNPARSEABLE:", result.text);
        showErrorModal(
          this.app,
          "AI presuppositions not parseable",
          "The AI replied but the response wasn't valid JSON with presuppositions A/B. Try again or switch model.",
          `Profile: ${profile.name} (${profile.model})\n\n--- RAW RESPONSE ---\n${result.text?.slice(0, 2000) ?? "(empty)"}`
        );
        return null;
      }
      if (typeof parsed.presupposizioniA !== "string" && typeof parsed.presupposizioniB !== "string") {
        console.error("[Antinomia] presupposti wrong keys:", parsed);
        showErrorModal(
          this.app,
          "AI presuppositions: wrong keys",
          "The AI returned valid JSON but with the wrong field names. Expected `presupposizioniA` and `presupposizioniB`.",
          `Got keys: ${Object.keys(parsed).join(", ")}\n\nParsed:\n${JSON.stringify(parsed, null, 2)}`
        );
        return null;
      }
      return parsed;
    } catch (e) {
      if ((e as Error).message === "hunter_aborted" || signal?.aborted) {
        throw new Error("ai_aborted");
      }
      console.error("[Antinomia] presupposti CATCH:", e);
      showErrorModal(
        this.app,
        "AI presuppositions error",
        `Couldn't get presuppositions from the AI. ${(e as Error).message.includes("not reachable") ? "Your local AI backend doesn't seem to be running." : "Check that the backend is reachable and the API key is valid."}`,
        `Profile: ${profile.name} (${profile.model})\nURL: ${profile.baseUrl}\n\n${(e as Error).message}`
      );
      return null;
    }
  }

  /**
   * AI helper: classifica testo grezzo in tensione vs substrate ed estrae i campi.
   * Usato dal FreeInputModal.
   */
  async analyzeFreeInput(
    text: string,
    signal?: AbortSignal,
    attachUsageTo?: HTMLButtonElement
  ): Promise<{ analysis: FreeInputAnalysis; meta: AIUsageMeta } | null> {
    const profile = this.profileFor("default");
    if (!profile.apiKey) {
      showErrorModal(
        this.app,
        "API key missing",
        "The active AI profile has no API key. Open Settings → Antinomia and add one (or switch profile)."
      );
      return null;
    }
    const t0 = Date.now();
    try {
      const result = await callAI({
        baseUrl: profile.baseUrl,
        apiKey: profile.apiKey,
        model: profile.model,
        system: FREE_INPUT_SYSTEM,
        messages: [{ role: "user", content: text }],
        taskClass: "short",
        signal,
      });
      notifyAIUsage(
        "Free input",
        result.usage,
        Date.now() - t0,
        {
          app: this.app,
          profile: profile.name,
          model: profile.model,
          url: profile.baseUrl,
        },
        attachUsageTo
      );
      // Silent abort if user clicked Stop after backend started streaming.
      if (signal?.aborted) return null;
      const parsed = extractJson<FreeInputAnalysis>(result.text);
      if (!parsed || (parsed.tipo !== "tension" && parsed.tipo !== "substrate")) {
        console.error("[Antinomia] analyzeFreeInput unparseable:", result.text);
        showErrorModal(
          this.app,
          "AI analysis not parseable",
          "The AI replied but the response wasn't valid JSON with a tension/substrate classification. Try again or rephrase the input.",
          `Profile: ${profile.name} (${profile.model})\n\n--- RAW RESPONSE ---\n${result.text?.slice(0, 2000) ?? "(empty)"}`
        );
        return null;
      }
      const meta: AIUsageMeta = {
        usage: result.usage,
        durationMs: Date.now() - t0,
        profile: profile.name,
        model: profile.model,
        url: profile.baseUrl,
        operation: "Free input",
      };
      return { analysis: parsed, meta };
    } catch (e) {
      const msg = (e as Error).message;
      // Silent abort: user clicked Stop. No error modal.
      if (msg === "hunter_aborted" || msg === "ai_aborted" || signal?.aborted) {
        return null;
      }
      showErrorModal(
        this.app,
        "AI analysis error",
        `Couldn't analyze the input. ${msg.includes("not reachable") ? "Your local AI backend doesn't seem to be running." : "Check that the backend is reachable and the API key is valid."}`,
        `Profile: ${profile.name} (${profile.model})\nURL: ${profile.baseUrl}\n\n${msg}`
      );
      return null;
    }
  }

  /**
   * Applica i Presuppositions A/B al body di una tensione. Sostituisce le righe
   * "**Presuppositions A:** ..." e "**Presuppositions B:** ..." se presenti,
   * altrimenti le appende in fondo.
   */
  async applyPresupposti(file: TFile, fields: PresuppostiFields): Promise<void> {
    try {
      const raw = await this.app.vault.read(file);
      const fmEnd = raw.indexOf("\n---", 3);
      if (fmEnd === -1) {
        new Notice("Errore: frontmatter non leggibile.");
        return;
      }
      const fmBlock = raw.slice(0, fmEnd + 4);
      let body = raw.slice(fmEnd + 4);

      const a = (fields.presupposizioniA || "").trim();
      const b = (fields.presupposizioniB || "").trim();

      const reA = /\*\*Presuppositions A:\*\*[^\n]*/;
      const reB = /\*\*Presuppositions B:\*\*[^\n]*/;

      if (a) {
        if (reA.test(body)) body = body.replace(reA, `**Presuppositions A:** ${a}`);
        else body += `\n\n**Presuppositions A:** ${a}`;
      }
      if (b) {
        if (reB.test(body)) body = body.replace(reB, `**Presuppositions B:** ${b}`);
        else body += `\n**Presuppositions B:** ${b}`;
      }

      await this.app.fileManager.processFrontMatter(file, (fm) => {
        if (a) fm.presupposizioniA = a;
        if (b) fm.presupposizioniB = b;
        fm.modified_date = todayISO();
      });
      // Riscrive il body (preserva frontmatter aggiornato)
      const afterFm = await this.app.vault.read(file);
      const fmEnd2 = afterFm.indexOf("\n---", 3);
      const fmBlock2 = afterFm.slice(0, fmEnd2 + 4);
      await this.app.vault.modify(file, fmBlock2 + body);
      new Notice("Presupposti aggiornati.");
    } catch (e) {
      new Notice(`Errore presupposti: ${(e as Error).message}`);
    }
  }

  /**
   * Collega due note via wikilink bidirezionale in `links: [...]` di
   * entrambi i frontmatter, e aggiunge "> See also: [[target]]" nel body
   * della nota attiva. Idempotente — non duplica link esistenti.
   */
  async linkActiveTo(active: TFile, target: TFile): Promise<void> {
    if (active.path === target.path) {
      new Notice("Non puoi collegare una nota a se stessa.");
      return;
    }
    try {
      const targetLink = `[[${target.basename}]]`;
      const activeLink = `[[${active.basename}]]`;

      await this.app.fileManager.processFrontMatter(active, (fm) => {
        const arr: string[] = Array.isArray(fm.links) ? fm.links : [];
        if (!arr.some((s) => s === targetLink || s === `"${targetLink}"`)) {
          arr.push(targetLink);
        }
        fm.links = arr;
        fm.modified_date = todayISO();
      });
      await this.app.fileManager.processFrontMatter(target, (fm) => {
        const arr: string[] = Array.isArray(fm.links) ? fm.links : [];
        if (!arr.some((s) => s === activeLink || s === `"${activeLink}"`)) {
          arr.push(activeLink);
        }
        fm.links = arr;
        fm.modified_date = todayISO();
      });

      // Aggiungi "> See also: [[target]]" nel body dell'attiva se mancante
      const rawA = await this.app.vault.read(active);
      const fmEnd = rawA.indexOf("\n---", 3);
      if (fmEnd !== -1) {
        const fmBlock = rawA.slice(0, fmEnd + 4);
        const body = rawA.slice(fmEnd + 4);
        const line = `> See also: ${targetLink}`;
        if (!body.includes(line)) {
          await this.app.vault.modify(active, fmBlock + body + `\n\n${line}`);
        }
      }
      new Notice(`Collegate ${active.basename} <-> ${target.basename}`);
    } catch (e) {
      new Notice(`Errore collegamento: ${(e as Error).message}`);
    }
  }

  /**
   * Public alias per attivare una view dall'esterno (es. ribbon, modal).
   */
  async activateViewExternal(viewType: string): Promise<void> {
    return this.activateView(viewType);
  }

  /**
   * Apre o rivela una view del plugin in un leaf. leafType controlla
   * dove appare: "right" sidebar (default), "left" sidebar, "tab" main area.
   *
   * Se esiste gia' una leaf per quel viewType:
   *  - per "tab": deve essere nel main area, altrimenti ne crea una nuova
   *    nel main area (la leaf esistente in sidebar viene lasciata stare)
   *  - per "right"/"left": rivela qualsiasi leaf esistente
   */
  async activateView(
    viewType: string,
    leafType: "tab" | "right" | "left" = "right"
  ): Promise<void> {
    if (
      viewType === VIEW_TYPE_SUBSTRATE_LIST ||
      viewType === VIEW_TYPE_PRINCIPLES_LIST ||
      viewType === VIEW_TYPE_DEFEATED_LIST
    ) {
      if (!this.settings.hasOpenedListSidebar) {
        this.settings.hasOpenedListSidebar = true;
        void this.saveSettings();
      }
    }
    const { workspace } = this.app;
    const existing = workspace.getLeavesOfType(viewType);
    const rootSplit = (workspace as any).rootSplit;

    if (leafType === "tab") {
      // Cerca una leaf esistente che sia gia' nel main editor area
      const inMain = existing.find((l) => {
        try {
          return (l as any).getRoot?.() === rootSplit;
        } catch {
          return false;
        }
      });
      if (inMain) {
        workspace.revealLeaf(inMain);
        return;
      }
      // Crea nuova leaf nel main area (anche se esiste un'altra in sidebar)
      const leaf = workspace.getLeaf("tab");
      if (!leaf) {
        new Notice("Unable to open the panel.");
        return;
      }
      await leaf.setViewState({ type: viewType, active: true });
      workspace.revealLeaf(leaf);
      return;
    }

    // Sidebar (right/left): rivela qualsiasi leaf esistente o creane una
    let leaf: WorkspaceLeaf | null = existing[0] ?? null;
    if (!leaf) {
      leaf =
        leafType === "left"
          ? workspace.getLeftLeaf(false)
          : workspace.getRightLeaf(false);
      if (!leaf) {
        new Notice("Unable to open the panel.");
        return;
      }
      await leaf.setViewState({ type: viewType, active: true });
    }
    workspace.revealLeaf(leaf);
  }
}
