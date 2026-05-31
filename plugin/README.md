# Antinomia V1

Plugin Obsidian per Personal Knowledge Management basato sulla **contraddizione come unità fondamentale** del pensiero.

> "L'unità del pensiero non è la nota. È la contraddizione."

Antinomia ribalta il paradigma classico del PKM: invece di organizzare informazioni in note, costruisci una mappa esplicita delle **tensioni** che strutturano come pensi. Le idee "pulite" emergono dopo, come principi operativi derivati dalla risoluzione di una tensione — non prima.

---

## I 5 layer del sistema

Ogni nota Antinomia ha un campo frontmatter `antinomia_tipo` che la colloca in uno dei 5 layer:

| Tipo | Cos'è | Campi principali |
|---|---|---|
| `tensione` | Contraddizione tra due posizioni A e B | `stato` (aperta/risolta/elevata), `collegamenti` |
| `substrate` | Materiale grezzo (citazioni, fatti, osservazioni) | `fonte`, `lingua_originale` |
| `principio` | Regola operativa IF/THEN derivata da una tensione | `origine_tensione` |
| `defeated` | Convinzione sconfitta (memoria storica) | `motivo`, `sostituita_da` |
| `meta_nota` | Riflessione sull'uso del sistema | `data` |

**Design invariant:** il layer di una nota è esclusivamente nel frontmatter. I file non si spostano mai tra cartelle quando cambia il layer. Una sola fonte di verità.

---

## Funzionalità principali

### Creazione note
- **Modal guidati** per nuova tensione (Titolo + Statement A + B) e nuovo substrate (Titolo + Contenuto)
- **Bottone "Proponi titolo (AI)"** in entrambi i modal
- **Inserimento libero** (`✨`): scrivi testo grezzo, l'AI determina se è tensione o substrate ed estrae i campi
- Toolbar in cima alla sidebar Tensioni con bottoni di creazione rapida

### Transizioni di layer
- **Eleva tensione a principio**: form IF/THEN/GREY ZONE con bottone "Proponi IF/THEN (AI)" — riscrive il body conservando il vecchio testo sotto `## Origine (tensione)`
- **Marca come risolta**: solo cambio di `stato`
- **Archivia come defeated**: modal con motivo (falso_positivo/elevata/sconfitta_genuina); se "elevata", chiede il principio sostituto

### Mappa presupposti (AI)
Comando che chiede all'AI di esplicitare le assunzioni epistemiche/valoriali sotto statement A e B. Si compila in 4 campi del frontmatter (`Presupposizioni A/B`).

### Contradiction Hunter (AI)
Scansiona tensioni aperte + substrate, identifica coppie contraddittorie. **Vincolo cruciale:** il Hunter IDENTIFICA, non risolve. Ogni coppia ha:
- Confidence (alta/media/bassa)
- Descrizione della contraddizione
- Bottoni azione per ogni nota della coppia (Eleva / Risolta / Defeated)
- Dismiss persistente (×) per i falsi positivi

### Multi-backend AI
Settings → Profili AI: configura più profili (es. LM Studio locale + Anthropic Cloud) e:
- Scegli il profilo **attivo** (default per tutti i comandi)
- Scegli il profilo **per Hunter** (override opzionale, vuoto = usa attivo)

Workflow tipico: Qwen 14B/27B locale per uso quotidiano (gratis, privacy), Sonnet/Opus cloud solo per Hunter approfondito.

### Sidebar/viste
- **Tensioni aperte** con card + bottoni inline per ogni tensione
- **Hunter results** con bottoni azione per ogni coppia
- **Falsi positivi del Hunter** (lista + "Reincludi")
- **Substrate** / **Principi** / **Defeated archive** (sidebar dedicate per layer)
- **Dashboard** (contatori + ultimo Hunter run + azioni rapide)
- **Audit vault** (report di salute: note incomplete)
- **Note non classificate** (per migrare un vault esistente)
- **Guida iniziale** (checklist 7 step con auto-detection)

### Onboarding completo
- **Welcome modal** al primo lancio (paradigma + 5 layer)
- **Tutorial** 7 schede navigabili (concetti chiave + esempi)
- **Vault di esempio** auto-generabile (3 tensioni + 2 substrate ben costruiti, cancellabili in 1 click)
- **Tooltip persistenti** prima volta che apri le sidebar
- **"Dimmi come procedere"**: comando contestuale che suggerisce il prossimo passo in base allo stato del vault

---

## Prerequisiti

### Necessari
- **Obsidian** 1.0+
- (per le funzioni AI) Almeno uno tra: API key Anthropic (`sk-ant-...`) oppure **LM Studio** in esecuzione locale con un modello caricato

### Fortemente consigliato

**[Front Matter Title](https://github.com/snezhig/obsidian-front-matter-title)** (plugin community Snezhig)

Le note Antinomia hanno basename con timestamp (`T-20260530-094515`) per stabilità degli ID. Per vedere i titoli umani anche nel File Explorer di Obsidian, installa Front Matter Title e configura **Common main template = `titolo`** nelle sue opzioni.

---

## Installazione

### Da release (zip)
1. Scarica `main.js`, `manifest.json`, `styles.css` (se presente) dalla release v1.0.0
2. Copia i file in `<TUO_VAULT>/.obsidian/plugins/antinomia/`
3. In Obsidian: Settings → Community plugins → Reload → enable "Antinomia"

### Build da sorgente
```bash
cd plugin
npm install
npm run build   # produce main.js + manifest.json in ../TestVault/.obsidian/plugins/antinomia/
npm run dev     # watch mode
```

Per usare in un vault reale, copia `main.js` + `manifest.json` dalla cartella di build in `<TUO_VAULT>/.obsidian/plugins/antinomia/`.

---

## Configurazione

### Primo lancio
Al primo lancio si apre il **Welcome modal** + la sidebar **Guida iniziale** (checklist con 7 step). Segui i passi guidati.

### Configurare un backend AI
1. Settings → Antinomia → Profili AI
2. Click **+ Aggiungi profilo** oppure modifica il Default
3. Scegli un Backend preset (Anthropic Cloud o LM Studio) → si pre-popolano Base URL + modello suggerito
4. Inserisci la tua API key (per LM Studio metti qualsiasi cosa, es. `lmstudio`)
5. Click **Test** per verificare ping/pong

### Override modello per Hunter
Se vuoi usare un modello più capace solo per il Contradiction Hunter:
1. Crea un secondo profilo (es. "Sonnet Cloud")
2. Settings → "Profilo per Hunter (override)" → seleziona il profilo Hunter

---

## Comandi (Ctrl+P)

### Creazione
- `Antinomia: nuova tensione` (modal guidato)
- `Antinomia: nuovo substrate` (modal guidato)
- `Antinomia: inserimento libero (AI classifica)`
- Varianti `(vuota/vuoto, senza modal)` per accesso rapido

### Liste sidebar
- `Antinomia: lista tensioni aperte`
- `Antinomia: lista substrate`
- `Antinomia: lista principi`
- `Antinomia: lista defeated archive`
- `Antinomia: lista falsi positivi del Hunter`
- `Antinomia: importa vault esistente (note non classificate)`
- `Antinomia: apri dashboard`
- `Antinomia: audit vault (report di salute)`

### Transizioni
- `Antinomia: eleva tensione a principio` (apre form IF/THEN/GREY + bottone Proponi AI)
- `Antinomia: marca tensione come risolta`
- `Antinomia: archivia come defeated`

### AI
- `Antinomia: classifica nota attiva (AI)`
- `Antinomia: cerca contraddizioni (Hunter)`
- `Antinomia: mappa presupposti (AI)`
- `Antinomia: proponi titolo (AI)`

### Titoli + collegamenti
- `Antinomia: imposta titolo nota`
- `Antinomia: collega questa nota a...`

### Onboarding
- `Antinomia: mostra welcome (riavvia onboarding)`
- `Antinomia: tutorial concetti chiave`
- `Antinomia: apri guida iniziale (checklist)`
- `Antinomia: dimmi come procedere (suggerimento contestuale)`
- `Antinomia: crea vault di esempio`
- `Antinomia: cancella esempi`

---

## Design invariants (decisioni che NON vanno rinegoziate)

1. **Layer = `antinomia_tipo` frontmatter only.** I file non si spostano mai. Una sola fonte di verità.
2. **Cartella unica `notes/`.** Niente cartelle separate per layer.
3. **Hunter IDENTIFICA, non RISOLVE.** La risoluzione è il lavoro epistemico dell'utente, attraverso il dialogo sui presupposti.
4. **AI sempre opt-in.** Nessuna chiamata in background. L'utente preme un comando, parte una chiamata.
5. **Backend AI pluggable.** Anthropic Cloud, LM Studio locale, o qualsiasi endpoint Anthropic-compatibile.
6. **Local-first.** I dati restano sul disco. Le note escono dal dispositivo solo nel momento esplicito in cui chiami un comando AI.
7. **Schema dati in italiano** (parte del design Antinomia). Codice e cartelle in inglese.

---

## Filosofia

Antinomia non è un tool da riempire. È una pratica. Il vault cresce man mano che incontri contraddizioni nel tuo pensiero (substrate). Le tensioni emergono dal materiale, non vengono progettate. Il Hunter ti mostra contraddizioni che non avevi visto — non per risolverle al posto tuo, ma per **costringerti a pensarle**.

Quando capisci una tensione abbastanza da formularla come principio operativo (IF/THEN/GREY), la elevi. Quando una convinzione si dimostra falsa, va nel Defeated archive come memoria di cosa NON era vero. Il grafo che emerge è la mappa della tua storia epistemica.

---

## Licenza

MIT.

## Autore

Giuseppe De Martino.

## Riferimenti culturali

Hegel (dialettica), David Bohm (dialogo che sospende la difesa), Karl Popper (falsificabilità), Thomas Kuhn (rivoluzioni scientifiche emergono dalle anomalie), Friedrich Hayek (ordine spontaneo, conoscenza locale).
