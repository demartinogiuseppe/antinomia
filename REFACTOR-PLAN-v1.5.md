# Refactor Plan v1.5 — Split main.ts into modules

**Status**: not started
**Stima**: ~15h concentrato, 2-3 giornate realistiche
**Branch**: `refactor/modular` (da creare prima di toccare codice)
**Commit strategy**: incrementali per fase, smoke test ad ogni step, mai lasciare build rotto a fine giornata

## Stato del codebase (giugno 2026)

- `plugin/main.ts` — **12.000+ righe**, tutto monolitico
- Plugin live su BRAT: **v1.4.0** (rilasciata 2026-06-05)
- Repo: https://github.com/demartinogiuseppe/antinomia (main @ 3a28e6b)
- Build: `npm run build` (esbuild bundle a `main.js` ~750KB)
- TestVault: `G:\AAAiProject\Claude\AntinomiaV1\AntinomiaV1Plugin\Antinomia V1 Plugin\TestVault\` (gitignored, contiene cluster PDF + tensions di test)
- Sviluppo dev locale: aveva ~25 bug fixati + 2 nuove patch (#143 vx fix, #144 edge glow) accumulati per v1.4.1 patch ma non ancora rilasciati

## Target structure

```
plugin/
├── main.ts                    # entry + AntinomiaPlugin class (load/unload, commands registration)
├── core/
│   ├── types.ts               # tutte le interface (SubstrateFields, TensionFields, PrincipleFields, PdfConcept, AIUsageMeta, GraphFilters, ecc.)
│   ├── constants.ts           # TYPE enum, FOLDER, VIEW_TYPE_*, LAYER_COLORS, DEFAULT_GRAPH_FILTERS, GRAPH_STYLE_PRESETS
│   ├── frontmatter.ts         # humanTitle, layerKey, stripFrontmatter, yamlQuote
│   ├── templates.ts           # substrateTemplate, tensionTemplate, principleTemplate, defeatedTemplate
│   ├── utils.ts               # timestampId, todayISO, ensureFolder, extractYouTubeId, debounce, ecc.
│   └── settings.ts            # AntinomiaSettings interface + DEFAULT_SETTINGS
├── ai/
│   ├── callAI.ts              # callAI function + types ClaudeMessage, ClaudeResponse
│   ├── prompts.ts             # CLASSIFY_SYSTEM, TITLE_SYSTEM, HUNTER_SYSTEM, PRINCIPLE_SYSTEM, PRESUPPOSTI_SYSTEM, FREE_INPUT_SYSTEM, EXTRACT_CONCEPTS_SYSTEM
│   ├── detectModel.ts         # detectModelCapabilities + ModelFamily, ReasoningVocab, ModelCapabilities
│   ├── parseResponse.ts       # parseAIResponse, parseTitleFromAIResponse, extractJson
│   ├── pingBackend.ts         # pingLocalBackend + cache
│   └── notifyUsage.ts         # notifyAIUsage helper + ErrorAckModal + showErrorModal + renderUsageMetaBanner
├── modals/
│   ├── ProfileEditModal.ts
│   ├── WelcomeModal.ts
│   ├── ConfirmModal.ts
│   ├── GuidanceModal.ts
│   ├── TutorialModal.ts
│   ├── ClassifyConfirmModal.ts
│   ├── TitleEditModal.ts
│   ├── DefeatedReasonModal.ts
│   ├── ElevateToPrincipleModal.ts
│   ├── FreeInputModal.ts
│   ├── NewTensionModal.ts
│   ├── NewSubstrateModal.ts
│   ├── MapPresuppostiModal.ts
│   ├── PdfSourcePickerModal.ts
│   ├── PdfPickerModal.ts
│   ├── PdfAnalyzingModal.ts
│   └── PdfConceptsPreviewModal.ts
├── views/
│   ├── OpenTensionsView.ts
│   ├── HunterContradictionsView.ts
│   ├── DismissedPairsView.ts
│   ├── SubstrateListView.ts
│   ├── PrinciplesListView.ts
│   ├── DefeatedListView.ts
│   ├── OnboardingView.ts
│   ├── DashboardView.ts
│   ├── AuditView.ts
│   ├── UnclassifiedView.ts
│   └── GraphView.ts           # AntinomiaGraphView + tutto il continuous physics + edge overlay
├── flows/
│   ├── pdfIngest.ts           # extractPdfText + extractConceptsFromPdfText + bulkCreateSubstratesFromConcepts + createOrUpdatePdfHubNote + importPdfFromDisk + openSubstrateFromPDF
│   ├── youtubeFetch.ts        # fetchYouTubeTranscript + openSubstrateFromYouTube + askYouTubeUrl
│   ├── hunter.ts              # runHunter + buildHunterSystem + dismissContradiction + undismissContradiction
│   ├── freeInput.ts           # analyzeFreeInput + openFreeInputModal + openFreeInputFromClipboard
│   ├── elevation.ts           # elevateToPrinciple + elevateSplit + elevateTransform + proposeIfThenFromContent
│   ├── presupposti.ts         # proposePresuppostiFromContent + applyPresupposti
│   ├── titleProposal.ts       # proposeTitleFromContent + proposeTitleAI
│   └── exampleVault.ts        # createExampleNotes + deleteExampleNotes
└── helpers/
    └── withLoadingButton.ts   # withLoadingButton (signal + stop button + counter)
```

## Order of extraction (CRITICAL — respect dependency order)

1. **`core/types.ts`** prima di tutto (nessuna dipendenza)
2. **`core/constants.ts`** (dipende solo da types)
3. **`core/utils.ts`** (dipende da niente o solo Obsidian)
4. **`core/frontmatter.ts`** (dipende da types + constants)
5. **`core/templates.ts`** (dipende da types + frontmatter)
6. **`core/settings.ts`** (dipende da types)
7. **`ai/prompts.ts`** (dipende da niente, solo string constants)
8. **`ai/parseResponse.ts`** (dipende da types)
9. **`ai/detectModel.ts`** (dipende da niente)
10. **`ai/pingBackend.ts`** (dipende da niente di Antinomia)
11. **`ai/callAI.ts`** (dipende da detectModel + parseResponse + pingBackend)
12. **`ai/notifyUsage.ts`** (dipende da types + Obsidian Notice/Modal)
13. **`helpers/withLoadingButton.ts`** (dipende da niente)
14. **`modals/*.ts`** (ognuno dipende da core + ai + helpers — niente cross-modal)
15. **`views/*.ts`** (dipende da tutto sopra + modals)
16. **`flows/*.ts`** (ULTIMI — dipendono da tutto)
17. **`main.ts`** finale (solo entry + plugin class che importa flows + views)

## Punti rischio noti

- **`AntinomiaPlugin` class** è gigante con 30+ metodi async — ognuno deve diventare un export function in `flows/` e essere chiamato via `await flowName(plugin, args)` invece di `await this.flowName(args)`
- **Cross-reference modal → plugin**: modals oggi fanno `this.plugin.xxx()` per chiamare metodi. Dopo refactor: passare `plugin: AntinomiaPlugin` come constructor param resta uguale, ma `plugin.xxx()` deve mappare ai nuovi function exports
- **State condiviso**: `_reasoningWarningShown` (Set globale), `_pingCache` (Map globale) — devono restare module-scoped, NON in plugin instance
- **Cytoscape state**: `AntinomiaGraphView` ha tantissimo state interno (this.cy, this.physicsRAF, this.velocities, ecc.) — quello rimane dentro la class
- **TYPE constant**: usato ovunque, definito in `constants.ts` — importarlo è la modifica più frequente

## Verifica post-refactor (smoke test)

Prima di committare, in TestVault:
1. New tension guidata + Propose title (AI)
2. New substrate guidato + Propose title (AI)
3. Free input → classificazione → modal con banner usage
4. Eleva tension → principle con IF/THEN AI
5. Map presupposti con Propose (AI)
6. Hunter run su 4-5 note
7. PDF ingest end-to-end
8. Graph view: aggiungi substrate → no TypeError vx
9. Graph view: filtri funzionanti per meta_note + principle
10. Sidebar Antinomia: Substrate / Principles / Defeated / Hunter results / Dashboard

## Esbuild config

`plugin/esbuild.config.mjs` ha `entryPoints: ["main.ts"]`. Dovrebbe funzionare invariato — esbuild segue gli import e bundle tutto. Backup automatico funziona.

## Cosa NON cambiare durante questo refactor

- Funzionalità: zero cambi di behavior. Solo riorganizzazione struttura.
- Versione: resta v1.4.0 fino a refactor + smoke test OK, poi bump v1.4.1 e release.
- Schema frontmatter: invariato.
- AI prompts: invariati testualmente.

## Branch + commit strategy

```bash
git checkout -b refactor/modular
# Estrai un file alla volta, commit ad ogni step:
git add plugin/core/types.ts plugin/main.ts && git commit -m "Refactor: extract types to core/types.ts"
git add plugin/core/constants.ts plugin/main.ts && git commit -m "Refactor: extract constants to core/constants.ts"
# ... ecc ad ogni step
# Al termine:
npm run build  # verifica
# Smoke test in TestVault
git checkout main
git merge refactor/modular --no-ff
git push origin main
```

## Dopo il refactor

Bump v1.4.1, CHANGELOG entry "Internal: split main.ts into modules (no behavior change)" + i 2 fix accumulati (#143, #144) + qualunque altro fix in coda al momento. Release standard.
