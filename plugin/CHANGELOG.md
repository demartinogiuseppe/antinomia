# Changelog

## v1.0.0 (30 maggio 2026) — Prima release pubblica

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

### AI commands (level 2 — su richiesta esplicita)
- Classifica nota attiva
- Proponi titolo (su nota esistente, o pre-popolato nei modal di creazione)
- Mappa presupposti (genera Presupposizioni A/B)
- Cerca contraddizioni (Contradiction Hunter)
- Inserimento libero (classifica + estrae campi)
- Tutti i bottoni AI nei modal hanno loader counter live durante l'attesa

### Contradiction Hunter
- Scansione tensioni aperte + substrate (cap configurabile)
- Confidence (alta/media/bassa) per ogni coppia
- Dismiss persistente dei falsi positivi via campo `hunter_falsi_positivi[]`
- Setting "Stile reasoning Hunter" (conciso vs esposto)
- Bottoni azione inline su ogni coppia (Eleva/Risolta/Defeated)
- Vincolo di design: il Hunter IDENTIFICA, non risolve

### Multi-backend AI
- Profili configurabili (nome, baseUrl, apiKey, modello)
- Profilo attivo per tutti i comandi AI
- Override opzionale del profilo solo per il Hunter
- Backend preset: Anthropic Cloud, LM Studio (locale)
- Parser JSON tollerante (gestisce `<thinking>` blocks, ```fence```, single→double quotes, trailing commas, // comments)
- Migration retrocompatibile da settings v1 (top-level baseUrl/apiKey/model)

### Sidebar e viste
- Tensioni aperte (card + bottoni inline: Titolo / Collega / Presupposti / Eleva / Risolta / Defeated)
- Hunter results (card con bottoni azione per ogni coppia + dismiss)
- Lista falsi positivi del Hunter (con "Reincludi")
- Substrate / Principi / Defeated archive (sidebar dedicate per layer)
- Dashboard (contatori per layer + ultimo Hunter run + azioni rapide)
- Audit vault (report di salute: note incomplete o malformate)
- Note non classificate (per migrare vault esistente)
- Guida iniziale (checklist 7 step con auto-detection)

### Collegamenti e grafo
- Comando "Collega questa nota a..." con picker fuzzy
- Wikilink bidirezionali in `collegamenti: [...]` + body line `> Vedi anche: [[...]]`
- `> Deriva da: [[T-...]]` aggiunto automaticamente nel body durante elevazione
- `> Sostituita da: [[P-...]]` per defeated con motivo=elevata
- Grafo Obsidian riflette le connessioni epistemiche esplicite

### Onboarding completo
- Welcome modal al primo lancio (paradigma + 5 layer + esempio guidato)
- Tutorial 7 schede navigabili (concetti chiave)
- Vault di esempio auto-generabile (5 note ben costruite, cancellabili in 1 click)
- Tooltip prime aperture sidebar (dismiss persistente)
- Comando "Dimmi come procedere" (suggerimento contestuale basato su stato vault)
- Checklist sidebar persistente con auto-detection completion
- Sezione Onboarding in Settings per ri-aprire/resettare ogni componente

### Quality of life
- Front Matter Title plugin (community) documentato come prerequisito
- Migration assistita per importare vault esistenti
- Audit report per identificare note incomplete

### Decisioni di design fisse
- Layer = frontmatter only, mai cartelle
- Hunter identifica, non risolve
- AI sempre opt-in, mai automatica
- Backend pluggable
- Local-first
- Schema dati in italiano, codice in inglese
