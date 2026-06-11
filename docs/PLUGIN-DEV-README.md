# Antinomia

Obsidian plugin for **Personal Tension Management (PTM)** — the in-tension counterpart of Personal Knowledge Management.

> "Notes preserve. Contradictions interrogate."

If **PKM** organizes explicit knowledge (*what I know*), **PTM** organizes where things don't fit (*where something jars*): contradictions, tradeoffs, anomalies, persistent doubts, weak signals, conflicts between goals. Clean ideas emerge later, as operational principles derived from resolving a tension — not before.

> ⚠️ **The plugin's UI and AI prompts are in Italian.** An English UI is on the V2 roadmap. Field names of the data schema (frontmatter) are also in Italian by design — they are treated as a stable contract.

---

## The 5 layers

Every Antinomia note has a `antinomia_tipo` frontmatter field that places it in one of 5 layers:

| Type | What it is | Key fields |
|---|---|---|
| `tensione` | A contradiction between two positions A and B | `stato` (aperta/risolta/elevata), `collegamenti` |
| `substrate` | Raw material (quotes, facts, observations) | `fonte`, `lingua_originale` |
| `principio` | An operational IF/THEN rule derived from a tension | `origine_tensione` |
| `defeated` | A defeated belief (historical memory) | `motivo`, `sostituita_da` |
| `meta_nota` | Reflection on using the system | `data` |

**Design invariant:** the layer of a note lives exclusively in its frontmatter. Files never move between folders when a layer changes. A single source of truth.

---

## Main features

### Note creation
- **Guided modals** for new tension (Title + Statement A + B) and new substrate (Title + Content)
- **"Propose title (AI)" button** in both modals
- **Free-form input** (`✨`): write raw text, the AI decides if it's a tension or substrate and extracts the fields
- Toolbar at the top of the Tensions sidebar with quick-creation buttons

### Layer transitions
- **Elevate tension to principle**: IF/THEN/GREY ZONE form with "Propose IF/THEN (AI)" button — rewrites the body, preserving the old text under `## Origine (tensione)`
- **Mark as resolved**: only changes the `stato`
- **Archive as defeated**: modal with motive (`falso_positivo` / `elevata` / `sconfitta_genuina`); if "elevata", asks for the substitute principle

### Presupposition map (AI)
A command that asks the AI to make explicit the epistemic/value assumptions underneath statements A and B. Fills 4 frontmatter fields (`Presupposizioni A/B`).

### Contradiction Hunter (AI)
Scans open tensions + substrate, identifies contradictory pairs. **Crucial constraint:** the Hunter IDENTIFIES, it does NOT resolve. Each pair has:
- Confidence (high/medium/low)
- Description of the contradiction
- Action buttons for each note in the pair (Elevate / Resolved / Defeated)
- Persistent dismissal (×) for false positives

### Multi-backend AI
Settings → AI Profiles: configure multiple profiles (e.g. LM Studio local + Anthropic Cloud) and:
- Choose the **active** profile (default for all commands)
- Choose the **Hunter** profile (optional override; empty = use active)

Typical workflow: Qwen 14B/27B local for daily use (free, private), Sonnet/Opus cloud only for deep Hunter scans.

### Sidebars / views
- **Open Tensions** with cards + inline buttons for each tension
- **Hunter results** with action buttons for each pair
- **Hunter false positives** (list + "Re-include")
- **Substrate** / **Principles** / **Defeated archive** (dedicated sidebars per layer)
- **Dashboard** (counters + last Hunter run + quick actions)
- **Vault audit** (health report: incomplete notes)
- **Unclassified notes** (for migrating an existing vault)
- **Getting Started guide** (7-step checklist with auto-detection)

### Complete onboarding
- **Welcome modal** on first launch (paradigm + 5 layers)
- **Tutorial** with 7 navigable cards (core concepts + examples)
- **Auto-generable example vault** (3 tensions + 2 substrate well-built, dismissible in 1 click)
- **Persistent tooltips** the first time you open sidebars
- **"Tell me what to do next"**: contextual command that suggests the next step based on vault state

---

## Prerequisites

### Required
- **Obsidian** 1.4+
- (for AI features) At least one of: Anthropic API key (`sk-ant-...`) OR a running **LM Studio** locally with a loaded model

### Strongly recommended

**[Front Matter Title](https://github.com/snezhig/obsidian-front-matter-title)** (community plugin by Snezhig)

Antinomia notes have timestamp basenames (`T-20260530-094515`) for ID stability. To see human titles also in Obsidian's File Explorer, install Front Matter Title and set **Common main template = `titolo`** in its options.

---

## Installation

### From release zip
1. Download `main.js`, `manifest.json`, `styles.css` (if present) from the latest release
2. Copy them into `<YOUR_VAULT>/.obsidian/plugins/antinomia/`
3. In Obsidian: Settings → Community plugins → Reload → enable "Antinomia"

### Build from source
```bash
cd plugin
npm install
npm run build   # outputs main.js + manifest.json into ../TestVault/.obsidian/plugins/antinomia/
npm run dev     # watch mode
```

For real-world use, copy `main.js` + `manifest.json` from the build folder into `<YOUR_VAULT>/.obsidian/plugins/antinomia/`.

---

## Configuration

### First launch
On first launch the **Welcome modal** opens, plus the **Getting Started** sidebar (7-step checklist). Follow the guided steps.

### Configure an AI backend
1. Settings → Antinomia → AI Profiles
2. Click **+ Add profile** or edit the Default one
3. Pick a Backend preset (Anthropic Cloud or LM Studio) → Base URL + suggested model auto-populate
4. Enter your API key (for LM Studio put any string, e.g. `lmstudio`)
5. Click **Test** to verify ping/pong

### Hunter model override
If you want a more capable model only for the Contradiction Hunter:
1. Create a second profile (e.g. "Sonnet Cloud")
2. Settings → "Hunter profile (override)" → pick the Hunter profile

---

## Commands (Ctrl+P)

> Command names in the palette are in Italian (the UI is Italian). The list below shows the Italian name + a brief English description.

### Creation
- `Antinomia: nuova tensione` — new tension (guided modal)
- `Antinomia: nuovo substrate` — new substrate (guided modal)
- `Antinomia: inserimento libero (AI classifica)` — free-form input with AI classification
- Variants `(vuota/vuoto, senza modal)` for quick access

### Sidebar lists
- `Antinomia: lista tensioni aperte` — open tensions list
- `Antinomia: lista substrate` — substrate list
- `Antinomia: lista principi` — principles list
- `Antinomia: lista defeated archive` — defeated archive list
- `Antinomia: lista falsi positivi del Hunter` — Hunter false positives list
- `Antinomia: importa vault esistente (note non classificate)` — import existing vault (unclassified notes)
- `Antinomia: apri dashboard` — open dashboard
- `Antinomia: audit vault (report di salute)` — vault audit (health report)

### Transitions
- `Antinomia: eleva tensione a principio` — elevate tension to principle (opens IF/THEN/GREY form + Propose AI button)
- `Antinomia: marca tensione come risolta` — mark tension as resolved
- `Antinomia: archivia come defeated` — archive as defeated

### AI
- `Antinomia: classifica nota attiva (AI)` — classify active note
- `Antinomia: cerca contraddizioni (Hunter)` — find contradictions
- `Antinomia: mappa presupposti (AI)` — map presuppositions
- `Antinomia: proponi titolo (AI)` — propose title

### Titles + links
- `Antinomia: imposta titolo nota` — set note title
- `Antinomia: collega questa nota a...` — link this note to...

### Onboarding
- `Antinomia: mostra welcome (riavvia onboarding)` — show welcome (restart onboarding)
- `Antinomia: tutorial concetti chiave` — core concepts tutorial
- `Antinomia: apri guida iniziale (checklist)` — open Getting Started guide
- `Antinomia: dimmi come procedere (suggerimento contestuale)` — tell me what to do next
- `Antinomia: crea vault di esempio` — create example vault
- `Antinomia: cancella esempi` — delete examples

---

## Design invariants (decisions NOT to renegotiate)

1. **Layer = `antinomia_tipo` frontmatter only.** Files never move. A single source of truth.
2. **Single folder `notes/`.** No separate folders per layer.
3. **The Hunter IDENTIFIES, it does NOT resolve.** Resolution is the user's epistemic work, through dialogue on presuppositions.
4. **AI always opt-in.** No background calls. The user presses a command, a call goes out.
5. **Pluggable AI backend.** Anthropic Cloud, LM Studio local, or any Anthropic-compatible endpoint (OpenAI, Groq, OpenRouter, Ollama).
6. **Local-first.** Data stays on disk. Notes leave the device only at the explicit moment you invoke an AI command.
7. **Data schema in Italian** (part of the Antinomia design). Code and folders in English.

---

## Philosophy

Antinomia is not a tool to fill up. It is a practice. The vault grows as you encounter contradictions in your own thinking (substrate). Tensions emerge from the material — they are not designed. The Hunter shows you contradictions you hadn't seen — not to resolve them for you, but to **force you to think them through**.

When you understand a tension well enough to formulate it as an operational principle (IF/THEN/GREY), you elevate it. When a belief proves false, it goes into the Defeated archive as a memory of what was not true. The graph that emerges is the map of your epistemic history.

---

## License

MIT.

## Author

Giuseppe De Martino.

## Intellectual references

Hegel (dialectics), David Bohm (dialogue that suspends defense), Karl Popper (falsifiability), Thomas Kuhn (scientific revolutions emerge from anomalies), Friedrich Hayek (spontaneous order, local knowledge).
