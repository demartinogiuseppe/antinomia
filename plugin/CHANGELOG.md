# Changelog

## v1.2.2 (June 1, 2026) — Graph relayout after example-vault generation

Bug fix: after clicking "Create example vault" (either from the Welcome modal CTA or from Settings → Onboarding), if the Antinomia Graph was open in the background, the 20+ new nodes would all be added at position (0,0) and the continuous physics could not separate them — resulting in a collapsed cluster with overlapping labels. Closing and reopening the graph tab worked around it, but it was a confusing first impression.

Fix: `createExampleNotes()` now triggers a forced relayout of any open graph view 300ms after the notes are created (small delay gives Obsidian's metadataCache time to process the new files). The graph re-applies its fcose layout from scratch, spreading the nodes correctly.

No breaking changes, no schema changes.

---

## v1.2.1 (June 1, 2026) — Welcome modal CTA for example vault

Small onboarding UX improvement, no functional changes.

- **Welcome modal** now shows a highlighted CTA box "🚀 Want to explore Antinomia quickly?" between the initial tip and the action buttons. Clicking the "Create example vault" button generates the 21 demo notes + `EXAMPLE-KEY.md` and closes the welcome.
- The CTA appears only when no example notes exist in the vault (checked via `antinomia_example: true` frontmatter), so it disappears after one click or for users who already explored.

Before v1.2.1, the example vault was only discoverable through Settings → Antinomia → Onboarding → Create examples. New users opening the Welcome modal had no fast path to a working playground.

---

## v1.2.0 (June 1, 2026) — Full English release

Antinomia is now fully localized in English. All user-facing strings, AI prompts, documentation, and example content have been translated. The frontmatter schema has been renamed from Italian to English field names. This is a **breaking change** for vaults built with v1.1.x: their Italian frontmatter (`tensione`, `stato: aperta`, `collegamenti`, etc.) is no longer recognized. No migration utility is provided — start a fresh vault.

### Localization (all phases A–E)

- **Docs** (A): README, CHANGELOG, CITATION.cff, BETA-INSTALL, plugin/README, manifest description.
- **Schema** (B): values `tensione/principio/meta_nota` → `tension/principle/meta_note`. Status `aperta/risolta/elevata` → `open/resolved/elevated`. Motive `falso_positivo/sconfitta_genuina` → `false_positive/genuinely_defeated`. Field names: `antinomia_tipo/stato/collegamenti/fonte/motivo/sostituita_da/origine_tensione/lingua_originale/data_modifica/titolo/lingua_base/data_creazione/origine` → `antinomia_type/status/links/source/motive/replaced_by/origin_tension/original_language/modified_date/title/base_language/creation_date/origin`. Body markers `## Origine`/`> Deriva da`/`> Sostituita da`/`> Vedi anche` → `## Origin`/`> Derived from`/`> Replaced by`/`> See also`.
- **UI strings** (C): ~600 strings across command palette, Notice messages, Settings labels and descriptions, modal titles and forms (Elevate, Free input, New tension, New substrate, Map presuppositions, Archive defeated, Profile editor), sidebar views (Open Tensions, Hunter Results, Substrate, Principles, Defeated, Dashboard, Audit, False Positives, Unclassified Notes, Getting Started), Welcome modal + 7-card Tutorial + GuidanceModal.
- **AI prompts** (D): all 6 system prompts translated (CLASSIFY, TITLE, PRESUPPOSTI, FREE_INPUT, PRINCIPLE, HUNTER). The HUNTER_SYSTEM (the largest, with few-shot examples and rules) was translated with care preserving structure and intent. JSON shape kept compatible (field names `nota_a/nota_b/descrizione/confidence` + values `alta/media/bassa` stay as internal contract to avoid breaking the parser).
- **Example vault** (E): the 21-note example vault generator (3 tensions + 15 substrate + 1 defeated + 1 Design C principle) and `EXAMPLE-KEY.md` (formerly `ESEMPIO-CHIAVE.md`) rewritten in English. Basename prefix `ESEMPIO-` → `EXAMPLE-`.

### Breaking changes

- Vaults built with v1.1.x will not be read: the plugin looks for `antinomia_type` (was `antinomia_tipo`), `status: open` (was `stato: aperta`), etc.
- The Italian schema was a design decision in v1.x. v1.2 makes English the default and only option. UI is no longer Italian.
- `isDesktopOnly: true` (unchanged, kept).

---

## v1.1.0 (June 1, 2026) — First public beta release via BRAT

### Framing

- **Personal Tension Management (PTM)** introduced as the framing of the project, in parallel to Personal Knowledge Management. PKM organizes explicit knowledge (*what I know*); PTM organizes where things don't fit (*where something jars*): contradictions, tradeoffs, anomalies, persistent doubts, weak signals, conflicts between goals. Antinomia is the first plugin to make this category explicit.

### New features

- **Antinomia Graph View** custom (Cytoscape.js + fcose) replacing Obsidian's native graph for Antinomia notes: per-layer cluster layout, continuous physics, animated wheel zoom (1.6×/step, 320 ms ease-out), gradual hover fade, inertia pan, vertical zoom slider, 6 theme presets + custom, persistent preferences.
- **Global navigation menu** in every Antinomia view (Tensions, Substrate, Principles, Defeated, Dashboard, Hunter, Graph, Audit, False Positives, Unclassified Notes, Getting Started).
- **Extended multi-backend AI**: in addition to Anthropic and LM Studio, now supports **OpenAI**, **Groq**, **OpenRouter** (OpenAI format), and **Ollama** (local). The profile's `format` field selects the dialect (`"anthropic" | "openai"`).
- **Universal Stop button** on every AI action (Hunter, Propose title, Propose IF/THEN, Propose presuppositions, Free-form classify). Cancels the in-flight call via `AbortController` and closes the TCP socket for LM Studio/Ollama local backends.
- **Design C — Split elevation**: new setting `elevationMode = "split" | "transform"`. In split mode, "Eleva" creates a new `P-...` (principle) file AND converts the original tension into a defeated note with motive `elevata` and a `sostituita_da` link. The graph shows a red edge between the defeated and the new principle. Transform mode keeps the v1.0.0 behavior.
- **Hunter focus mode**: new command "Hunter on a note" opens a picker and scans only pairs involving the selected note. For targeted scans on specific tensions or substrate notes.

### Onboarding and safety

- **Disclaimer "reflective practice, not decision-support system"** shown in 3 places (Welcome modal, Settings → Onboarding, Hunter results sidebar). Warns that proposed pairs are prompts for thinking, not truths to base decisions on in real contexts (work, health, finance, relationships).
- **Notice on paid APIs vs free local alternative** in Settings, before profile setup. Explains the cost difference between cloud (Anthropic, OpenAI, Groq) and local (LM Studio, Ollama).
- **Automatic Front Matter Title detection** with banner in the Welcome modal: detects if the Front Matter Title community plugin is missing or misconfigured and warns the user.
- **Rich example vault** (21 notes): 3 tensions + 15 substrate + 1 defeated + 1 Design C principle in `notes/` + `EXAMPLE-KEY.md` at the vault root containing the seeded contradictions map for measuring the Hunter.

### Robustness and developer experience

- **Robust JSON parser** for AI responses: multi-pass strategies (markdown unwrap, Qwen3 code-before-JSON pattern, single→double quotes, trailing commas, comments). No more "Cannot access 'a' before initialization".
- **Anti-hallucination validation** in the Hunter: filters out pairs with non-existing basenames, self-pairs (A↔A), and pairs with empty or "undefined" descriptions (frequent false positives from small local models).
- **Automatic backup of main.ts** in `esbuild.config.mjs` before every build, with anti-truncation guard (rejects backup if `main.ts` is truncated under the minimum threshold). History in `plugin/backups/`.
- **BRAT compliance**: `minAppVersion` raised to 1.4.0, `isDesktopOnly` set to true (plugin uses Node's `require("http")` for LM Studio), `versions.json` introduced.

### Distribution

- **BETA-INSTALL.md** at the repo root: 6-step beta-tester guide (dedicated vault → install plugin → Front Matter Title → AI backend → example vault → cleanup).
- **package-release.ps1**: PowerShell script that bundles `main.js` + `manifest.json` (+ optional `styles.css`) into `releases/antinomia-vX.X.X.zip` for direct upload to a GitHub Release.
- MIT LICENSE, CITATION.cff, and a public README in the repo root.

### Known backlog (v1.1.1+)

- Duplicate Eleva modal in certain flows (guard implemented, to be validated).
- Incremental Hunter (history of already-seen pairs).
- PDF text extraction on drop.

---

## v1.0.0 (May 30, 2026) — First internal release

### Core
- 5-layer data schema (tensione, substrate, principio, defeated, meta_nota) managed via YAML frontmatter
- Single folder `notes/` (design decision: files never move when their layer changes)
- Automatic migration of titles with YAML-sensitive characters (`:`, `"`, etc.) via explicit quoting

### Note creation
- Guided modal for new tension (Title + Statement A + B)
- Guided modal for new substrate (Title + Content)
- "Free-form input" with automatic AI classification (tension vs substrate)
- "Propose title (AI)" button in both modals
- Toolbar in the Open Tensions sidebar with quick-creation buttons

### Layer transitions
- Elevate tension to principle with IF/THEN/GREY form + "Propose IF/THEN (AI)" button
- Mark as resolved (just changes `stato`)
- Archive as defeated with motive modal + substitute-principle picker if motive=elevata
- All transitions happen via frontmatter, no file is ever moved

### AI commands
- Classify active note
- Propose title (for an existing note, or pre-populated in creation modals)
- Map presuppositions (generates Presupposizioni A/B)
- Find contradictions (Contradiction Hunter)
- Free-form input (classify + extract fields)

### Contradiction Hunter
- Scans open tensions + substrate (configurable cap)
- Confidence (high/medium/low) for each pair
- Persistent dismissal of false positives via `hunter_falsi_positivi[]` field
- "Hunter reasoning style" setting (concise vs expanded)
- Inline action buttons on each pair (Elevate/Resolved/Defeated)
- Design constraint: the Hunter identifies, it does not resolve

### Multi-backend AI (base)
- Configurable profiles (name, baseUrl, apiKey, model)
- Active profile for all AI commands
- Optional Hunter-specific profile override
- Backend presets: Anthropic Cloud, LM Studio (local)

### Sidebars and views
- Open Tensions, Substrate, Principles, Defeated archive, Dashboard, Hunter results, False positives, Vault audit, Unclassified notes, Getting Started guide.

### Onboarding
- Welcome modal on first launch
- 7-card navigable tutorial
- Auto-generable example vault
- Persistent first-open tooltips
- "Tell me what to do next" command
- Persistent checklist sidebar
- Onboarding section in Settings

### Design invariants
- Layer = frontmatter only, never folders
- The Hunter identifies, it does not resolve
- AI is always opt-in, never automatic
- Backend pluggable
- Local-first
- Schema in Italian, code in English
