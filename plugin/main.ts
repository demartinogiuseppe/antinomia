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

// Antinomia V1 — Step 5e: guided creation modals + human titles + Hunter v2.1
//
// Design invariants (do not violate without explicit user reconfirmation):
//   - Layer of a note = `antinomia_tipo` frontmatter ONLY. Files never move.
//   - Hunter IDENTIFIES contradictions, does NOT propose resolutions.
//   - AI calls only on explicit user action (no background AI).
//   - Backend pluggable (Anthropic cloud / LM Studio / custom).
//   - Modals for new tension/substrate are opt-out: "Salta e apri nota vuota"
//     button lets the savvy user bypass and write directly in markdown.

const FOLDER = { notes: "notes" } as const;

const TYPE = {
  tension: "tensione",
  substrate: "substrate",
  principle: "principio",
  defeated: "defeated",
  meta: "meta_nota",
} as const;

const VIEW_TYPE_OPEN_TENSIONS = "antinomia-open-tensions";
const VIEW_TYPE_HUNTER_RESULTS = "antinomia-hunter-results";
const VIEW_TYPE_DISMISSED_PAIRS = "antinomia-dismissed-pairs";
const VIEW_TYPE_SUBSTRATE_LIST = "antinomia-substrate-list";
const VIEW_TYPE_PRINCIPLES_LIST = "antinomia-principles-list";
const VIEW_TYPE_DEFEATED_LIST = "antinomia-defeated-list";
const VIEW_TYPE_ONBOARDING = "antinomia-onboarding-checklist";
const VIEW_TYPE_DASHBOARD = "antinomia-dashboard";
const VIEW_TYPE_AUDIT = "antinomia-audit";
const VIEW_TYPE_GRAPH = "antinomia-graph";

interface Profile {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
}

interface AntinomiaSettings {
  profiles: Profile[];
  activeProfileId: string;
  // Empty string means "use the active profile". Otherwise overrides Hunter only.
  hunterProfileId: string;
  hunterReasoningStyle: "concise" | "verbose";
  hunterMaxNotes: number;
  hunterNoteBodyLimit: number;
  // Onboarding flags (false on first install; flipped to true by WelcomeModal)
  onboardingCompleted: boolean;
  // Tracking flags for the onboarding checklist
  hasRunHunter: boolean;
  hasUsedFreeInput: boolean;
  hasOpenedListSidebar: boolean;
  // Sidebar "first time" hints (banner dismissed once)
  hintsTensionsShown: boolean;
  hintsHunterShown: boolean;
  // Last Hunter run summary (for dashboard)
  lastHunterRunISO: string;
  lastHunterRunCount: number;
  // Human-readable name for THIS Antinomia vault (shown in sidebar headers)
  vaultDisplayName: string;
  autoOpenDashboard: boolean;
  autoOpenGraph: boolean;
  // 'transform' (legacy): cambia tipo in-place. 'split' (design C): crea P-... nuovo + converte T-... in defeated.
  elevationMode: "transform" | "split";
  // Stile grafico del Graph View. "custom" usa graphCustomColors.
  graphStyleName: string;
  graphCustomColors: GraphColors;
}

interface GraphColors {
  tensione_aperta: string;
  tensione_risolta: string;
  tensione_elevata: string;
  substrate: string;
  principio: string;
  defeated: string;
  meta_nota: string;
  label: string;
  edge: string;
  background: string;
}

const GRAPH_STYLE_PRESETS: Record<string, GraphColors> = {
  default: {
    tensione_aperta: "#ff8c42",
    tensione_risolta: "#fbc02d",
    tensione_elevata: "#4caf50",
    substrate: "#9aa0a6",
    principio: "#2e7d32",
    defeated: "#e53935",
    meta_nota: "#7e57c2",
    label: "#999999",
    edge: "rgba(128,128,128,0.25)",
    background: "",
  },
  scuro: {
    tensione_aperta: "#ff6b35",
    tensione_risolta: "#ffb300",
    tensione_elevata: "#66bb6a",
    substrate: "#546e7a",
    principio: "#1b5e20",
    defeated: "#c62828",
    meta_nota: "#5e35b1",
    label: "#cfcfcf",
    edge: "rgba(180,180,180,0.18)",
    background: "#0e0e10",
  },
  chiaro: {
    tensione_aperta: "#f57c00",
    tensione_risolta: "#fdd835",
    tensione_elevata: "#388e3c",
    substrate: "#90a4ae",
    principio: "#1b5e20",
    defeated: "#d32f2f",
    meta_nota: "#5e35b1",
    label: "#444444",
    edge: "rgba(100,100,100,0.3)",
    background: "#fafafa",
  },
  sepia: {
    tensione_aperta: "#bf6b27",
    tensione_risolta: "#c89b3d",
    tensione_elevata: "#6b8e23",
    substrate: "#a68d6e",
    principio: "#556b2f",
    defeated: "#a0312f",
    meta_nota: "#7a5e8c",
    label: "#5a4530",
    edge: "rgba(120,90,60,0.3)",
    background: "#f5ecd9",
  },
  minimal: {
    tensione_aperta: "#444444",
    tensione_risolta: "#666666",
    tensione_elevata: "#222222",
    substrate: "#999999",
    principio: "#000000",
    defeated: "#aa0000",
    meta_nota: "#555555",
    label: "#333333",
    edge: "rgba(0,0,0,0.15)",
    background: "#ffffff",
  },
  neon: {
    tensione_aperta: "#ff5722",
    tensione_risolta: "#ffff00",
    tensione_elevata: "#00e676",
    substrate: "#00bcd4",
    principio: "#76ff03",
    defeated: "#ff1744",
    meta_nota: "#d500f9",
    label: "#e0e0e0",
    edge: "rgba(0,229,255,0.3)",
    background: "#0a0a0f",
  },
};

const DEFAULT_SETTINGS: AntinomiaSettings = {
  profiles: [
    {
      id: "default",
      name: "Default",
      baseUrl: "https://api.anthropic.com",
      apiKey: "",
      model: "claude-sonnet-4-6",
    },
  ],
  activeProfileId: "default",
  hunterProfileId: "",
  hunterReasoningStyle: "concise",
  hunterMaxNotes: 20,
  hunterNoteBodyLimit: 800,
  onboardingCompleted: false,
  hasRunHunter: false,
  hasUsedFreeInput: false,
  hasOpenedListSidebar: false,
  hintsTensionsShown: false,
  hintsHunterShown: false,
  lastHunterRunISO: "",
  lastHunterRunCount: 0,
  vaultDisplayName: "",
  autoOpenDashboard: true,
  autoOpenGraph: true,
  elevationMode: "split",
  graphStyleName: "default",
  graphCustomColors: {
    tensione_aperta: "#ff8c42",
    tensione_risolta: "#fbc02d",
    tensione_elevata: "#4caf50",
    substrate: "#9aa0a6",
    principio: "#2e7d32",
    defeated: "#e53935",
    meta_nota: "#7e57c2",
    label: "#999999",
    edge: "rgba(128,128,128,0.25)",
    background: "",
  },
};

interface BackendPreset {
  id: string;
  label: string;
  baseUrl: string;
  defaultModel: string;
  defaultKey: string;
  helpKey: string;
}

const BACKEND_PRESETS: BackendPreset[] = [
  {
    id: "anthropic",
    label: "Anthropic Cloud",
    baseUrl: "https://api.anthropic.com",
    defaultModel: "claude-sonnet-4-6",
    defaultKey: "",
    helpKey: "Crea la chiave su console.anthropic.com.",
  },
  {
    id: "lmstudio",
    label: "LM Studio (locale)",
    baseUrl: "http://localhost:1234",
    defaultModel: "qwen/qwen3.5-9b",
    defaultKey: "lmstudio",
    helpKey: "LM Studio ignora la chiave ma il plugin la richiede.",
  },
];

const MODEL_PRESETS: Array<{ id: string; label: string }> = [
  { id: "claude-sonnet-4-6", label: "Sonnet 4.6 (Anthropic)" },
  { id: "claude-opus-4-6", label: "Opus 4.6 (Anthropic)" },
  { id: "claude-haiku-4-5-20251001", label: "Haiku 4.5 (Anthropic)" },
  { id: "qwen/qwen3.5-9b", label: "Qwen 3.5 9B (LM Studio)" },
];

function detectBackend(baseUrl: string): string {
  if (baseUrl.includes("anthropic.com")) return "anthropic";
  if (baseUrl.includes("localhost") || baseUrl.includes("127.0.0.1"))
    return "lmstudio";
  return "custom";
}

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
    contentEl.createEl("h3", { text: "Modifica profilo AI" });

    const profile = this.current;

    new Setting(contentEl)
      .setName("Backend preset")
      .setDesc("Pre-popola base URL + modello suggerito.")
      .addDropdown((dd) => {
        for (const p of BACKEND_PRESETS) dd.addOption(p.id, p.label);
        dd.addOption("custom", "Custom / altro");
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

    new Setting(contentEl).setName("Nome").addText((text) =>
      text
        .setPlaceholder("Es. Sonnet Cloud, Qwen 14B locale, ...")
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
        .setPlaceholder("sk-ant-... oppure lmstudio")
        .setValue(profile.apiKey)
        .onChange((v) => (profile.apiKey = v.trim()))
    );

    new Setting(contentEl)
      .setName("Modello")
      .addDropdown((dd) => {
        for (const m of MODEL_PRESETS) dd.addOption(m.id, m.label);
        if (!MODEL_PRESETS.some((m) => m.id === profile.model)) {
          dd.addOption(profile.model, profile.model);
        }
        dd.setValue(profile.model);
        dd.onChange((v) => (profile.model = v));
      });

    new Setting(contentEl)
      .setName("Modello custom")
      .setDesc("Stringa libera (sovrascrive il dropdown). Vuoto = usa dropdown.")
      .addText((text) =>
        text
          .setPlaceholder("nome-modello-esatto")
          .setValue(profile.model)
          .onChange((v) => {
            const t = v.trim();
            if (t) profile.model = t;
          })
      );

    new Setting(contentEl)
      .addButton((b) =>
        b.setButtonText("Annulla").onClick(() => {
          this.onSubmit(null);
          this.close();
        })
      )
      .addButton((b) =>
        b
          .setButtonText("Salva")
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

    contentEl.createEl("h2", { text: "Benvenuto in Antinomia" });

    // Banner SICUREZZA: cosa Antinomia non e' (sempre visibile, in cima)
    const safety = contentEl.createDiv();
    safety.style.cssText =
      "background:rgba(220,53,69,0.10); border-left:3px solid #dc3545; " +
      "padding:10px 12px; margin-bottom:12px; border-radius:4px; font-size:0.88em;";
    safety.createEl("strong", { text: "⚠ Cosa Antinomia NON e'" });
    const safetyP = safety.createEl("p");
    safetyP.style.margin = "6px 0 0 0";
    safetyP.setText(
      "Questo strumento nasce per aiutarti a comprendere l'evoluzione del tuo pensiero, mappando tensioni e contraddizioni che gia' porti dentro. NON e' un sistema di supporto decisionale. Non usarlo per decidere in situazioni reali (lavoro, salute, finanza, relazioni). Le coppie che il Hunter propone sono spunti di riflessione, non verita': il modello AI puo' allucinare, semplificare, fraintendere. Ogni uso diverso da 'pratica riflessiva personale' e' improprio."
    );

    // Banner avviso se Front Matter Title non e' installato/attivo
    if (!this.plugin.isFrontMatterTitleEnabled()) {
      const banner = contentEl.createDiv();
      banner.style.cssText =
        "background:rgba(255,193,7,0.12); border-left:3px solid #ffc107; " +
        "padding:10px 12px; margin-bottom:12px; border-radius:4px; font-size:0.9em;";
      banner.createEl("strong", { text: "Plugin consigliato mancante: Front Matter Title" });
      const p = banner.createEl("p");
      p.style.margin = "6px 0";
      p.setText(
        "Senza questo plugin il File Explorer ti mostra i basename tecnici (T-20260530-091416) invece dei titoli umani delle tue note. Antinomia funziona lo stesso, ma vederli e' molto piu' comodo."
      );
      const btn = banner.createEl("button", { text: "Apri Community Plugins" });
      btn.style.cssText = "margin-top:4px; padding:4px 10px; cursor:pointer;";
      btn.onclick = () => {
        const setting = (this.app as any).setting;
        if (setting?.open) {
          setting.open();
          if (setting.openTabById) setting.openTabById("community-plugins");
        }
      };
    }

    const intro = contentEl.createEl("p");
    intro.setText(
      "Antinomia e' un sistema di Personal Knowledge Management basato su un'idea controintuitiva: la contraddizione e' l'unita' fondamentale del pensiero. Non costruisci una gerarchia di idee, costruisci una mappa delle tensioni che strutturano come pensi."
    );

    contentEl.createEl("h3", { text: "I 5 layer del sistema" });

    const layers: Array<{ emoji: string; label: string; desc: string }> = [
      {
        emoji: "🔀",
        label: "Tensione",
        desc: "Due posizioni in conflitto (A vs B). L'unita' base del pensiero antinomiano.",
      },
      {
        emoji: "📚",
        label: "Substrate",
        desc: "Materiale grezzo: citazioni, fatti, osservazioni, appunti di lettura.",
      },
      {
        emoji: "🧭",
        label: "Principio",
        desc: "Regola operativa IF/THEN che emerge dalla risoluzione di una tensione.",
      },
      {
        emoji: "📦",
        label: "Defeated",
        desc: "Convinzioni archiviate (falsi positivi, superate, elevate a principio).",
      },
      {
        emoji: "📝",
        label: "Meta-nota",
        desc: "Riflessione sull'uso del sistema stesso (rapporto utente-vault).",
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

    contentEl.createEl("h3", { text: "Come funziona in pratica" });
    const flow = contentEl.createEl("ol");
    flow.style.lineHeight = "1.6";
    flow.style.marginBottom = "16px";
    const steps = [
      "Butti dentro substrate (citazioni, osservazioni) quando li incontri — bottone '+ Nuovo substrate' o '✨ Libero' (AI classifica per te).",
      "Quando vedi una contraddizione, la registri come tensione (statement A vs statement B).",
      "Il Hunter (icona 🔍) scansiona il vault e trova contraddizioni anche tra note che non avevi messo in relazione.",
      "Quando capisci una tensione, la elevi a principio (IF/THEN/GREY ZONE). L'AI puo' proporre i campi.",
      "Le convinzioni sconfitte vanno nell'archivio defeated come memoria storica di cio' che NON era vero.",
    ];
    for (const s of steps) flow.createEl("li", { text: s });

    contentEl.createEl("h3", { text: "Un consiglio iniziale" });
    const tip = contentEl.createEl("p");
    tip.style.fontSize = "0.92em";
    tip.style.opacity = "0.85";
    tip.setText(
      "Non cercare la perfezione subito. Butta dentro materiale grezzo (substrate) e tensioni mal formulate. Il sistema migliora le tue formulazioni col tempo — il Hunter ti mostra cose che non avevi visto, e mappare i presupposti ti costringe a esplicitare cio' che dai per scontato. Antinomia non e' uno strumento da riempire, e' una pratica."
    );

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
      "Capito, non mostrare piu'",
      false,
      "Marca l'onboarding come completato. Potrai sempre riaprirlo da Ctrl+P -> Antinomia: mostra welcome."
    );
    dontShowBtn.onclick = async () => {
      this.plugin.settings.onboardingCompleted = true;
      await this.plugin.saveSettings();
      this.close();
      // Also open the checklist so the user has a starting point
      void this.plugin.activateViewExternal(VIEW_TYPE_ONBOARDING);
    };

    const exploreBtn = mkBtn(
      "Esplora da solo",
      false,
      "Chiudi il welcome senza completare. Si riaprira' al prossimo lancio."
    );
    exploreBtn.onclick = () => {
      this.close();
    };

    const startBtn = mkBtn(
      "Crea la mia prima tensione (guidata)",
      true,
      "Apre il modal di creazione tensione pre-popolato con un esempio chiaro."
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
          titolo: "Esempio — Solitudine creativa vs correzione sociale",
          statementA:
            "Il lavoro creativo profondo richiede solitudine prolungata. Le idee originali nascono nel silenzio, lontano dal rumore degli altri. La presenza altrui diluisce l'intuizione e spinge verso il conformismo.",
          statementB:
            "La condivisione continua con altre menti corregge gli errori e impedisce ai pensieri di girare a vuoto. Da solo si finisce per confermare i propri pregiudizi: la qualita' del pensiero dipende dal contraddittorio.",
        }
      ).open();
      new Notice(
        "Questo e' un esempio. Modificalo se vuoi, oppure premi Annulla e creane uno tuo."
      );
    };
  }
  onClose(): void {
    this.contentEl.empty();
  }
}

interface TutorialStep {
  title: string;
  paragraphs: string[];
  exampleTitle?: string;
  exampleLines?: string[];
}

const TUTORIAL_STEPS: TutorialStep[] = [
  {
    title: "1. Tensione",
    paragraphs: [
      "Una tensione cattura una contraddizione tra due posizioni A e B. Piu' sono incompatibili, piu' la tensione e' feconda. La tensione e' l'unita' fondamentale del pensiero antinomiano — non parti dalle idee 'pulite', parti dai conflitti.",
      "La tensione non si risolve necessariamente: alcune restano aperte per anni, altre vengono 'elevate' a principi operativi, altre archiviate come 'defeated'.",
    ],
    exampleTitle: "Esempio — Solitudine creativa",
    exampleLines: [
      "A: Il lavoro creativo profondo richiede solitudine prolungata.",
      "B: La condivisione continua con altri corregge gli errori e impedisce ai pensieri di girare a vuoto.",
    ],
  },
  {
    title: "2. Substrate",
    paragraphs: [
      "Il substrate e' materiale grezzo: una citazione, un fatto, un'osservazione, un appunto di lettura. Non e' ancora ne' tensione ne' principio.",
      "I substrate sono il deposito da cui emergono le tensioni. Quando il Hunter li mette in relazione con tensioni esistenti, scopri contraddizioni che non avevi visto.",
    ],
    exampleTitle: "Esempio — Cit. Kahneman",
    exampleLines: [
      "\"In isolamento il cervello amplifica i bias di conferma. La discussione con un peer riduce gli errori del 40%.\"",
    ],
  },
  {
    title: "3. Principio",
    paragraphs: [
      "Un principio emerge dalla risoluzione di una tensione. Non sceglie un lato — assorbe entrambi i lati come casi contestuali.",
      "Forma standard: IF/THEN/GREY ZONE. Identifichi i contesti in cui vince A e quelli in cui vince B. La GREY ZONE sono i casi limite dove la regola non basta.",
    ],
    exampleTitle: "Esempio — Processi vs giudizio",
    exampleLines: [
      "IF [rischio prevedibile, errori costosi] -> processi codificati, checklist",
      "IF [contesto unico, conoscenza locale distribuita] -> giudizio decentralizzato, eccezioni",
      "GREY ZONE: progetti complessi dove la ripetibilita' sembra esserci ma c'e' conoscenza tacita",
    ],
  },
  {
    title: "4. Defeated",
    paragraphs: [
      "Defeated e' l'archivio delle convinzioni sconfitte. NON vengono cancellate: restano come memoria storica di cio' che NON era vero.",
      "Tre motivi possibili: 'falso_positivo' (era un errore di valutazione), 'elevata' (e' diventata principio, link al principio sostituto), 'sconfitta_genuina' (l'evidenza l'ha demolita).",
    ],
    exampleTitle: "Esempio",
    exampleLines: [
      "Convinzione: 'Ogni decisione importante si prende meglio in solitudine.'",
      "Motivo: sconfitta_genuina (l'esperienza ha mostrato che le decisioni meditate insieme erano migliori).",
    ],
  },
  {
    title: "5. Presupposti",
    paragraphs: [
      "I presupposti sono le assunzioni epistemiche / valoriali / metafisiche che A e B danno per scontate, spesso senza dirlo.",
      "Mapparli rende esplicito perche' A e B non possono convivere senza trade-off. E spesso e' nei presupposti che si scioglie la tensione (o si scopre che era mal posta).",
    ],
    exampleTitle: "Esempio — Solitudine creativa",
    exampleLines: [
      "Presupposti A: l'individuo isolato accede a una fonte di sapere migliore di quella sociale.",
      "Presupposti B: il pensiero individuale, senza correzione esterna, tende sistematicamente all'errore.",
    ],
  },
  {
    title: "6. Hunter (Contradiction Hunter)",
    paragraphs: [
      "Il Hunter scansiona tensioni aperte + substrate del vault e propone COPPIE contraddittorie. Il valore vero del sistema: trova contraddizioni che NON avevi visto.",
      "Vincolo importante: il Hunter IDENTIFICA, non risolve. La risoluzione e' lavoro tuo (attraverso il dialogo sui presupposti). Far suggerire risoluzioni all'AI distruggerebbe il valore epistemico del sistema.",
      "Le coppie hanno confidence (alta/media/bassa) e si possono dismissare se sono falsi positivi.",
    ],
  },
  {
    title: "7. Grafo e collegamenti",
    paragraphs: [
      "Il grafo di Obsidian mostra i wikilink tra le note. In Antinomia, i collegamenti rappresentano le relazioni epistemiche esplicite: una tensione e' nata da quale substrate, un principio deriva da quale tensione, un defeated e' stato sostituito da quale principio.",
      "Quando elevi una tensione il plugin scrive 'Deriva da: [[T-...]]' nel body del principio. Quando archivi defeated 'elevata', scrivi 'Sostituita da: [[P-...]]'. Il comando 'Collega questa nota a...' aggiunge wikilink bidirezionali.",
      "Il grafo che ne risulta NON e' la rete delle contraddizioni del Hunter — quella e' implicita. Il grafo e' la mappa delle connessioni che TU hai dichiarato.",
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
        b.setButtonText("Annulla").onClick(() => this.close())
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
    contentEl.createEl("h3", { text: "Come procedere adesso" });

    const intro = contentEl.createEl("p");
    intro.style.fontSize = "0.9em";
    intro.style.opacity = "0.8";
    intro.setText(
      "Suggerimento contestuale basato sullo stato attuale del tuo vault."
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

    const closeBtn = btnRow.createEl("button", { text: "Chiudi" });
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
        return fm?.antinomia_tipo === t;
      }).length;

    const tensions = countByType(TYPE.tension);
    const openTensions = files.filter((f) => {
      const fm = this.app.metadataCache.getFileCache(f)?.frontmatter;
      return fm?.antinomia_tipo === TYPE.tension && fm?.stato === "aperta";
    }).length;
    const substrates = countByType(TYPE.substrate);
    const principles = countByType(TYPE.principle);
    const totalAntinomia = tensions + substrates + principles + countByType(TYPE.defeated);

    const s = this.plugin.settings;

    // No notes at all
    if (totalAntinomia === 0) {
      return {
        headline: "Vault vuoto: crea la tua prima tensione",
        body: "Antinomia inizia da una contraddizione. Pensa a un dilemma che hai (lavoro, decisioni, valori) — due posizioni che ti sembrano entrambe vere ma incompatibili. Quello e' il materiale base.",
        actionLabel: "Crea prima tensione",
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
        headline: "Aggiungi del materiale grezzo (substrate)",
        body: "Hai gia' delle tensioni ma nessun substrate. Il substrate (citazioni, fatti, osservazioni) e' il materiale grezzo da cui emergono contraddizioni nuove. Il Hunter funziona molto meglio se ha substrate da incrociare con le tensioni.",
        actionLabel: "Crea substrate",
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
        headline: "Lancia il primo Hunter",
        body: `Hai ${totalAntinomia} note nel vault. Il Hunter scansiona tensioni aperte + substrate e identifica coppie contraddittorie che magari non avevi visto. Per modelli locali serve qualche minuto. Niente di distruttivo, solo lettura.`,
        actionLabel: "Lancia Hunter",
        action: () => void this.plugin.runHunter(),
      };
    }

    // Hai fatto Hunter, hai tensioni aperte, ma nessun principio
    if (s.hasRunHunter && openTensions >= 1 && principles === 0) {
      return {
        headline: "Considera di elevare una tensione a principio",
        body: "Hai tensioni aperte e hai gia' lanciato il Hunter. Se una tensione ti sembra abbastanza chiara, elevala: trasforma la contraddizione in un principio operativo IF/THEN. Non significa 'avere ragione', significa 'aver capito i contesti'.",
        actionLabel: "Apri sidebar tensioni",
        action: () => void this.plugin.activateViewExternal(VIEW_TYPE_OPEN_TENSIONS),
      };
    }

    // Hai diverse tensioni ma nessun presupposto mappato (heuristic check)
    if (openTensions >= 2) {
      return {
        headline: "Mappa i presupposti di una tensione",
        body: "Le tensioni piu' produttive emergono quando rendi espliciti i presupposti epistemici/valoriali che A e B danno per scontati. Il bottone 'Presupposti' su una tensione aperta apre un form con bottone AI che propone una mappatura.",
        actionLabel: "Apri tensioni aperte",
        action: () => void this.plugin.activateViewExternal(VIEW_TYPE_OPEN_TENSIONS),
      };
    }

    // Vault maturo (default fallback)
    return {
      headline: "Continua a lavorare con il sistema",
      body: `Stato: ${tensions} tensioni (${openTensions} aperte), ${substrates} substrate, ${principles} principi. Il vault funziona. Quando vuoi un colpo d'occhio sulle contraddizioni nascoste rilancia il Hunter. Quando incontri materiale nuovo, butta dentro un substrate via '✨ Libero' (l'AI classifica per te).`,
      actionLabel: "Apri sidebar tensioni",
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
      `Step ${this.currentStep + 1} di ${TUTORIAL_STEPS.length}`
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

    const backBtn = leftGroup.createEl("button", { text: "← Indietro" });
    backBtn.style.padding = "6px 12px";
    backBtn.style.cursor = "pointer";
    backBtn.disabled = this.currentStep === 0;
    backBtn.onclick = () => {
      if (this.currentStep > 0) {
        this.currentStep--;
        this.render();
      }
    };

    const exitBtn = leftGroup.createEl("button", { text: "Esci" });
    exitBtn.style.padding = "6px 12px";
    exitBtn.style.cursor = "pointer";
    exitBtn.onclick = () => this.close();

    const rightGroup = navRow.createEl("div");
    const isLast = this.currentStep === TUTORIAL_STEPS.length - 1;
    const nextBtn = rightGroup.createEl("button", {
      text: isLast ? "Termina" : "Avanti →",
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
    disclaimer.createEl("strong", { text: "⚠ Uso previsto" });
    const dp = disclaimer.createEl("p");
    dp.style.margin = "6px 0 0 0";
    dp.setText(
      "Antinomia e' una pratica riflessiva personale, non un sistema di supporto decisionale. Non usarla per decidere in situazioni reali (lavoro, salute, finanza, relazioni). Le coppie del Hunter sono spunti, non verita': l'AI puo' allucinare. Ogni uso diverso e' improprio."
    );
    containerEl.createEl("p", {
      text: "Backend AI configurabili come profili. Puoi avere piu' profili (es. LM Studio locale + Anthropic Cloud) e switchare quale e' attivo, con override opzionale per il Hunter.",
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
    recTitle.setText("Plugin consigliato: Front Matter Title");
    const recText = recBox.createEl("div");
    recText.style.fontSize = "0.85em";
    recText.style.opacity = "0.85";
    recText.setText(
      "Le note Antinomia hanno basename con timestamp per stabilita' degli ID. Per vedere il titolo umano anche nel File Explorer, installa 'Front Matter Title' dalla community e configuralo per leggere la proprieta' 'titolo'."
    );

    new Setting(containerEl)
      .setName("Cartella allegati (PDF, immagini, audio)")
      .setDesc(
        "Crea la cartella 'attachments/' e la imposta come default Obsidian per nuovi allegati. Tiene la cartella 'notes/' (le note Antinomia) pulita da file binari."
      )
      .addButton((b) =>
        b
          .setButtonText("Configura attachments/")
          .onClick(() => void this.plugin.setupAttachmentsFolder())
      );

    new Setting(containerEl)
      .setName("Nome di questo vault Antinomia")
      .setDesc(
        "Etichetta umana mostrata in cima alle sidebar (es. 'Brain filosofia', 'Pensiero lavoro'). Lascia vuoto per non mostrarla."
      )
      .addText((text) =>
        text
          .setPlaceholder("(opzionale)")
          .setValue(this.plugin.settings.vaultDisplayName)
          .onChange(async (value) => {
            this.plugin.settings.vaultDisplayName = value.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Apri Dashboard all'avvio")
      .setDesc(
        "Quando Obsidian si avvia, mostra automaticamente la Dashboard Antinomia nella sidebar destra (se non e' gia' aperta)."
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
      .setName("Modalita' elevazione tensione → principio")
      .setDesc(
        "split (design C, raccomandato): crea principio nuovo + converte tensione in defeated, mostra arco rosso nel grafo. transform: cambia tipo in-place (legacy, no arco)."
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
      .setName("Migra principi esistenti")
      .setDesc(
        "Per ogni principio gia' nel vault che ha la sezione '## Origine (tensione)' nel body, crea un defeated retroattivo. Esegui una sola volta dopo aver attivato split."
      )
      .addButton((b) =>
        b.setButtonText("Esegui migrazione").onClick(() => void this.plugin.migrateExistingPrinciples())
      );

    new Setting(containerEl)
      .setName("Apri Grafo Antinomia all'avvio")
      .setDesc(
        "Quando Obsidian si avvia, apri anche il grafo custom Antinomia in un tab principale (se non e' gia' aperto)."
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
    containerEl.createEl("h3", { text: "Stile grafico Graph View" });

    new Setting(containerEl)
      .setName("Stile preset")
      .setDesc("Cambia palette del grafo. Custom = colori personalizzati sotto.")
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
      colorRow("tensione_aperta", "Tensioni aperte");
      colorRow("tensione_risolta", "Tensioni risolte");
      colorRow("tensione_elevata", "Tensioni elevate");
      colorRow("substrate", "Substrate");
      colorRow("principio", "Principi");
      colorRow("defeated", "Defeated");
      colorRow("meta_nota", "Meta nota");
      colorRow("label", "Testo (label)");
      // edge e background usano color picker generico ma supportano rgba; UI standard converte
      colorRow("edge", "Linee (edge)");
      colorRow("background", "Sfondo");
    }

    new Setting(containerEl)
      .setDesc(
        "Riapri il tab Antinomia Graph dopo aver cambiato stile/colori per vederli applicati."
      );

    containerEl.createEl("h3", { text: "Profili AI" });

    // Info box su API costose vs locali gratuite
    const apiInfo = containerEl.createDiv();
    apiInfo.style.cssText =
      "background:rgba(13,110,253,0.08); border-left:3px solid #0d6efd; " +
      "padding:10px 12px; margin:4px 0 12px 0; border-radius:4px; font-size:0.86em;";
    apiInfo.createEl("strong", { text: "ℹ Modelli AI: cloud vs locale" });
    const aiP = apiInfo.createEl("p");
    aiP.style.margin = "6px 0 0 0";
    aiP.setText(
      "Antinomia usa modelli AI per le funzioni intelligenti (Hunter, propose IF/THEN, presupposti, classifica). Due opzioni:"
    );
    const ul = apiInfo.createEl("ul");
    ul.style.cssText = "margin:6px 0 0 0; padding-left:22px;";
    const li1 = ul.createEl("li");
    li1.innerHTML =
      "<strong>API cloud a pagamento</strong> (Anthropic Claude, OpenAI GPT, Groq, OpenRouter): qualita' top, costo per token consumato. Servono account + API key.";
    const li2 = ul.createEl("li");
    li2.innerHTML =
      "<strong>Modello locale gratuito</strong> (LM Studio, Ollama): privacy completa, zero costi, qualita' variabile. Servono ~10GB di RAM/VRAM e download iniziale del modello.";
    const aiP2 = apiInfo.createEl("p");
    aiP2.style.margin = "6px 0 0 0";
    aiP2.style.opacity = "0.85";
    aiP2.setText(
      "Puoi configurare piu' profili e cambiarli a piacere (es. LM Studio per uso quotidiano, Claude solo per Hunter approfondito)."
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
        b.setButtonText("Modifica").onClick(() => {
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
        b.setButtonText("Elimina").onClick(async () => {
          if (this.plugin.settings.profiles.length <= 1) {
            new Notice("Devi avere almeno un profilo.");
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
        .setButtonText("+ Aggiungi profilo")
        .setCta()
        .onClick(() => {
          const newProfile: Profile = {
            id: `profile-${Date.now()}`,
            name: "Nuovo profilo",
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
      .setName("Profilo attivo")
      .setDesc("Usato di default per tutti i comandi AI.")
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
      .setName("Profilo per Hunter (override)")
      .setDesc(
        "Lascia 'usa profilo attivo' per default. Override utile per usare un modello piu' grosso (es. Sonnet cloud) solo per il Hunter."
      )
      .addDropdown((dd) => {
        dd.addOption("", "(usa profilo attivo)");
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
      .setName("Stile reasoning Hunter")
      .setDesc(
        "Conciso: descrizioni brevi 2-3 frasi, niente pensiero esposto, ~3x piu' veloce. Esposto: il modello mostra il suo ragionamento (utile in fase di apprendimento o debug)."
      )
      .addDropdown((dd) => {
        dd.addOption("concise", "Conciso (consigliato)");
        dd.addOption("verbose", "Esposto (per capire come ragiona)");
        dd.setValue(this.plugin.settings.hunterReasoningStyle);
        dd.onChange(async (value) => {
          this.plugin.settings.hunterReasoningStyle =
            value as "concise" | "verbose";
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName("Max note per scansione")
      .setDesc("Limitato dal context window del modello.")
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
      .setName("Char max per nota nel prompt")
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
      ? "completato"
      : "non ancora completato";
    const statusEl = containerEl.createEl("p");
    statusEl.style.fontSize = "0.85em";
    statusEl.style.opacity = "0.7";
    statusEl.setText(
      `Stato attuale: onboarding ${statusText}. Il welcome modal viene mostrato automaticamente al lancio se l'onboarding non e' completato.`
    );

    new Setting(containerEl)
      .setName("Riapri welcome modal")
      .setDesc(
        "Mostra subito il welcome con la spiegazione di Antinomia e i 5 layer. Non cambia lo stato dell'onboarding."
      )
      .addButton((b) =>
        b.setButtonText("Apri").onClick(() => {
          new WelcomeModal(this.app, this.plugin).open();
        })
      );

    new Setting(containerEl)
      .setName("Apri guida iniziale (checklist)")
      .setDesc(
        "Sidebar laterale con i passi suggeriti per esplorare il sistema. Si aggiorna in automatico man mano che li completi."
      )
      .addButton((b) =>
        b.setButtonText("Apri checklist").onClick(() => {
          void this.plugin.activateViewExternal(VIEW_TYPE_ONBOARDING);
        })
      );

    new Setting(containerEl)
      .setName("Tutorial concetti chiave")
      .setDesc(
        "Sequenza di 7 mini-schede che spiegano tensione, substrate, principio, defeated, presupposti, Hunter, grafo. Naviga con Indietro/Avanti."
      )
      .addButton((b) =>
        b.setButtonText("Apri tutorial").onClick(() => {
          new TutorialModal(this.app).open();
        })
      );

    new Setting(containerEl)
      .setName("Suggerimento contestuale")
      .setDesc(
        "Mostra un suggerimento basato sullo stato attuale del vault (es. 'crea prima tensione' se vuoto, 'lancia Hunter' se hai materiale, ecc.)."
      )
      .addButton((b) =>
        b.setButtonText("Dimmi come procedere").onClick(() => {
          new GuidanceModal(this.app, this.plugin).open();
        })
      );

    new Setting(containerEl)
      .setName("Reset suggerimenti sidebar")
      .setDesc(
        "Rimostra i banner suggerimento la prossima volta che apri Tensioni Aperte e Contradiction Hunter."
      )
      .addButton((b) =>
        b.setButtonText("Reset hint").onClick(async () => {
          this.plugin.settings.hintsTensionsShown = false;
          this.plugin.settings.hintsHunterShown = false;
          await this.plugin.saveSettings();
          new Notice(
            "Suggerimenti sidebar resettati. Apparira' il banner la prossima volta che apri le sidebar."
          );
        })
      );

    new Setting(containerEl)
      .setName("Vault di esempio")
      .setDesc(
        "Crea 3 tensioni + 2 substrate ben costruiti per vedere subito come si comporta il Hunter. Marcate antinomia_esempio: true, cancellabili in un click."
      )
      .addButton((b) =>
        b.setButtonText("Crea esempi").onClick(() => {
          new ConfirmModal(
            this.app,
            "Crea vault di esempio",
            "Verranno create 5 note marcate come esempio (prefisso 'ESEMPIO -' nel titolo, flag antinomia_esempio: true).",
            "Crea",
            () => void this.plugin.createExampleNotes()
          ).open();
        })
      )
      .addButton((b) =>
        b
          .setButtonText("Cancella esempi")
          .setWarning()
          .onClick(() => {
            const count = this.app.vault.getMarkdownFiles().filter((f) => {
              const fm = this.app.metadataCache.getFileCache(f)?.frontmatter;
              return fm?.antinomia_esempio === true;
            }).length;
            if (count === 0) {
              new Notice("Nessuna nota di esempio nel vault.");
              return;
            }
            new ConfirmModal(
              this.app,
              "Cancella esempi",
              `Verranno cancellate ${count} note marcate antinomia_esempio: true.`,
              "Cancella",
              () => void this.plugin.deleteExampleNotes()
            ).open();
          })
      );

    new Setting(containerEl)
      .setName("Resetta onboarding")
      .setDesc(
        "Mette onboardingCompleted = false. Il welcome modal verra' mostrato automaticamente al prossimo lancio di Obsidian."
      )
      .addButton((b) =>
        b
          .setButtonText("Resetta")
          .setWarning()
          .onClick(async () => {
            this.plugin.settings.onboardingCompleted = false;
            await this.plugin.saveSettings();
            new Notice(
              "Onboarding resettato. Apparira' al prossimo lancio (o clicca 'Apri' qui sopra per vederlo adesso)."
            );
            this.display();
          })
      );
  }
}

// ---------- helpers ----------

function todayISO(): string {
  return moment().format("YYYY-MM-DD");
}
function timestampId(): string {
  return moment().format("YYYYMMDD-HHmmss");
}
async function ensureFolder(app: App, path: string): Promise<void> {
  if (!app.vault.getAbstractFileByPath(path))
    await app.vault.createFolder(path);
}
function stripFrontmatter(raw: string): string {
  if (!raw.startsWith("---")) return raw;
  const end = raw.indexOf("\n---", 3);
  if (end === -1) return raw;
  const after = raw.slice(end + 4);
  return after.startsWith("\n") ? after.slice(1) : after;
}
/**
 * Normalize single-quoted string values to double-quoted, so that JSON-like
 * output with mixed quotes (common in models that try to handle apostrophes
 * inside Italian text) becomes parseable. Heuristic: only matches single
 * quotes that appear in "value position" (after `:`, `[`, or `,`).
 * Handles `\'` escape inside the string. Skips matches inside already
 * double-quoted strings.
 */
function normalizeJsonQuotes(s: string): string {
  // First pass: tokenize to know when we are inside a double-quoted string.
  let out = "";
  let i = 0;
  const len = s.length;
  while (i < len) {
    const ch = s[i];
    if (ch === '"') {
      // Copy the whole double-quoted string verbatim (respecting backslash escapes)
      out += ch;
      i++;
      while (i < len) {
        const c2 = s[i];
        out += c2;
        if (c2 === "\\" && i + 1 < len) {
          out += s[i + 1];
          i += 2;
          continue;
        }
        i++;
        if (c2 === '"') break;
      }
      continue;
    }
    // Check if we are at a "value-start" position followed by a single-quoted string
    if (ch === "'") {
      // Look back for last non-whitespace char to confirm value position
      let j = out.length - 1;
      while (j >= 0 && /\s/.test(out[j])) j--;
      const prev = j >= 0 ? out[j] : "";
      if (prev === ":" || prev === "[" || prev === ",") {
        // Consume single-quoted string
        i++;
        let inner = "";
        while (i < len) {
          const c2 = s[i];
          if (c2 === "\\" && i + 1 < len) {
            const next = s[i + 1];
            // Unescape \' -> ', keep other escapes
            if (next === "'") {
              inner += "'";
            } else {
              inner += "\\" + next;
            }
            i += 2;
            continue;
          }
          if (c2 === "'") {
            i++;
            break;
          }
          inner += c2;
          i++;
        }
        // Escape double quotes and newlines in the captured string
        inner = inner
          .replace(/\\/g, "\\\\")
          .replace(/"/g, '\\"')
          .replace(/\n/g, "\\n")
          .replace(/\r/g, "\\r");
        out += '"' + inner + '"';
        continue;
      }
    }
    out += ch;
    i++;
  }
  return out;
}

function extractJson<T>(raw: string): T | null {
  // Pass 0: try ALL `{` positions in the raw text and return the first one
  // that parses as a JSON object. Some models (e.g. Qwen3) emit JS code with
  // braces BEFORE the real JSON answer, which fools brace-matching parsers.
  const tryAllCandidates = (raw: string): T | null => {
    for (let i = 0; i < raw.length; i++) {
      if (raw[i] !== "{" && raw[i] !== "[") continue;
      // brace match
      const open = raw[i];
      const close = open === "{" ? "}" : "]";
      let depth = 0;
      let inStr = false;
      let strCh = "";
      let esc = false;
      for (let j = i; j < raw.length; j++) {
        const c = raw[j];
        if (inStr) {
          if (esc) { esc = false; continue; }
          if (c === "\\") { esc = true; continue; }
          if (c === strCh) { inStr = false; continue; }
          continue;
        }
        if (c === '"' || c === "'") { inStr = true; strCh = c; continue; }
        if (c === open) depth++;
        else if (c === close) {
          depth--;
          if (depth === 0) {
            const slice = raw.slice(i, j + 1);
            try {
              const parsed = JSON.parse(slice) as unknown;
              if (parsed && typeof parsed === "object") return parsed as T;
            } catch {
              // try with quote normalization
              try {
                const normalized = slice
                  .replace(/'([^'\\]*(?:\\.[^'\\]*)*)'(\s*[:,}\]])/g, '"$1"$2')
                  .replace(/([:,\[]\s*)'([^'\\]*(?:\\.[^'\\]*)*)'/g, '$1"$2"')
                  .replace(/,(\s*[}\]])/g, "$1");
                const parsed2 = JSON.parse(normalized) as unknown;
                if (parsed2 && typeof parsed2 === "object") return parsed2 as T;
              } catch {
                /* keep scanning */
              }
            }
            break;
          }
        }
      }
    }
    return null;
  };
  // Strip <thinking>...</thinking> blocks (R1-style "high reasoning" models).
  let text = raw.replace(/<thinking>[\s\S]*?<\/thinking>/gi, "");
  text = text.replace(/<think>[\s\S]*?<\/think>/gi, "");

  // Pass 0: try ALL `{` positions in the (cleaned) text.
  const allCands = tryAllCandidates(text);
  if (allCands !== null) return allCands;

  // Prefer fenced ```json``` blocks if present.
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenceMatch ? fenceMatch[1] : text;

  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  const slice = candidate.slice(start, end + 1);

  // 1) Strict JSON.parse
  try {
    return JSON.parse(slice) as T;
  } catch {
    // fall through
  }

  // 2) Lenient: strip // line comments + trailing commas
  const cleaned = slice
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1")
    .replace(/,(\s*[}\]])/g, "$1");
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    // fall through
  }

  // 3) Most lenient: normalize single-quoted string values to double-quoted
  const normalized = normalizeJsonQuotes(cleaned);
  try {
    return JSON.parse(normalized) as T;
  } catch (e) {
    console.error("[Antinomia] extractJson exhausted attempts. Last error:", e);
    console.error("[Antinomia] Normalized text was:", normalized);
    return null;
  }
}
function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max).trimEnd() + " [...]";
}

/**
 * Quote a string for use as a YAML scalar in our raw template strings.
 * Necessary because user-provided titles (and similar) may contain `:`,
 * `#`, `"`, leading `-`, etc., which break unquoted YAML parsing.
 * Always wraps in double quotes and escapes embedded `\\` and `"`.
 */
function yamlQuote(s: string): string {
  return '"' + s.replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"';
}

/**
 * Extract a YouTube video ID from any common URL form.
 * Returns null if not a YouTube URL.
 */
function extractYouTubeId(input: string): string | null {
  const trimmed = input.trim();
  // youtu.be/<id>
  let m = trimmed.match(/youtu\.be\/([A-Za-z0-9_-]{11})/);
  if (m) return m[1];
  // youtube.com/watch?v=<id>
  m = trimmed.match(/[?&]v=([A-Za-z0-9_-]{11})/);
  if (m) return m[1];
  // youtube.com/embed/<id> or /shorts/<id> or /v/<id>
  m = trimmed.match(/youtube\.com\/(?:embed|shorts|v)\/([A-Za-z0-9_-]{11})/);
  if (m) return m[1];
  // Bare 11-char id (unlikely but cheap to support)
  if (/^[A-Za-z0-9_-]{11}$/.test(trimmed)) return trimmed;
  return null;
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

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
    new Notice("URL YouTube non riconosciuto.");
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
      new Notice(`Errore fetch video (HTTP ${res.status}).`);
      return null;
    }
    html = res.text;
  } catch (e) {
    console.error("[Antinomia] fetchYouTubeTranscript page fetch failed", e);
    new Notice(`Errore rete: ${(e as Error).message}`);
    return null;
  }

  // Find captionTracks JSON array in the HTML
  const captionMatch = html.match(/"captionTracks":(\[.+?\])/);
  if (!captionMatch) {
    new Notice(
      "Trascrizione non disponibile per questo video (nessun captionTrack)."
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
    new Notice("Errore parsing captionTracks (formato YouTube cambiato).");
    return null;
  }

  if (!Array.isArray(captionTracks) || captionTracks.length === 0) {
    new Notice("Nessuna trascrizione disponibile.");
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
    new Notice("Track senza baseUrl.");
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
      "Trascrizione vuota o formato non riconosciuto in nessuno dei 3 tentativi (json3/srv3/xml). Vedi DevTools console per il raw."
    );
    return null;
  }
  console.log(`[Antinomia] transcript parsed via ${chosen}: ${lines.length} lines`);
  return { text: lines.join(" "), lang, videoId };
}
function alphabeticOwner(a: string, b: string): string {
  return a < b ? a : b;
}
/**
 * Helper to render the optional vault display name as a small subheader.
 * Used in the top of main sidebars.
 */
function renderVaultLabel(parent: HTMLElement, name: string): void {
  if (!name) return;
  const lbl = parent.createEl("div");
  lbl.style.fontSize = "0.78em";
  lbl.style.opacity = "0.55";
  lbl.style.marginBottom = "4px";
  lbl.style.fontStyle = "italic";
  lbl.setText(name);
}

function humanTitle(app: App, file: TFile): string {
  const cache = app.metadataCache.getFileCache(file);
  const fm = cache?.frontmatter;
  const explicit =
    (fm?.titolo as string | undefined) ?? (fm?.title as string | undefined);
  if (explicit && String(explicit).trim()) return String(explicit).trim();
  const firstHeading = cache?.headings?.[0]?.heading;
  if (firstHeading && firstHeading.trim()) return firstHeading.trim();
  return file.basename;
}

// ---------- AI ----------

interface ClaudeMessage {
  role: "user" | "assistant";
  content: string;
}
interface ClaudeResponse {
  content: Array<{ type: string; text?: string }>;
  stop_reason?: string;
  usage?: { input_tokens: number; output_tokens: number };
}
async function callAI(opts: {
  baseUrl: string;
  apiKey: string;
  model: string;
  system: string;
  messages: ClaudeMessage[];
  maxTokens?: number;
  /**
   * Optional AbortSignal. When provided AND the backend is a localhost URL
   * (LM Studio, Ollama, etc.), we use native fetch() so that aborting closes
   * the TCP socket and the local model actually stops generating.
   * For remote (Anthropic Cloud) we keep requestUrl to bypass CORS — abort
   * still rejects the promise but the HTTP request can't be cancelled mid-flight.
   */
  signal?: AbortSignal;
}): Promise<{ text: string; usage?: ClaudeResponse["usage"] }> {
  if (!opts.apiKey) throw new Error("API key mancante.");
  if (!opts.baseUrl) throw new Error("Base URL mancante.");
  const url = `${opts.baseUrl.replace(/\/$/, "")}/v1/messages`;
  const body = {
    model: opts.model,
    max_tokens: opts.maxTokens ?? 1024,
    system: opts.system,
    messages: opts.messages,
  };
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-api-key": opts.apiKey,
    authorization: `Bearer ${opts.apiKey}`,
    "anthropic-version": "2023-06-01",
    "anthropic-dangerous-direct-browser-access": "true",
  };

  // Detect local backend: localhost, 127.0.0.1, or any *.local hostname.
  // For local backends we use native fetch() so AbortSignal actually closes
  // the connection — LM Studio / Ollama stop generating when the socket dies.
  let isLocal = false;
  try {
    const u = new URL(url);
    isLocal =
      u.hostname === "localhost" ||
      u.hostname === "127.0.0.1" ||
      u.hostname === "0.0.0.0" ||
      u.hostname.endsWith(".local");
  } catch {
    /* malformed URL — fall back to requestUrl */
  }

  if (isLocal && opts.signal) {
    // Use Node http/https (available in Obsidian desktop via require) so we
    // can abort with req.destroy(). Bypasses CORS (which fetch() trips on)
    // AND lets us actually cancel mid-generation (which requestUrl can't).
    try {
      const u = new URL(url);
      const isHttps = u.protocol === "https:";
      let nodeMod: any = null;
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        nodeMod = (window as any).require
          ? (window as any).require(isHttps ? "https" : "http")
          : null;
      } catch {
        nodeMod = null;
      }
      if (!nodeMod) throw new Error("node_http_unavailable");

      const bodyStr = JSON.stringify(body);
      const result = await new Promise<{ status: number; text: string }>(
        (resolve, reject) => {
          const req = nodeMod.request(
            {
              hostname: u.hostname,
              port: u.port || (isHttps ? 443 : 80),
              path: u.pathname + u.search,
              method: "POST",
              headers: {
                ...headers,
                "Content-Length": Buffer.byteLength(bodyStr).toString(),
              },
            },
            (res: any) => {
              const chunks: any[] = [];
              res.on("data", (c: any) => chunks.push(c));
              res.on("end", () => {
                const text = Buffer.concat(chunks).toString("utf8");
                resolve({ status: res.statusCode || 0, text });
              });
              res.on("error", (e: Error) => reject(e));
            }
          );
          req.on("error", (e: Error) => {
            if (opts.signal?.aborted) {
              reject(new Error("hunter_aborted"));
            } else {
              reject(e);
            }
          });
          opts.signal!.addEventListener("abort", () => {
            try {
              req.destroy();
            } catch {
              /* ignore */
            }
          });
          req.write(bodyStr);
          req.end();
        }
      );

      if (result.status < 200 || result.status >= 300) {
        throw new Error(
          `AI errore ${result.status} (${url}): ${result.text.slice(0, 500)}`
        );
      }
      const data = JSON.parse(result.text) as ClaudeResponse;
      const text = (data.content || [])
        .filter((b) => b.type === "text" && typeof b.text === "string")
        .map((b) => b.text!)
        .join("\n");
      return { text, usage: data.usage };
    } catch (e) {
      if ((e as Error).message === "hunter_aborted") throw e;
      if ((e as Error).message === "node_http_unavailable") {
        // Fall through to requestUrl below (no cancellation possible)
        console.warn(
          "[Antinomia] Node http unavailable — falling back to requestUrl (no abort)."
        );
      } else {
        throw e;
      }
    }
  }

  // Remote backend (or no signal) — use requestUrl to bypass CORS.
  const res = await requestUrl({
    url,
    method: "POST",
    contentType: "application/json",
    headers,
    body: JSON.stringify(body),
    throw: false,
  });
  if (res.status < 200 || res.status >= 300) {
    let detail = "";
    try {
      detail = res.text.slice(0, 500);
    } catch {}
    throw new Error(`AI errore ${res.status} (${url}): ${detail}`);
  }
  const data = res.json as ClaudeResponse;
  const text = (data.content || [])
    .filter((b) => b.type === "text" && typeof b.text === "string")
    .map((b) => b.text!)
    .join("\n");
  return { text, usage: data.usage };
}

// ---------- prompts ----------

const CLASSIFY_SYSTEM = `Sei l'analista di Antinomia. Classifica una nota in UNO dei tipi:

1. **tensione** — contraddizione tra due posizioni A vs B
2. **substrate** — materiale grezzo (citazione, fatto, appunto)
3. **principio** — regola IF/THEN derivata da una tensione risolta
4. **defeated** — convinzione sconfitta (archivio)
5. **meta_nota** — riflessione sul rapporto utente-sistema

Rispondi SOLO con JSON valido, senza fence:
{"tipo": "<uno dei 5>", "motivazione": "<1-2 frasi>"}`;

interface ClassifyResult {
  tipo: string;
  motivazione: string;
}

const TITLE_SYSTEM = `Proponi un TITOLO breve per una nota.

Vincoli:
- DEVE catturare IL TEMA (di cosa parla), NON il primo statement.
- 3-7 parole, max 60 caratteri.
- Italiano, niente virgolette ne' punto finale.
- NON sintesi della posizione (es. "L'isolamento e' meglio") — la nota potrebbe avere posizioni opposte. Usa termini neutri (es. "Solitudine creativa").
- Per le tensioni, idealmente "X vs Y" o "X (tensione su Y)".

Rispondi SOLO con JSON valido, senza fence:
{"titolo": "<la tua proposta>"}`;

interface TitleProposal {
  titolo: string;
}

const PRESUPPOSTI_SYSTEM = `Sei l'assistente di Antinomia. Stai aiutando l'utente a mappare i PRESUPPOSTI di una tensione.

Una tensione ha statement A e statement B che si contraddicono. I PRESUPPOSTI sono le assunzioni epistemiche / metafisiche / di valore che A e B danno per scontate (spesso senza dirlo). Mapparli rende esplicito perche' A e B non possono convivere senza trade-off.

Vincoli:
- Italiano, conciso
- NON riformulare A e B — descrivi le ASSUNZIONI di base che li rendono possibili
- Esempi tipici di presupposto: "X e' l'autorita' epistemica primaria", "Y e' universale/contestuale", "Z e' separabile da W", "C e' un valore non negoziabile", "D e' misurabile/non misurabile"
- Una tensione puo' avere 1 o piu' presupposti per lato. Lista compatta o frase singola.
- Identifica i presupposti che, se cambiati, scioglierebbero la tensione.

Rispondi SOLO con JSON valido, senza commenti, senza fence markdown:
{"presupposizioniA": "<presupposti del lato A>", "presupposizioniB": "<presupposti del lato B>"}`;

interface PresuppostiFields {
  presupposizioniA?: string;
  presupposizioniB?: string;
}

const FREE_INPUT_SYSTEM = `Sei l'analista di Antinomia. L'utente ti da' un input grezzo (puo' essere una citazione, un'osservazione, un dubbio, una contraddizione, un singolo pensiero) e tu devi:

1. Determinare se e' una TENSIONE o un SUBSTRATE.
2. Estrarre i campi pertinenti.
3. Proporre un titolo neutro (3-7 parole).

Criteri:
- TENSIONE se l'input contiene o implica DUE posizioni in conflitto (anche solo abbozzate).
- SUBSTRATE se l'input e' materiale grezzo singolo (citazione, fatto, osservazione, aneddoto).

Per TENSIONE: statementA/statementB devono essere affermazioni complete, semanticamente incompatibili.
Per SUBSTRATE: contenuto preserva fedelmente l'input grezzo.

Rispondi SOLO con JSON valido, senza fence:
{"tipo": "tensione" | "substrate", "titolo": "...", "statementA": "...", "statementB": "...", "contenuto": "..."}

Per tensione lascia contenuto vuoto. Per substrate lascia statementA/statementB vuoti.`;

interface FreeInputAnalysis {
  tipo: "tensione" | "substrate";
  titolo: string;
  statementA: string;
  statementB: string;
  contenuto: string;
}

const PRINCIPLE_SYSTEM = `Sei l'assistente di Antinomia. Stai aiutando l'utente a trasformare una tensione (statement A vs statement B) in un principio operativo nella forma IF/THEN/GREY.

Cosa devi produrre:
- Identifica il CONTESTO in cui vince A e il CONTESTO in cui vince B (le due NON devono essere "A se vince A" — devono essere condizioni descrittive)
- Per ciascuno, formula l'ESITO (regola/azione/conclusione)
- GREY ZONE: casi limite dove A e B si toccano e la regola non basta. Puoi lasciare vuota se non viene niente di solido.

Vincoli:
- Italiano, conciso
- IF deve descrivere un contesto verificabile, non ripetere la tesi
- THEN deve essere operativo (cosa fare/concludere), non astratto
- Non risolvere la tensione "scegliendo un lato" — il principio deve assorbire entrambi i lati come casi

Rispondi SOLO con JSON valido, senza fence markdown:
{"ifA": "<contesto in cui vale A>", "thenA": "<esito A>", "ifB": "<contesto in cui vale B>", "thenB": "<esito B>", "greyZone": "<casi limite, puo' essere stringa vuota>"}`;

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
      new Notice("Generazione AI fermata.");
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
  const presupA = extract(/-\s*\*\*Presupposizioni A:\*\*\s*([^\n]*)/);
  const presupB = extract(/-\s*\*\*Presupposizioni B:\*\*\s*([^\n]*)/);

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
  header.setText("Tensione di origine");

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
  if (aOrig) mkRow("A (originale)", aOrig);
  if (bBase) mkRow("B", bBase);
  if (bOrig) mkRow("B (originale)", bOrig);
  if (presupA) mkRow("Presupposizioni A", presupA);
  if (presupB) mkRow("Presupposizioni B", presupB);

  // If absolutely nothing was extracted, show the whole body as fallback
  if (!aBase && !bBase && !presupA && !presupB) {
    const fallback = box.createEl("pre");
    fallback.style.whiteSpace = "pre-wrap";
    fallback.style.fontSize = "0.85em";
    fallback.style.margin = "0";
    fallback.setText(body.slice(0, 1000));
  }
}

const HUNTER_SYSTEM = `Sei il Contradiction Hunter di Antinomia.

IL TUO COMPITO: identificare COPPIE di note che si contraddicono.

COPPIE DA CONSIDERARE — ESAMINA TUTTE le combinazioni possibili tra le note inviate:
- tensione ↔ tensione
- tensione ↔ substrate
- **substrate ↔ substrate** (frequentemente ignorate, ma ALTRETTANTO IMPORTANTI)

Per N note ci sono N*(N-1)/2 coppie. Devi considerarle tutte prima di scartare quelle non contraddittorie.
NON privilegiare le tensioni rispetto ai substrate solo perche' sono "piu' polari": i substrate spesso contengono presupposti che entrano in conflitto tra loro o con tensioni esistenti.

CRUCIALE — NON devi:
- Suggerire risoluzioni o sintesi
- Spiegare come la contraddizione potrebbe essere risolta
- Proporre principi che la supererebbero
La risoluzione e' lavoro dell'utente. Tu IDENTIFICHI, lui RISOLVE.

Vale come contraddizione:
- Due note semanticamente incompatibili (A dice X, B dice non-X)
- Due note i cui PRESUPPOSTI sono incompatibili (anche se i temi superficiali differiscono)
- Una nota la cui pratica contraddice cio' che un'altra afferma
- Due substrate che assumono presupposti epistemici/valoriali in conflitto

NON vale:
- Note su temi diversi non incompatibili
- Differenze di tono/registro/lunghezza
- Una nota piu' dettagliata di un'altra
- Coppie deboli/forzate (se incerto, NON includere o usa confidence: bassa)
- Connessioni TEMATICHE deboli (entrambe parlano di "tempo" ma in modi diversi non opposti)
- Coppie dove devi INVENTARE un presupposto comune per giustificarle: non scrivere "una assume X mentre l'altra Y" se nessuna delle due dice quello esplicitamente

**PRECISIONE > RECALL**: meglio dire "nessuna contraddizione" che produrre coppie deboli. Lo scopo del Hunter e' farti vedere conflitti REALI, non darti l'illusione di profondita'.

**ESEMPI DI CONTRADDIZIONI VALIDE (frontali, sullo STESSO criterio):**
- A: "le decisioni di pancia sono affidabili, l'istinto raramente sbaglia" ↔ B: "i dati mostrano che le decisioni d'impulso hanno tasso di errore 3x superiore alle ponderate" → confidence alta, opposizione esplicita sullo stesso oggetto (qualita' delle decisioni intuitive).
- A: "il talento e' tutto, senza dono naturale resti mediocre" ↔ B: "la disciplina conta piu' del talento, l'impegno supera il predestinato pigro" → confidence alta, opposizione su quale fattore determina il successo.

**ESEMPI DA NON ACCOPPIARE:**
- Una nota su "produttivita' in ufficio" e una su "risparmio economico": temi diversi, non contraddizione.
- Una nota di promemoria operativo ("dormito male, riunione domani") con qualsiasi tensione: il promemoria non afferma una tesi.
- Due note che entrambe menzionano il "tempo" ma una parla di productivity-time e l'altra di philosophy-of-time: tema vicino, sostanza diversa.

Confidence:
- "alta" — contraddizione chiara, sui presupposti o esplicita
- "media" — esiste ma richiede interpretazione
- "bassa" — sospetto debole

Rispondi SOLO con JSON valido, senza fence:
{"contraddizioni": [{"nota_a": "<basename>", "nota_b": "<basename>", "descrizione": "<2-3 frasi sul COSA, non sul COME risolvere>", "confidence": "alta|media|bassa"}]}

Se nessuna: {"contraddizioni": []}`;

/**
 * Build the Hunter system prompt for a given style. "concise" appends a strict
 * "no reasoning exposed" constraint that typically speeds up the model 2-3x.
 * "verbose" leaves the base prompt as-is so the model can chain-of-thought.
 */
function buildHunterSystem(style: "concise" | "verbose"): string {
  if (style === "verbose") return HUNTER_SYSTEM;
  return (
    HUNTER_SYSTEM +
    `\n\nVincolo aggiuntivo: descrizione in 2-3 frasi MASSIMO, dritta al punto. NIENTE reasoning esposto, NIENTE frasi come "rivediamo", "consideriamo", "tuttavia, vediamo se", "sebbene... mentre...". Vai dritto alla conclusione finale sulla contraddizione.`
  );
}

type HunterConfidence = "alta" | "media" | "bassa";
interface HunterContradiction {
  nota_a: string;
  nota_b: string;
  descrizione: string;
  confidence?: HunterConfidence;
}
interface HunterResult {
  contraddizioni: HunterContradiction[];
}
interface HunterRunMetadata {
  timestamp: string;
  notesExamined: number;
  totalCandidates: number;
  truncated: boolean;
  durationMs: number;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
  dismissedFiltered: number;
}
interface HunterRun {
  meta: HunterRunMetadata;
  result: HunterResult;
}
const CONFIDENCE_ORDER: Record<HunterConfidence, number> = {
  alta: 0,
  media: 1,
  bassa: 2,
};
const CONFIDENCE_COLOR: Record<HunterConfidence, string> = {
  alta: "var(--color-green, #2ecc71)",
  media: "var(--color-yellow, #f1c40f)",
  bassa: "var(--color-orange, #e67e22)",
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
    contentEl.createEl("h3", { text: "Classificazione proposta" });
    contentEl.createEl("p", {
      text: `Tipo attuale: ${this.current || "(nessuno)"}`,
    });
    contentEl.createEl("p", { text: `Tipo proposto: ${this.proposed}` });
    contentEl.createEl("p").createEl("em", { text: this.motivazione });
    new Setting(contentEl)
      .addButton((b) =>
        b.setButtonText("Rifiuta").onClick(() => {
          this.onConfirm(false);
          this.close();
        })
      )
      .addButton((b) =>
        b
          .setButtonText("Applica")
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
    private onConfirm: (value: string | null) => void
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
    new Setting(contentEl)
      .addButton((b) =>
        b.setButtonText("Annulla").onClick(() => {
          this.onConfirm(null);
          this.close();
        })
      )
      .addButton((b) =>
        b
          .setButtonText("Salva")
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

interface DefeatedSubmit {
  motivo: string;
  sostituita_da: string | null;
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
    contentEl.createEl("h3", { text: "Archivia come defeated" });
    contentEl.createEl("p", { text: "Perche' e' stata sconfitta?" });

    let motivo = "falso_positivo";
    let sostituitaDa: string | null = null;

    // --- Motivo dropdown ---
    new Setting(contentEl).setName("Motivo").addDropdown((dd) => {
      dd.addOption("falso_positivo", "falso_positivo");
      dd.addOption("elevata", "elevata");
      dd.addOption("sconfitta_genuina", "sconfitta_genuina");
      dd.setValue(motivo);
      dd.onChange((v) => {
        motivo = v;
        renderSostituitaSection();
      });
    });

    // --- Sostituita_da picker (only shown when motivo == "elevata") ---
    const sostBlock = contentEl.createEl("div");
    sostBlock.style.marginBottom = "10px";

    const labelEl = contentEl.createEl("div");
    labelEl.style.fontSize = "0.85em";
    labelEl.style.opacity = "0.7";
    labelEl.style.marginBottom = "12px";

    const renderSostituitaSection = () => {
      sostBlock.empty();
      labelEl.setText("");
      if (motivo !== "elevata") return;

      new Setting(sostBlock)
        .setName("Sostituita da quale principio")
        .setDesc(
          "Scegli il principio che ha preso il posto di questa nota. Si chiude cosi' il ciclo tensione -> defeated -> principio nel grafo."
        )
        .addButton((b) => {
          b.setButtonText(
            sostituitaDa
              ? `Cambia (attuale: ${sostituitaDa})`
              : "Scegli principio..."
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
                return fm?.antinomia_tipo === TYPE.principle;
              },
              "Cerca un principio..."
            ).open();
          });
        });

      if (sostituitaDa) {
        labelEl.setText(`Sostituita da: [[${sostituitaDa}]]`);
      } else {
        labelEl.setText(
          "(Nessun principio selezionato — puoi salvare comunque, sostituita_da resta vuoto.)"
        );
      }
    };
    renderSostituitaSection();

    new Setting(contentEl)
      .addButton((b) =>
        b.setButtonText("Annulla").onClick(() => {
          this.result = null;
          this.close();
        })
      )
      .addButton((b) =>
        b
          .setButtonText("Archivia")
          .setCta()
          .onClick(() => {
            this.result = { motivo, sostituita_da: sostituitaDa };
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

interface TensionFields {
  titolo?: string;
  statementA?: string;
  statementB?: string;
}
function tensionTemplate(fields: TensionFields = {}): string {
  const date = todayISO();
  const titoloLine = fields.titolo
    ? `titolo: ${yamlQuote(fields.titolo)}`
    : "titolo:";
  const a = fields.statementA?.trim() ?? "";
  const b = fields.statementB?.trim() ?? "";
  return `---
antinomia_tipo: ${TYPE.tension}
${titoloLine}
stato: aperta
lingua_base: italiano
data_creazione: ${date}
data_modifica: ${date}
origine: input_utente
collegamenti: []
---
- **A (base):** ${a}
- **A (originale):**
- **B (base):** ${b}
- **B (originale):**
- **Presupposizioni A:**
- **Presupposizioni B:**
`;
}

interface SubstrateFields {
  titolo?: string;
  contenuto?: string;
}
function substrateTemplate(fields: SubstrateFields = {}): string {
  const date = todayISO();
  const titoloLine = fields.titolo
    ? `titolo: ${yamlQuote(fields.titolo)}`
    : "titolo:";
  const c = fields.contenuto?.trim() ?? "";
  return `---
antinomia_tipo: ${TYPE.substrate}
${titoloLine}
lingua_base: italiano
lingua_originale: italiano
fonte: input_utente
data: ${date}
---
- **Contenuto (base):** ${c}
- **Originale:**
`;
}

interface PrincipleFields {
  ifA?: string;
  thenA?: string;
  ifB?: string;
  thenB?: string;
  greyZone?: string;
}

/**
 * Build the principle body (the IF/THEN/GREY block) from optional fields.
 * If a field is empty, falls back to the original placeholder so the user
 * can still spot what's missing in the editor.
 */
function principleBodyTemplate(fields: PrincipleFields = {}): string {
  const ifA = fields.ifA?.trim() ?? "";
  const thenA = fields.thenA?.trim() ?? "";
  const ifB = fields.ifB?.trim() ?? "";
  const thenB = fields.thenB?.trim() ?? "";
  const grey = fields.greyZone?.trim() ?? "";

  const lineA =
    ifA || thenA
      ? `IF ${ifA || "[condizione A]"} -> ${thenA || "[esito X]"}`
      : "IF [condizione A] -> [esito X]";
  const lineB =
    ifB || thenB
      ? `IF ${ifB || "[condizione B]"} -> ${thenB || "[esito Y]"}`
      : "IF [condizione B] -> [esito Y]";

  return `- **${lineA}**
- **${lineB}**
- **GREY ZONE:** ${grey}
`;
}

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
    contentEl.createEl("h3", { text: "Eleva a principio" });
    const intro = contentEl.createEl("p");
    intro.style.fontSize = "0.9em";
    intro.style.opacity = "0.8";
    intro.setText(
      `Stai trasformando la tensione "${humanTitle(this.app, this.file)}" in un principio operativo. Compila i campi sotto: diventeranno il nuovo body. Il testo originale della tensione verra' conservato sotto la sezione "## Origine (tensione)".`
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

    mkLabel("IF — condizione A");
    mkHint("La condizione/contesto in cui vale l'esito A.");
    const ifAInput = mkInput((v) => (ifA = v));

    mkLabel("THEN — esito A");
    mkHint("La regola/azione/conclusione che vale nella condizione A.");
    const thenAInput = mkInput((v) => (thenA = v));

    mkLabel("IF — condizione B");
    mkHint("La condizione/contesto opposto (o complementare) ad A.");
    const ifBInput = mkInput((v) => (ifB = v));

    mkLabel("THEN — esito B");
    mkHint("La regola/azione/conclusione che vale nella condizione B.");
    const thenBInput = mkInput((v) => (thenB = v));

    mkLabel("GREY ZONE");
    mkHint(
      "Casi limite, ambigui, dove A e B si toccano. Lascia vuoto se non ti viene niente subito."
    );
    const greyTextarea = mkTextarea("60px", (v) => (greyZone = v));

    // ---- "Proponi IF/THEN (AI)" button ----
    const aiBtn = contentEl.createEl("button", {
      text: "Proponi IF/THEN (AI)",
    });
    aiBtn.style.marginTop = "10px";
    aiBtn.style.fontSize = "0.85em";
    aiBtn.style.padding = "4px 12px";
    aiBtn.style.cursor = "pointer";
    aiBtn.title =
      "Chiede al modello AI di proporre i 5 campi IF/THEN/GREY leggendo il testo della tensione.";
    aiBtn.onclick = async (e) => {
      e.preventDefault();
      const proposed = await withLoadingButton(
        aiBtn,
        "⏳ Generando...",
        async () => {
          const raw = await this.app.vault.read(this.file);
          const body = stripFrontmatter(raw).trim();
          const content =
            "Sto elevando questa tensione Antinomia a principio operativo IF/THEN/GREY. Ecco il testo della tensione:\n\n" +
            body;
          return await this.plugin.proposeIfThenFromContent(content);
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
        b.setButtonText("Annulla").onClick(() => {
          this.onSubmit(null, false);
          this.close();
        })
      )
      .addButton((b) =>
        b.setButtonText("Salta e usa template vuoto").onClick(() => {
          this.onSubmit(null, true);
          this.close();
        })
      )
      .addButton((b) =>
        b
          .setButtonText("Eleva")
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
      originalText: string
    ) => void,
    prefillText = ""
  ) {
    super(app);
    this.plugin = plugin;
    this.prefillText = prefillText;
  }
  onOpen(): void {
    const { contentEl } = this;
    contentEl.createEl("h3", { text: "Inserimento libero" });
    const intro = contentEl.createEl("p");
    intro.style.fontSize = "0.9em";
    intro.style.opacity = "0.8";
    intro.setText(
      "Scrivi quello che hai in mente, senza preoccuparti del tipo. L'AI capisce se e' una tensione o un substrate, estrae i campi e apre il modal corrispondente pre-compilato. Puoi sempre raffinare prima di salvare."
    );

    let testo = this.prefillText;

    const labelEl = contentEl.createEl("label", { text: "Testo grezzo" });
    labelEl.style.display = "block";
    labelEl.style.fontWeight = "bold";
    labelEl.style.marginTop = "10px";

    const hint = contentEl.createEl("div");
    hint.style.fontSize = "0.8em";
    hint.style.opacity = "0.6";
    hint.setText(
      "Una citazione, un'osservazione, un dubbio, una contraddizione che vedi, un singolo pensiero. Qualunque cosa: l'AI capisce."
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
        b.setButtonText("Annulla").onClick(() => {
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
              new Notice("Scrivi qualcosa prima di analizzare.");
              return;
            }
            const analysis = await withLoadingButton(
              b.buttonEl,
              "⏳ Analizzando...",
              () => this.plugin.analyzeFreeInput(t)
            );
            if (!analysis) return;
            this.close();
            this.onAnalyzed(analysis, t);
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
  constructor(
    app: App,
    plugin: AntinomiaPlugin,
    private onSubmit: (fields: TensionFields | null, skipped: boolean) => void,
    prefill: TensionFields = {}
  ) {
    super(app);
    this.plugin = plugin;
    this.prefill = prefill;
  }
  onOpen(): void {
    const { contentEl } = this;
    contentEl.createEl("h3", { text: "Nuova tensione" });
    const intro = contentEl.createEl("p");
    intro.style.fontSize = "0.9em";
    intro.style.opacity = "0.8";
    intro.setText(
      "Una tensione cattura una contraddizione tra due posizioni. Piu' sono incompatibili, piu' la tensione e' feconda. I presupposti li mapperai dopo, con calma."
    );

    let titolo = this.prefill.titolo ?? "";
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

    mkLabel("Titolo (opzionale)");
    mkHint(
      "3-7 parole, neutro (es. 'Solitudine creativa', 'Decisione: istinto vs dati')"
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
      text: "Proponi titolo (AI)",
    });
    aiBtn.style.marginTop = "6px";
    aiBtn.style.fontSize = "0.85em";
    aiBtn.style.padding = "3px 10px";
    aiBtn.style.cursor = "pointer";
    aiBtn.title =
      "Chiede al modello AI configurato di proporre un titolo dai due statement compilati.";
    aiBtn.onclick = async (e) => {
      e.preventDefault();
      const aTxt = statementA.trim();
      const bTxt = statementB.trim();
      if (!aTxt && !bTxt) {
        new Notice(
          "Compila almeno uno tra Statement A e B prima di chiedere un titolo."
        );
        return;
      }
      const content =
        "Sto creando una nuova tensione Antinomia con questi due statement (i presupposti non sono ancora mappati). Proponi un titolo neutro per il tema della tensione.\n\n" +
        `Statement A: ${aTxt || "(vuoto)"}\n\n` +
        `Statement B: ${bTxt || "(vuoto)"}`;
      const proposed = await withLoadingButton(
        aiBtn,
        "⏳ Generando...",
        () => this.plugin.proposeTitleFromContent(content)
      );
      if (proposed) {
        titleInput.value = proposed;
        titolo = proposed;
      }
    };

    mkLabel("Statement A");
    mkHint("La prima posizione, formulata in modo chiaro.");
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
      "La posizione opposta. Deve essere semanticamente incompatibile con A."
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
        b.setButtonText("Annulla").onClick(() => {
          this.onSubmit(null, false);
          this.close();
        })
      )
      .addButton((b) =>
        b.setButtonText("Salta e apri nota vuota").onClick(() => {
          this.onSubmit(null, true);
          this.close();
        })
      )
      .addButton((b) =>
        b
          .setButtonText("Crea")
          .setCta()
          .onClick(() => {
            this.onSubmit({ titolo, statementA, statementB }, false);
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
  constructor(
    app: App,
    plugin: AntinomiaPlugin,
    private onSubmit: (fields: SubstrateFields | null, skipped: boolean) => void,
    prefill: SubstrateFields = {}
  ) {
    super(app);
    this.plugin = plugin;
    this.prefill = prefill;
  }
  onOpen(): void {
    const { contentEl } = this;
    contentEl.createEl("h3", { text: "Nuovo substrate" });
    const intro = contentEl.createEl("p");
    intro.style.fontSize = "0.9em";
    intro.style.opacity = "0.8";
    intro.setText(
      "Un substrate e' materiale grezzo: una citazione, un fatto, un appunto. La materia prima da cui possono emergere tensioni e principi."
    );

    let titolo = this.prefill.titolo ?? "";
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

    mkLabel("Titolo (opzionale)");
    mkHint("Etichetta breve (es. 'Cit. Kahneman su bias di conferma').");
    const titleInput = contentEl.createEl("input", { type: "text" });
    titleInput.style.width = "100%";
    titleInput.style.padding = "6px";
    titleInput.style.marginTop = "4px";
    titleInput.value = titolo;
    titleInput.addEventListener("input", (e) => {
      titolo = (e.target as HTMLInputElement).value;
    });

    // ---- "Proponi titolo (AI)" button ----
    const aiBtn = contentEl.createEl("button", { text: "Proponi titolo (AI)" });
    aiBtn.style.marginTop = "6px";
    aiBtn.style.fontSize = "0.85em";
    aiBtn.style.padding = "3px 10px";
    aiBtn.style.cursor = "pointer";
    aiBtn.title =
      "Chiede al modello AI configurato di proporre un titolo dal contenuto compilato.";
    aiBtn.onclick = async (e) => {
      e.preventDefault();
      const cTxt = contenuto.trim();
      if (!cTxt) {
        new Notice("Compila il contenuto prima di chiedere un titolo.");
        return;
      }
      const content =
        "Sto creando un nuovo substrate Antinomia (materiale grezzo: citazione, fatto, appunto). Proponi un titolo neutro che identifichi l'oggetto, non lo riassuma.\n\n" +
        `Contenuto: ${cTxt}`;
      const proposed = await withLoadingButton(
        aiBtn,
        "⏳ Generando...",
        () => this.plugin.proposeTitleFromContent(content)
      );
      if (proposed) {
        titleInput.value = proposed;
        titolo = proposed;
      }
    };

    mkLabel("Contenuto");
    mkHint("La citazione, il fatto, l'osservazione. Senza interpretarla.");
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
        b.setButtonText("Annulla").onClick(() => {
          this.onSubmit(null, false);
          this.close();
        })
      )
      .addButton((b) =>
        b.setButtonText("Salta e apri nota vuota").onClick(() => {
          this.onSubmit(null, true);
          this.close();
        })
      )
      .addButton((b) =>
        b
          .setButtonText("Crea")
          .setCta()
          .onClick(() => {
            this.onSubmit({ titolo, contenuto }, false);
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
 * Picker over all PDF files in the vault. Used by `openSubstrateFromPDF`.
 */
class PdfPickerModal extends FuzzySuggestModal<TFile> {
  private pdfs: TFile[];
  private onChoose: (file: TFile) => void;
  constructor(app: App, pdfs: TFile[], onChoose: (file: TFile) => void) {
    super(app);
    this.pdfs = pdfs;
    this.onChoose = onChoose;
    this.setPlaceholder("Cerca un PDF nel vault...");
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
    this.setPlaceholder(placeholder ?? "Cerca una nota da collegare...");
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
      text: `Mappa presupposti: ${humanTitle(this.app, this.file)}`,
    });
    const intro = contentEl.createEl("p");
    intro.style.fontSize = "0.9em";
    intro.style.opacity = "0.8";
    intro.setText(
      `Identifica le assunzioni epistemiche/metafisiche/valoriali che A e B danno per scontate. Mapparli rende esplicito perche' la tensione non si dissolve da sola.`
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

    mkLabel("Presupposizioni A");
    mkHint("Le assunzioni di base che rendono il lato A possibile.");
    const aTextarea = contentEl.createEl("textarea");
    aTextarea.style.width = "100%";
    aTextarea.style.padding = "6px";
    aTextarea.style.marginTop = "4px";
    aTextarea.style.minHeight = "70px";
    aTextarea.value = presupA;
    aTextarea.addEventListener("input", (e) => {
      presupA = (e.target as HTMLTextAreaElement).value;
    });

    mkLabel("Presupposizioni B");
    mkHint("Le assunzioni di base che rendono il lato B possibile.");
    const bTextarea = contentEl.createEl("textarea");
    bTextarea.style.width = "100%";
    bTextarea.style.padding = "6px";
    bTextarea.style.marginTop = "4px";
    bTextarea.style.minHeight = "70px";
    bTextarea.value = presupB;
    bTextarea.addEventListener("input", (e) => {
      presupB = (e.target as HTMLTextAreaElement).value;
    });

    // ---- "Proponi presupposti (AI)" button ----
    const aiBtn = contentEl.createEl("button", {
      text: "Proponi presupposti (AI)",
    });
    aiBtn.style.marginTop = "10px";
    aiBtn.style.fontSize = "0.85em";
    aiBtn.style.padding = "4px 12px";
    aiBtn.style.cursor = "pointer";
    aiBtn.title =
      "Chiede al modello AI di proporre i due campi leggendo il testo della tensione.";
    aiBtn.onclick = async (e) => {
      e.preventDefault();
      const proposed = await withLoadingButton(
        aiBtn,
        "⏳ Generando...",
        async (signal) => {
          const raw = await this.app.vault.read(this.file);
          const body = stripFrontmatter(raw).trim();
          const content =
            "Mappa i presupposti epistemici/valoriali della seguente tensione Antinomia:\n\n" +
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
        b.setButtonText("Annulla").onClick(() => {
          this.onSubmit(null);
          this.close();
        })
      )
      .addButton((b) =>
        b
          .setButtonText("Applica")
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
 * Clicking a leaf-level entry (Dashboard, Grafo, Audit) replaces the
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
  mkMenuBtn("📝 Note ▾", (m) => {
    m.addItem((i) =>
      i.setTitle("Tensioni aperte").setIcon("git-pull-request")
        .onClick(() => goTo(VIEW_TYPE_OPEN_TENSIONS))
    );
    m.addItem((i) =>
      i.setTitle("Substrate").setIcon("layers")
        .onClick(() => goTo(VIEW_TYPE_SUBSTRATE_LIST))
    );
    m.addItem((i) =>
      i.setTitle("Principi").setIcon("compass")
        .onClick(() => goTo(VIEW_TYPE_PRINCIPLES_LIST))
    );
    m.addItem((i) =>
      i.setTitle("Defeated archive").setIcon("archive")
        .onClick(() => goTo(VIEW_TYPE_DEFEATED_LIST))
    );
    m.addSeparator();
    m.addItem((i) =>
      i.setTitle("Note non classificate").setIcon("help-circle")
        .onClick(() => goTo(VIEW_TYPE_UNCLASSIFIED))
    );
  });

  // -- Hunter (submenu)
  mkMenuBtn("🔍 Hunter ▾", (m) => {
    m.addItem((i) =>
      i.setTitle("Risultati Hunter").setIcon("search")
        .onClick(() => goTo(VIEW_TYPE_HUNTER_RESULTS))
    );
    m.addItem((i) =>
      i.setTitle("Falsi positivi").setIcon("eye-off")
        .onClick(() => goTo(VIEW_TYPE_DISMISSED_PAIRS))
    );
    m.addSeparator();
    m.addItem((i) =>
      i.setTitle("Esegui Hunter ora").setIcon("play")
        .onClick(() => void plugin.runHunter())
    );
  });

  // -- Crea (submenu)
  mkMenuBtn("➕ Crea ▾", (m) => {
    m.addItem((i) =>
      i.setTitle("Nuova tensione (guidata)").setIcon("git-pull-request")
        .onClick(() => {
          new NewTensionModal(plugin.app, plugin, (fields, skipped) => {
            if (fields === null && !skipped) return;
            const content = fields ? tensionTemplate(fields) : tensionTemplate();
            void plugin.createNote("T", content);
          }).open();
        })
    );
    m.addItem((i) =>
      i.setTitle("Nuovo substrate (guidato)").setIcon("layers")
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
      i.setTitle("Inserimento libero (AI classifica)").setIcon("sparkles")
        .onClick(() => new FreeInputModal(plugin.app, plugin).open())
    );
    m.addItem((i) =>
      i.setTitle("Substrate da clipboard").setIcon("clipboard")
        .onClick(() => void plugin.openFreeInputFromClipboard())
    );
    m.addItem((i) =>
      i.setTitle("Substrate da PDF").setIcon("file")
        .onClick(() => void plugin.openSubstrateFromPDF())
    );
    m.addItem((i) =>
      i.setTitle("Substrate da YouTube").setIcon("youtube")
        .onClick(() => void plugin.openSubstrateFromYouTube())
    );
  });

  // -- Grafo (custom)
  mkBtn("🕸 Grafo", () => goTo(VIEW_TYPE_GRAPH));

  // -- Audit
  mkBtn("🩺 Audit", () => goTo(VIEW_TYPE_AUDIT));

  // -- Guida (submenu)
  mkMenuBtn("❓ Guida ▾", (m) => {
    m.addItem((i) =>
      i.setTitle("Checklist iniziale").setIcon("list-checks")
        .onClick(() => goTo(VIEW_TYPE_ONBOARDING))
    );
    m.addItem((i) =>
      i.setTitle("Tutorial concetti").setIcon("book-open")
        .onClick(() => new TutorialModal(plugin.app, plugin).open())
    );
    m.addItem((i) =>
      i.setTitle("Welcome (riavvia)").setIcon("hand")
        .onClick(() => new WelcomeModal(plugin.app, plugin).open())
    );
    m.addSeparator();
    m.addItem((i) =>
      i.setTitle("Dimmi come procedere").setIcon("compass")
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
  settingsBtn.title = "Apri impostazioni Antinomia";
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
    return "Antinomia — tensioni aperte";
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
    container.createEl("h4", { text: "Tensioni aperte" });

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
        "Suggerimento: ogni tensione e' una card con bottoni rapidi (Titolo / Collega / Presupposti / ↑ Eleva / ✓ Risolta / × Defeated). Click sul titolo per aprire la nota. In cima alla sidebar i 4 bottoni di toolbar: '+ Tensione', '+ Substrate', '✨ Libero' (AI classifica), '🔍 Hunter'."
      );
      const dismissBtn = hint.createEl("button", { text: "Capito" });
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

    const newTBtn = toolbar.createEl("button", { text: "+ Nuova tensione" });
    newTBtn.style.padding = "4px 10px";
    newTBtn.style.fontSize = "0.85em";
    newTBtn.style.cursor = "pointer";
    newTBtn.style.fontWeight = "600";
    newTBtn.title = "Crea una nuova tensione (modal guidato)";
    newTBtn.onclick = () => {
      new NewTensionModal(this.app, this.plugin, (fields, skipped) => {
        if (fields === null && !skipped) return;
        const content = fields ? tensionTemplate(fields) : tensionTemplate();
        void this.plugin.createNote("T", content);
      }).open();
    };

    const newSBtn = toolbar.createEl("button", { text: "+ Nuovo substrate" });
    newSBtn.style.padding = "4px 10px";
    newSBtn.style.fontSize = "0.85em";
    newSBtn.style.cursor = "pointer";
    newSBtn.title = "Crea un nuovo substrate (modal guidato)";
    newSBtn.onclick = () => {
      new NewSubstrateModal(this.app, this.plugin, (fields, skipped) => {
        if (fields === null && !skipped) return;
        const content = fields ? substrateTemplate(fields) : substrateTemplate();
        void this.plugin.createNote("S", content);
      }).open();
    };

    const freeBtn = toolbar.createEl("button", { text: "✨ Libero" });
    freeBtn.style.padding = "4px 10px";
    freeBtn.style.fontSize = "0.85em";
    freeBtn.style.cursor = "pointer";
    freeBtn.style.fontWeight = "600";
    freeBtn.title =
      "Inserimento libero: scrivi qualunque cosa, l'AI capisce se e' tensione o substrate";
    freeBtn.onclick = () => this.plugin.openFreeInputModal();

    const clipBtn = toolbar.createEl("button", { text: "📋 Clipboard" });
    clipBtn.style.padding = "4px 10px";
    clipBtn.style.fontSize = "0.85em";
    clipBtn.style.cursor = "pointer";
    clipBtn.title = "Apre 'Inserimento libero' con il testo della clipboard gia' incollato: l'AI classifica come tensione o substrate.";
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
      "Lancia il Contradiction Hunter (scansiona tensioni aperte + substrate, identifica coppie contraddittorie)";
    hunterBtn.onclick = () => {
      void this.plugin.runHunter();
    };

    const open = this.app.vault.getMarkdownFiles().filter((f) => {
      const fm = this.app.metadataCache.getFileCache(f)?.frontmatter;
      return fm?.antinomia_tipo === TYPE.tension && fm?.stato === "aperta";
    });
    if (open.length === 0) {
      container.createEl("p", { text: "Nessuna tensione aperta. Crea la prima qui sopra." });
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

      mkBtn("Titolo", "Imposta o modifica il titolo della nota", () => {
        void this.plugin.setTitleOnActiveNote(file);
      });
      mkBtn("Collega", "Collega questa tensione a un'altra nota", () => {
        new NotePickerModal(this.plugin.app, file, (target) => {
          void this.plugin.linkActiveTo(file, target);
        }).open();
      });
      mkBtn("Presupposti", "Mappa i presupposti A/B (con aiuto AI)", () => {
        void this.plugin.openMapPresupposti(file);
      });
      const elBtn = mkBtn(
        "↑ Eleva",
        "Eleva a principio (apre form IF/THEN/GREY)",
        () => {
          void this.plugin.openElevateModal(file);
        }
      );
      elBtn.style.borderLeft = "2px solid var(--interactive-accent)";

      mkBtn("✓ Risolta", "Marca questa tensione come risolta", () => {
        void this.plugin.markResolved(file);
      });
      mkBtn("× Defeated", "Archivia come defeated (apre modal motivo)", () => {
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
      "⚠ Spunti riflessivi, non verita'. L'AI puo' allucinare. Non usare per decidere in situazioni reali."
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
        "Suggerimento: il Hunter scansiona tensioni aperte + substrate, e propone COPPIE contraddittorie. Non risolve. Confidence alta/media/bassa, ordinate per qualita'. × dismissa un falso positivo (persistente). Sotto ogni coppia, bottoni Eleva/Risolta/Defeated agiscono direttamente sulla nota di una delle due."
      );
      const dismissBtn = hint.createEl("button", { text: "Capito" });
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
      text: isLoading ? "Hunter in corso..." : "Esegui Hunter",
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
        "Ferma il Hunter in corso. (La richiesta HTTP non viene interrotta ma il risultato sara' scartato.)";
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
        text: "Nessuna scansione ancora. Premi 'Esegui Hunter' o usa Ctrl+P.",
      });
      return;
    }

    const meta = this.currentRun.meta;
    const metaEl = container.createEl("p");
    metaEl.style.fontSize = "0.85em";
    metaEl.style.opacity = "0.7";
    let metaTxt = `${meta.timestamp} — esaminate ${meta.notesExamined}/${meta.totalCandidates} note in ${meta.durationMs}ms con ${meta.model}`;
    if (meta.inputTokens !== undefined)
      metaTxt += ` (${meta.inputTokens}->${meta.outputTokens} tok)`;
    if (meta.dismissedFiltered > 0)
      metaTxt += ` — ${meta.dismissedFiltered} coppie nascoste perche' gia' dismessas`;
    metaEl.setText(metaTxt);
    if (meta.truncated) {
      const warn = container.createEl("p");
      warn.style.color = "var(--text-warning, orange)";
      warn.setText(
        `Escluse ${meta.totalCandidates - meta.notesExamined} note (oltre il limite).`
      );
    }

    const items = this.currentRun.result.contraddizioni;
    if (items.length === 0) {
      container.createEl("p", {
        text: "Nessuna contraddizione rilevata in questo run.",
      });
      return;
    }

    const sorted = [...items].sort((a, b) => {
      const ca = CONFIDENCE_ORDER[a.confidence ?? "media"];
      const cb = CONFIDENCE_ORDER[b.confidence ?? "media"];
      if (ca !== cb) return ca - cb;
      return a.nota_a.localeCompare(b.nota_a);
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

      const confidence = c.confidence ?? "media";
      const badge = headerLine.createEl("span", { text: confidence });
      badge.style.fontSize = "0.7em";
      badge.style.padding = "1px 6px";
      badge.style.borderRadius = "8px";
      badge.style.background = CONFIDENCE_COLOR[confidence];
      badge.style.color = "white";
      badge.style.fontWeight = "bold";
      badge.title = `Confidence: ${confidence}`;

      this.appendNoteLink(headerLine, c.nota_a);
      headerLine.appendText(" ⟷ ");
      this.appendNoteLink(headerLine, c.nota_b);

      const dismissBtn = headerLine.createEl("button", { text: "×" });
      dismissBtn.style.marginLeft = "auto";
      dismissBtn.style.padding = "0 6px";
      dismissBtn.style.cursor = "pointer";
      dismissBtn.title = "Marca come falso positivo.";
      dismissBtn.onclick = async () => {
        await this.plugin.dismissContradiction(c.nota_a, c.nota_b);
        if (this.currentRun) {
          this.currentRun.result.contraddizioni =
            this.currentRun.result.contraddizioni.filter(
              (x) =>
                !(
                  (x.nota_a === c.nota_a && x.nota_b === c.nota_b) ||
                  (x.nota_a === c.nota_b && x.nota_b === c.nota_a)
                )
            );
          this.render();
        }
      };

      const desc = li.createEl("p");
      desc.style.marginTop = "4px";
      desc.style.fontStyle = "italic";
      desc.setText(c.descrizione);

      // ---- Per-note action rows (rendered only if the note exists) ----
      this.appendActionRow(li, c.nota_a);
      this.appendActionRow(li, c.nota_b);
    }
  }

  /**
   * Compact row of action buttons targeting a single note in a contradiction
   * pair. Buttons shown depend on the note's antinomia_tipo:
   *   - tensione (aperta): ↑ Eleva, ✓ Risolta, × Defeated
   *   - tensione (chiusa) / principio / substrate: × Defeated
   *   - other / missing: nothing
   */
  private appendActionRow(parent: HTMLElement, basename: string): void {
    const file = this.findFileByBasename(basename);
    if (!file) return;
    const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
    const t = fm?.antinomia_tipo;
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

    const isOpenTension = t === TYPE.tension && fm?.stato === "aperta";
    if (isOpenTension) {
      mkBtn("↑ Eleva", "Eleva a principio (apre form IF/THEN/GREY)", () => {
        void this.plugin.openElevateModal(file);
      });
      mkBtn("✓ Risolta", "Marca come risolta", () => {
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
    container.createEl("h4", { text: "Falsi positivi del Hunter" });

    const desc = container.createEl("p");
    desc.style.fontSize = "0.85em";
    desc.style.opacity = "0.7";
    desc.setText(
      "Coppie marcate come falso positivo (via × nella sidebar Hunter). Non verranno piu' riproposte. Clicca 'Reincludi' per rimuovere il dismiss e farle riapparire ai prossimi run."
    );

    // Collect all dismissed pairs. Stored as `hunter_falsi_positivi: [basename, ...]`
    // in the frontmatter of the alphabetically smaller-basename note.
    interface Pair {
      ownerFile: TFile;
      ownerBasename: string;
      otherBasename: string;
    }
    const pairs: Pair[] = [];
    for (const f of this.app.vault.getMarkdownFiles()) {
      const fm = this.app.metadataCache.getFileCache(f)?.frontmatter;
      const list = fm?.hunter_falsi_positivi;
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
        text: "Nessun falso positivo registrato.",
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

  mkBtn("Titolo", "Imposta o modifica il titolo", () => {
    void plugin.setTitleOnActiveNote(file);
  });
  if (options.showCollega !== false) {
    mkBtn("Collega", "Collega questa nota a un'altra", () => {
      new NotePickerModal(app, file, (target) => {
        void plugin.linkActiveTo(file, target);
      }).open();
    });
  }
  if (options.showDefeated) {
    mkBtn("× Defeated", "Archivia come defeated (apre modal motivo)", () => {
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
    const newBtn = toolbar.createEl("button", { text: "+ Nuovo substrate" });
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
      return fm?.antinomia_tipo === TYPE.substrate;
    });
    items.sort((a, b) => b.stat.mtime - a.stat.mtime);

    if (items.length === 0) {
      container.createEl("p", {
        text: "Nessun substrate. Materiale grezzo (citazioni, fatti, appunti) che pu\u00f2 generare tensioni.",
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
    container.createEl("h4", { text: "Principi (Truth Archive)" });

    const desc = container.createEl("p");
    desc.style.fontSize = "0.85em";
    desc.style.opacity = "0.7";
    desc.setText(
      "Regole operative IF/THEN/GREY emerse dalla risoluzione delle tensioni."
    );

    const items = this.app.vault.getMarkdownFiles().filter((f) => {
      const fm = this.app.metadataCache.getFileCache(f)?.frontmatter;
      return fm?.antinomia_tipo === TYPE.principle;
    });
    items.sort((a, b) => b.stat.mtime - a.stat.mtime);

    if (items.length === 0) {
      container.createEl("p", {
        text: "Nessun principio attivo. Eleva una tensione risolta per crearne uno.",
      });
      return;
    }
    for (const file of items) {
      renderNoteCard(container, this.app, this.plugin, file, {
        showCollega: true,
        showDefeated: true,
        extraInfo: (card, fm) => {
          const origin = fm?.origine_tensione;
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
      "Convinzioni sconfitte. Memoria storica: non si toccano, restano come traccia di cosa NON era vero."
    );

    const items = this.app.vault.getMarkdownFiles().filter((f) => {
      const fm = this.app.metadataCache.getFileCache(f)?.frontmatter;
      return fm?.antinomia_tipo === TYPE.defeated;
    });
    items.sort((a, b) => b.stat.mtime - a.stat.mtime);

    if (items.length === 0) {
      container.createEl("p", { text: "Nessuna convinzione defeated." });
      return;
    }
    for (const file of items) {
      renderNoteCard(container, this.app, this.plugin, file, {
        showCollega: true,
        showDefeated: false, // already defeated, can't re-defeat
        extraInfo: (card, fm) => {
          const motivo = fm?.motivo;
          const sost = fm?.sostituita_da;
          const meta = card.createEl("div");
          meta.style.fontSize = "0.78em";
          meta.style.opacity = "0.7";
          meta.style.marginBottom = "4px";
          const parts: string[] = [];
          if (typeof motivo === "string") parts.push(`motivo: ${motivo}`);
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
      return fm?.antinomia_tipo === type;
    }).length;
  }

  private firstFileByType(type: string): TFile | null {
    return (
      this.app.vault.getMarkdownFiles().find((f) => {
        const fm = this.app.metadataCache.getFileCache(f)?.frontmatter;
        return fm?.antinomia_tipo === type;
      }) ?? null
    );
  }

  private hasAnyPresupposti(): boolean {
    return this.app.vault.getMarkdownFiles().some((f) => {
      const fm = this.app.metadataCache.getFileCache(f)?.frontmatter;
      if (fm?.antinomia_tipo !== TYPE.tension) return false;
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
      return fm?.antinomia_tipo === TYPE.tension;
    });
    const key = tensions.map((f) => f.path + f.stat.mtime).join("|");
    if (key !== this.lastScannedKey) {
      this.lastScannedKey = key;
      this.presuppostiDetected = false;
      void Promise.all(
        tensions.map(async (f) => {
          try {
            const raw = await this.app.vault.cachedRead(f);
            // Match "**Presupposizioni A:**" followed by non-empty content
            if (
              /\*\*Presupposizioni A:\*\*\s+\S/.test(raw) ||
              /\*\*Presupposizioni B:\*\*\s+\S/.test(raw)
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
    container.createEl("h4", { text: "Guida iniziale" });

    const intro = container.createEl("p");
    intro.style.fontSize = "0.85em";
    intro.style.opacity = "0.7";
    intro.setText(
      "Step suggeriti per esplorare Antinomia. La spunta appare automaticamente quando li completi. Puoi chiudere questa sidebar in qualsiasi momento — la riapri da Impostazioni o dalla palette."
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
        label: "Crea la tua prima tensione",
        desc: "Una contraddizione tra due posizioni A e B che ti pungola.",
        done: tensions >= 1,
        actionLabel: "Crea tensione",
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
        label: "Crea il tuo primo substrate",
        desc: "Materiale grezzo: una citazione, un fatto, un appunto.",
        done: substrates >= 1,
        actionLabel: "Crea substrate",
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
        label: "Prova l'inserimento libero (✨ AI)",
        desc: "Scrivi un pensiero qualsiasi: l'AI capisce se e' tensione o substrate ed estrae i campi.",
        done: s.hasUsedFreeInput,
        actionLabel: "Apri",
        action: () => this.plugin.openFreeInputModal(),
      },
      {
        id: "presupposti",
        label: "Mappa i presupposti di una tensione",
        desc: "Rendi espliciti gli assunti epistemici/valoriali che A e B danno per scontato.",
        done: hasPresup,
        actionLabel: "Mappa",
        action: () => {
          const file = this.firstFileByType(TYPE.tension);
          if (!file) {
            new Notice(
              "Prima crea almeno una tensione (step 1)."
            );
            return;
          }
          void this.plugin.openMapPresupposti(file);
        },
      },
      {
        id: "hunter",
        label: "Lancia il tuo primo Hunter",
        desc: "Scansiona il vault per trovare contraddizioni anche tra note non collegate.",
        done: s.hasRunHunter,
        actionLabel: "Hunter",
        action: () => {
          const candidates = tensions + substrates;
          if (candidates < 2) {
            new Notice(
              "Servono almeno 2 note tra tensioni aperte e substrate per il Hunter."
            );
            return;
          }
          void this.plugin.runHunter();
        },
      },
      {
        id: "elevate",
        label: "Eleva una tensione a principio",
        desc: "Trasforma una tensione in una regola operativa IF/THEN/GREY (anche l'AI puo' proporre).",
        done: principles >= 1,
        actionLabel: "Eleva",
        action: () => {
          const file = this.firstFileByType(TYPE.tension);
          if (!file) {
            new Notice("Prima crea almeno una tensione.");
            return;
          }
          void this.plugin.openElevateModal(file);
        },
      },
      {
        id: "explore",
        label: "Esplora le altre sidebar",
        desc: "Apri 'lista substrate', 'lista principi' o 'lista defeated archive' per vedere il tuo vault per layer.",
        done: s.hasOpenedListSidebar,
        actionLabel: "Apri liste",
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
        "🎉 Hai completato l'onboarding! Da qui in poi e' lavoro vero."
      );
    }
  }
}

const VIEW_TYPE_UNCLASSIFIED = "antinomia-unclassified";

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
    return "Antinomia — dashboard";
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
        return fm?.antinomia_tipo === t;
      });
    const tensions = byType(TYPE.tension);
    const openTensions = tensions.filter((f) => {
      const fm = this.app.metadataCache.getFileCache(f)?.frontmatter;
      return fm?.stato === "aperta";
    });
    const resolvedTensions = tensions.filter((f) => {
      const fm = this.app.metadataCache.getFileCache(f)?.frontmatter;
      return fm?.stato === "risolta";
    });
    const substrates = byType(TYPE.substrate);
    const principles = byType(TYPE.principle);
    const defeated = byType(TYPE.defeated);
    const meta = byType(TYPE.meta);
    const unclassified = files.filter((f) => {
      const fm = this.app.metadataCache.getFileCache(f)?.frontmatter;
      return !fm || !fm.antinomia_tipo;
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
      "Tensioni aperte",
      openTensions.length,
      () => void this.plugin.activateViewExternal(VIEW_TYPE_OPEN_TENSIONS),
      `${tensions.length} totali, ${resolvedTensions.length} risolte`
    );
    counter(
      "Substrate",
      substrates.length,
      () => void this.plugin.activateViewExternal(VIEW_TYPE_SUBSTRATE_LIST)
    );
    counter(
      "Principi",
      principles.length,
      () => void this.plugin.activateViewExternal(VIEW_TYPE_PRINCIPLES_LIST)
    );
    counter(
      "Defeated",
      defeated.length,
      () => void this.plugin.activateViewExternal(VIEW_TYPE_DEFEATED_LIST)
    );
    if (meta.length > 0) {
      counter("Meta-note", meta.length);
    }
    if (unclassified.length > 0) {
      counter(
        "Non classificate",
        unclassified.length,
        () => void this.plugin.activateViewExternal(VIEW_TYPE_UNCLASSIFIED),
        "da classificare"
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
      line.setText(`Ultimo run: ${s.lastHunterRunISO}`);
      const count = hunterInfo.createEl("div");
      count.style.fontWeight = "600";
      count.setText(`Coppie trovate: ${s.lastHunterRunCount}`);
    } else {
      hunterInfo.setText("Hunter non ancora eseguito.");
    }

    // ---- Active profile ----
    container.createEl("h5", { text: "Profilo AI" });
    const profInfo = container.createEl("div");
    profInfo.style.padding = "8px 10px";
    profInfo.style.background = "var(--background-secondary)";
    profInfo.style.borderRadius = "4px";
    profInfo.style.fontSize = "0.85em";
    profInfo.style.marginBottom = "14px";
    const activeP = this.plugin.activeProfile();
    profInfo.createEl("div", {
      text: `Attivo: ${activeP.name} (${activeP.model})`,
    });
    if (s.hunterProfileId) {
      const hp = s.profiles.find((p) => p.id === s.hunterProfileId);
      if (hp)
        profInfo.createEl("div", {
          text: `Override Hunter: ${hp.name} (${hp.model})`,
        });
    }

    // ---- Recent activity ----
    container.createEl("h5", { text: "Attivita' recente" });
    const recent = [...files]
      .filter((f) => {
        const fm = this.app.metadataCache.getFileCache(f)?.frontmatter;
        return fm?.antinomia_tipo;
      })
      .sort((a, b) => b.stat.mtime - a.stat.mtime)
      .slice(0, 5);
    if (recent.length === 0) {
      container.createEl("p", {
        text: "Nessuna nota Antinomia ancora.",
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
    container.createEl("h5", { text: "Azioni rapide" });
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
    mkAct("✨ Libero", () => this.plugin.openFreeInputModal(), true);
    mkAct("+ Tensione", () => {
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
    mkAct("🕸 Grafo", () =>
      void this.plugin.activateViewExternal(VIEW_TYPE_GRAPH)
    );
    mkAct("Audit", () =>
      void this.plugin.activateViewExternal(VIEW_TYPE_AUDIT)
    );
    mkAct("Guida", () => new GuidanceModal(this.app, this.plugin).open());
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
    return "Antinomia — audit";
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
      return fm?.antinomia_tipo;
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
    container.createEl("h4", { text: "Audit del vault" });

    const desc = container.createEl("p");
    desc.style.fontSize = "0.85em";
    desc.style.opacity = "0.7";
    desc.setText(
      "Report di salute: note Antinomia incomplete o malformate. Clicca un'issue per aprire la nota e sistemarla."
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
      const tipo = fm?.antinomia_tipo;
      if (!tipo) continue;
      const body = this.bodyCache.get(f.path) ?? "";

      // No title (frontmatter `titolo` missing/empty AND no first heading)
      const explicitTitle =
        typeof fm?.titolo === "string" && (fm.titolo as string).trim();
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
          /-\s*\*\*Presupposizioni A:\*\*\s*([^\n]*)/
        );
        const presupB = hasContentAfter(
          body,
          /-\s*\*\*Presupposizioni B:\*\*\s*([^\n]*)/
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
        if (!fm?.motivo) {
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
        title: "Tensioni senza statement A",
        issues: cat.tensionMissingA,
        suggestion: "Apri e compila il campo 'A (base):'.",
      },
      {
        title: "Tensioni senza statement B",
        issues: cat.tensionMissingB,
        suggestion: "Apri e compila il campo 'B (base):'.",
      },
      {
        title: "Tensioni senza presupposti mappati",
        issues: cat.tensionNoPresupposti,
        suggestion:
          "Usa il bottone 'Presupposti' sulla card della tensione (anche AI propone).",
      },
      {
        title: "Principi col template IF/THEN/GREY non compilato",
        issues: cat.principleNoIfThen,
        suggestion:
          "Il principio ha ancora '[condizione A]' / '[esito X]' come placeholder. Vai a compilarli.",
      },
      {
        title: "Defeated senza motivo",
        issues: cat.defeatedNoMotivo,
        suggestion:
          "Apri la nota e aggiungi il campo 'motivo:' nel frontmatter (falso_positivo / elevata / sconfitta_genuina).",
      },
      {
        title: "Note senza titolo umano",
        issues: cat.noTitle,
        suggestion:
          "Usa 'Antinomia: imposta titolo nota' o aggiungi 'titolo:' nel frontmatter.",
      },
    ];

    const totalIssues = sections.reduce((sum, s) => sum + s.issues.length, 0);
    const summary = container.createEl("p");
    summary.style.fontWeight = "600";
    summary.style.marginBottom = "10px";
    if (totalIssues === 0) {
      summary.style.color = "var(--text-success, var(--text-accent))";
      summary.setText("✅ Nessuna issue trovata. Vault in salute.");
      return;
    }
    summary.setText(`${totalIssues} issue totali in ${sections.filter((s) => s.issues.length > 0).length} categorie.`);

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
 * `antinomia_tipo` (and is not flagged `antinomia_ignora`). For each one, the
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
    return "Antinomia — non classificate";
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
    container.createEl("h4", { text: "Note non classificate" });

    const desc = container.createEl("p");
    desc.style.fontSize = "0.85em";
    desc.style.opacity = "0.7";
    desc.setText(
      "Note del vault senza antinomia_tipo. Utile per migrare un vault esistente: classifica una per una manualmente o con AI. 'Ignora' aggiunge antinomia_ignora: true (non riapparira'). I file in trash sono esclusi."
    );

    const all = this.app.vault.getMarkdownFiles();
    const items = all.filter((f) => {
      const fm = this.app.metadataCache.getFileCache(f)?.frontmatter;
      if (fm?.antinomia_tipo) return false;
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
        `Mostrate le prime ${MAX} di ${items.length}. Classificale (o ignorale) per veder comparire le successive.`
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

      mkBtn("Tensione", "Marca come tensione (aggiunge antinomia_tipo)", () =>
        void this.plugin.markAsType(file, TYPE.tension)
      );
      mkBtn("Substrate", "Marca come substrate", () =>
        void this.plugin.markAsType(file, TYPE.substrate)
      );
      mkBtn("Principio", "Marca come principio", () =>
        void this.plugin.markAsType(file, TYPE.principle)
      );
      mkBtn("Defeated", "Marca come defeated", () =>
        void this.plugin.markAsType(file, TYPE.defeated)
      );
      mkBtn("Meta", "Marca come meta_nota", () =>
        void this.plugin.markAsType(file, TYPE.meta)
      );
      mkBtn("AI", "Classifica con AI (chiede conferma)", () =>
        void this.plugin.classifyActiveNoteExternal(file)
      );
      mkBtn(
        "Ignora",
        "Aggiungi antinomia_ignora: true (la nota sparisce da questa lista)",
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

interface GraphFilters {
  tensione_aperta: boolean;
  tensione_risolta: boolean;
  tensione_elevata: boolean;
  substrate: boolean;
  principio: boolean;
  defeated: boolean;
  meta_nota: boolean;
}

const DEFAULT_GRAPH_FILTERS: GraphFilters = {
  tensione_aperta: true,
  tensione_risolta: true,
  tensione_elevata: true,
  substrate: true,
  principio: true,
  defeated: true,
  meta_nota: true,
};

const LAYER_COLORS: Record<string, string> = {
  tensione_aperta: "#ff8c42",   // arancione caldo
  tensione_risolta: "#fbc02d",  // giallo
  tensione_elevata: "#4caf50",  // verde (gia\' diventata principio nello stesso file)
  substrate: "#9aa0a6",         // grigio
  principio: "#2e7d32",         // verde scuro
  defeated: "#e53935",          // rosso
  meta_nota: "#7e57c2",         // viola
  unknown: "#607d8b",
};

// Tutti pallini — il colore basta per identificare il layer (vs Obsidian default style)
const LAYER_SHAPES: Record<string, string> = {
  tensione_aperta: "ellipse",
  tensione_risolta: "ellipse",
  tensione_elevata: "ellipse",
  substrate: "ellipse",
  principio: "ellipse",
  defeated: "ellipse",
  meta_nota: "ellipse",
  unknown: "ellipse",
};

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
      };
    };

    mkChk("tensione_aperta", "Tensioni aperte", "tensione_aperta");
    mkChk("tensione_risolta", "Risolte", "tensione_risolta");
    mkChk("tensione_elevata", "Elevate", "tensione_elevata");
    mkChk("substrate", "Substrate", "substrate");
    mkChk("principio", "Principi", "principio");
    mkChk("defeated", "Defeated", "defeated");
    mkChk("meta_nota", "Meta", "meta_nota");

    // Spacer
    const spacer = toolbar.createDiv();
    spacer.style.flex = "1";

    // Layout dropdown
    const layoutSel = toolbar.createEl("select");
    layoutSel.style.padding = "2px 4px";
    [
      ["clusters", "Clusters per layer"],
      ["fcose", "Force-directed libero"],
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

    const resetBtn = toolbar.createEl("button", { text: "Reset filtri" });
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
    slider.style.cssText =
      "writing-mode:bt-lr; -webkit-appearance:slider-vertical; appearance:slider-vertical; " +
      "width:8px; height:160px; cursor:pointer; pointer-events:auto;";
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
      const t = fm?.antinomia_tipo;
      if (t === TYPE.tension) {
        const stato = fm?.stato;
        if (stato === "elevata") return "tensione_elevata";
        if (stato === "risolta") return "tensione_risolta";
        return "tensione_aperta";
      }
      if (t === TYPE.substrate) return "substrate";
      if (t === TYPE.principle) return "principio";
      if (t === TYPE.defeated) return "defeated";
      if (t === TYPE.meta_nota) return "meta_nota";
      return null;
    };

    const colorKey = (key: keyof GraphFilters): string => {
      const map: Record<string, string> = {
        tensione_aperta: "tensione_aperta",
        tensione_risolta: "tensione_risolta",
        tensione_elevata: "tensione_elevata",
        substrate: "substrate",
        principio: "principio",
        defeated: "defeated",
        meta_nota: "meta_nota",
      };
      return map[String(key)] || "unknown";
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
      nodes.push({
        data: {
          id: f.basename,
          label: shortLabel,
          fullTitle: title,
          layer: key,
          color: this.activeLayerColor(ck),
          shape: LAYER_SHAPES[ck] || "ellipse",
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
      // ID semantico stabile (no sequenziale) cosi' il diff funziona
      // tra rebuild consecutivi anche quando aggiungi/togli elementi.
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

      // origine_tensione: scalar "[[X]]"
      const origine = extractBasenameFromWikilink(fm.origine_tensione);
      if (origine) addEdge(f.basename, origine, "origine");

      // sostituita_da: scalar "[[X]]"
      const sost = extractBasenameFromWikilink(fm.sostituita_da);
      if (sost) addEdge(f.basename, sost, "sostituita");

      // collegamenti: array of "[[X]]"
      if (Array.isArray(fm.collegamenti)) {
        for (const c of fm.collegamenti) {
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
        "Nessuna nota corrisponde ai filtri attivi. Attiva piu' layer in alto."
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
            "background-color": "data(color)",
            shape: "ellipse",
            label: "data(label)",
            color: TEXT_MUTED,
            "font-size": "10px",
            "font-weight": 400,
            "text-valign": "bottom",
            "text-halign": "center",
            "text-margin-y": 6,
            "text-wrap": "ellipsis",
            "text-max-width": "120px",
            "min-zoomed-font-size": 8,
            width: 18,
            height: 18,
            "border-width": 0,
            "transition-property":
              "opacity, text-opacity, background-color, border-color, border-width",
            "transition-duration": 250,
            "transition-timing-function": "ease-out",
          },
        },
        {
          selector: "edge",
          style: {
            width: 0.8,
            "line-color": C.edge,
            "curve-style": "bezier",
            "transition-property": "opacity, line-color, width",
            "transition-duration": 250,
            "transition-timing-function": "ease-out",
          },
        },
        {
          selector: 'edge[kind = "origine"]',
          style: {
            "line-color": "rgba(76,175,80,0.45)",
            width: 1.2,
          },
        },
        {
          selector: 'edge[kind = "sostituita"]',
          style: {
            "line-color": "rgba(229,57,53,0.45)",
            width: 1.2,
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
        // Hover: nodi/edge non vicini si sbiadiscono (come Obsidian default)
        {
          selector: ".faded",
          style: {
            opacity: 0.35,
            "text-opacity": 0.25,
          },
        },
        {
          selector: "node.highlight",
          style: {
            "border-width": 2,
            "border-color": ACCENT,
            color: TEXT_NORMAL,
            "font-weight": 600,
          },
        },
        {
          selector: "edge.highlight",
          style: {
            width: 1.8,
            "line-color": ACCENT,
          },
        },
      ],
      layout: { name: "preset" }, // placeholder; we'll apply real layout below
      userZoomingEnabled: false, // gestiamo lo zoom a mano per il raddoppio per step
      minZoom: 0.02,
      maxZoom: 8,
      zoom: 1.0,
    });

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
      const neighborhood = node.closedNeighborhood();
      this.cy.batch(() => {
        this.cy.elements().addClass("faded");
        neighborhood.removeClass("faded").addClass("highlight");
      });
    });
    this.cy.on("mouseout", "node", () => {
      if (this.graphContainer) this.graphContainer.title = "";
      if (!this.cy) return;
      this.cy.batch(() => {
        this.cy.elements().removeClass("faded highlight");
      });
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
    const SPRING_K = 0.012;   // attrazione lungo edge
    const IDEAL_LEN = 55;     // distanza target lungo edge (dimezzata)
    const GRAVITY = 0.002;    // gravita' al centro piu' forte per cluster compatti
    const DAMPING = 0.86;     // smorzamento velocita'
    const MAX_SPEED = 3.5;

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
      arr.forEach((n: any) => {
        if (n.grabbed()) {
          const v = this.velocities.get(n.id())!;
          v.vx = 0;
          v.vy = 0;
          return;
        }
        const v = this.velocities.get(n.id())!;
        const f = forces.get(n.id())!;
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
      return {
        name: "fcose",
        animate: true,
        animationDuration: 1000,
        nodeRepulsion: 8000,
        idealEdgeLength: 120,
        edgeElasticity: 0.45,
        nodeSeparation: 80,
        gravity: 0.25,
        gravityRangeCompound: 1.5,
        gravityCompound: 1.0,
        gravityRange: 3.8,
        packComponents: true,
        randomize: true,
        fit: true,
        padding: 50,
        quality: "default",
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
    this.cy.layout(this.layoutOptions()).run();
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
   * Contradiction Hunter: scansiona tensioni aperte + substrate, manda al
   * modello, parsea coppie contraddittorie, filtra falsi positivi gia'
   * dismissati, salva ultimo run nei settings, mostra in HunterResultsView.
   * Supporta cancellazione via Stop button (AbortController).
   */
  async runHunter(): Promise<void> {
    const profile = this.profileFor("hunter");
    if (!profile.apiKey) {
      new Notice("API key mancante nel profilo Hunter (o nell'attivo). Impostazioni -> Antinomia.");
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
      const t = fm?.antinomia_tipo;
      const isOpenTension = t === TYPE.tension && fm?.stato === "aperta";
      const isSubstrate = t === TYPE.substrate;
      if (isOpenTension || isSubstrate) candidates.push(f);
    }
    if (candidates.length < 2) {
      new Notice(`Hunter: servono almeno 2 note. Trovate: ${candidates.length}.`);
      return;
    }
    candidates.sort((a, b) => b.stat.mtime - a.stat.mtime);
    const cap = this.settings.hunterMaxNotes;
    const truncated = candidates.length > cap;
    const selected = candidates.slice(0, cap);

    // Conta tipi per il prompt (cosi' il modello sa quante substrate ci sono)
    let nTensions = 0, nSubstrates = 0;
    for (const f of selected) {
      const fm = this.app.metadataCache.getFileCache(f)?.frontmatter;
      if (fm?.antinomia_tipo === TYPE.tension) nTensions++;
      else if (fm?.antinomia_tipo === TYPE.substrate) nSubstrates++;
    }

    const bodyLimit = this.settings.hunterNoteBodyLimit;
    const noteBlocks: string[] = [];
    for (const f of selected) {
      const raw = await this.app.vault.read(f);
      const fm = this.app.metadataCache.getFileCache(f)?.frontmatter;
      const body = stripFrontmatter(raw).trim();
      const truncBody = body.length > bodyLimit ? body.slice(0, bodyLimit) + "..." : body;
      const tipo = fm?.antinomia_tipo || "?";
      noteBlocks.push(`### ${f.basename} [${tipo}]\n${truncBody}`);
    }
    const nTotal = selected.length;
    const userContent =
      `Analizza queste ${nTotal} note Antinomia (${nTensions} tensioni, ${nSubstrates} substrate) ` +
      `e identifica coppie contraddittorie. ESAMINA TUTTE le ${(nTotal * (nTotal - 1)) / 2} coppie possibili, ` +
      `incluse substrate-substrate. Rispondi SOLO con JSON conforme allo schema.\n\n` +
      noteBlocks.join("\n\n");

    await this.activateView(VIEW_TYPE_HUNTER_RESULTS);
    const hunterLeaf = this.app.workspace.getLeavesOfType(VIEW_TYPE_HUNTER_RESULTS)[0];
    const hunterView =
      hunterLeaf && hunterLeaf.view instanceof HunterResultsView
        ? hunterLeaf.view
        : null;

    new Notice(`Hunter: invio ${selected.length} note (${nTensions}T + ${nSubstrates}S)...${truncated ? " (troncate)" : ""}`);
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
        maxTokens: 2048,
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
        new Notice("Hunter fermato dall'utente.");
        console.log("[Antinomia] hunter aborted by user");
      } else {
        new Notice(`Hunter errore: ${(e as Error).message}`);
        console.error("[Antinomia] hunter call failed", e);
      }
      return;
    }
    hunterView?.setLoading(false);
    this.hunterAbortController = null;
    const durationMs = Date.now() - t0;

    const parsed = extractJson<HunterResult>(result.text);
    if (!parsed || !Array.isArray(parsed.contraddizioni)) {
      console.error("[Antinomia] hunter unparseable:", result.text);
      new Notice("Hunter: risposta non parseable. Vedi console.");
      return;
    }

    // Validazione anti-hallucinazione: scarta basename inventati, self-pair, descrizioni vuote
    const realBasenames = new Set(selected.map((f) => f.basename));
    let halluFiltered = 0;
    const validated = parsed.contraddizioni.filter((c) => {
      const a = String(c.nota_a || "").trim();
      const b = String(c.nota_b || "").trim();
      const desc = String(c.descrizione || "").trim();
      if (!a || !b || a === b) { halluFiltered++; return false; }
      if (!desc || desc === "undefined") { halluFiltered++; return false; }
      if (!realBasenames.has(a) || !realBasenames.has(b)) {
        halluFiltered++;
        console.warn("[Antinomia] hunter: scartata coppia con basename inesistenti:", a, "<->", b);
        return false;
      }
      return true;
    });
    if (halluFiltered > 0) {
      console.log(`[Antinomia] hunter: filtrate ${halluFiltered} coppie hallucinate/invalide`);
    }

    // Filtra falsi positivi gia' dismissati
    const dismissedSet = new Set<string>();
    for (const f of selected) {
      const fm = this.app.metadataCache.getFileCache(f)?.frontmatter;
      const fp = fm?.hunter_falsi_positivi;
      if (Array.isArray(fp)) {
        for (const peer of fp) {
          const key = [f.basename, String(peer)].sort().join("|");
          dismissedSet.add(key);
        }
      }
    }
    let dismissedFiltered = 0;
    const filtered = validated.filter((c) => {
      const key = [c.nota_a, c.nota_b].sort().join("|");
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
    const run: HunterRun = { meta, result: { contraddizioni: filtered } };

    this.settings.lastHunterRunISO = meta.timestamp;
    this.settings.lastHunterRunCount = filtered.length;
    void this.saveSettings();

    hunterView?.setRun(run);
    new Notice(`Hunter: ${filtered.length} coppie in ${(durationMs / 1000).toFixed(1)}s.`);
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

    // Auto-open Dashboard + Graph on startup if their settings are on.
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

    this.addRibbonIcon("git-pull-request", "Antinomia: tensioni aperte", () =>
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

    // ---- Creation (guided + bypass) ----
    this.addCommand({
      id: "new-tension",
      name: "nuova tensione",
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
      name: "nuova tensione (vuota, senza modal)",
      callback: () => this.createNote("T", tensionTemplate()),
    });
    this.addCommand({
      id: "new-substrate",
      name: "nuovo substrate",
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
      name: "nuovo substrate (vuoto, senza modal)",
      callback: () => this.createNote("S", substrateTemplate()),
    });
    this.addCommand({
      id: "free-input",
      name: "inserimento libero (AI classifica)",
      callback: () => this.openFreeInputModal(),
    });
    this.addCommand({
      id: "free-input-from-clipboard",
      name: "inserimento libero da clipboard (AI classifica)",
      callback: () => void this.openFreeInputFromClipboard(),
    });
    this.addCommand({
      id: "substrate-from-pdf",
      name: "substrate da PDF (linka un PDF del vault)",
      callback: () => void this.openSubstrateFromPDF(),
    });
    this.addCommand({
      id: "substrate-from-youtube",
      name: "substrate da YouTube (scarica trascrizione)",
      callback: () => void this.openSubstrateFromYouTube(),
    });
    this.addCommand({
      id: "setup-attachments-folder",
      name: "configura cartella allegati (attachments/)",
      callback: () => void this.setupAttachmentsFolder(),
    });
    this.addCommand({
      id: "list-open-tensions",
      name: "lista tensioni aperte",
      callback: () => this.activateView(VIEW_TYPE_OPEN_TENSIONS),
    });

    // ---- Layer transitions ----
    this.addCommand({
      id: "elevate-to-principle",
      name: "eleva tensione a principio",
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        if (!file) return false;
        const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
        if (fm?.antinomia_tipo !== TYPE.tension) return false;
        if (!checking) void this.openElevateModal(file);
        return true;
      },
    });
    this.addCommand({
      id: "mark-resolved",
      name: "marca tensione come risolta",
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        if (!file) return false;
        const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
        if (fm?.antinomia_tipo !== TYPE.tension || fm?.stato !== "aperta")
          return false;
        if (!checking) void this.markResolved(file);
        return true;
      },
    });
    this.addCommand({
      id: "archive-as-defeated",
      name: "archivia come defeated",
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        if (!file) return false;
        const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
        const t = fm?.antinomia_tipo;
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
      name: "classifica nota attiva (AI)",
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        if (!file || file.extension !== "md") return false;
        if (!checking) void this.classifyActiveNote(file);
        return true;
      },
    });
    this.addCommand({
      id: "hunt-contradictions",
      name: "cerca contraddizioni (Hunter)",
      callback: () => this.runHunter(),
    });
    this.addCommand({
      id: "list-dismissed-pairs",
      name: "lista falsi positivi del Hunter",
      callback: () => this.activateView(VIEW_TYPE_DISMISSED_PAIRS),
    });
    this.addCommand({
      id: "migrate-existing-principles",
      name: "migra principi esistenti (genera defeated retroattivi)",
      callback: () => void this.migrateExistingPrinciples(),
    });
    this.addCommand({
      id: "create-defeated-for-orphan-principle",
      name: "crea defeated origine per principio orfano",
      callback: () => {
        const all = this.app.vault.getMarkdownFiles();
        const orphans = all.filter((f) => {
          const fm = this.app.metadataCache.getFileCache(f)?.frontmatter;
          if (fm?.antinomia_tipo !== TYPE.principle) return false;
          const ot = fm?.origine_tensione;
          if (typeof ot !== "string") return true;
          const m = ot.match(/\[\[([^\]|]+)/);
          if (!m) return true;
          const refBase = m[1].split("/").pop() || m[1];
          const refFile = all.find((f2) => f2.basename === refBase);
          if (!refFile) return true;
          const refFm = this.app.metadataCache.getFileCache(refFile)?.frontmatter;
          return refFm?.antinomia_tipo !== TYPE.defeated;
        });
        if (orphans.length === 0) {
          new Notice("Nessun principio orfano nel vault.");
          return;
        }
        const dummy = all.find((f) => {
          const fm = this.app.metadataCache.getFileCache(f)?.frontmatter;
          return fm?.antinomia_tipo !== TYPE.principle;
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
      name: "unisci due defeated in uno (caso B)",
      callback: () => {
        const all = this.app.vault.getMarkdownFiles();
        const defs = all.filter((f) => {
          const fm = this.app.metadataCache.getFileCache(f)?.frontmatter;
          return fm?.antinomia_tipo === TYPE.defeated;
        });
        if (defs.length < 2) {
          new Notice("Servono almeno 2 defeated nel vault.");
          return;
        }
        const dummy = all.find((f) => {
          const fm = this.app.metadataCache.getFileCache(f)?.frontmatter;
          return fm?.antinomia_tipo !== TYPE.defeated;
        }) ?? defs[0];
        const isDefeated = (f: TFile): boolean => {
          const fm = this.app.metadataCache.getFileCache(f)?.frontmatter;
          return fm?.antinomia_tipo === TYPE.defeated;
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
      name: "apri grafo Antinomia (custom)",
      callback: () => this.activateView(VIEW_TYPE_GRAPH, "tab"),
    });
    this.addCommand({
      id: "list-substrate",
      name: "lista substrate",
      callback: () => this.activateView(VIEW_TYPE_SUBSTRATE_LIST),
    });
    this.addCommand({
      id: "list-principles",
      name: "lista principi",
      callback: () => this.activateView(VIEW_TYPE_PRINCIPLES_LIST),
    });
    this.addCommand({
      id: "list-defeated",
      name: "lista defeated archive",
      callback: () => this.activateView(VIEW_TYPE_DEFEATED_LIST),
    });
    this.addCommand({
      id: "show-onboarding-checklist",
      name: "apri guida iniziale (checklist)",
      callback: () => this.activateView(VIEW_TYPE_ONBOARDING),
    });
    this.addCommand({
      id: "show-dashboard",
      name: "apri dashboard",
      callback: () => this.activateView(VIEW_TYPE_DASHBOARD),
    });
    this.addCommand({
      id: "show-audit",
      name: "audit vault (report di salute)",
      callback: () => this.activateView(VIEW_TYPE_AUDIT),
    });
    this.addCommand({
      id: "show-unclassified",
      name: "importa vault esistente (note non classificate)",
      callback: () => this.activateView(VIEW_TYPE_UNCLASSIFIED),
    });

    // ---- Graph / collegamenti ----
    this.addCommand({
      id: "link-active-note-to",
      name: "collega questa nota a...",
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
      name: "imposta titolo nota",
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        if (!file || file.extension !== "md") return false;
        if (!checking) void this.setTitleOnActiveNote(file);
        return true;
      },
    });
    this.addCommand({
      id: "show-welcome",
      name: "mostra welcome (riavvia onboarding)",
      callback: () => {
        new WelcomeModal(this.app, this).open();
      },
    });
    this.addCommand({
      id: "show-tutorial",
      name: "tutorial concetti chiave",
      callback: () => {
        new TutorialModal(this.app).open();
      },
    });
    this.addCommand({
      id: "guidance-next-step",
      name: "dimmi come procedere (suggerimento contestuale)",
      callback: () => {
        new GuidanceModal(this.app, this).open();
      },
    });
    this.addCommand({
      id: "create-example-notes",
      name: "crea vault di esempio (3 tensioni + 2 substrate)",
      callback: () => {
        new ConfirmModal(
          this.app,
          "Crea vault di esempio",
          "Verranno create 5 note marcate come esempio (prefisso 'ESEMPIO -' nel titolo, flag antinomia_esempio: true). Cancellabili in 1 click col comando 'cancella esempi'.",
          "Crea",
          () => void this.createExampleNotes()
        ).open();
      },
    });
    this.addCommand({
      id: "delete-example-notes",
      name: "cancella esempi (note marcate antinomia_esempio)",
      callback: () => {
        const count = this.app.vault.getMarkdownFiles().filter((f) => {
          const fm = this.app.metadataCache.getFileCache(f)?.frontmatter;
          return fm?.antinomia_esempio === true;
        }).length;
        if (count === 0) {
          new Notice("Nessuna nota di esempio nel vault.");
          return;
        }
        new ConfirmModal(
          this.app,
          "Cancella esempi",
          `Verranno cancellate ${count} note marcate antinomia_esempio: true. Vanno nel cestino di Obsidian (recuperabili).`,
          "Cancella",
          () => void this.deleteExampleNotes()
        ).open();
      },
    });
    this.addCommand({
      id: "propose-title-ai",
      name: "proponi titolo (AI)",
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        if (!file || file.extension !== "md") return false;
        if (!checking) void this.proposeTitleAI(file);
        return true;
      },
    });

    this.addCommand({
      id: "map-presupposti",
      name: "mappa presupposti (AI)",
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        if (!file) return false;
        const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
        if (fm?.antinomia_tipo !== TYPE.tension) return false;
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
    new Notice(`Test ${profile.name} (${profile.baseUrl}) ...`);
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
      new Notice(`Test fallito: ${(e as Error).message}`);
    }
  }

  /**
   * Create a small example vault: 3 tensions + 2 substrate, all with
   * `antinomia_esempio: true` so they can be wiped in one go via
   * `deleteExampleNotes()`.
   */
  async createExampleNotes(): Promise<void> {
    await ensureFolder(this.app, FOLDER.notes);
    const today = todayISO();
    const stamp = () => moment().format("YYYYMMDD-HHmmss");

    const tensionTpl = (
      titolo: string,
      a: string,
      b: string,
      presupA = "",
      presupB = ""
    ) => `---
antinomia_tipo: ${TYPE.tension}
titolo: ${yamlQuote(titolo)}
stato: aperta
lingua_base: italiano
data_creazione: ${today}
data_modifica: ${today}
origine: esempio
antinomia_esempio: true
collegamenti: []
---
- **A (base):** ${a}
- **A (originale):**
- **B (base):** ${b}
- **B (originale):**
- **Presupposizioni A:** ${presupA}
- **Presupposizioni B:** ${presupB}
`;

    const substrateTpl = (titolo: string, contenuto: string) => `---
antinomia_tipo: ${TYPE.substrate}
titolo: ${yamlQuote(titolo)}
lingua_base: italiano
lingua_originale: italiano
fonte: esempio
data: ${today}
antinomia_esempio: true
---
- **Contenuto (base):** ${contenuto}
- **Originale:**
`;

    const items: Array<{ prefix: string; content: string }> = [
      {
        prefix: "T",
        content: tensionTpl(
          "ESEMPIO - Solitudine creativa vs correzione sociale",
          "Il lavoro creativo profondo richiede solitudine prolungata. La presenza altrui diluisce l'intuizione e spinge verso il conformismo.",
          "La condivisione continua con altri corregge gli errori e impedisce ai pensieri di girare a vuoto. Da solo si finisce per confermare i propri pregiudizi.",
          "L'individuo isolato accede a una fonte di sapere migliore di quella sociale.",
          "Il pensiero individuale, senza correzione esterna, tende sistematicamente all'errore."
        ),
      },
      {
        prefix: "T",
        content: tensionTpl(
          "ESEMPIO - Processi codificati vs giudizio esperto",
          "Per ridurre il rischio servono processi, checklist, regole codificate. L'eccezionalita' individuale e' l'inizio della catastrofe.",
          "Le decisioni davvero importanti sfuggono ai processi. Nei momenti critici contano il giudizio, l'esperienza diretta, l'eccezione consapevole alla regola.",
          "La conoscenza rilevante deve essere centralizzata e codificata in regole per essere sicura.",
          "La conoscenza locale e tacita degli esperti non e' codificabile e va lasciata operare."
        ),
      },
      {
        prefix: "T",
        content: tensionTpl(
          "ESEMPIO - Apprendimento: pratica vs teoria",
          "L'apprendimento vero avviene solo facendo. La teoria senza pratica e' inerte; si capisce davvero qualcosa solo quando si sbaglia provandola.",
          "L'esperienza non guidata da una struttura teorica ripete gli stessi errori. Chi pratica senza capire diventa piu' rapido ma non piu' profondo.",
          "L'esperienza diretta e' la fonte primaria di conoscenza affidabile.",
          "La struttura teorica precede e organizza l'esperienza; senza di essa, la pratica e' cieca."
        ),
      },
      {
        prefix: "S",
        content: substrateTpl(
          "ESEMPIO - Cit. Kahneman sull'isolamento",
          "Studi mostrano che in isolamento il cervello amplifica i bias di conferma: le proprie convinzioni si rafforzano senza correzione. La discussione con un peer riduce gli errori di valutazione di circa il 40%."
        ),
      },
      {
        prefix: "S",
        content: substrateTpl(
          "ESEMPIO - Cit. Hayek su ordine spontaneo",
          "L'ordine spontaneo del mercato emerge dall'azione decentralizzata di milioni di agenti che inseguono i propri fini con conoscenza locale e parziale, non dal disegno centralizzato di un pianificatore che pretende di conoscere il tutto."
        ),
      },
    ];

    let created = 0;
    for (const it of items) {
      const id = `${it.prefix}-${stamp()}`;
      const path = `${FOLDER.notes}/${id}.md`;
      try {
        await this.app.vault.create(path, it.content);
        created++;
        // tiny pause so timestamps differ
        await new Promise((r) => setTimeout(r, 1100));
      } catch (e) {
        console.error("[Antinomia] example create failed", e);
      }
    }
    new Notice(
      `Esempi creati: ${created} note (3 tensioni + 2 substrate). Cancellabili con 'cancella esempi'.`
    );
    await this.activateView(VIEW_TYPE_OPEN_TENSIONS);
  }

  /**
   * Delete every note flagged with `antinomia_esempio: true` in frontmatter.
   */
  async deleteExampleNotes(): Promise<void> {
    const toDelete = this.app.vault.getMarkdownFiles().filter((f) => {
      const fm = this.app.metadataCache.getFileCache(f)?.frontmatter;
      return fm?.antinomia_esempio === true;
    });
    if (toDelete.length === 0) {
      new Notice("Nessuna nota di esempio trovata.");
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
    new Notice(`Cancellate ${deleted} note di esempio.`);
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
        "Clipboard vuota o non leggibile. Apro il modal libero vuoto: puoi incollare manualmente (Ctrl+V)."
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
      `Letti ${clip.length} caratteri. L'AI classifichera' come tensione o substrate.`
    );

    // Route through FreeInputModal so the AI decides tipo (tension/substrate)
    new FreeInputModal(
      this.app,
      this,
      (analysis, originalText) => {
        if (analysis.tipo === "tensione") {
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
              titolo: analysis.titolo,
              statementA: analysis.statementA,
              statementB: analysis.statementB,
            }
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
              titolo: analysis.titolo,
              contenuto: analysis.contenuto || originalText,
            }
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
        new Notice(`Cartella '${folder}/' creata.`);
      } else {
        new Notice(`Cartella '${folder}/' esiste gia'.`);
      }
    } catch (e) {
      console.error("[Antinomia] createFolder attachments failed", e);
      new Notice(`Errore creazione cartella: ${(e as Error).message}`);
      return;
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const vaultAny = this.app.vault as any;
      if (typeof vaultAny.setConfig === "function") {
        vaultAny.setConfig("attachmentFolderPath", folder);
        new Notice(
          `Nuovi allegati salveranno in '${folder}/'. (Impostazione Obsidian aggiornata.)`
        );
      } else {
        new Notice(
          `Cartella '${folder}/' pronta. Per renderla default, vai in Impostazioni Obsidian → File e collegamenti → 'Cartella predefinita per nuovi allegati' → seleziona '${folder}'.`
        );
      }
    } catch (e) {
      console.error("[Antinomia] setConfig attachmentFolderPath failed", e);
      new Notice(
        `Cartella creata ma non sono riuscito a impostarla come default. Configurala manualmente in Impostazioni Obsidian → File e collegamenti.`
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
          c.createEl("h3", { text: "Substrate da YouTube" });
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
              b.setButtonText("Annulla").onClick(() => {
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

    new Notice("Tentativo fetch automatico trascrizione YouTube...");
    const result = await fetchYouTubeTranscript(url);

    if (result) {
      // Auto-fetch success
      new Notice(
        `Trascrizione scaricata: ${result.text.length} caratteri (lingua: ${result.lang}).`
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
        { titolo: titoloSuggerito, contenuto: contenutoIniziale }
      ).open();
      return;
    }

    // ---- Auto-fetch failed: paste-assisted fallback ----
    const videoId = extractYouTubeId(url) ?? "video";
    const fallbackModal = new Modal(this.app);
    fallbackModal.onOpen = () => {
      const c = fallbackModal.contentEl;
      c.createEl("h3", { text: "Fetch automatico fallito" });
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
        .setName("Apri servizio esterno")
        .addButton((b) =>
          b
            .setButtonText("Apri youtubetotranscript.com")
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
          b.setButtonText("Annulla").onClick(() => fallbackModal.close())
        )
        .addButton((b) =>
          b
            .setButtonText("Crea substrate")
            .setCta()
            .onClick(() => {
              const txt = pasted.trim();
              if (!txt) {
                new Notice("Incolla la trascrizione prima di salvare.");
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
                { titolo: titoloSuggerito, contenuto: contenutoIniziale }
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
    if (fm0?.antinomia_tipo !== TYPE.tension) {
      new Notice("Eleva: la nota attiva non e' una tensione.");
      return;
    }
    let rawElev = "";
    try {
      rawElev = await this.app.vault.read(file);
    } catch (e) {
      new Notice(`Errore lettura: ${(e as Error).message}`);
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
   * `hunter_falsi_positivi`. Se l'array diventa vuoto, rimuove il campo.
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
        const arr = fm.hunter_falsi_positivi;
        if (!Array.isArray(arr)) return;
        const filtered = arr.filter((x: any) => String(x) !== peer);
        if (filtered.length !== arr.length) {
          modified = true;
          if (filtered.length === 0) delete fm.hunter_falsi_positivi;
          else fm.hunter_falsi_positivi = filtered;
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
    if (fm?.antinomia_tipo !== TYPE.tension) {
      new Notice("Mappa presupposti: la nota attiva non e' una tensione.");
      return;
    }
    let raw = "";
    try {
      raw = await this.app.vault.read(file);
    } catch (e) {
      new Notice(`Errore lettura: ${(e as Error).message}`);
      return;
    }
    // Pre-fill: prima frontmatter, poi fallback al body "**Presupposizioni A:** ..."
    let existingA: string =
      typeof fm?.presupposizioniA === "string" ? fm.presupposizioniA : "";
    let existingB: string =
      typeof fm?.presupposizioniB === "string" ? fm.presupposizioniB : "";
    if (!existingA) {
      const m = raw.match(/\*\*Presupposizioni A:\*\*\s*([^\n]*)/);
      if (m && m[1].trim() && !m[1].includes("[da mappare]")) {
        existingA = m[1].trim();
      }
    }
    if (!existingB) {
      const m = raw.match(/\*\*Presupposizioni B:\*\*\s*([^\n]*)/);
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
  async openSubstrateFromPDF(): Promise<void> {
    const pdfs = this.app.vault.getFiles().filter((f) => f.extension === "pdf");
    if (pdfs.length === 0) {
      new Notice(
        "Nessun PDF nel vault. Trascina un PDF in Obsidian per importarlo, poi riprova."
      );
      return;
    }
    new PdfPickerModal(this.app, pdfs, (pdf) => {
      const titoloSuggerito = `Note di lettura — ${pdf.basename}`;
      const contenutoIniziale = `> Vedi PDF: [[${pdf.basename}]]\n\n(Aggiungi qui i tuoi appunti / citazioni / osservazioni dalla lettura.)`;
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
        { titolo: titoloSuggerito, contenuto: contenutoIniziale }
      ).open();
    }).open();
  }

  openFreeInputModal(): void {
    new FreeInputModal(this.app, this, (analysis, originalText) => {
      if (analysis.tipo === "tensione") {
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
            titolo: analysis.titolo,
            statementA: analysis.statementA,
            statementB: analysis.statementB,
          }
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
            titolo: analysis.titolo,
            contenuto: analysis.contenuto || originalText,
          }
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

  async createNote(prefix: string, content: string): Promise<TFile | null> {
    try {
      await ensureFolder(this.app, FOLDER.notes);
      const id = `${prefix}-${timestampId()}`;
      const path = `${FOLDER.notes}/${id}.md`;
      const file = await this.app.vault.create(path, content);
      await this.app.workspace.getLeaf(false).openFile(file);
      new Notice(`Creata: ${id}`);
      return file;
    } catch (e) {
      new Notice(`Errore: ${(e as Error).message}`);
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
      fm.antinomia_tipo = TYPE.principle;
      fm.data = today;
      fm.data_modifica = today;
      fm.origine_tensione = `[[${originBasename}]]`;
      delete fm.stato;
      delete fm.origine;
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
      "\n## Origine (tensione)\n\n" +
      `> Deriva da: [[${originBasename}]]\n\n` +
      oldBody +
      "\n";
    await this.app.vault.modify(file, fmBlock + newBody);
    new Notice(`Elevata (transform): ${file.basename}`);
  }

  private async elevateSplit(file: TFile, fields?: PrincipleFields): Promise<void> {
    const oldFm = this.app.metadataCache.getFileCache(file)?.frontmatter ?? {};
    const tensionBasename = file.basename;
    const today = todayISO();
    const tensionTitle = typeof oldFm.titolo === "string" ? oldFm.titolo : tensionBasename;
    const existingLinks: string[] = Array.isArray(oldFm.collegamenti)
      ? oldFm.collegamenti.map((s: any) => String(s))
      : [];
    const collegamentiYaml = existingLinks.length > 0
      ? `collegamenti:\n${existingLinks.map((l) => "  - " + JSON.stringify(l)).join("\n")}\n`
      : "collegamenti: []\n";
    const principleContent =
      "---\n" +
      `antinomia_tipo: ${TYPE.principle}\n` +
      `titolo: ${yamlQuote("Principio da " + tensionTitle)}\n` +
      `data: ${today}\n` +
      `data_modifica: ${today}\n` +
      `origine_tensione: "[[${tensionBasename}]]"\n` +
      collegamentiYaml +
      "---\n\n" +
      principleBodyTemplate(fields) +
      "\n## Origine (tensione)\n\n" +
      `> Deriva da: [[${tensionBasename}]]\n\n` +
      "_(testo originale conservato nel defeated linkato)_\n";
    const principleFile = await this.createNote("P", principleContent);
    if (!principleFile) {
      new Notice("Errore: impossibile creare il principio.");
      return;
    }
    const principleBasename = principleFile.basename;
    await this.app.fileManager.processFrontMatter(file, (fm) => {
      fm.antinomia_tipo = TYPE.defeated;
      fm.motivo = "elevata";
      fm.sostituita_da = `[[${principleBasename}]]`;
      fm.data_modifica = today;
      delete fm.stato;
    });
    const afterFm = await this.app.vault.read(file);
    if (!afterFm.includes(`> Sostituita da: [[${principleBasename}]]`)) {
      await this.app.vault.modify(file, afterFm + `\n\n> Sostituita da: [[${principleBasename}]]\n`);
    }
    new Notice(`Elevata (split): ${tensionBasename} -> defeated, principio ${principleBasename}`);
  }

  /**
   * Migrazione retroattiva: per ogni principio gia' esistente, legge la
   * sezione "## Origine (tensione)" dal body, crea un defeated D-... con
   * quel contenuto e linka bidirezionalmente (sostituita_da + origine_tensione).
   */
  async migrateExistingPrinciples(): Promise<void> {
    const all = this.app.vault.getMarkdownFiles();
    const principles = all.filter((f) => {
      const fm = this.app.metadataCache.getFileCache(f)?.frontmatter;
      return fm?.antinomia_tipo === TYPE.principle;
    });
    if (principles.length === 0) {
      new Notice("Nessun principio nel vault.");
      return;
    }
    const alreadyLinked = new Set<string>();
    for (const p of principles) {
      const fm = this.app.metadataCache.getFileCache(p)?.frontmatter;
      const ot = fm?.origine_tensione;
      if (typeof ot === "string") {
        const m = ot.match(/\[\[([^\]|]+)/);
        if (m) {
          const refBase = m[1].split("/").pop() || m[1];
          const refFile = all.find((f) => f.basename === refBase);
          const refFm = refFile ? this.app.metadataCache.getFileCache(refFile)?.frontmatter : null;
          if (refFm?.antinomia_tipo === TYPE.defeated) {
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
      const title = typeof pFm.titolo === "string"
        ? `Tensione originaria di ${pFm.titolo}`
        : `Tensione originaria di ${p.basename}`;
      const defeatedContent =
        "---\n" +
        `antinomia_tipo: ${TYPE.defeated}\n` +
        `titolo: ${yamlQuote(title)}\n` +
        `motivo: elevata\n` +
        `data: ${today}\n` +
        `data_modifica: ${today}\n` +
        `sostituita_da: "[[${p.basename}]]"\n` +
        "collegamenti: []\n" +
        "---\n\n" +
        originContent +
        `\n\n> Sostituita da: [[${p.basename}]]\n` +
        `\n_(generato da migrazione retroattiva ${today})_\n`;
      const defeatedFile = await this.createNote("D", defeatedContent);
      if (!defeatedFile) { skipped++; continue; }
      await this.app.fileManager.processFrontMatter(p, (fm) => {
        fm.origine_tensione = `[[${defeatedFile.basename}]]`;
        fm.data_modifica = today;
      });
      migrated++;
    }
    new Notice(`Migrazione: ${migrated} defeated creati, ${skipped} principi saltati.`);
  }

  /**
   * Crea un defeated vuoto come "origine" di un principio orfano (cioe' un
   * principio senza ## Origine (tensione) nel body). L'utente puo' poi
   * compilare a mano il body del defeated con la tensione originale che
   * ricorda. Linka bidirezionalmente al principio.
   */
  async createDefeatedForPrinciple(principleFile: TFile): Promise<void> {
    const fm = this.app.metadataCache.getFileCache(principleFile)?.frontmatter;
    if (fm?.antinomia_tipo !== TYPE.principle) {
      new Notice("Selezione: la nota non e' un principio.");
      return;
    }
    const today = todayISO();
    const title = typeof fm?.titolo === "string"
      ? `Tensione originaria di ${fm.titolo}`
      : `Tensione originaria di ${principleFile.basename}`;
    const defeatedContent =
      "---\n" +
      `antinomia_tipo: ${TYPE.defeated}\n` +
      `titolo: ${yamlQuote(title)}\n` +
      `motivo: elevata\n` +
      `data: ${today}\n` +
      `data_modifica: ${today}\n` +
      `sostituita_da: "[[${principleFile.basename}]]"\n` +
      "collegamenti: []\n" +
      "---\n\n" +
      "**A (originale):** [da compilare]\n\n" +
      "**B (originale):** [da compilare]\n\n" +
      "_(Defeated creato manualmente per agganciare un principio orfano al grafo. " +
      "Compila A/B con la tensione che ricordi essere all'origine di questo principio.)_\n\n" +
      `> Sostituita da: [[${principleFile.basename}]]\n`;
    const defeatedFile = await this.createNote("D", defeatedContent);
    if (!defeatedFile) {
      new Notice("Errore: impossibile creare il defeated.");
      return;
    }
    await this.app.fileManager.processFrontMatter(principleFile, (frontm) => {
      frontm.origine_tensione = `[[${defeatedFile.basename}]]`;
      frontm.data_modifica = today;
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
      if (fm?.antinomia_tipo !== TYPE.principle) continue;
      const ot = fm?.origine_tensione;
      if (typeof ot !== "string") continue;
      if (ot.includes(removeFile.basename)) {
        await this.app.fileManager.processFrontMatter(f, (frontm) => {
          frontm.origine_tensione = `[[${keepFile.basename}]]`;
          frontm.data_modifica = today;
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
        fm.stato = "risolta";
        fm.data_modifica = todayISO();
      });
      new Notice(`Risolta: ${file.basename}`);
    } catch (e) {
      new Notice(`Errore: ${(e as Error).message}`);
    }
  }

  async archiveAsDefeated(file: TFile): Promise<void> {
    new DefeatedReasonModal(this.app, file, async (data) => {
      if (!data) {
        new Notice("Archiviazione annullata.");
        return;
      }
      const { motivo, sostituita_da } = data;
      try {
        await this.app.fileManager.processFrontMatter(file, (fm) => {
          fm.antinomia_tipo = TYPE.defeated;
          fm.motivo = motivo;
          fm.data_modifica = todayISO();
          delete fm.stato;
          delete fm.origine;
          if (sostituita_da) {
            fm.sostituita_da = `[[${sostituita_da}]]`;
          }
        });
        // If a substitute principle is set, add a body line so the link
        // is indexed by Obsidian's graph + backlinks immediately.
        if (sostituita_da) {
          const raw = await this.app.vault.read(file);
          const marker = `> Sostituita da: [[${sostituita_da}]]`;
          if (!raw.includes(marker)) {
            const trimmed = raw.endsWith("\n") ? raw : raw + "\n";
            await this.app.vault.modify(file, trimmed + "\n" + marker + "\n");
          }
        }
        const subMsg = sostituita_da ? `, sostituita da ${sostituita_da}` : "";
        new Notice(
          `Archiviata defeated (${motivo}${subMsg}): ${file.basename}`
        );
      } catch (e) {
        new Notice(`Errore: ${(e as Error).message}`);
      }
    }).open();
  }

  /**
   * Set antinomia_tipo on a note. For tensions/substrates we also add basic
   * default fields to avoid downstream surprises (stato: aperta, data, ...).
   */
  async markAsType(file: TFile, tipo: string): Promise<void> {
    try {
      const today = todayISO();
      await this.app.fileManager.processFrontMatter(file, (fm) => {
        fm.antinomia_tipo = tipo;
        fm.data_modifica = today;
        if (tipo === TYPE.tension && !fm.stato) fm.stato = "aperta";
        if (!fm.lingua_base) fm.lingua_base = "italiano";
        if (tipo === TYPE.tension && !fm.data_creazione)
          fm.data_creazione = today;
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
      new Notice("API key mancante nel profilo attivo. Impostazioni -> Antinomia.");
      return;
    }
    const raw = await this.app.vault.read(file);
    const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
    const currentTipo = fm?.antinomia_tipo ?? "";
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
            frontm.antinomia_tipo = parsed.tipo;
            frontm.data_modifica = todayISO();
          });
          new Notice(`Applicato: antinomia_tipo = ${parsed.tipo}`);
        } catch (e) {
          new Notice(`Errore: ${(e as Error).message}`);
        }
      }
    ).open();
  }

  async setTitleOnActiveNote(file: TFile): Promise<void> {
    const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
    const current = (fm?.titolo as string | undefined) ?? "";
    new TitleEditModal(
      this.app,
      current,
      `Titolo per ${file.basename}`,
      "3-7 parole che catturino il TEMA. Lascia vuoto per rimuovere.",
      async (value) => {
        if (value === null) return;
        try {
          await this.app.fileManager.processFrontMatter(file, (frontm) => {
            if (value === "") delete frontm.titolo;
            else frontm.titolo = value;
            frontm.data_modifica = todayISO();
          });
          new Notice(value ? `Titolo: ${value}` : "Titolo rimosso");
        } catch (e) {
          new Notice(`Errore: ${(e as Error).message}`);
        }
      }
    ).open();
  }

  async proposeTitleAI(file: TFile): Promise<void> {
    const profile = this.profileFor("default");
    if (!profile.apiKey) {
      new Notice("API key mancante nel profilo attivo. Impostazioni -> Antinomia.");
      return;
    }
    const raw = await this.app.vault.read(file);
    new Notice("Antinomia: proponi titolo (AI) in corso...");
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
              "Nome file: " +
              file.basename +
              "\n\n=== CONTENUTO NOTA ===\n\n" +
              raw,
          },
        ],
        maxTokens: 100,
      });
    } catch (e) {
      new Notice(`Errore AI: ${(e as Error).message}`);
      return;
    }
    const parsed = extractJson<TitleProposal>(result.text);
    if (!parsed?.titolo || !String(parsed.titolo).trim()) {
      console.error("[Antinomia] title unparseable:", result.text);
      new Notice("Titolo non parseable. Vedi console.");
      return;
    }
    const proposed = String(parsed.titolo).trim().slice(0, 80);
    new TitleEditModal(
      this.app,
      proposed,
      `Titolo proposto per ${file.basename}`,
      "Suggerimento AI. Modifica liberamente prima di salvare.",
      async (value) => {
        if (value === null || value === "") return;
        try {
          await this.app.fileManager.processFrontMatter(file, (frontm) => {
            frontm.titolo = value;
            frontm.data_modifica = todayISO();
          });
          new Notice(`Titolo: ${value}`);
        } catch (e) {
          new Notice(`Errore: ${(e as Error).message}`);
        }
      }
    ).open();
  }

  /**
   * AI helper: propone un titolo dato un contenuto arbitrario (non legato a file).
   * Usato dai modal di creazione per pre-popolare il campo titolo.
   */
  async proposeTitleFromContent(content: string): Promise<string | null> {
    const profile = this.profileFor("default");
    if (!profile.apiKey) {
      new Notice("API key mancante nel profilo attivo. Impostazioni -> Antinomia.");
      return null;
    }
    try {
      const result = await callAI({
        baseUrl: profile.baseUrl,
        apiKey: profile.apiKey,
        model: profile.model,
        system: TITLE_SYSTEM,
        messages: [{ role: "user", content }],
        maxTokens: 200,
      });
      const parsed = extractJson<TitleProposal>(result.text);
      if (!parsed || typeof parsed.titolo !== "string") {
        new Notice("AI: risposta titolo non parseable.");
        console.error("[Antinomia] proposeTitleFromContent unparseable:", result.text);
        return null;
      }
      return parsed.titolo.trim();
    } catch (e) {
      new Notice(`AI errore titolo: ${(e as Error).message}`);
      return null;
    }
  }

  /**
   * AI helper: propone IF/THEN/GREY zone dato il contenuto di una tensione.
   * Usato dal modal Eleva con bottone "Proponi IF/THEN (AI)".
   */
  async proposeIfThenFromContent(content: string): Promise<PrincipleFields | null> {
    const profile = this.profileFor("default");
    if (!profile.apiKey) {
      new Notice("API key mancante nel profilo attivo. Impostazioni -> Antinomia.");
      return null;
    }
    try {
      const result = await callAI({
        baseUrl: profile.baseUrl,
        apiKey: profile.apiKey,
        model: profile.model,
        system: PRINCIPLE_SYSTEM,
        messages: [{ role: "user", content }],
        maxTokens: 800,
      });
      const parsed = extractJson<PrincipleFields>(result.text);
      if (!parsed) {
        new Notice("AI: proposta principio non parseable.");
        console.error("[Antinomia] proposeIfThenFromContent unparseable:", result.text);
        return null;
      }
      return parsed;
    } catch (e) {
      new Notice(`AI errore principio: ${(e as Error).message}`);
      return null;
    }
  }

  /**
   * AI helper: propone Presupposizioni A/B per una tensione.
   */
  async proposePresuppostiFromContent(
    content: string,
    signal?: AbortSignal
  ): Promise<PresuppostiFields | null> {
    const profile = this.profileFor("default");
    console.log("[Antinomia] presupposti START profile:", profile.name, profile.format, profile.model);
    if (!profile.apiKey) {
      new Notice("API key mancante nel profilo attivo. Impostazioni -> Antinomia.");
      return null;
    }
    try {
      const result = await callAI({
        baseUrl: profile.baseUrl,
        apiKey: profile.apiKey,
        model: profile.model,
        format: profile.format,
        system: PRESUPPOSTI_SYSTEM,
        messages: [{ role: "user", content }],
        maxTokens: 800,
        signal,
      });
      console.log("[Antinomia] presupposti response len:", result.text.length);
      console.log("[Antinomia] presupposti response full:", result.text);
      const parsed = extractJson<PresuppostiFields>(result.text);
      console.log("[Antinomia] presupposti parsed:", parsed);
      if (!parsed) {
        new Notice("AI: proposta presupposti non parseable.");
        console.error("[Antinomia] presupposti UNPARSEABLE:", result.text);
        return null;
      }
      if (typeof parsed.presupposizioniA !== "string" && typeof parsed.presupposizioniB !== "string") {
        new Notice("AI: JSON ok ma chiavi sbagliate: " + Object.keys(parsed).join(", "));
        console.error("[Antinomia] presupposti chiavi sbagliate:", parsed);
        return null;
      }
      return parsed;
    } catch (e) {
      if ((e as Error).message === "hunter_aborted" || signal?.aborted) {
        throw new Error("ai_aborted");
      }
      console.error("[Antinomia] presupposti CATCH:", e);
      new Notice(`AI errore presupposti: ${(e as Error).message}`);
      return null;
    }
  }

  /**
   * AI helper: classifica testo grezzo in tensione vs substrate ed estrae i campi.
   * Usato dal FreeInputModal.
   */
  async analyzeFreeInput(text: string): Promise<FreeInputAnalysis | null> {
    const profile = this.profileFor("default");
    if (!profile.apiKey) {
      new Notice("API key mancante nel profilo attivo. Impostazioni -> Antinomia.");
      return null;
    }
    try {
      const result = await callAI({
        baseUrl: profile.baseUrl,
        apiKey: profile.apiKey,
        model: profile.model,
        system: FREE_INPUT_SYSTEM,
        messages: [{ role: "user", content: text }],
        maxTokens: 1200,
      });
      const parsed = extractJson<FreeInputAnalysis>(result.text);
      if (!parsed || (parsed.tipo !== "tensione" && parsed.tipo !== "substrate")) {
        new Notice("AI: analisi non parseable.");
        console.error("[Antinomia] analyzeFreeInput unparseable:", result.text);
        return null;
      }
      return parsed;
    } catch (e) {
      new Notice(`AI errore analisi: ${(e as Error).message}`);
      return null;
    }
  }

  /**
   * Applica i Presupposizioni A/B al body di una tensione. Sostituisce le righe
   * "**Presupposizioni A:** ..." e "**Presupposizioni B:** ..." se presenti,
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

      const reA = /\*\*Presupposizioni A:\*\*[^\n]*/;
      const reB = /\*\*Presupposizioni B:\*\*[^\n]*/;

      if (a) {
        if (reA.test(body)) body = body.replace(reA, `**Presupposizioni A:** ${a}`);
        else body += `\n\n**Presupposizioni A:** ${a}`;
      }
      if (b) {
        if (reB.test(body)) body = body.replace(reB, `**Presupposizioni B:** ${b}`);
        else body += `\n**Presupposizioni B:** ${b}`;
      }

      await this.app.fileManager.processFrontMatter(file, (fm) => {
        if (a) fm.presupposizioniA = a;
        if (b) fm.presupposizioniB = b;
        fm.data_modifica = todayISO();
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
   * Collega due note via wikilink bidirezionale in `collegamenti: [...]` di
   * entrambi i frontmatter, e aggiunge "> Vedi anche: [[target]]" nel body
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
        const arr: string[] = Array.isArray(fm.collegamenti) ? fm.collegamenti : [];
        if (!arr.some((s) => s === targetLink || s === `"${targetLink}"`)) {
          arr.push(targetLink);
        }
        fm.collegamenti = arr;
        fm.data_modifica = todayISO();
      });
      await this.app.fileManager.processFrontMatter(target, (fm) => {
        const arr: string[] = Array.isArray(fm.collegamenti) ? fm.collegamenti : [];
        if (!arr.some((s) => s === activeLink || s === `"${activeLink}"`)) {
          arr.push(activeLink);
        }
        fm.collegamenti = arr;
        fm.data_modifica = todayISO();
      });

      // Aggiungi "> Vedi anche: [[target]]" nel body dell'attiva se mancante
      const rawA = await this.app.vault.read(active);
      const fmEnd = rawA.indexOf("\n---", 3);
      if (fmEnd !== -1) {
        const fmBlock = rawA.slice(0, fmEnd + 4);
        const body = rawA.slice(fmEnd + 4);
        const line = `> Vedi anche: ${targetLink}`;
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
   * Contradiction Hunter: scansiona tensioni aperte + substrate, manda al
   * modello, parsea coppie contraddittorie, filtra falsi positivi gia'
   * dismissati, salva ultimo run nei settings, mostra in HunterResultsView.
   * Supporta cancellazione via Stop button (AbortController).
   */
  async runHunter(): Promise<void> {
    const profile = this.profileFor("hunter");
    if (!profile.apiKey) {
      new Notice("API key mancante nel profilo Hunter (o nell'attivo). Impostazioni -> Antinomia.");
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
      const t = fm?.antinomia_tipo;
      const isOpenTension = t === TYPE.tension && fm?.stato === "aperta";
      const isSubstrate = t === TYPE.substrate;
      if (isOpenTension || isSubstrate) candidates.push(f);
    }
    if (candidates.length < 2) {
      new Notice(`Hunter: servono almeno 2 note. Trovate: ${candidates.length}.`);
      return;
    }
    candidates.sort((a, b) => b.stat.mtime - a.stat.mtime);
    const cap = this.settings.hunterMaxNotes;
    const truncated = candidates.length > cap;
    const selected = candidates.slice(0, cap);

    const bodyLimit = this.settings.hunterNoteBodyLimit;
    const noteBlocks: string[] = [];
    for (const f of selected) {
      const raw = await this.app.vault.read(f);
      const fm = this.app.metadataCache.getFileCache(f)?.frontmatter;
      const body = stripFrontmatter(raw).trim();
      const truncBody = body.length > bodyLimit ? body.slice(0, bodyLimit) + "..." : body;
      const tipo = fm?.antinomia_tipo || "?";
      noteBlocks.push(`### ${f.basename} [${tipo}]\n${truncBody}`);
    }
    const userContent = `Analizza queste note Antinomia e identifica coppie contraddittorie. Rispondi SOLO con JSON conforme allo schema indicato.\n\n${noteBlocks.join("\n\n")}`;

    // Apri / rivela la HunterResultsView
    await this.activateView(VIEW_TYPE_HUNTER_RESULTS);
    const hunterLeaf = this.app.workspace.getLeavesOfType(VIEW_TYPE_HUNTER_RESULTS)[0];
    const hunterView =
      hunterLeaf && hunterLeaf.view instanceof HunterResultsView
        ? hunterLeaf.view
        : null;

    new Notice(`Hunter: invio ${selected.length} note...${truncated ? " (troncate)" : ""}`);
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
        system: buildHunterSystem(this.settings.hunterReasoningStyle),
        messages: [{ role: "user", content: userContent }],
        maxTokens: 2048,
        signal: abortSignal,
      });
      const abortPromise = new Promise<never>((_, reject) => {
        abortSignal.addEventListener("abort", () =>
          reject(new Error("hunter_aborted"))
        );
      });
      result = await Promise.race([aiPromise, abortPromise]);
    } catch (e) {
      hunterView?.setLoading(false);
      this.hunterAbortController = null;
      if ((e as Error).message === "hunter_aborted") {
        new Notice("Hunter fermato dall'utente. La richiesta al modello continua in background ma il risultato sara' scartato.");
        console.log("[Antinomia] hunter aborted by user");
      } else {
        new Notice(`Hunter errore: ${(e as Error).message}`);
        console.error("[Antinomia] hunter call failed", e);
      }
      return;
    }
    hunterView?.setLoading(false);
    this.hunterAbortController = null;
    const durationMs = Date.now() - t0;

    const parsed = extractJson<HunterResult>(result.text);
    if (!parsed || !Array.isArray(parsed.contraddizioni)) {
      console.error("[Antinomia] hunter unparseable:", result.text);
      new Notice("Hunter: risposta non parseable. Vedi console.");
      return;
    }

    // Validazione anti-hallucinazione: scarta basename inventati, self-pair, descrizioni vuote
    const realBasenames = new Set(selected.map((f) => f.basename));
    let halluFiltered = 0;
    const validated = parsed.contraddizioni.filter((c) => {
      const a = String(c.nota_a || "").trim();
      const b = String(c.nota_b || "").trim();
      const desc = String(c.descrizione || "").trim();
      if (!a || !b || a === b) { halluFiltered++; return false; }
      if (!desc || desc === "undefined") { halluFiltered++; return false; }
      if (!realBasenames.has(a) || !realBasenames.has(b)) {
        halluFiltered++;
        console.warn("[Antinomia] hunter: scartata coppia con basename inesistenti:", a, "<->", b);
        return false;
      }
      return true;
    });
    if (halluFiltered > 0) {
      console.log(`[Antinomia] hunter: filtrate ${halluFiltered} coppie hallucinate/invalide`);
    }

    // Filtra falsi positivi gia' dismissati
    const dismissedSet = new Set<string>();
    for (const f of selected) {
      const fm = this.app.metadataCache.getFileCache(f)?.frontmatter;
      const fp = fm?.hunter_falsi_positivi;
      if (Array.isArray(fp)) {
        for (const peer of fp) {
          const key = [f.basename, String(peer)].sort().join("|");
          dismissedSet.add(key);
        }
      }
    }
    let dismissedFiltered = 0;
    const filtered = validated.filter((c) => {
      const key = [c.nota_a, c.nota_b].sort().join("|");
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
    const run: HunterRun = { meta, result: { contraddizioni: filtered } };

    this.settings.lastHunterRunISO = meta.timestamp;
    this.settings.lastHunterRunCount = filtered.length;
    void this.saveSettings();

    hunterView?.setRun(run);
    new Notice(`Hunter: ${filtered.length} coppie trovate in ${(durationMs / 1000).toFixed(1)}s.`);
    console.log("[Antinomia] hunter run", meta);
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
        new Notice("Impossibile aprire il pannello.");
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
        new Notice("Impossibile aprire il pannello.");
        return;
      }
      await leaf.setViewState({ type: viewType, active: true });
    }
    workspace.revealLeaf(leaf);
  }
}
