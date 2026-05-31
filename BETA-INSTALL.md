# Antinomia V1.1 — Installazione per beta tester

Grazie per provare Antinomia. Questo file ti guida dall'installazione al primo uso. Tempo stimato: **10 minuti** (di cui 5 sono il download del modello AI locale).

---

## Prerequisiti

- **Obsidian** versione 1.4 o superiore (download da [obsidian.md](https://obsidian.md))
- (Opzionale ma consigliato) **LM Studio** se vuoi usare un modello AI locale gratuito — vedi Step 4

---

## Step 1 — Prepara un vault dedicato per il test

> ⚠️ **Non installare Antinomia nel tuo vault principale alla prima prova.** Antinomia crea note marcate (prefisso `ESEMPIO-`) per la demo + un file `ESEMPIO-CHIAVE.md` nella root. Se sbagli a cancellare, si mischiano alle tue note vere.

1. Apri Obsidian
2. Click sull'icona del vault in basso a sinistra → **Open another vault** → **Create new vault**
3. Nome: `AntinomiaTest` (o quello che preferisci)
4. Conferma → si apre un vault vuoto

---

## Step 2 — Installa il plugin Antinomia

1. **Scompatta** il file `antinomia-v1.1.0.zip` che hai ricevuto. Otterrai una cartella `antinomia/` con dentro `main.js`, `manifest.json` (ed eventualmente `styles.css`).
2. Apri la **cartella del vault** sul filesystem (es. `Documents/AntinomiaTest/`). Se non sai dove sia, in Obsidian: Settings → About → "Open vault location" o icona sotto al nome del vault.
3. Naviga in `<vault>/.obsidian/plugins/`. Se la cartella `plugins` non esiste, creala.
4. **Copia la cartella `antinomia/`** scompattata dentro `<vault>/.obsidian/plugins/`. La struttura finale deve essere:
   ```
   <vault>/.obsidian/plugins/antinomia/main.js
   <vault>/.obsidian/plugins/antinomia/manifest.json
   ```
5. Torna in Obsidian
6. Settings → **Community plugins**
7. Se vedi "Community plugins are currently restricted", click su **"Turn on community plugins"** → Trust author and enable
8. Sezione **"Installed plugins"** → trova **Antinomia** → toggle on
9. Antinomia si attiva. Al primo lancio si apre il **Welcome Modal** con il paradigma e i 5 layer.

---

## Step 3 — Installa il plugin consigliato Front Matter Title

Senza questo plugin, il File Explorer ti mostra basename tecnici tipo `T-20260530-091416.md` invece dei titoli umani che hai dato alle note. Antinomia te lo segnala con un **banner giallo nel Welcome Modal**.

1. Settings → **Community plugins** → **Browse**
2. Cerca **Front Matter Title** (autore: Snezhig)
3. Install → Enable
4. Settings → **Front Matter Title** (sezione plugin community) → "Common main template" → metti la parola `titolo`
5. Salva

Ora vedrai i titoli umani ovunque (File Explorer, tab, wikilink).

---

## Step 4 — Configura un backend AI

Antinomia usa modelli AI per Hunter, propose IF/THEN, Mappa presupposti, classifica. Due opzioni:

### 4A — Locale gratuito (raccomandato per beta tester)

1. Scarica e installa **LM Studio** da [lmstudio.ai](https://lmstudio.ai)
2. Avvia LM Studio
3. Sezione **Discover** o **Search** → cerca `qwen3-14b-claude-4.5-opus-high-reasoning-distill` (o un altro Qwen 14B / 9B se hai meno VRAM). Download (~6-9 GB).
4. Sezione **Local Server** o **Developer** → carica il modello → avvia il server (default `http://localhost:1234`)
5. In Obsidian: Settings → **Antinomia** → sezione **Profili AI** → modifica il profilo Default (o aggiungi nuovo)
6. **Backend preset** → "LM Studio (locale)" (oppure "LM Studio OpenAI-compat" se preferisci formato OpenAI)
7. API key: lascia `lmstudio` (placeholder, LM Studio non lo verifica)
8. Click **Test** → deve rispondere "pong" o equivalente

### 4B — Cloud a pagamento

1. Crea API key da:
   - Anthropic: [console.anthropic.com](https://console.anthropic.com) (Claude)
   - OpenAI: [platform.openai.com](https://platform.openai.com) (GPT)
   - Groq: [console.groq.com](https://console.groq.com) (Llama 3.3 super veloce)
   - OpenRouter: [openrouter.ai](https://openrouter.ai) (gateway a 100+ modelli)
2. Settings → Antinomia → Profili AI → modifica → Backend preset corrispondente
3. Incolla la chiave → Test

> ⚠️ Le API cloud hanno **costi per token consumato**. Se sei sensibile ai costi, usa LM Studio in locale.

---

## Step 5 — Esplora il vault di esempio

Ora la parte interessante: vedi cosa fa Antinomia con un set di note pre-confezionato.

1. Settings → **Antinomia** → scorri in basso fino a **Onboarding**
2. Click sul bottone **"Crea vault di esempio"**
3. Conferma il modal di avviso
4. Vengono create **21 note** (3 tensioni + 15 substrate + 1 defeated + 1 principio Design C) nella cartella `notes/` + un file `ESEMPIO-CHIAVE.md` nella root del vault

### Cosa fare adesso (5-10 minuti)

1. **Apri `ESEMPIO-CHIAVE.md`** (nella root del vault, file in cima al File Explorer). Lì c'è la guida con le contraddizioni seminate (CN1-CN5).

2. **Esplora le sidebar Antinomia** (le icone a sinistra nella ribbon di Obsidian o dal menu in cima a ogni view):
   - 📊 Dashboard (sidebar destra)
   - 📝 Tensioni aperte
   - 📚 Substrate
   - 🧭 Principi
   - 🗄 Defeated archive

3. **Apri il Grafo Antinomia** (auto-aperto all'avvio del plugin, o dal menu nav → 🕸 Grafo). Vedi:
   - 21 nodi colorati per layer (arancione = tensioni aperte, grigio = substrate, verde = principio, rosso = defeated)
   - 1 **arco rosso** tra il defeated e il principio dell'esempio Design C (`ESEMPIO-D-quantita-qualita` → `ESEMPIO-P-quantita-qualita`)
   - Spunta/togli i checkbox in alto per filtrare per layer (fade-in/out animato)
   - Trascina i pallini, gira la rotella (zoom 1.6×/step animato 320ms), usa lo slider verticale

4. **Lancia il Hunter**:
   - `Ctrl+P` → "**Antinomia: cerca contraddizioni (Hunter)**"
   - Aspetta il completamento (con LM Studio 14B su 18 note: ~2 minuti)
   - Confronta l'output con la **CHIAVE**. Atteso: trova CN2, CN3, CN4 (test substrate-substrate), CN5. CN1 è il caso più difficile per i modelli locali.
   - Se vuoi fermare il Hunter prima del completamento: bottone "⛔ Stop Hunter" nella sidebar dei risultati.

5. **Hunter su singola nota** (focus mode):
   - Menu nav globale → **🔍 Hunter ▾** → **"Hunter su una nota (focus)"**
   - Si apre un picker → scegli es. "Compro sempre il piu' economico"
   - Il Hunter cerca solo coppie che coinvolgono quella nota specifica

6. **Prova le altre funzioni AI**:
   - Apri una tensione → sidebar Tensioni aperte → bottone **"Presupposti"** → "Proponi presupposti (AI)" → l'AI suggerisce
   - Apri una tensione → bottone **"↑ Eleva"** → form IF/THEN/GREY → "Proponi IF/THEN (AI)" → si crea un nuovo principio + il defeated della tensione originale (Design C)

---

## Step 6 — Pulisci quando hai finito

Quando hai capito come funziona e vuoi iniziare il tuo vault vero:

1. Settings → Antinomia → **Onboarding** → bottone **"Cancella esempi"**
2. Conferma → tutte le note `ESEMPIO-*` + la `ESEMPIO-CHIAVE.md` vanno nel cestino di Obsidian (recuperabili dal cestino se cambi idea)
3. Il vault è pulito. Inizia con: `Ctrl+P` → "Antinomia: nuova tensione" oppure dal menu nav → ➕ Crea

---

## Avvertenze importanti

⚠️ **Antinomia non è un sistema di supporto decisionale.** Le coppie che il Hunter propone sono spunti riflessivi, non verità. Il modello AI può allucinare, semplificare, fraintendere. **Non usare per decidere in situazioni reali** (lavoro, salute, finanza, relazioni). Vedi il disclaimer all'apertura del Welcome Modal.

---

## Feedback al team

Cose particolarmente utili da segnalare:

- **Bug e crash**: console di Obsidian (Ctrl+Shift+I) → tab Console → copia eventuali errori `[Antinomia] ...`
- **Hunter su tuo vault**: quante coppie trova, quante sono buone, quante false positive
- **Workflow d'uso reale**: cosa è scomodo, cosa manca, cosa non hai usato
- **Comparazione tra modelli AI**: se hai provato cloud e locale, qualità dei risultati

Grazie per aver dedicato del tempo. Antinomia è una pratica, non un tool: ogni feedback su come si "vive" il sistema vale molto.

---

## Risoluzione problemi rapidi

- **Il plugin non compare in "Installed plugins"**: la cartella `antinomia/` deve essere DIRETTAMENTE dentro `.obsidian/plugins/`, non annidata in un altro livello. Verifica che `manifest.json` sia direttamente leggibile in `.obsidian/plugins/antinomia/manifest.json`.
- **"Failed to fetch" cliccando funzioni AI**: ricarica il plugin (Settings → Community plugins → toggle off/on Antinomia). Obsidian non rilegge `main.js` se cambia su disco senza reload.
- **LM Studio "Processing prompt 100%" non risponde**: il modello è lento sul prompt grosso. Premi "⛔ Stop Hunter" (il bottone funziona davvero, chiude il socket TCP e ferma la generazione lato LM Studio). Riduci il cap note in Settings o usa un modello più piccolo.
- **File Explorer mostra `T-20260530-...` invece dei titoli**: manca Front Matter Title (Step 3).
