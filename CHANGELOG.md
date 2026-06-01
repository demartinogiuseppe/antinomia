# Changelog

## v1.1.0 (1 giugno 2026) — Prima release pubblica via BRAT

### Posizionamento

- **Personal Tension Management (PTM)** introdotto come framing del progetto, in parallelo al Personal Knowledge Management. PKM organizza la conoscenza esplicita (*cosa so*); PTM organizza dove qualcosa non torna (*dove qualcosa stride*): contraddizioni, tradeoff, anomalie, dubbi persistenti, segnali deboli, tensioni tra obiettivi. Antinomia è il primo plugin a esplicitare questa categoria.

### Nuove funzioni

- **Antinomia Graph View** custom (Cytoscape.js + fcose) che sostituisce il grafo nativo di Obsidian per le note Antinomia: cluster layout per layer, fisica continua, zoom rotella animato (1.6×/step, 320 ms ease-out), hover fade graduale, inertia pan, slider zoom verticale, 6 preset di tema + custom, persistenza preferenze.
- **Menu di navigazione globale** in tutte le view Antinomia (sidebar Tensioni, Substrate, Principi, Defeated, Dashboard, Hunter, Grafo, Audit, Falsi positivi, Note non classificate, Guida iniziale).
- **Multi-backend AI** esteso: oltre ad Anthropic e LM Studio, ora supporta **OpenAI**, **Groq**, **OpenRouter** (formato OpenAI) e **Ollama** (locale). Il campo `format` del profilo decide il dialetto (`"anthropic" | "openai"`).
- **Stop button universale** su tutti i bottoni AI (Hunter, Proponi titolo, Proponi IF/THEN, Proponi presupposti, Inserimento libero classifica). Annulla la chiamata in volo via `AbortController` + chiude il socket TCP lato locale per LM Studio/Ollama.
- **Design C — Elevazione split**: setting `elevationMode = "split" | "transform"`. In modalità split, "Eleva" crea un nuovo file `P-...` (principio) E converte la tensione originale in defeated con motivo `elevata` e link `sostituita_da`. Il grafo mostra un arco rosso tra defeated e principio. Modalità transform mantiene il comportamento v1.0.0.
- **Hunter focalizzato** (focus mode): nuovo comando "Hunter su una nota" che apre un picker e cerca solo coppie che coinvolgono la nota selezionata. Per scansioni mirate su tensioni o substrate specifici.

### Onboarding e safety

- **Disclaimer "pratica riflessiva, non sistema decisionale"** mostrato in 3 punti (Welcome modal, Settings → Onboarding, sidebar risultati Hunter). Avverte che le coppie proposte sono spunti per pensare, non verità su cui decidere in contesti reali (lavoro, salute, finanza, relazioni).
- **Notice API a pagamento vs alternativa locale gratuita** in Settings, prima della configurazione profili. Spiega la differenza di costo tra cloud (Anthropic, OpenAI, Groq) e locale (LM Studio, Ollama).
- **Detection Front Matter Title** automatica con banner nel Welcome modal: rileva se il plugin community Front Matter Title manca o è mal configurato e avvisa l'utente.
- **Vault di esempio ricco** (21 note): 3 tensioni + 15 substrate + 1 defeated + 1 principio Design C in `notes/` + `ESEMPIO-CHIAVE.md` nella root con la mappa delle contraddizioni seminate per misurare il Hunter.

### Robustezza e developer experience

- **Parser JSON robusto** per le risposte AI: pass multipli con strategie diverse (markdown unwrap, code-before-JSON pattern di Qwen3, single→double quotes, trailing commas, commenti). Mai più "Cannot access 'a' before initialization".
- **Anti-hallucination validation** nel Hunter: filtra coppie con basename inesistenti, coppie self (A↔A), e coppie con descrizione vuota o "undefined" (false positive frequenti di modelli locali piccoli).
- **Backup automatico di main.ts** in `esbuild.config.mjs` prima di ogni build, con verifica anti-truncation (rifiuta il backup se main.ts è truncato sotto la soglia minima). Storico in `plugin/backups/`.
- **BRAT-compliance**: `minAppVersion` portato a 1.4.0, `isDesktopOnly` a true (il plugin usa `require("http")` di Node per LM Studio), file `versions.json` introdotto.

### Distribuzione

- **BETA-INSTALL.md** in root: guida 6-step per beta tester (vault dedicato → install plugin → Front Matter Title → AI backend → vault esempio → cleanup).
- **package-release.ps1**: script PowerShell che impacchetta `main.js` + `manifest.json` (+ `styles.css` opzionale) in `releases/antinomia-vX.X.X.zip` per upload diretto su GitHub Release.
- LICENSE MIT, CITATION.cff e README pubblico nella root del repo.

### Backlog noto (v1.1.1+)

- Doppio modal Eleva in certi flussi (guard implementata, da validare).
- Hunter incrementale (storia delle coppie già viste).
- PDF text extraction al drop.

---

## v1.0.0 (30 maggio 2026) — Prima release interna

### Core
- Schema dati a 5 layer (tensione, substrate, principio, defeated, meta_nota) gestito via frontmatter YAML
- Cartella unica `notes/` (decisione di design: i file non si spostano mai per cambio layer)
- Migration automatica dei titoli con caratteri YAML-sensibili (`:`, `"`, ecc.) via quoting esplicito

### Creazione note
- Modal guidato per nuova tensione (Titolo + Statement A + B)
- Modal guidato per nuovo substrate (Titolo + Contenuto)
- "Inserimento libero" con classificazione AI automatica (tensione vs substrate)
- Bottone "Proponi titolo (AI)" in entrambi i modal
- Toolbar nella sidebar Tensioni aperte con bottoni di creazione rapida

### Transizioni di layer
- Eleva tensione a principio con form IF/THEN/GREY + bottone "Proponi IF/THEN (AI)"
- Marca come risolta (solo cambio `stato`)
- Archivia come defeated con modal motivo + picker principio sostituto se motivo=elevata
- Tutte le transizioni avvengono via frontmatter, nessun file viene mai spostato

### AI commands
- Classifica nota attiva
- Proponi titolo (su nota esistente, o pre-popolato nei modal di creazione)
- Mappa presupposti (genera Presupposizioni A/B)
- Cerca contraddizioni (Contradiction Hunter)
- Inserimento libero (classifica + estrae campi)

### Contradiction Hunter
- Scansione tensioni aperte + substrate (cap configurabile)
- Confidence (alta/media/bassa) per ogni coppia
- Dismiss persistente dei falsi positivi via campo `hunter_falsi_positivi[]`
- Setting "Stile reasoning Hunter" (conciso vs esposto)
- Bottoni azione inline su ogni coppia (Eleva/Risolta/Defeated)
- Vincolo di design: il Hunter IDENTIFICA, non risolve

### Multi-backend AI (base)
- Profili configurabili (nome, baseUrl, apiKey, modello)
- Profilo attivo per tutti i comandi AI
- Override opzionale del profilo solo per il Hunter
- Backend preset: Anthropic Cloud, LM Studio (locale)

### Sidebar e viste
- Tensioni aperte, Substrate, Principi, Defeated archive, Dashboard, Hunter results, Falsi positivi, Audit vault, Note non classificate, Guida iniziale.

### Onboarding
- Welcome modal al primo lancio
- Tutorial 7 schede navigabili
- Vault di esempio auto-generabile
- Tooltip persistenti prime aperture
- Comando "Dimmi come procedere"
- Checklist sidebar persistente
- Sezione Onboarding in Settings

### Design invariants
- Layer = frontmatter only, mai cartelle
- Hunter identifica, non risolve
- AI sempre opt-in, mai automatica
- Backend pluggable
- Local-first
- Schema dati in italiano, codice in inglese
