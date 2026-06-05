# Antinomia v1.3.0 — Bug log (sessione test new-user)

Data inizio test: 2026-06-03
Tester: Giuseppe (in modalità new-user simulation)
Vault test: `AntinomiaTest-NewUser` (vault Obsidian vuoto)
Install path: BRAT → `demartinogiuseppe/antinomia` → release v1.3.0
Backend AI: LM Studio (locale)

---

## 🐞 BUG — da sistemare

### BUG-001 — Titolo AI non parseable su LM Studio — 🟡 FIX APPLICATO, in test
- **Sintomo**: bottone "Propose title (AI)" nel modal "New substrate" restituisce Notice `"AI: risposta titolo non parseable."`. Nessun titolo inserito nel campo.
- **Backend**: LM Studio locale.
- **Modello LM Studio**: _da raccogliere_
- **Payload grezzo restituito dal modello** (console `Ctrl+Shift+I`, riga `[Antinomia] proposeTitleFromContent unparseable:`): _da raccogliere_
- **Codice coinvolto**: `proposeTitleFromContent()` in `main.ts` riga 9795 — parser a 4 livelli (JSON → `"title": "..."` → `Title: ...` → quoted string → skip-reasoning-lines) **bucato**.
- **Ipotesi cause**:
  1. Modello reasoning (Qwen3 / DeepSeek-R1) che spende tutti i `maxTokens: 200` in `<think>` interno → nessun JSON di uscita.
  2. Token limit troppo basso (`maxTokens: 200`).
  3. Modello produce markdown bold (`**Title:** "..."`) che rompe il regex pattern `Title: ...`.
  4. Modello restituisce in lingua diversa con punteggiatura unicode (`"`/`"` invece di `"`).
- **Fix candidate**:
  - Alzare `maxTokens` a 500-800 per modelli reasoning.
  - Aggiungere quinto pattern parser: strip markdown `**...**` prima dei pattern.
  - Detect `<think>...</think>` non chiuso → log esplicito.
  - Aggiungere `reasoning_effort: "low"` se backend supporta (Qwen).

### BUG-002 — Residui italiani nei Notice — ✅ FIXED
- `proposeTitleFromContent` Notice tradotti
- `proposeTitleAI` Notice + prompt user tradotti (incluso "Nome file" → "Filename" e "CONTENUTO NOTA" → "NOTE CONTENT")

### BUG-003 — `bassa` italiano dentro prompt HUNTER_SYSTEM (EN) — ✅ FIXED
- Riga 2733: `use confidence: bassa` → `use confidence: low`

### BUG-004 — Schema interno Hunter italiano vs prompt inglese — ✅ FIXED
- `HunterContradiction` rinominato: `nota_a/nota_b/descrizione` → `note_a/note_b/description`
- `HunterConfidence` rinominato: `"alta"|"media"|"bassa"` → `"high"|"medium"|"low"`
- `HunterResult.contraddizioni` → `HunterResult.pairs`
- `CONFIDENCE_ORDER` / `CONFIDENCE_COLOR` keys allineate a EN
- `HunterContradictionsView` aggiornato (sort, badge, dismiss, render)
- `runHunter` parser/dedupe aggiornati
- `normalizePair()` accetta sia chiavi EN nuove sia legacy IT (`nota_a/alta/...`) come input AI

### BUG-005 — Residui italiani in HunterContradictionsView — ✅ FIXED
- Riga 4463: `"coppie nascoste perche' gia' dismessas"` → `"pairs hidden (already dismissed)"`
- Riga 4469: `"Escluse ${...} note (oltre il limite)"` → `"Excluded ${...} notes (over the limit)"`
- Riga 4517: tooltip `"Marca come falso positivo"` → `"Mark as false positive"`
- Anti-hallucination log: `"scartata coppia con basename inesistenti"` → `"discarded pair with non-existent basenames"`
- `"filtrate ${n} coppie hallucinate/invalide"` → `"filtered ${n} hallucinated/invalid pairs"`

---

### BUG-006 — Nessun pre-check backend AI locale — ✅ FIXED
- Aggiunta funzione `pingLocalBackend(baseUrl)` con cache 30s (alive) / 5s (down), timeout 2s.
- Endpoint pingato: `GET /v1/models` (compatibile LM Studio + Ollama).
- Usa Node `http.request` quando disponibile (bypass CORS), fallback su Obsidian `requestUrl`.
- Integrata in `callAI()`: se backend local non risponde, throw Error friendly:
  `"Local AI backend not reachable at http://localhost:1234. Start LM Studio / Ollama (Local Server) and try again. [<reason>]"`
- Vantaggio: fail-fast in 2s invece di aspettare timeout TCP nativo (variabile)

### UX-001 — Notice transient sostituiti da Modal con ack — ✅ FIXED
- Nuova classe `ErrorAckModal` (riusabile) + helper `showErrorModal(app, heading, message, details?)`
- Titolo prefixato `"Antinomia — ..."`, messaggio human-readable, sezione "Technical details" collapsible (raw response, URL, profile)
- Bottone OK CTA (modal non chiudibile per ESC accidentale è discutibile — lasciato chiudibile)
- Punti sostituiti (errori AI critici, prima Notice → ora Modal):
  - `proposeTitleFromContent` (API key missing / unparseable / catch)
  - `proposeTitleAI` (API key missing / unparseable / catch)
  - `proposeIfThenFromContent` (API key / unparseable / catch)
  - `proposePresuppostiFromContent` (API key / unparseable / wrong keys / catch)
  - `analyzeFreeInput` (API key / unparseable / catch)
  - `runHunter` (response not parseable / generic error)
- Notice mantenute per success/info (es. `"Hunter: 3 pairs in 4.2s"`, `"Antinomia: proposing title (AI)..."`)
- Messaggi context-aware: se errore contiene "not reachable" → suggerisce di avviare LM Studio/Ollama

### BUG-007 — Residui IT in callAI — ✅ FIXED
- Riga 2177: `"API key mancante."` → `"API key missing."`
- Riga 2178: `"Base URL mancante."` → `"Base URL missing."`
- Riga 2293: `"AI errore ${result.status} ..."` → `"AI error ..."`
- Riga 2325: `"AI errore ${res.status} ..."` → `"AI error ..."`

---

## ⚠️ Limitazioni note (non bug, da chiarire all'utente)

### LIM-001 — Substrate non ingerisce semanticamente immagini
- Drop/paste di immagini in una nota substrate funziona (storage Obsidian nativo + cartella `attachments/`).
- AI title / Hunter / mappa presupposti **leggono solo testo**.
- Manca `openSubstrateFromImage` (no OCR, no AI vision).
- **Possibile aggiunta backlog**: bottone "Describe image (AI)" nel modal substrate via Vision API (Claude Sonnet vision / GPT-4o vision).

---

## 🟡 Frizioni UX

_(da popolare durante il test)_

---

## ✅ Verifiche completate

- [x] BRAT install end-to-end funzionante su vault vuoto
- [x] Antinomia v1.3.0 enabled al primo lancio (toggle BRAT "Enable after installing")
- [x] Substrate manuale creabile via modal
- [x] Propose title (AI) con Groq → titolo OK (post-fix)

---

## 📋 Next test steps

1. **Build + reload TestVault** — verificare tutti i fix BUG-002→007 + UX-001
2. Testare modal errore: spegnere LM Studio → click Propose title (AI) → atteso Modal "Local AI backend not reachable" con dettagli
3. Testare modal unparseable: caricare modello reasoning (Qwen3) in LM Studio → click Propose title → atteso Modal "AI title not parseable" con raw response in details
4. Testare Hunter su substrate creati con schema EN nuovo
5. Audit BUG-008 (futuro): rimangono Notice italiani in operazioni file IO (riga 9577, 9593, 9613, 9654, 9773, 9826, 9863, 9893, 9907, 9979) — meno priorità, sono "Errore: <io message>" generici
6. Testare Graph view filtri + layout incrementale
7. Testare Dashboard + sidebar "Tensioni aperte"
