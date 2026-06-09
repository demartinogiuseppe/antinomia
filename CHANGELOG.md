# Changelog

## v1.5.6 (June 9, 2026) — Map presuppositions: standard AI progress modal

- **UX:** Map presuppositions AI flow now uses the standard progress modal (Stop + token usage notice). Launching *"Map presuppositions of this principle"* (command palette or the 🔑 card button) now shows the same loading UI as Hunter / PDF extract / title flows: a modal with a live elapsed timer and a **⛔ Stop** button that aborts the in-flight AI call. On completion the modal closes, a clickable *"tokens used"* notice appears (→ token details), and the review modal opens. Stop closes the modal with no notice and no review; errors (e.g. local backend offline) show the standard error modal.
- New reusable `modals/AIProgressModal` (title + dynamic status line + elapsed timer + Stop → `AbortController.abort()`), shared loading UI for command-context AI flows.
- **Polish:** load-bearing presupposition nodes in the graph no longer draw a gold ring — the translucent border read as a detached second circle. Size + brighter glow alone flag the invariants.

No schema changes, no breaking, no new settings.

## v1.5.5 (June 9, 2026) — Cross-pane hover highlight + presupposition polish

Hovering now connects the **Antinomia Graph** to the rest of Obsidian. The link is bidirectional and goes through a single central "hover bus", so there are no feedback loops and everything is torn down cleanly on unload.

- **Feature — cross-pane hover highlight:**
  - Hover a node in the Antinomia Graph → its file lights up in the **File Explorer**, the **Antinomia sidebars** (note cards), and the **Backlinks / Outgoing Links** panes (`.antinomia-hover-highlight`: accent outline + hover background).
  - Hover a file entry in any of those panes → the matching graph node gets `hover-focus` (size bump + brighter glow) and its neighbors get `hover-neighbor` — same reaction as hovering the node directly.
  - Implemented via a singleton `hoverBus` (`core/hoverBus.ts`): publishers emit `enter`/`leave` tagged with a `source`; subscribers skip their own source (the loop guard). DOM publishers are delegated + ~50ms throttled; listeners use `registerDomEvent` and the bus is cleared on unload.
- **Polish — presupposition wikilinks:** `presupposes` / `presupposes_of` frontmatter now writes **aliased wikilinks** `[[U-…|Human title]]` when a title is known, so the source view reads naturally instead of showing opaque `U-` IDs.
- **Polish — load-bearing nodes:** the gold ring on load-bearing presuppositions is now a thin, semi-transparent halo (border 8 / opacity 0.28) instead of a thick marker — reads as a soft glow.

No schema changes, no breaking, no new settings.

## v1.5.4 (June 9, 2026) — Disambiguate "Presuppositions" in the global nav

Follow-up to v1.5.3. The new card button "🔑 Presuppositions" and the global nav entry "🔑 Presuppositions" had the same label but did different things, which was confusing. The nav entry is renamed.

- **UX:** renamed the global nav menu entry **"🔑 Presuppositions" → "🔑 Presuppositions Map"**. The nav menu opens the *view* (list of presuppositions with their dependent principles); the card button (v1.5.3) runs the *AI mapping flow* on the active principle.

No schema changes, no breaking, no new settings.

## v1.5.3 (June 9, 2026) — Map presuppositions button on principle cards

Small UX add: each principle card in the **Principles (Truth Archive)** sidebar now exposes a **🔑 Presuppositions** button that runs *"Map presuppositions of this principle"* directly — no need to open the command palette and re-find the action every time.

- **UX:** added inline 🔑 Presuppositions button on each principle card (next to Title / Link / × Defeated). Tooltip: *"Map presuppositions of this principle (AI)"*.
- Same AI flow as the command palette entry — opens the review modal with deduplication against existing `U-` notes.

No schema changes, no breaking, no new settings.

## v1.5.2 (June 9, 2026) — IT residual cleanup in Principles view and elevation flow

Bonifica di 5 stringhe italiane mai tradotte dalla v1.2.0 English release. Sono tutte user-visible: emergevano nell'header della Principles view, nel prefix di origine delle card principio, e nelle note generate quando si eleva una tensione a principio.

- **fix:** `PrinciplesListView` subtitle from *"Regole operative IF/THEN/GREY emerse dalla risoluzione delle tensioni"* → *"Operational IF/THEN/GREY rules emerged from resolving tensions"*.
- **fix:** principle card origin prefix *"Origine:"* → *"Origin:"*.
- **fix:** elevation flow — generated principle note title *"Principio da X"* → *"Principle from X"*.
- **fix:** orphan-principle defeated companion title *"Tensione originaria di X"* → *"Original tension of X"* (4 occurrences in `main.ts`).

No schema changes, no breaking, no new settings.

## v1.5.1 (June 8, 2026) — UX polish for the presuppositions map

- **UX:** the **Presuppositions Map** is now reachable from the global Antinomia nav menu (🔑 Presuppositions, between Graph and Audit) — not just the ribbon icon and command palette.
- **UX:** renamed the legacy tension command **"map presuppositions (AI)" → "Map tension presuppositions"** so it no longer collides with the v1.5.0 "Map presuppositions of this principle". The inline tension-card button tooltip is clarified to match.

## v1.5.0 (June 8, 2026) — PTM Core: invariant presuppositions map

The first PTM Core release. A new layer that surfaces the **load-bearing assumptions** your principles silently rest on — and, crucially, the **invariants** shared by several principles. When an invariant fails, you see exactly which principles fall with it.

**New layer: presuppositions (`U-`)**
- A new `antinomia_type: presupposition` (file prefix `U-`, "Underlying"). Each presupposition is an implicit assumption a principle takes for granted; `presupposes_of` lists the principles that depend on it. Principles gain a `presupposes` list. The two are kept in sync automatically (and a deleted `U-` note is stripped from every principle). Additive — existing vaults are unaffected.

**AI command — "Map presuppositions of this principle"** (principle notes only)
- Reads the principle's IF/THEN and body and proposes 3–5 genuinely implicit assumptions (not restatements). It is **deduplication-aware**: it sees the presuppositions already in your vault and prefers linking to an existing one over creating a near-duplicate. A review modal lets you, per item, create new / link existing / edit / skip; on confirm the bidirectional links are written.

**Invariants in the Graph**
- A 7th filter — **Presuppositions** (gold nodes, default on) — plus `principle → presupposes → presupposition` edges. A presupposition shared by **more than one** principle is a **load-bearing assumption**: it renders larger, brighter, ringed in gold, with a tooltip naming how many principles it supports.

**Dedicated Presuppositions Map** (ribbon, key icon)
- Lists every presupposition with the principles resting on it. Filter to **load-bearing only**, sort by **most-supported**, click to open, or ask **"What collapses if this fails?"** — a modal listing the affected principles, with a button to mark the assumption **undermined**.

**Example vault** now seeds two principles plus five presuppositions where one — *"Budget clarity signals client seriousness"* — is shared by both, so opening the example and the graph shows a real gold invariant. `EXAMPLE-KEY.md` explains the concept.

Tests: 132 → 148 (presupposition parser, dedup/sync helpers, and an integration test of the full create→link→sync→delete cycle).

## v1.4.6 (June 8, 2026) — 3D parallax graph

**Features**
- **3D depth effect** on the Antinomia Graph view via parallax pan. Three independent layers stacked behind the graph:
  - **Nebula** (deepest): the existing galaxy backdrop, now translates at 0.15× pan velocity — barely moves, simulating cosmic distance.
  - **Stars** (mid): ~100 randomly placed white pinpoints generated at view-open (fresh seed each session), translate at 0.5× — middle distance.
  - **Nodes + edges** (front): unchanged 1:1 pan.
- Drag the graph and watch nodes glide past stars, while the nebula remains nearly fixed — convincing depth on a 2D canvas.

**Notes**
- Parallax fires on `pan` events only — zoom keeps the background fixed in size (intentional, no scale parallax).
- Layers are `pointer-events:none` + `will-change:transform` so the GPU handles the translates without dropping frames.
- Layers anchor with `isolation:isolate` and z-index -2/-1 to coexist with the Cytoscape canvases (z 1–3) and the edge-glow SVG (z 0).
- Toggle in Settings → Graph view → **"Galaxy background"** (default ON) controls all three layers together; OFF restores a flat container.

## v1.4.5 (June 7, 2026) — Galaxy nebula background for the Graph view

**Features**
- **Galaxy nebula background** for the Antinomia Graph view — a cosmic nebula photo behind the graph, with a 45% dark overlay so nodes and edges stay perfectly readable.
- **"Galaxy background" setting** in Settings → Graph view (default ON). Live toggle — no Obsidian restart.

**Notes**
- No impact on zoom, pan, edge overlay, or layer filters. The image is anchored to the container, so it doesn't parallax while the graph pans/zooms.
- Bundling: the image is a JPEG (~64 KB) embedded as a base64 data URI inside `styles.css` (~87 KB). Because BRAT auto-fetches `styles.css`, the background ships with auto-updates — no separate asset to package.

## v1.4.4 (June 7, 2026) — Migration utility

If you installed Antinomia back at **v1.1.x** (Italian schema) and updated via BRAT, your vault would break — the new code doesn't recognise the old Italian frontmatter keys, so the graph wouldn't render and the Hunter would ignore your notes. This release adds a safe, one-command fix.

- **#150 Migration utility (v1.1 → v1.4)**: command **"Antinomia: Migrate vault from v1.1 to v1.4 (english schema)"** renames 16 frontmatter keys, the `antinomia_type` / `status` / `motive` enum values, and 10 body markers to the English schema. It is **idempotent** (safe to run twice; already-migrated notes are skipped) and **backup-first** — a complete copy of every affected note is written to `notes/.antinomia-pre-migration-backup-<timestamp>/` before anything changes. A second command, **"Restore pre-migration backup (latest)"**, undoes the migration. On load, if legacy notes are detected, a single clickable 5-second Notice offers to migrate (never an aggressive modal; toggle it off in Settings).
- **Internal**: `layerKey` extracted to `core/frontmatter.ts` and `normalizeHunterPair` to `ai/parseResponse.ts` (both behavior-neutral, done for the test refactor).
- **Tests**: 107 → 132. Unit tests for the pure migration transforms (keys/enums/body markers + idempotency) and an integration test running the full migrate → backup → restore cycle over a fixture vault. Coverage on the tested modules ~47%.

Your data is never touched without a backup. If anything looks off after migrating, run the restore command.

## v1.4.3 (June 7, 2026) — Robust AI parsers + retry strategy

Reasoning models (e.g. qwen3-distill) sometimes reply with prose instead of the requested JSON, which made the Free-input and Hunter flows fail outright. Both now degrade gracefully instead of throwing the work away.

- **Free input (#160)**: new fallback parser — strict JSON → loose JSON-ish field extraction → discursive heuristic that reads a model narrating its choice ("I'll classify this as a 'substrate'… the title could be 'Financial Documentation Requirements'"). If parsing still fails, one automatic retry with a reinforced STRICT-JSON prompt (with a transparent Notice), and finally an "Open response as substrate" escape hatch that keeps the raw text as an editable substrate instead of losing it.
- **Hunter (#161)**: one automatic retry with a reinforced JSON-only prompt when the first reply isn't a valid `pairs[]` structure (transparent Notice, no silent retry). Network/abort errors still bail immediately. If the retry also fails, the error modal gains an "Open raw response" button that writes the payload to a `HUNTER-RAW` debug note. No fragile prose pattern-matching on the structured pair list — explicit retry is more reliable.

Additive: well-formed JSON still parses on the first pattern, so there's no behavior change for compliant backends.

## v1.4.2 (June 7, 2026) — Quick polish

A round of small fixes and UX polish.

- **Cloud-profile privacy warning (#163)**: activating a non-local (cloud) profile now shows a modal spelling out the implications — your notes leave the machine to a third party (their ToS / possible training), per-token cost, network latency, the provider can read your tensions. "Cancel" reverts the switch; a "don't warn me again" toggle persists the choice.
- **Profile baseUrl sanity check (#162)**: at load, if a profile matches a known backend preset (by id/name) but its baseUrl points at a different host (e.g. a "Groq" profile left on `api.anthropic.com`), a non-blocking Notice offers a one-click "Fix".
- **Title parsing rejects meta-content (#164)**: reasoning models that ignore the JSON-only instruction sometimes leaked a fragment like "as a JSON object with one title" as the note title. The last-resort line picker now rejects meta-instruction shapes — while preserving legitimate titles that happen to contain words like "value", "object", or "string".
- **Plugin version in Dashboard (#136)**: shown as a subtle line under the Dashboard heading.
- **Token badge on the Hunter button (#138)**: the inline token-usage badge (same UX as the Title badge) now also appears next to the Run Hunter button, complementing the run-metadata header.
- **No surprise sidebar after PDF ingest (#139)**: the Substrate list is only revealed if it was already open, instead of force-opening a leaf you didn't ask for.
- **Double Elevate modal fixed (#65)**: two rapid clicks could open the elevate form twice — a check-then-act race where the guard flag was set after an `await`. The guard is now claimed synchronously.
- **English Notices (#111, #159)**: translated the last residual Italian strings in file-IO / flow Notices and the Free-input "Analyze with AI" button.

## v1.4.1 (June 7, 2026) — Refactor + patch

### Internal refactor (no behavior change)

`plugin/main.ts` split from a 12,138-line monolith into **2,410 lines** (-80%) across **53 module files**:

- `core/` — types, constants, utils, frontmatter, templates, settings
- `ai/` — prompts, parseResponse, detectModel, pingBackend, callAI, notifyUsage
- `helpers/` — withLoadingButton, renderTensionContext, renderAntinomiaNav, renderNoteCard
- `modals/` — one class per file (18)
- `views/` — one class per file (11)
- `flows/` — pdfIngest, youtubeFetch, hunter, freeInput, elevation, presupposti, titleProposal, exampleVault (8)

Flow methods use a **delegator pattern**: each flow's logic lives in `flows/*` as `f(plugin, …)`, and the plugin class keeps a thin `f(…) { return f(this, …) }`, so the public `plugin.x()` API the UI calls is unchanged. Zero behavior change; verified by build + typecheck holding constant across every extraction step.

Two dependency-cycle findings surfaced and resolved during the split:
- `parseResponse ↔ callAI` — broke by moving the transport types (`ClaudeMessage` / `ClaudeResponse`) to `core/types`.
- `AntinomiaGraphView` referenced the `cytoscape` UMD global once extracted into its own module — fixed with an explicit `import cytoscape`.

### Fixes

- **BUG-GRAPH-001**: `TypeError: Cannot read properties of undefined (reading 'vx')` on `rebuildGraph` during the physics loop — nodes added after `startContinuousPhysics()` (e.g. a substrate created via PDF ingest while the graph view was open) had no velocity entry. Now lazy-initialized.
- **BUG-CLOUD-001**: Groq cloud rejected `chat_template_kwargs` / `extra_body` with HTTP 400. These runtime-specific reasoning-disable fields (LM Studio / vLLM / Ollama) are now sent **only** to local backends; cloud relies on `reasoning_effort` or nothing.

### UX

- Edge glow on the graph reduced ~60% — thinner halo, sharper core line, less dominant overall.

## v1.4.0 (June 5, 2026) — PDF concept extraction, autoadaptive model layer, resilient AI flows

The largest release since the English schema migration. Three big themes:

1. **PDF → substrates**: drop a PDF in the vault (or import from disk), Antinomia extracts standalone concepts via AI and creates one substrate per concept, automatically grouped in a per-PDF subfolder and wired together in the graph view via a meta_note "hub" node — so each PDF becomes a visible cluster.
2. **Autoadaptive model layer**: Antinomia now classifies your active model into a family (Anthropic, OpenAI o-series, Qwen3-reasoning, DeepSeek-R1, Llama, Mistral, Phi, Gemma, etc.) and adapts `max_tokens`, reasoning vocabulary, and behavior accordingly. No more configuring max_tokens by hand, no more sending `"low"` to a backend that only knows `"on"/"off"`, no more empty responses from reasoning distills that consume all tokens in `<think>`.
3. **Resilient AI flows**: every AI call now has a real Stop button that closes the local TCP connection (LM Studio actually stops generating), a persistent ack modal for errors instead of a 5-second Notice the user can't read in time, a clickable token usage indicator, and a fallback path that recovers the answer from `reasoning_content` when the model writes there instead of `content`.

### NEW — PDF ingest with AI concept extraction

Open the sidebar quick-actions menu → **Substrate from PDF**. Pick a PDF already in the vault, or import one from disk (HTML5 file picker, copies it to `attachments/`). Antinomia extracts the text via Obsidian's bundled `pdfjsLib`, sends it to the AI with a prompt designed to surface 5-20 standalone concepts (quotes, facts, observations, claims — NOT summaries), and shows a preview modal where you check which concepts to save as substrates.

Each generated substrate goes into a dedicated subfolder `notes/from-pdf-<basename>/`, carries `source: "PDF: <basename>"` + `origin: pdf_extraction` in its frontmatter, and links via `links: [[H-<basename>]]` to a meta_note "hub" the plugin creates automatically. The hub note lists all extracted concepts, links back to the original PDF, and lives at the root of the per-PDF subfolder. **Effect in the graph view**: each PDF becomes a cluster — hub in the center, N concept satellites around it.

Cap at 30,000 characters per PDF for the MVP (chunking for longer documents is planned for v1.5). Scanned/image-only PDFs are detected and produce a friendly error pointing to v1.5 (OCR via vision models). Stop button works during the AI call via a dedicated progress modal with abort signal.

### NEW — Autoadaptive AI behavior (`detectModelCapabilities`)

Until now, every AI call hardcoded `max_tokens: 200` (or 600, or 1024 — depending on the call site). For non-reasoning models this was generous; for Qwen3 reasoning distills it was a death sentence — the model burned all 200 tokens in `<think>` and returned an empty `content`.

The new `detectModelCapabilities(model)` function classifies the active model into a family and returns:
- `isReasoning: boolean`
- `reasoningVocab: "openai" | "on_off" | "none"` (mismatched vocab is a major source of silent failures — OpenAI rejects `"off"`, LM Studio Qwen3 promotes unknowns to `"on"`)
- `recommended.{short, medium, deep}` max_tokens per task category

Call sites now pass `taskClass: "short" | "medium" | "deep"` instead of a fixed number. Titles and free input are `short` (auto-disable reasoning where supported); IF/THEN and presuppositions are `medium`; Hunter is `deep` (leaves reasoning on).

A one-shot per-session console warning fires when you use a reasoning model for a short task, suggesting you create a dedicated "Fast" profile with a non-reasoning model (Llama 3.x, Mistral, Phi) for the trivial calls while keeping the reasoning model for Hunter.

### NEW — Persistent error modal (`ErrorAckModal`) with full details

Every AI failure used to show a Notice that disappeared after 5 seconds. With reasoning models on local hardware, by the time you'd parsed the message it was already gone. v1.4 replaces those Notices with an `ErrorAckModal`:

- Title, plain-English message, collapsible "Technical details" with profile, model, URL, raw response payload
- **Copy message** button (puts the whole modal content on the clipboard for sharing in a bug report)
- **Copy details** button (just the technical block)
- Selectable text in the body
- OK to dismiss

Used by every AI catch path: `proposeTitleFromContent`, `proposeTitleAI`, `proposeIfThenFromContent`, `proposePresuppostiFromContent`, `analyzeFreeInput`, `runHunter`, `extractConceptsFromPdfText`.

### NEW — Token usage inline badge + clickable Notice

After every successful AI call you see two indicators:
- A **Notice** at top-right: `Antinomia · Title · ↓ 42 in / ↑ 18 out · 2.1s` — clickable to open a detailed modal (operation, profile, model, URL, throughput in tok/s, hint about reasoning model overuse if > 1000 tokens)
- An **inline badge** next to the triggering button: `Tokens: ↓42 ↑18 · 2.1s` — persistent until you re-click the button or close the parent modal

When the originating modal closes (e.g. Free input → NewTension/NewSubstrate), the usage info propagates via a new `AIUsageMeta` type and appears as a banner at the top of the downstream modal: `Pre-filled by Free input · Tokens: ↓N ↑M · Xs`. No more losing the info because the source modal closed too quickly.

### Fixed — `reasoning_content` fallback for Qwen3 distills

Qwen3 distills via LM Studio (e.g. `qwen3-14b-claude-4.5-opus-high-reasoning-distill`) write their actual output in `message.reasoning_content`, not `message.content`. When `max_tokens` truncated the call mid-reasoning, `content` was `""` and the title parser saw nothing.

Fix: `parseAIResponse` now falls back to `reasoning_content` when `content` is empty, with a console warning. The downstream pattern parsers (`parseTitleFromAIResponse` with 5 patterns including JSON extraction, label match, quoted string, skip-reasoning-lines heuristic) can usually fish the final answer out of the reasoning trace.

Also logs a console warning when `finish_reason === "length"` so you know `max_tokens` was the bottleneck.

### Fixed — Stop button now stops everything

Several AI flows had `withLoadingButton(..., (signal) => ...)` passing a signal that the async function ignored (`proposeTitleFromContent`, `analyzeFreeInput`, `proposeIfThenFromContent`). Stop button visually disappeared but the AI kept running. Fixed: all of them now accept and propagate `signal` to `callAI`, which uses Node's `http.request` for local backends and calls `req.destroy()` on abort — closing the TCP socket so LM Studio actually stops generating.

Also: when Stop is clicked *after* the backend has already begun streaming the response, `callAI` may still resolve successfully with a partial body. New silent-abort check (`if (signal?.aborted) return null`) prevents an unwanted "AI response not parseable" error modal from appearing in that race-condition window.

### Fixed — Pre-flight ping for local backends

Before each AI call to `localhost`/`127.0.0.1`/`*.local`, the new `pingLocalBackend()` hits `<baseUrl>/v1/models` with a 2-second timeout (results cached 30s alive / 5s down). If the local server is off, the user gets a friendly error: *"Local AI backend not reachable at http://localhost:1234. Start LM Studio / Ollama (Local Server) and try again."* Instead of a cryptic ECONNREFUSED dumped into a Notice.

Also fixed a latent bug where `baseUrl` ending in `/v1` (the common case) caused the ping to hit `/v1/v1/models`.

### Fixed — `reasoning_effort` vocabulary across runtimes

The `reasoning_effort` body field uses different vocabularies across providers:
- **OpenAI cloud** (o-series, GPT-5): `"low" | "medium" | "high"` (rejects others with 400)
- **LM Studio ~0.3.x**: `"on" | "off"` (promotes unknowns silently to `"on"`)
- **LM Studio 0.4.x+**: `"none" | "minimal" | "low" | "medium" | "high" | "xhigh"` (rejects `"off"` with 400)

Sending the wrong vocabulary was the root cause of "model bursts tokens for no reason" and "400 invalid_value" errors in v1.3. Fix: route by `caps.reasoningVocab` — for `openai-reasoning` family send `"low"`; for everything else (local reasoning models) send nothing and rely on `chat_template_kwargs.enable_thinking: false`, which works at the model-template level across runtime versions.

### Fixed — Hunter internal schema fully migrated to English

`HunterContradiction` and `HunterResult` interfaces still used Italian field names (`nota_a`, `nota_b`, `descrizione`, `contraddizioni`, confidence `"alta" | "media" | "bassa"`) even after the v1.2 English UI migration — pure technical debt that confused the prompt language detection because the AI saw mixed-language signals. Fully migrated to `note_a`, `note_b`, `description`, `pairs`, `high/medium/low`. `normalizePair` keeps backward-compat for AI responses in either schema; sorted results, dismiss key, badge color map, and view rendering all updated.

### Fixed — Graph view: meta_note and principle nodes now actually render

`GraphFilters` interface had keys `meta_nota` and `principio` (Italian), but `layerKey()` returns `meta_note` and `principle` (English). Lookup `this.filters["meta_note"]` returned `undefined` → node silently excluded from the graph. This had been broken since v1.2 but hidden because nobody ever toggled those filters explicitly. Discovered while debugging why the PDF hub clusters weren't rendering. Now meta_notes and principles appear correctly, with their proper colors (purple and dark green respectively).

### Fixed — Gemma 4 classification

`detectModelCapabilities` treated all `gemma*` models as non-reasoning instruct. Gemma 3+ and 4 ship with thinking ENABLED by default in their chat template (similar to Qwen3 distills) and write their output to `reasoning_content`. The 200-token short-task budget caused empty content + parser fallback to a fragment of internal reasoning ("thinking through" extracted as title, etc.). Now `gemma-[34+]` is recognized as `qwen3-reasoning`-equivalent: 4000 token budget for short tasks, `enable_thinking: false` signal sent (which some Gemma 4 distills still ignore — for those, switching to a true non-reasoning model is the only fix).

### Fixed — Bulk note creation no longer collides on timestamp ID

`timestampId()` has 1-second resolution. Creating N notes in the same second (PDF ingest, batch imports) caused `S-YYYYMMDD-HHmmss.md` collisions — first note succeeded, rest silently failed. Fix: `createNote()` now appends `-001`, `-002`, ... suffix when a path is already taken. Applies to all future bulk flows, not just PDF.

### Fixed — Front Matter Title "Approve changes" prompt during PDF ingest

When generating bulk substrates with body wikilinks like `[[H-xxx]]`, the Front Matter Title plugin showed an "Approve changes" dialog for each one proposing to add an alias. Fix: pre-write wikilinks with explicit alias `[[basename|<title>]]` so FMT has nothing to suggest.

### Fixed — Various Italian residues from the v1.2 EN migration

- Prompt `Hunter` had `confidence: bassa` in an otherwise English prompt
- Notice in callAI: `"API key mancante"`, `"Base URL mancante"`, `"AI errore <status>"`
- Notice in `proposeTitleFromContent`: `"AI: risposta titolo non parseable"`, `"AI errore title"`
- Sidebar `HunterContradictionsView`: `"coppie nascoste perche' gia' dismessas"`, `"Escluse N note"`, `"Marca come falso positivo"`
- `analyzeFreeInput` loading text `"⏳ Analizzando..."` → `"⏳ Analyzing..."`
- `createNote` Notice `"Creata: ..."` and `"Errore: ..."` → `"Created: ..."` and `"Error: ..."`

A few notice in file-I/O paths (10 occurrences in note manipulation) are still in Italian and will be cleaned up in v1.4.1.

### Fixed — Cytoscape and CSS deprecations

- Edge `node:grabbing` selector is invalid in Cytoscape (the state is `:grabbed`)
- CSS `appearance: slider-vertical` is deprecated in Chromium — replaced with the standard `writing-mode: vertical-lr; direction: rtl` pattern

### Fixed — FreeInputModal callsite from sidebar crashed when clicked

The sidebar quick-actions item *"Free-form input (AI classifies)"* called `new FreeInputModal(plugin.app, plugin).open()` — missing the required third argument (`onAnalyzed` callback). Click Analyze → `Uncaught TypeError: this.onAnalyzed is not a function`. Latent since the modal was introduced. Fix: route via `plugin.openFreeInputModal()` which supplies the callback.

---

## v1.3.0 (June 2, 2026) — Multilingual Hunter, Meta filter fix, smoother graph interactions

A focused polish release: the Hunter now adapts its output language to the user's notes (no more forced Italian on Llama/Groq), the Meta filter in the graph view finally matches notes (had a latent typo bug), and the graph re-layout after toggling filters is smooth and respects existing node positions instead of swarming everything to the center.

### Hunter: English-keyed JSON schema to suppress Italian language bias

In v1.2.9 the system prompts told the AI to "detect the user's language and reply in that language", but Llama 3.3 on Groq kept responding in Italian. Root cause: the JSON schema keys (`contraddizioni`, `nota_a`, `nota_b`, `descrizione`, `confidence: alta|media|bassa`) were stronger language signals than the English instructions in the prompt.

Fix: the AI is now asked to reply with English keys (`pairs`, `note_a`, `note_b`, `description`, `confidence: high|medium|low`). The parser accepts both schemas (new English + legacy Italian) and normalizes everything to the internal Italian shape used downstream, so existing saved runs, dismiss lists, and the sidebar UI keep working unchanged.

### Bug fix: Meta filter in the graph view matched zero notes

`layerKey()` checked `t === TYPE.meta_nota`, but the `TYPE` constant only exposes `TYPE.meta` (= `"meta_note"`). So `TYPE.meta_nota` was always `undefined`, every meta note was filtered out, and the "Meta" checkbox in the graph toolbar appeared broken. Fix: one-character change to `TYPE.meta`. Latent since v1.2.0.

### Smoother graph re-layout after filter toggle

Previously, toggling a filter checkbox triggered a full fcose re-layout with `animate: true` + `randomize: true` + `fit: true`. Result: all existing nodes scattered briefly toward the center, then re-spread — visually jarring.

Now the flow is:
1. `rebuildGraph()` adds new nodes at layer-specific positions (not at (0,0)), existing nodes stay put.
2. The continuous physics simulation runs at higher speed (MAX_SPEED 3.5 → 6.0, DAMPING 0.86 → 0.78, SPRING_K 0.012 → 0.018) to integrate new nodes quickly without lag.
3. An edge-node repulsion pass runs immediately to push nodes off lines they don't belong to, then a second pass at 600ms cleans residual overlaps.

Result: nodes that were already placed don't move; new nodes slide into position; lines rarely cross unrelated nodes.

### SVG overlay throttled to one repaint per frame

The SVG overlay that draws edges and labels was re-rendering on every Cytoscape `position` event (multiple times per frame as the physics moved nodes). With many edges (large vault), this caused visible lag. The overlay update is now wrapped in `requestAnimationFrame` so it redraws at most once per browser frame (~60fps), regardless of how many Cytoscape events fire.

### Hover interaction: simpler & snappier

- Animation duration 220ms → 130ms (snappier).
- Removed the "fade the rest of the graph" behavior — hover now only brightens the hovered node + its direct neighbors, the rest of the graph stays untouched.
- Hovered node grows 32 → 60px; connected neighbors stay at 32px but brighten via `background-image-opacity`.
- Hit-area expanded to 68px diameter (visible disc 32 + transparent 18px border on each side) — much easier to hover.

### Other small fixes

- Status bar Italian residue `esaminate X/X note in Yms con MODEL` → `examined X/X notes in Yms with MODEL`.
- `applyEdgeNodeRepulsion()` wraps position updates in `cy.batch()` so Cytoscape re-renders once per iteration instead of per node.
- No more `cy.fit()` at the end of edge-node repulsion — viewport stays where the user left it.

---

## v1.2.9 (June 2, 2026) — Multi-backend AI (Groq / OpenAI / OpenRouter / Ollama) + multilingual AI prompts

Two correlated changes that finally match what the README and Substack posts have been promising.

### Multi-backend AI: OpenAI-compatible support

Up to v1.2.8, despite the documentation claiming "Multi-backend AI: Anthropic, OpenAI, Groq, OpenRouter, LM Studio, Ollama", the `callAI` implementation was hard-coded on the Anthropic wire format (`POST /v1/messages`, headers `x-api-key` + `anthropic-version`, body `{system, messages}`). Anything that wasn't Anthropic Cloud or an LM Studio instance pretending to be Anthropic-compatible would 404.

Fixed by introducing a `detectApiFormat()` helper that classifies the base URL into one of two wire formats:

- **anthropic** — `POST /v1/messages`, body `{model, max_tokens, system, messages}`, headers `x-api-key` + `anthropic-version`. Used for `api.anthropic.com`.
- **openai** — `POST /chat/completions`, body `{model, max_tokens, messages:[{role:"system"}, ...]}`, single Bearer auth header. Used for Groq, OpenAI, OpenRouter, LM Studio, Ollama, and any custom OpenAI-compatible gateway.

The response parser (`parseAIResponse()`) is similarly format-aware: Anthropic returns `{content: [{type, text}]}`, OpenAI-compatible returns `{choices: [{message: {content}}]}`. Both are normalized into a uniform `{text, usage}` shape.

### New backend presets

The "Backend preset" dropdown in the AI profile modal now offers six pre-filled options:

| Preset | Base URL | Default model | Notes |
|---|---|---|---|
| Anthropic Cloud | api.anthropic.com | claude-sonnet-4-6 | Paid |
| **Groq Cloud (free tier)** | api.groq.com/openai/v1 | llama-3.3-70b-versatile | **Free, generous rate limits** |
| OpenAI | api.openai.com/v1 | gpt-4o-mini | Paid |
| OpenRouter | openrouter.ai/api/v1 | meta-llama/llama-3.1-8b-instruct:free | Some free models |
| LM Studio (local, free) | localhost:1234/v1 | qwen/qwen3.5-9b | Free, private |
| Ollama (local, free) | localhost:11434/v1 | llama3.2 | Free, private |

The model dropdown now includes the most useful models for each backend (Llama 3.3 70B, Llama 3.1 8B Instant, Mixtral 8x7B for Groq; GPT-4o + GPT-4o mini for OpenAI; etc.). Free-form Custom model field overrides as before.

`detectBackend()` recognizes all the new domains and auto-selects the right preset when editing an existing profile.

### Multilingual AI prompts

Every AI system prompt used to declare "English, concise" or "English, no quotes" as an output constraint. With non-Anthropic models (especially Llama 3.3 on Groq), the Italian JSON schema keys (`contraddizioni`, `descrizione`, `motivazione`, `presupposizioniA/B`) acted as a stronger language signal than the English instructions, and the model replied in Italian even when the user's vault was English.

Fixed by rewriting all six system prompts (CLASSIFY, TITLE, PRESUPPOSTI, FREE_INPUT, PRINCIPLE, HUNTER) with an explicit language directive:

> Detect the dominant language of THE USER'S input content (notes / tension / substrate) and write every text value in THAT language. The JSON keys are in Italian for historical reasons — they are NOT a language signal.

Enum-style values that are technical labels (`tipo: "tension" | "substrate" | "principle" | "defeated" | "meta_note"`) remain in English, since the parser depends on them. Free-text fields (`descrizione`, `motivazione`, `presupposizioniA/B`, `ifA`/`thenA`/`ifB`/`thenB`/`greyZone`, `title`, `statementA`/`statementB`/`contenuto`) follow the user's language.

The TITLE_SYSTEM prompt now also includes an Italian few-shot example alongside the two English ones, so the model has explicit precedent for both languages.

### Status bar Italian residue

Hunter run status bar said `esaminate X/X note in Yms con MODEL` (Italian). Now `examined X/X notes in Yms with MODEL`.

---

## v1.2.8 (June 2, 2026) — One-click install + auto-configure Front Matter Title

Onboarding overhaul focused on the single biggest friction point: getting Front Matter Title (FMT) installed and configured to read the `title` frontmatter field. Without this, the File Explorer shows timestamp basenames (`T-20260530-091416.md`) instead of human titles. Until this release, the user had to find the plugin manually in the Community Browser, install it, then navigate to its settings tab and set `path = title` + enable the Explorer feature by hand.

### One-click install via `obsidian://` URL scheme

The "Install Front Matter Title" button — in both the Welcome modal banner and Settings → Antinomia → Recommended plugin — now opens the FMT plugin page **directly** in the Obsidian community plugin browser via the `obsidian://show-plugin?id=obsidian-front-matter-title-plugin` URL scheme. The user only has to press Install + Enable on the page that opens. Fallback to the generic Community Plugins tab if the URL scheme fails on older Obsidian versions.

### Auto-configure FMT for Antinomia (smart 3-state button)

A new helper `configureFrontMatterTitleForAntinomia()` accesses the FMT plugin instance via `app.plugins.plugins[...]`, merges into its settings:

- `rules.items.title = { path: "title", enabled: true }`
- `features.explorer / graph / tab → enabled: true`

…then calls FMT's own `saveSettings()` (or writes `data.json` directly as fallback) and disable/re-enables the plugin so the changes take effect immediately. No restart required.

The banner / settings button now has three states:

| FMT state | Button label | Action |
|---|---|---|
| Not installed | "Install Front Matter Title" | Opens FMT page in community browser |
| Installed, not configured for Antinomia | "Configure FMT for Antinomia" | Smart configure (see below) |
| Configured | "✓ Front Matter Title configured" (disabled) | — |

**Smart configure** behavior: if FMT has no meaningful existing settings, the configuration is applied directly. If the user already has custom FMT settings, a confirmation dialog spells out exactly what will change (`Resolver path → title`, features enabled) and asks before overwriting. This respects users who have customized FMT for other workflows.

Detection (`isFrontMatterTitleConfiguredForAntinomia()`) sniffs the FMT settings JSON for `"path": "title"` plus `"explorer" ... "enabled": true`, so the banner disappears once FMT is properly set up.

---

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
