# Changelog

## v1.2.7 (June 2, 2026) — Title-field bug fix, more graph polish, AI suggest on title modal, Italian residues sweep

### Critical bug fix: titles always empty in newly-created notes (Front Matter Title showed timestamps)

The `TensionFields` / `SubstrateFields` interfaces declared `titolo` / `contenuto` (Italian), but `tensionTemplate` / `substrateTemplate` read `fields.title` / `fields.content` (English). Result: the title field in the frontmatter was always empty when creating a new note from either modal, including the "Propose title (AI)" path — Front Matter Title therefore had nothing to read and displayed the timestamp basename `T-20260602-165351` instead of a human title.

Fix: renamed interface keys to English (`title`, `content`), updated the two modal callbacks to pass `{ title: titolo, ... }` and `{ title: titolo, content: contenuto }`, and the substrate template now reads `fields.content`.

### "Elevated" graph filter now actually matches notes

The `Elevated` checkbox in the graph toolbar previously looked for `tension + status=elevated` — an edge-case state that the Design C elevation flow never produces. Now it matches `defeated + motive=elevated`, i.e. the *original* tensions that have been elevated into principles. Spunting the checkbox in a vault with elevated tensions finally shows them.

### Graph view polish

- **Smaller, brighter nodes**: base disc 44 → 32px, glow at 100% opacity by default (was 0.8).
- **Larger hit-area**: 18px transparent border on every node — hovering is much easier without enlarging the visible pallino.
- **Hover focus enlarged**: 50 → 60px on the hovered node (the connected neighbors stay at 32px and only brighten).
- **Snappier animations**: hover transition duration 220ms → 130ms.
- **No more dimming on hover**: the previous "fade everything else" behavior was removed. Focus is communicated only by the hovered/neighbor nodes brightening, the rest of the graph stays at full opacity.
- **No more purple ring around the hovered node**: the accent border that Cytoscape painted on `.highlight` is gone.
- **Default fcose params tuned for fewer edge crossings**: `nodeRepulsion: 18000`, `idealEdgeLength: 190`, `nodeSeparation: 160`, `quality: "proof"`, `numIter: 5000`.

### New experimental setting: "Spacious layout"

Settings → Antinomia → Graph View style → **Spacious layout (experimental)**. When enabled:
- fcose runs with much stronger repulsion (`nodeRepulsion: 55000`, `idealEdgeLength: 340`, `nodeSeparation: 280`).
- After fcose converges, a post-processing pass nudges every node away from edges that do not touch it, until the minimum node-edge distance reaches 70 graph-units. This is the only way to get *true* edge-node repulsion since fcose has no native support for it.
- Slower initial layout, much cleaner result — edges rarely cross unrelated nodes.

Default is OFF (reverts to the standard layout if disabled).

### "Propose title (AI)" available in the title-edit modal

The "Set / edit title" modal (button on every note card, or via command palette) now has a **Propose title (AI)** button that reads the note body and asks the configured AI model for a suggestion. Same loader UI as in the New Tension / New Substrate modals. The model output is run through `sanitizeTitle()` so the result is always capped at 7 words / 60 chars.

### AI "Propose title" — robustness against verbose local models (continued)

Title prompt rewritten as a strict JSON-only generator with three few-shot examples. The response parser now tries (in order): JSON, embedded `"title": "..."` anywhere in the text, `Title: ...` / `Titolo: ...` labels, any quoted substring, finally the first short non-reasoning line. Every result capped at 7 words / 60 chars.

### Italian residues sweep (continued)

Strings still in Italian, now in English:
- Contradiction Hunter sidebar safety warning.
- Card action buttons: `Titolo` → `Title`, `Collega` → `Link` (with tooltips).
- Toolbar: `✨ Libero` → `✨ Free`.
- Free-input modal buttons: `Rifiuta` → `Reject`, `Applica` → `Apply`.
- Defeated archiving tooltip: `Archivia come defeated (apre modal motivo)` → `Archive as defeated (opens motive modal)`.
- Unclassified pagination hint: `Mostrate le prime N…` → `Showing the first N…`.
- PDF substrate template: Italian "Vedi PDF / Aggiungi…" → "See PDF / Add here…".
- Notices: `Archiviazione annullata` → `Archiving cancelled`; `Archiviata defeated` → `Archived as defeated`; `API key mancante…` → `API key missing…` (6 occurrences); `Suggerimento AI. Modifica liberamente…` → `AI suggestion. Edit freely…`; `Antinomia: proponi titolo (AI) in corso…` → `Antinomia: proposing title (AI)…`.
- TitleEditModal header / hint / notices: `Titolo per…` → `Title for…`, `3-7 parole che catturino il TEMA…` → `3-7 words capturing the THEME…`, `Titolo: X` / `Titolo rimosso` / `Errore: …` translated.

---

## v1.2.6 (June 2, 2026) — Zenodo bootstrap

Tag-only release to trigger Zenodo archival for the first time. No code changes vs v1.2.5.

- `CITATION.cff` updated to v1.2.6 with English layer names (tension, substrate, principle, defeated, meta_note) and a placeholder for the Zenodo DOI (filled in once Zenodo generates one for this release).
- Tag published as `1.2.6` (no `v` prefix) to comply with the Obsidian community plugin store naming requirement.

---

## v1.2.5 (June 2, 2026) — Graph visual overhaul (neon glow nodes + edges + labels) + bug fixes + Italian residues

Visual overhaul of the Graph view plus a handful of bug fixes. No breaking changes, no schema changes.

### Neon glow on nodes (per-color SVG halo)

Every node is now rendered with a soft, color-matched gaussian halo around the visible disc, using an inline SVG with a `radialGradient` as the node's `background-image`. The halo uses a quadratic falloff (no Mach-band ring), centers correctly during zoom, and fades when the node is in the `.faded` state (hover on a non-connected node). Visual result: each pallino looks like a colored neon dot, exactly like the reference graph apps the user pointed to.

### Per-color gaussian glow on edges (SVG overlay)

Cytoscape's canvas renderer can't draw per-edge gaussian blur, so the Graph view now uses an SVG overlay on top of the Cytoscape canvases. Every edge is re-drawn there as three stacked `<path>` elements (outer halo with strong gaussian blur, inner halo with mild blur, sharp core), each painted with a `<linearGradient>` running from the source node's color to the target node's color. The result is a neon-edge that smoothly transitions colors from one endpoint to the other and glows correctly through its own halo. The original Cytoscape edges are kept in the graph (for the layout engine) but set to `visibility: hidden`. The SVG overlay also respects the Cytoscape `.faded` state so non-hover edges dim down when hovering a node.

### Node labels rendered in the SVG overlay (always on top)

Labels were previously painted by Cytoscape on the same canvas as the edges, which means after the edge-overlay change above they ended up *underneath* the glowing lines. They are now drawn as `<text>` elements in a dedicated labels SVG (`zIndex 10`, appended to the container), forced white (`#ffffff`) with a black semi-transparent stroke for legibility over any colored line. Bold weight on hovered/connected nodes.

### Z-order: edges behind nodes, labels above everything

The overlay was split in two SVGs to get the right stacking:
- **`edgePathsSvg`** — `zIndex: 0`, DOM-prepended → renders BEHIND the Cytoscape canvases (nodes appear on top of the lines, with clean disc edges).
- **`edgeLabelsSvg`** — `zIndex: 10`, DOM-appended → renders ABOVE everything (labels are never covered by lines or nodes).

### Edge endpoints trimmed to the visible disc

The SVG paths now stop at the outer edge of each node's visible disc rather than running to the center. Endpoint inset is computed dynamically per node based on its current state (normal, hover-neighbor, hover-focus) and the active Cytoscape zoom — so the line stays attached to the disc edge at every zoom level.

### Hover interaction overhaul

The previous "fade everything else" behavior was replaced with a focused-brighten model:
- **Hovered node (`.hover-focus`)** — grows from 44px → 60px, switches to the brighter glow SVG variant (more opaque gradient stops, larger inner disc), label goes white + bold.
- **Connected neighbors (`.hover-neighbor`)** — stay at 44px, get the normal glow at full opacity (boost without size change), label white + bold.
- **Everything else** — completely untouched, no dimming.

All animated via Cytoscape transitions (`width`, `height`, `background-image-opacity`, `color`) with `transition-duration: 130ms ease-out` for a snappy feel.

### Hit-area expanded by 10px

A transparent 10px border was added to every node (`border-color: rgba(0,0,0,0)`) so the hoverable / clickable area extends 10 pixels beyond the visible disc on every side, without changing the visual size of the node. Makes hovering much easier without enlarging the pallini.

### Auto-open Dashboard + Graph on startup (Bug A)

When `autoOpenDashboard` / `autoOpenGraph` were on in Settings, Dashboard and Graph did not actually appear at Obsidian startup unless the vault already contained Antinomia notes. Workaround: create example vault first, restart Obsidian.

Root cause: the `workspace.onLayoutReady()` callback was registered BEFORE `registerView()` for Dashboard and Graph. On launches where Obsidian's layout was already ready, the callback fired immediately and tried to instantiate views that the plugin had not yet declared — so Obsidian silently dropped the request.

Fix: moved the auto-open block AFTER all `registerView()` calls in `onload()`. Now Dashboard and Graph reliably auto-open on startup regardless of vault state.

### Graph freeze when toggling filters, especially Principles (Bug B)

Toggling a filter checkbox in the Graph toolbar (e.g. enabling "Principles") could freeze the graph: newly visible nodes were added at position (0,0) and the continuous physics could not separate them, making the graph appear stuck.

Fix: the checkbox `onchange` handler now calls `applyLayoutToCy()` after `rebuildGraph()`, re-running the active layout (fcose by default) so newly visible nodes are spread out and animation resumes cleanly.

### Suppressed Cytoscape's default grab/active overlay on nodes

The dark square halo Cytoscape paints around a node while dragging it is now disabled (`overlay-opacity: 0`, `overlay-padding: 0`) — it conflicted with the neon glow aesthetic.

### "neon" graph preset is now the default

Fresh installs (no saved settings) now boot with `graphStyleName: "neon"` instead of `default`, so the neon glow nodes/edges look intended out of the box. Existing users keep their saved choice — they can switch via Settings → Antinomia → Graph style.

### AI "propose title" robustness against verbose local models

When using a local LLM (LM Studio with Qwen3 in particular), the model often replied with a reasoning paragraph (e.g. "The user asked me to…", "L'utente…") instead of the strict JSON the prompt requested, leaving the title input empty. Fixed on two fronts:

- **Prompt rewritten** as a strict "JSON-only generator" with three few-shot input/output examples. Explicit ban on "I think", "Let me", "L'utente", etc.
- **Title extraction made resilient**: the response parser now (in order) tries JSON; then looks for `"title": "..."` anywhere in the text; then `Title: ...` / `Titolo: ...` labeled lines; then any quoted substring of reasonable length; finally falls back to the first short line that doesn't look like reasoning. Every result is then capped at 7 words / 60 characters via a shared `sanitizeTitle()` helper.

### Italian residues cleanup (final sweep)

Strings still in Italian found during this session, now in English:
- **Graph toolbar checkboxes**: `Tensioni aperte` → `Open tensions`, `Risolte` → `Resolved`, `Elevate` → `Elevated`, `Principi` → `Principles`.
- **Graph layout dropdown**: `Clusters per layer` → `Clusters by layer`, `Force-directed libero` → `Force-directed (free)`.
- **Ribbon icon tooltip**: `Antinomia: tensioni aperte` → `Antinomia: Open tensions`.
- **Top nav submenu "Note"**: `Note` → `Notes`, `Tensioni aperte` → `Open tensions`, `Principi` → `Principles`, `Note non classificate` → `Unclassified notes`.
- **Top nav submenu "Hunter"**: `Risultati Hunter` → `Hunter results`, `Falsi positivi` → `False positives`, `Hunter su una nota (focus)` → `Hunter on a note (focus)`.
- **Unclassified notes sidebar buttons**: `Tensione`/`Principio`/`Ignora` and their tooltips translated.
- **Open tensions sidebar action buttons**: `↑ Eleva` → `↑ Elevate`, `✓ Risolta` → `✓ Resolved`, tooltips translated.
- **Defeated archive description**: `Convinzioni sconfitte. Memoria storica…` → `Defeated beliefs. Historical memory…`.
- **Notice messages**: `Impossibile aprire il pannello.` → `Unable to open the panel.`
- **NotePicker placeholders** and a few other minor strings.

---

## v1.2.2 (June 1, 2026) — Graph relayout + Italian residues in nav menu

Bug fix release. No breaking changes, no schema changes.

### Graph relayout after example-vault generation

After clicking "Create example vault" (either from the Welcome modal CTA or from Settings → Onboarding), if the Antinomia Graph was open in the background, the 20+ new nodes would all be added at position (0,0) and the continuous physics could not separate them — resulting in a collapsed cluster with overlapping labels. Closing and reopening the graph tab worked around it, but it was a confusing first impression.

Fix: `createExampleNotes()` now triggers a forced relayout of any open graph view 300ms after the notes are created (delay gives Obsidian's metadataCache time to process the new files). The graph re-applies its fcose layout from scratch.

### Italian residues cleanup in the global nav menu

A handful of strings in the top navigation bar were missed during the v1.2.0 full-English pass:

- Top buttons: `Crea` → `Create`, `Grafo` → `Graph`, `Guida` → `Guide`.
- Create submenu items: `Nuova tensione (guidata)` → `New tension (guided)`, `Nuovo substrate (guidato)` → `New substrate (guided)`, `Inserimento libero (AI classifica)` → `Free-form input (AI classifies)`, `Substrate da clipboard/PDF/YouTube` → `Substrate from clipboard/PDF/YouTube`.
- Guide submenu items: `Checklist iniziale` → `Getting Started checklist`, `Tutorial concetti` → `Key concepts tutorial`, `Welcome (riavvia)` → `Welcome (restart)`, `Dimmi come procedere` → `Tell me what to do`.
- Sidebar hint dismiss button: `Capito` → `Got it`.

### Repo housekeeping

`releases/` folder restructured: each version now has its own subfolder `releases/vX.X.X/` containing zip + BETA-INSTALL + main.js + manifest.json + versions.json. `package-release.ps1` updated to write into the per-version folder.

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
