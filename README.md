# Antinomia

> "Le note conservano. Le contraddizioni interrogano."

**Antinomia** è un plugin Obsidian per **Personal Tension Management (PTM)** — il parallelo "in tensione" del classico Personal Knowledge Management. Se il **PKM** organizza la conoscenza esplicita (*cosa so*), il **PTM** organizza dove qualcosa non torna (*dove qualcosa stride*): contraddizioni, tradeoff, anomalie, dubbi persistenti, segnali deboli, tensioni tra obiettivi. Le idee "pulite" emergono dopo, come principi operativi derivati dalla risoluzione di una tensione — non prima.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-1.1.0--beta-orange)](CHANGELOG.md)
[![Obsidian](https://img.shields.io/badge/Obsidian-1.4%2B-7c3aed)](https://obsidian.md)

---

## ⚠️ Status: research preview (v1.1.0 beta)

Antinomia è in **fase di beta pubblica** distribuita via BRAT. Funzioni stabili, ma alcuni flussi (es. doppio modal Eleva in certi casi-limite) sono in osservazione. Apri una issue se incontri qualcosa di strano.

**Antinomia non è un sistema di supporto decisionale.** Le coppie che il Contradiction Hunter propone sono spunti per pensare, **non verità su cui basare decisioni reali** (lavoro, salute, finanza, relazioni). I modelli AI possono allucinare, semplificare, fraintendere. Usa Antinomia come una pratica riflessiva.

---

## I 5 layer del sistema

Ogni nota ha un campo frontmatter `antinomia_tipo` che la colloca in uno dei 5 layer:

| Tipo | Cos'è | Campi principali |
|---|---|---|
| `tensione` | Contraddizione tra due posizioni A e B | `stato`, `collegamenti` |
| `substrate` | Materiale grezzo (citazioni, fatti, osservazioni) | `fonte`, `lingua_originale` |
| `principio` | Regola operativa IF/THEN derivata da una tensione | `origine_tensione` |
| `defeated` | Convinzione sconfitta (memoria storica) | `motivo`, `sostituita_da` |
| `meta_nota` | Riflessione sull'uso del sistema | `data` |

**Design invariant:** il layer di una nota è esclusivamente nel frontmatter. I file non si spostano mai tra cartelle quando cambia il layer.

---

## Funzioni principali

- **Creazione note**: modal guidati per tensioni e substrate + inserimento libero con classificazione AI.
- **Transizioni di layer** (Eleva, Risolvi, Archivia) via frontmatter — i file non si muovono mai.
- **Contradiction Hunter (AI)**: scansiona tensioni e substrate, identifica coppie contraddittorie con confidence. Vincolo: identifica, non risolve.
- **Antinomia Graph View** custom (Cytoscape.js + fcose) con cluster per layer, animazioni zoom, 6 preset di tema.
- **Multi-backend AI**: Anthropic Cloud, OpenAI, Groq, OpenRouter, LM Studio locale, Ollama locale. Profili multipli con override Hunter.
- **Onboarding completo**: Welcome modal, tutorial 7 schede, vault d'esempio (21 note + CHIAVE), guida iniziale.

Vedi [plugin/README.md](plugin/README.md) per il manuale tecnico completo dei comandi.

---

## Installazione

### Con BRAT (raccomandato)

[BRAT](https://github.com/TfTHacker/obsidian42-brat) (Beta Reviewers Auto-update Tool) è il modo più semplice per installare e aggiornare Antinomia da beta. Procedimento:

1. Installa **BRAT** dalla Community plugins di Obsidian
2. Apri Settings → BRAT → **Add Beta plugin**
3. Incolla l'URL di questo repo: `https://github.com/demartinogiuseppe/antinomia`
4. Conferma → BRAT scarica l'ultima release
5. Settings → Community plugins → abilita **Antinomia**

BRAT controllerà automaticamente i nuovi rilasci e proporrà gli aggiornamenti.

### Da zip release (alternativa manuale)

1. Scarica `main.js`, `manifest.json` (e `styles.css` se presente) dall'ultima [release](https://github.com/demartinogiuseppe/antinomia/releases)
2. Copia in `<TUO_VAULT>/.obsidian/plugins/antinomia/`
3. Settings → Community plugins → reload → abilita Antinomia

Vedi anche [BETA-INSTALL.md](BETA-INSTALL.md) per la guida estesa ai beta tester (vault dedicato, Front Matter Title, configurazione AI, vault di esempio).

### Build da sorgente

```bash
cd plugin
npm install
npm run build
```

Produce `main.js` + `manifest.json` in `../TestVault/.obsidian/plugins/antinomia/`. Per uso reale, copia quei file nel vault target.

---

## Prerequisiti

- **Obsidian** 1.4+
- **Front Matter Title** plugin community (raccomandato) — mostra i titoli umani al posto dei basename timestamp (`T-20260601-...`) nel File Explorer. Antinomia lo segnala se manca.
- **Almeno un backend AI** per le funzioni Hunter / Proponi / Mappa presupposti:
  - **Locale gratuito**: [LM Studio](https://lmstudio.ai) con un modello caricato (es. Qwen3 14B distill)
  - **Cloud a pagamento**: API key Anthropic / OpenAI / Groq / OpenRouter

> ⚠️ **API cloud = costi per token consumato**. Se sei sensibile ai costi, usa LM Studio o Ollama in locale (gratuito, privacy, modelli da scaricare una volta).

---

## Filosofia

Antinomia non è un tool da riempire. È una pratica. Il vault cresce man mano che incontri contraddizioni nel tuo pensiero (substrate). Le tensioni emergono dal materiale, non vengono progettate. Il Hunter ti mostra contraddizioni che non avevi visto — non per risolverle al posto tuo, ma per **costringerti a pensarle**.

Quando capisci una tensione abbastanza da formularla come principio operativo (IF/THEN/GREY), la elevi. Quando una convinzione si dimostra falsa, va nel Defeated archive come memoria di cosa NON era vero. Il grafo che emerge è la mappa della tua storia epistemica.

---

## Citazione

Se usi Antinomia in un contesto accademico o scrivi a riguardo, citalo come:

> De Martino, G. (2026). *Antinomia: un plugin Obsidian per Personal Knowledge Management basato sulla contraddizione* (versione 1.1.0) [Software]. https://github.com/demartinogiuseppe/antinomia

Vedi anche [CITATION.cff](CITATION.cff) per il formato strutturato.

Un DOI Zenodo sarà associato alle release future per riferimenti accademici stabili.

---

## Riferimenti culturali

Hegel (dialettica), David Bohm (dialogo che sospende la difesa), Karl Popper (falsificabilità), Thomas Kuhn (rivoluzioni scientifiche emergono dalle anomalie), Friedrich Hayek (ordine spontaneo, conoscenza locale).

---

## Licenza

[MIT](LICENSE). © 2026 Giuseppe De Martino.

---

## Autore

Giuseppe De Martino. Per discussioni, idee, segnalazioni: apri una [issue](https://github.com/demartinogiuseppe/antinomia/issues) su GitHub.
