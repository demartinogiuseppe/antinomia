# Antinomia — Roadmap post-V1.0

## V1.1 (incrementi sul plugin)

### AI / Hunter
- **Hunter incrementale** — esegui solo sulle note nuove/modificate dall'ultimo run, non rilancia tutto il vault.
- **Hunter su selezione** — comando "Hunter su queste note" partendo da multi-select nel File Explorer o da una sidebar.
- **C4 — Storia Hunter** — view che mostra tutti i run passati con timestamp, contraddizioni trovate, dismiss.
- **B2 — Suggerisci collegamenti AI** — comando "trova note correlate" che propone wikilink basati su affinità semantica (non contraddizione).

### Ingestion / Substrate
- **Estrazione testo PDF automatica al drop** — quando l'utente trascina un PDF nel vault (o usa 📎 PDF), parsa il testo via `pdf.js` (già incluso in Obsidian) e popola il body della nota substrate, così il Hunter può analizzare il contenuto e non solo il link.
  - Opzione UX: cap configurabile (es. primi N caratteri) per PDF grossi.
  - Edge case: PDF scansionati (immagini) → fallback "PDF non testuale, aggiungi tu il contenuto manualmente".
- **URL fetch generico** — comando "Substrate da URL" che fa fetch della pagina, estrae il main content (readability-like) e popola il body.
- **Trascrizione YouTube** — già implementato come fallback paste-assisted; aggiungere fetch nativo via API quando disponibile.

### Quality / UX
- Hot reload setup documentato.
- Onboarding: video walkthrough embedded.
- Mobile (read-only mode).

## V1.2 / V2

### Manifesto + Format Spec
- **Manifesto pubblico Antinomia** — testo lungo che spiega perché la contraddizione e' l'unita' fondamentale del pensiero.
- **Antinomia Format Spec v1** — documento separato che definisce lo schema frontmatter come standard aperto, indipendente dal plugin. Obiettivo: chiunque possa scrivere un parser/import/export compatibile.

### Localizzazione UI
- **English UI** — tradurre in inglese tutte le stringhe della UI del plugin (modal, sidebar, notice, command palette names, settings labels, prompt AI). **Promessa pubblica nel README v1.1.0** ("An English UI is on the V2 roadmap"). Implica:
  - Estrarre tutte le stringhe da `main.ts` in un dizionario.
  - Sistema i18n base (chiave -> traduzione) con switch lingua nelle Settings.
  - Tradurre i prompt AI (system + user templates) — attenzione, i prompt influenzano la qualita' del modello, traduzione cura.
  - Localizzare anche il vault di esempio (English version) o lasciare Italian default + English alternativo.
- **Schema frontmatter localization (decisione aperta)** — i nomi dei campi (`tensione`, `substrate`, `principio`, `defeated`, `meta_nota`) restano in italiano come scelta di design del v1.x; valutare in V2 se aggiungere alias inglesi (`tension`, `substrate`, `principle`, `defeated`, `meta_note`) o lasciare l'italiano come standard del Format Spec.

### Distribuzione
- Submission al community store di Obsidian.
- Sito statico (decisione aperta sul dominio) con docs + esempi.

## V2 (Epistemic Network)

- Multi-user P2P: condivisione selettiva di tensioni/principi/defeated tra utenti.
- Hunter cross-vault opt-in: trova contraddizioni tra il tuo pensiero e quello di altri.
- Identita' pseudonima crittografica per firmare i principi.
- (Esplorativo) Bridge IPFS/Nostr per persistenza decentralizzata.

---

_Documento vivente. Le voci possono cambiare priorita' man mano che V1.0 viene usato e si capisce cosa serve davvero._
