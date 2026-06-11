import cytoscape from "cytoscape";
// @ts-ignore — cytoscape-fcose has no types
import fcose from "cytoscape-fcose";
cytoscape.use(fcose as any);

import { App, Notice, Plugin, PluginSettingTab, Setting, TFile, WorkspaceLeaf, normalizePath } from "obsidian";

import type { Profile, GraphColors, BackendPreset, TutorialStep, PdfExtractResult, ClassifyResult, TitleProposal, PresuppostiFields, PdfConcept, PdfConceptsResult, AIUsageMeta, FreeInputAnalysis, HunterConfidence, HunterContradiction, HunterResult, HunterRunMetadata, HunterRun, DefeatedSubmit, TensionFields, SubstrateFields, PrincipleFields, GraphFilters, ClaudeResponse } from "./core/types";

import { FOLDER, TYPE, VIEW_TYPE_OPEN_TENSIONS, VIEW_TYPE_HUNTER_RESULTS, VIEW_TYPE_DISMISSED_PAIRS, VIEW_TYPE_SUBSTRATE_LIST, VIEW_TYPE_PRINCIPLES_LIST, VIEW_TYPE_DEFEATED_LIST, VIEW_TYPE_ONBOARDING, VIEW_TYPE_DASHBOARD, VIEW_TYPE_AUDIT, VIEW_TYPE_GRAPH, VIEW_TYPE_UNCLASSIFIED, VIEW_TYPE_PRESUPPOSITIONS_MAP, GRAPH_STYLE_PRESETS, BACKEND_PRESETS } from "./core/constants";

import { todayISO, timestampId, ensureFolder, isLocalBaseUrl } from "./core/utils";

import { yamlQuote } from "./core/frontmatter";

import { hoverBus, throttle, type HoverPayload } from "./core/hoverBus";

import type { FrictionLevel, FrictionPayload } from "./core/aiFriction";

import { tensionTemplate, substrateTemplate } from "./core/templates";

import { DEFAULT_SETTINGS, type AntinomiaSettings } from "./core/settings";

import { CLASSIFY_SYSTEM } from "./ai/prompts";

import { extractJson } from "./ai/parseResponse";

import { callAI } from "./ai/callAI";

import { notifyAIUsage, renderUsageMetaBanner, ErrorAckModal, showErrorModal } from "./ai/notifyUsage";



import { ProfileEditModal } from "./modals/ProfileEditModal";

import { WelcomeModal } from "./modals/WelcomeModal";
import { CloudWarningModal } from "./modals/CloudWarningModal";
import { MigrationModal } from "./modals/MigrationModal";
import {
  scanVaultForLegacyNotes,
  restoreFromLatestBackup,
} from "./flows/migration";
import {
  mapPresuppositionsOfPrinciple,
  showCollapseImpact,
  removePresuppositionFromPrinciples,
} from "./flows/presuppositionMap";

import { ConfirmModal } from "./modals/ConfirmModal";

import { GuidanceModal } from "./modals/GuidanceModal";

import { TutorialModal, WHY_FRICTION_STEP } from "./modals/TutorialModal";

import { ClassifyConfirmModal } from "./modals/ClassifyConfirmModal";

import { TitleEditModal } from "./modals/TitleEditModal";

import { DefeatedReasonModal } from "./modals/DefeatedReasonModal";



import { NewTensionModal } from "./modals/NewTensionModal";

import { NewSubstrateModal } from "./modals/NewSubstrateModal";





import { NotePickerModal } from "./modals/NotePickerModal";




import { OpenTensionsView } from "./views/OpenTensionsView";

import { HunterResultsView } from "./views/HunterResultsView";

import { DismissedPairsView } from "./views/DismissedPairsView";

import { SubstrateListView } from "./views/SubstrateListView";

import { PrinciplesListView } from "./views/PrinciplesListView";

import { DefeatedListView } from "./views/DefeatedListView";

import { OnboardingChecklistView } from "./views/OnboardingChecklistView";

import { DashboardView } from "./views/DashboardView";

import { AuditVaultView } from "./views/AuditVaultView";

import { UnclassifiedNotesView } from "./views/UnclassifiedNotesView";
import { PresuppositionsMapView } from "./views/PresuppositionsMapView";

import { AntinomiaGraphView } from "./views/AntinomiaGraphView";

import { createExampleNotes, deleteExampleNotes } from "./flows/exampleVault";

import { proposeTitleAI, proposeTitleFromContent } from "./flows/titleProposal";

import { openFreeInputFromClipboard, openFreeInputModal, analyzeFreeInput } from "./flows/freeInput";

import { openMapPresupposti, proposePresuppostiFromContent, applyPresupposti } from "./flows/presupposti";

import { runHunter, undismissContradiction } from "./flows/hunter";

import { openElevateModal, elevateToPrinciple, elevateTransform, elevateSplit, proposeIfThenFromContent } from "./flows/elevation";

import { openSubstrateFromYouTube, runYouTubeConceptIngest } from "./flows/youtubeFetch";

import { extractConceptsFromPdfText, bulkCreateSubstratesFromConcepts, createOrUpdatePdfHubNote, importPdfFromDisk, openSubstrateFromPDF, runPdfIngest } from "./flows/pdfIngest";

// Antinomia V1 — Step 5e: guided creation modals + human titles + Hunter v2.1
//
// Design invariants (do not violate without explicit user reconfirmation):
//   - Layer of a note = `antinomia_type` frontmatter ONLY. Files never move.
//   - Hunter IDENTIFIES contradictions, does NOT propose resolutions.
//   - AI calls only on explicit user action (no background AI).
//   - Backend pluggable (Anthropic cloud / LM Studio / custom).
//   - Modals for new tension/substrate are opt-out: "Salta e apri nota vuota"
//     button lets the savvy user bypass and write directly in markdown.

/**
 * Modal to edit an AI profile (name, baseUrl, apiKey, model). Has a Backend
 * preset dropdown at the top that quickly populates the standard endpoints.
 */

/**
 * Welcome modal shown on first launch (when onboardingCompleted is false).
 * Explains Antinomia, the 5 layers, the basic workflow, and offers an
 * entry point: "Crea la mia prima tensione guidata" pre-fills NewTensionModal
 * with a worked example.
 */
/**
 * Reusable yes/no confirmation modal.
 */
/**
 * Context-aware "what should I do next?" modal. Inspects vault + settings
 * flags to suggest the most useful next step, with a "Vai" button.
 */
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
      .setName("Check for legacy v1.1 notes at startup")
      .setDesc(
        "If your vault has notes from Antinomia v1.1 (Italian schema), show a one-time clickable Notice offering to migrate them to v1.4. Turn off to silence the check."
      )
      .addToggle((t) =>
        t
          .setValue(this.plugin.settings.migrationCheckEnabled !== false)
          .onChange(async (v) => {
            this.plugin.settings.migrationCheckEnabled = v;
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

    new Setting(containerEl)
      .setName("Galaxy background")
      .setDesc(
        "Static violet/blue/pink nebulae behind the graph (CSS-only, no animation). Turn off for a flat background."
      )
      .addToggle((tg) => {
        tg.setValue(this.plugin.settings.galaxyBackground !== false);
        tg.onChange(async (v) => {
          this.plugin.settings.galaxyBackground = v;
          await this.plugin.saveSettings();
          // Live toggle: no rebuild, just add/remove the class on open views.
          for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_GRAPH)) {
            const view = leaf.view as unknown as { applyGalaxyClass?: () => void };
            view?.applyGalaxyClass?.();
          }
        });
      });

    // ---- AI Friction & Model Transparency (PTM Core) ----
    containerEl.createEl("h3", { text: "AI Friction" });
    const frictionDesc = containerEl.createEl("p");
    frictionDesc.style.fontSize = "0.85em";
    frictionDesc.style.opacity = "0.8";
    frictionDesc.style.lineHeight = "1.5";
    frictionDesc.setText(
      "PTM means staying in a contradiction to think, not resolving it fast. Every AI output carries a friction card (model transparency + limitations) to keep you the thinker. Off = no card. Low = model line only. Medium = collapsible card (default). High = card always open + you must acknowledge limitations before accepting an AI result."
    );
    new Setting(containerEl)
      .setName("AI friction level")
      .setDesc("How much friction every AI output carries.")
      .addDropdown((dd) => {
        dd.addOption("off", "Off — no card (pre-friction)");
        dd.addOption("low", "Low — model line only");
        dd.addOption("medium", "Medium — collapsible card (default)");
        dd.addOption("high", "High — always open + acknowledge to accept");
        dd.setValue(this.plugin.settings.aiFrictionLevel ?? "medium");
        dd.onChange(async (v) => {
          this.plugin.settings.aiFrictionLevel = v as FrictionLevel;
          await this.plugin.saveSettings();
        });
      });
    const whyLink = containerEl.createEl("a", {
      text: "Why PTM friction? Read more →",
      href: "#",
    });
    whyLink.style.fontSize = "0.85em";
    whyLink.style.display = "inline-block";
    whyLink.style.marginBottom = "10px";
    whyLink.onclick = (e) => {
      e.preventDefault();
      new TutorialModal(this.app, WHY_FRICTION_STEP).open();
    };

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
    li1.createEl("strong", { text: "Paid cloud APIs" });
    li1.appendText(
      " (Anthropic Claude, OpenAI GPT, Groq, OpenRouter): top quality, per-token cost. Account + API key required."
    );
    const li2 = ul.createEl("li");
    li2.createEl("strong", { text: "Free local models" });
    li2.appendText(
      " (LM Studio, Ollama): full privacy, zero cost, variable quality. Requires ~10GB of RAM/VRAM and an initial model download."
    );
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
          const prev = this.plugin.settings.activeProfileId;
          this.plugin.settings.activeProfileId = value;
          await this.plugin.saveSettings();
          // Warn when switching TO a cloud profile; revert on cancel.
          this.plugin.maybeWarnCloudProfile(async () => {
            this.plugin.settings.activeProfileId = prev;
            await this.plugin.saveSettings();
            dd.setValue(prev);
          });
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






// ---------- modals ----------

// ---------- templates ----------

/**
 * Modal to compose a new principle (IF/THEN/GREY). Same visual style as
 * NewTensionModal: intro + labeled fields with hints + 3 buttons.
 * Two exit paths:
 *   - "Eleva" -> pass the filled fields to elevateToPrinciple
 *   - "Salta e usa template vuoto" -> elevate with empty placeholders (legacy)
 */
// ---------- guided creation modals ----------

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
/**
 * Preview & selection modal for PDF concept extraction. Shows each
 * concept proposed by the AI with a checkbox (default selected), expandable
 * content, and lets the user pick which to materialize as substrates.
 *
 * Banner at the top shows tokens spent + duration of the extraction call.
 */
/**
 * Source picker modal for PDF ingest: choose between picking a PDF already
 * in the vault OR importing a fresh PDF from disk (Electron file dialog,
 * desktop-only). Either choice ultimately yields a TFile inside the vault
 * that the AI flow can read.
 */
/**
 * Picker over all PDF files in the vault. Used by `openSubstrateFromPDF`.
 */
/**
 * Modal for mapping presupposti A/B of a tension. Same visual style as the
 * other AI-assisted modals: form with 2 textareas + "Proponi (AI)" button
 * with live elapsed-seconds loader. Pre-fills with existing values if the
 * tension already has presupposti written.
 */
// ---------- sidebar views ----------

/**
 * Renders a global navigation bar at the top of an Antinomia view.
 * Clicking a leaf-level entry (Dashboard, Graph, Audit) replaces the
 * current leaf's view; submenu entries either replace the view or open
 * a modal / fire an action.
 */
/**
 * Generic helper to render a single note as a card with action buttons.
 * Used by SubstrateListView, PrinciplesListView, DefeatedListView.
 * The `extraInfo` callback can render type-specific metadata (e.g. defeated motivo).
 */
/**
 * Onboarding checklist sidebar. Shows a progressive list of steps with auto
 * detected completion (scans vault + tracks flags). Each step has a "Vai"
 * button that triggers the relevant command. Closes when all steps are done.
 */
/**
 * Dashboard: vault status at a glance. Counters per layer + last Hunter run +
 * recent activity + quick action buttons. Refreshes on vault changes.
 */
/**
 * Audit Vault: scans the vault for incomplete or malformed Antinomia notes
 * and surfaces them in actionable categories. Each issue links to the file
 * and (where relevant) has a quick action.
 */
/**
 * Migration helper: shows every markdown note in the vault that does NOT have
 * `antinomia_type` (and is not flagged `antinomia_ignora`). For each one, the
 * user can: mark as a specific layer, classify via AI, or ignore.
 */
// ---------- plugin entry point ----------


// ============================================================================
// Antinomia Graph View — vista grafo custom con filtri per layer
// ============================================================================

export default class AntinomiaPlugin extends Plugin {
  settings: AntinomiaSettings = DEFAULT_SETTINGS;
  statusBarEl: HTMLElement | null = null;
  // AbortController active while a Hunter run is in progress, null otherwise
  hunterAbortController: AbortController | null = null;
  // Friction payload from the most recent AI call (PTM Core). Flows stash it
  // here right before opening their result UI, which reads it synchronously to
  // render the FrictionCard. Only one AI command runs at a time, so there's no
  // interleaving. See core/aiFriction.ts.
  lastFriction?: FrictionPayload;

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
  async runHunter(focusFile?: TFile, attachToButton?: HTMLButtonElement): Promise<void> {
    return runHunter(this, focusFile, attachToButton);
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
    await this.loadSettings();
    this.addSettingTab(new AntinomiaSettingTab(this.app, this));

    // Delete-sync: when a presupposition (U-) note is removed, strip its
    // basename from every principle's `presupposes` list.
    this.registerEvent(
      this.app.vault.on("delete", (f) => {
        if (f instanceof TFile && f.extension === "md" && f.basename.startsWith("U-")) {
          void removePresuppositionFromPrinciples(this.app, f.basename);
        }
      })
    );

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
      VIEW_TYPE_PRESUPPOSITIONS_MAP,
      (leaf) => new PresuppositionsMapView(leaf, this)
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
    this.addRibbonIcon("key", "Antinomia: Presuppositions Map", () =>
      this.activateView(VIEW_TYPE_PRESUPPOSITIONS_MAP, "right")
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
      // Cloud-profile privacy reminder for returning users. Skipped on the very
      // first launch, where the WelcomeModal already covers cloud-vs-local.
      if (this.settings.onboardingCompleted) {
        this.maybeWarnCloudProfile();
      }
      this.validateProfileBaseUrls();

      // Low-friction legacy-schema detection: a single clickable 5s Notice
      // (never an aggressive modal). Click opens the migration modal.
      if (this.settings.migrationCheckEnabled !== false) {
        void scanVaultForLegacyNotes(this.app).then((legacy) => {
          if (legacy.length === 0) return;
          const frag = document.createDocumentFragment();
          const span = document.createElement("span");
          span.setText(
            `Antinomia: ${legacy.length} notes use the legacy v1.1 schema. Click to migrate to v1.4.`
          );
          span.style.cursor = "pointer";
          span.style.textDecoration = "underline";
          span.onclick = () => new MigrationModal(this.app, this).open();
          frag.appendChild(span);
          new Notice(frag, 5000);
        });
      }
    });

    // Cross-pane hover highlight: graph node ↔ file entries in other panes.
    this.setupCrossPaneHover();

    // ---- Creation (guided + bypass) ----
    this.addCommand({
      id: "migrate-v1",
      name: "Migrate vault from v1.1 to v1.4 (english schema)",
      callback: () => new MigrationModal(this.app, this).open(),
    });
    this.addCommand({
      id: "restore-backup",
      name: "Restore pre-migration backup (latest)",
      callback: () => void restoreFromLatestBackup(this.app),
    });
    this.addCommand({
      id: "map-presuppositions",
      name: "Map presuppositions of this principle",
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        if (!file) return false;
        const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
        const ok = fm?.antinomia_type === TYPE.principle;
        if (ok && !checking) void mapPresuppositionsOfPrinciple(this, file);
        return ok;
      },
    });
    this.addCommand({
      id: "show-collapse-impact",
      name: "What collapses if this fails?",
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        if (!file) return false;
        const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
        const ok = fm?.antinomia_type === TYPE.presupposition;
        if (ok && !checking) void showCollapseImpact(this, file);
        return ok;
      },
    });
    this.addCommand({
      id: "open-presuppositions-map",
      name: "Open Presuppositions Map",
      callback: () => void this.activateView(VIEW_TYPE_PRESUPPOSITIONS_MAP, "right"),
    });
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
      id: "youtube-extract-concepts",
      name: "Substrate from YouTube — extract concepts (AI)",
      callback: () => void runYouTubeConceptIngest(this),
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
      name: "Map tension presuppositions",
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

  /** Unsubscribe handle for the DOM-highlight hover subscriber. */
  private hoverDomUnsub: (() => void) | null = null;

  /**
   * Cross-pane hover highlight. Two halves, joined by the central hoverBus:
   *
   *  Publisher — delegated mouseover/mouseout on document. When the pointer is
   *  over a file entry in the file explorer (.nav-file-title), the
   *  backlinks/outgoing panes (.tree-item-self), or an Antinomia note card
   *  ([data-antinomia-path]), we resolve its path + basename and emit on the
   *  bus with source "dom".
   *
   *  Subscriber — listens to the bus and, for events NOT from source "dom"
   *  (i.e. coming from the graph), toggles `.antinomia-hover-highlight` on
   *  every DOM entry for that path. The source check is the loop guard.
   *
   *  registerDomEvent auto-removes the listeners on unload; the bus
   *  subscription is torn down explicitly in onunload.
   */
  private setupCrossPaneHover(): void {
    const SELECTOR =
      ".nav-file-title[data-path], .tree-item-self[data-path], [data-antinomia-path]";

    const pathOf = (el: HTMLElement): string | null =>
      el.dataset.antinomiaPath || el.getAttribute("data-path") || null;

    const basenameOf = (path: string): string => {
      const file = path.split("/").pop() || path;
      return file.replace(/\.md$/i, "");
    };

    const emitFor = (ev: "enter" | "leave", target: EventTarget | null): void => {
      if (!(target instanceof HTMLElement)) return;
      const el = target.closest<HTMLElement>(SELECTOR);
      if (!el) return;
      const path = pathOf(el);
      if (!path) return;
      hoverBus.emit(ev, { path, basename: basenameOf(path), source: "dom" });
    };

    // ~50ms trailing throttle keeps rapid pointer travel from flooding the bus.
    const onEnter = throttle(
      (t: EventTarget | null) => emitFor("enter", t),
      50
    );
    this.registerDomEvent(document, "mouseover", (e) => onEnter(e.target));
    this.registerDomEvent(document, "mouseout", (e) => emitFor("leave", e.target));

    // Subscriber: highlight DOM entries for hovers coming from the graph.
    const highlighted = new Set<HTMLElement>();
    const clearHighlights = (): void => {
      for (const el of highlighted) el.removeClass("antinomia-hover-highlight");
      highlighted.clear();
    };
    this.hoverDomUnsub = hoverBus.on((ev, p: HoverPayload) => {
      if (p.source === "dom") return; // our own events — skip
      clearHighlights();
      if (ev !== "enter") return;
      const sel = [
        `.nav-file-title[data-path="${CSS.escape(p.path)}"]`,
        `.tree-item-self[data-path="${CSS.escape(p.path)}"]`,
        `[data-antinomia-path="${CSS.escape(p.path)}"]`,
      ].join(", ");
      document.querySelectorAll<HTMLElement>(sel).forEach((el) => {
        el.addClass("antinomia-hover-highlight");
        highlighted.add(el);
      });
    });
  }

  onunload(): void {
    if (this.hoverDomUnsub) {
      this.hoverDomUnsub();
      this.hoverDomUnsub = null;
    }
    hoverBus.clear();
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
   * If the active profile points at a third-party cloud backend (not a local
   * server) and the user hasn't dismissed the warning, show the cloud-privacy
   * modal. `onCancel` runs when the user backs out (used to revert a profile
   * switch). No-op when the active profile is local or the warning is off.
   */
  /**
   * Non-blocking sanity check at load: if a profile clearly corresponds to a
   * known backend preset (by id or name) but its baseUrl points at a different
   * host (a common copy-paste mistake, e.g. a "Groq" profile left on
   * api.anthropic.com), surface a Notice with a one-click "Fix" that rewrites
   * the baseUrl to the preset's. Custom/unknown profiles are left alone.
   */
  validateProfileBaseUrls(): void {
    const hostOf = (u: string): string => {
      try {
        return new URL(u).hostname;
      } catch {
        return "";
      }
    };
    for (const profile of this.settings.profiles) {
      const name = profile.name.toLowerCase();
      const preset = BACKEND_PRESETS.find(
        (p) => p.id === profile.id || name.includes(p.id)
      );
      if (!preset) continue;
      const want = hostOf(preset.baseUrl);
      const got = hostOf(profile.baseUrl);
      if (!want || !got || want === got) continue;
      const frag = document.createDocumentFragment();
      const span = document.createElement("span");
      span.setText(
        `Antinomia: profile "${profile.name}" has baseUrl ${got}, but the ${preset.label} preset uses ${want}. `
      );
      frag.appendChild(span);
      const btn = document.createElement("button");
      btn.textContent = "Fix";
      btn.style.marginLeft = "8px";
      btn.onclick = async () => {
        profile.baseUrl = preset.baseUrl;
        await this.saveSettings();
        new Notice(`Fixed baseUrl for "${profile.name}" → ${want}.`);
      };
      frag.appendChild(btn);
      new Notice(frag, 20000);
    }
  }

  maybeWarnCloudProfile(onCancel: () => void = () => {}): void {
    if (this.settings.cloudWarningDismissed) return;
    const p = this.activeProfile();
    if (!p || isLocalBaseUrl(p.baseUrl)) return;
    new CloudWarningModal(
      this.app,
      this,
      async (dontWarnAgain) => {
        if (dontWarnAgain) {
          this.settings.cloudWarningDismissed = true;
          await this.saveSettings();
        }
      },
      onCancel
    ).open();
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
    return createExampleNotes(this);
  }

  /**
   * Delete every note flagged with `antinomia_example: true` in frontmatter.
   */
  async deleteExampleNotes(): Promise<void> {
    return deleteExampleNotes(this);
  }

  /**
   * Read the system clipboard and open FreeInputModal with the text
   * pre-populated. The AI then classifies it as tensione or substrate
   * and routes to the correct creation modal.
   */
  async openFreeInputFromClipboard(): Promise<void> {
    return openFreeInputFromClipboard(this);
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
    return openSubstrateFromYouTube(this, prefillUrl);
  }

  /**
   * Apre il MapPresuppostiModal per una tensione. Estrae i presupposti
   * gia' presenti (frontmatter o body) e li pre-popola; sul submit li
   * applica via applyPresupposti.
   */
  // Guardia anti-doppia-apertura: alcuni click handler/re-render della sidebar
  // possono triggerare due volte openElevateModal in rapida sequenza.
  // public so flows/elevation.ts can guard against opening two elevate modals
  elevateModalOpen = false;

  async openElevateModal(file: TFile): Promise<void> {
    return openElevateModal(this, file);
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
    return undismissContradiction(this, aBasename, bBasename);
  }

  async openMapPresupposti(file: TFile): Promise<void> {
    return openMapPresupposti(this, file);
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
  ): ReturnType<typeof extractConceptsFromPdfText> {
    return extractConceptsFromPdfText(this, text, signal, attachUsageTo);
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
    return bulkCreateSubstratesFromConcepts(this, concepts, pdfFile);
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
  async createOrUpdatePdfHubNote(
    pdfFile: TFile,
    folder: string,
    conceptFiles: TFile[],
    existing?: TFile
  ): Promise<TFile | null> {
    return createOrUpdatePdfHubNote(this, pdfFile, folder, conceptFiles, existing);
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
    return importPdfFromDisk(this);
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
    return openSubstrateFromPDF(this);
  }

  async runPdfIngest(pdf: TFile): Promise<void> {
    return runPdfIngest(this, pdf);
  }

  openFreeInputModal(): void {
    return openFreeInputModal(this);
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
      let path = normalizePath(`${folder}/${id}.md`);
      let suffix = 1;
      while (this.app.vault.getAbstractFileByPath(path)) {
        id = `${baseId}-${String(suffix).padStart(3, "0")}`;
        path = normalizePath(`${folder}/${id}.md`);
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
    return elevateToPrinciple(this, file, fields);
  }

  async elevateTransform(file: TFile, fields?: PrincipleFields): Promise<void> {
    return elevateTransform(this, file, fields);
  }

  async elevateSplit(file: TFile, fields?: PrincipleFields): Promise<void> {
    return elevateSplit(this, file, fields);
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
      new Notice("No principles in the vault.");
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
        ? `Original tension of ${pFm.title}`
        : `Original tension of ${p.basename}`;
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
      new Notice("Selection: the note is not a principle.");
      return;
    }
    const today = todayISO();
    const title = typeof fm?.title === "string"
      ? `Original tension of ${fm.title}`
      : `Original tension of ${principleFile.basename}`;
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
      new Notice("Error: could not create the defeated.");
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
      new Notice(`Resolved: ${file.basename}`);
    } catch (e) {
      new Notice(`Error: ${(e as Error).message}`);
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
        new Notice(`Error: ${(e as Error).message}`);
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
      new Notice(`Error: ${(e as Error).message}`);
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
      new Notice(`Error: ${(e as Error).message}`);
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
      new Notice(`AI error: ${(e as Error).message}`);
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
          new Notice(`Error: ${(e as Error).message}`);
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
    return proposeTitleAI(this, file);
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
    return proposeTitleFromContent(this, content, signal, attachUsageTo);
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
    return proposeIfThenFromContent(this, content, signal, attachUsageTo);
  }

  /**
   * AI helper: propone Presuppositions A/B per una tensione.
   */
  async proposePresuppostiFromContent(
    content: string,
    signal?: AbortSignal
  ): Promise<PresuppostiFields | null> {
    return proposePresuppostiFromContent(this, content, signal);
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
    return analyzeFreeInput(this, text, signal, attachUsageTo);
  }

  /**
   * Applica i Presuppositions A/B al body di una tensione. Sostituisce le righe
   * "**Presuppositions A:** ..." e "**Presuppositions B:** ..." se presenti,
   * altrimenti le appende in fondo.
   */
  async applyPresupposti(file: TFile, fields: PresuppostiFields): Promise<void> {
    return applyPresupposti(this, file, fields);
  }

  /**
   * Collega due note via wikilink bidirezionale in `links: [...]` di
   * entrambi i frontmatter, e aggiunge "> See also: [[target]]" nel body
   * della nota attiva. Idempotente — non duplica link esistenti.
   */
  async linkActiveTo(active: TFile, target: TFile): Promise<void> {
    if (active.path === target.path) {
      new Notice("You can't link a note to itself.");
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
      new Notice(`Link error: ${(e as Error).message}`);
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
