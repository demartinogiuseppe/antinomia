# Antinomia

> "Notes preserve. Contradictions interrogate."

**Antinomia** is an Obsidian plugin for **Personal Tension Management (PTM)** — the in-tension counterpart of Personal Knowledge Management. If **PKM** organizes explicit knowledge (*what I know*), **PTM** organizes where things don't fit (*where something jars*): contradictions, tradeoffs, anomalies, persistent doubts, weak signals, conflicts between goals. Clean ideas emerge later — as operational principles derived from resolving a tension, not before.

[![tests](https://github.com/demartinogiuseppe/antinomia/actions/workflows/test.yml/badge.svg)](https://github.com/demartinogiuseppe/antinomia/actions/workflows/test.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-1.2.8--beta-orange)](CHANGELOG.md)
[![Obsidian](https://img.shields.io/badge/Obsidian-1.4%2B-7c3aed)](https://obsidian.md)
[![Paper DOI](https://img.shields.io/badge/Paper%20DOI-10.5281%2Fzenodo.20369124-blue)](https://doi.org/10.5281/zenodo.20369124)
[![Software DOI](https://img.shields.io/badge/Software%20DOI-10.5281%2Fzenodo.20506815-blue)](https://doi.org/10.5281/zenodo.20506815)
[![Substack](https://img.shields.io/badge/Newsletter-The%20Deeper%20Layer-orange?logo=substack)](https://giuseppedemartino.substack.com)

> 📓 I write about the ideas behind this work — the why, the architecture, the practice — at **[The Deeper Layer](https://giuseppedemartino.substack.com)** newsletter. Start with [*The Problem Nobody Is Solving*](https://giuseppedemartino.substack.com/p/the-problem-nobody-is-solving) and [*The Architecture of PTM*](https://giuseppedemartino.substack.com/p/the-architecture-of-ptm).

---

## ⚠️ Status: research preview (v1.2.8 beta)

Antinomia is in **public beta** distributed via BRAT. Features are stable, but a few edge-case flows (e.g., duplicate Elevate modal in certain conditions) are under observation. Please open an issue if you find anything odd.

**Antinomia is not a decision-support system.** The pairs the Contradiction Hunter proposes are prompts for thinking, **not truths on which to base real decisions** (work, health, finance, relationships). AI models can hallucinate, oversimplify, misinterpret. Use Antinomia as a reflective practice.

---

## The 5 layers

Every Antinomia note has a frontmatter field `antinomia_type` that places it in one of five layers:

| Type | What it is | Key fields |
|---|---|---|
| `tension` | A contradiction between two positions A and B | `status`, `links` |
| `substrate` | Raw material (quotes, facts, observations) | `source`, `original_language` |
| `principle` | An operational IF/THEN rule derived from a tension | `origin_tension` |
| `defeated` | A defeated belief (historical memory) | `motive`, `replaced_by` |
| `meta_note` | Reflection on using the system | `date` |

**Design invariant:** the layer of a note lives exclusively in its frontmatter. Files never move between folders when a layer changes.

---

## Core features

- **Note creation**: guided modals for tensions and substrate notes + free-form input with AI classification.
- **Layer transitions** (Eleva, Risolvi, Archivia) happen via frontmatter — files never move.
- **Contradiction Hunter (AI)**: scans open tensions and substrates, identifies contradictory pairs with a confidence rating. Constraint: it identifies, it does not resolve.
- **Antinomia Graph View** (Cytoscape.js + fcose) with per-layer clusters, smooth zoom animations, 6 theme presets.
- **Multi-backend AI**: Anthropic Cloud, OpenAI, Groq, OpenRouter, LM Studio local, Ollama local. Multiple profiles with a Hunter-specific override.
- **Complete onboarding**: Welcome modal, 7-card tutorial, 21-note example vault (with KEY note for measuring the Hunter), getting-started checklist.

See [plugin/README.md](plugin/README.md) for the full command reference (Italian).

---

## Installation

### With BRAT (recommended)

[BRAT](https://github.com/TfTHacker/obsidian42-brat) (Beta Reviewers Auto-update Tool) is the easiest way to install and stay updated with Antinomia beta releases:

1. Install **BRAT** from Obsidian Community plugins
2. Open Settings → BRAT → **Add Beta plugin**
3. Paste this repo URL: `https://github.com/demartinogiuseppe/antinomia`
4. Confirm → BRAT fetches the latest release
5. Settings → Community plugins → enable **Antinomia**

BRAT will automatically check for new releases and prompt you to update.

### From release zip (manual alternative)

1. Download `main.js`, `manifest.json` (and `styles.css` if present) from the latest [release](https://github.com/demartinogiuseppe/antinomia/releases)
2. Copy them into `<YOUR_VAULT>/.obsidian/plugins/antinomia/`
3. Settings → Community plugins → reload → enable Antinomia

See [BETA-INSTALL.md](BETA-INSTALL.md) for the extended beta-tester guide (dedicated vault, Front Matter Title, AI configuration, example vault).

### Build from source

```bash
cd plugin
npm install
npm run build
```

This produces `main.js` + `manifest.json` in `../TestVault/.obsidian/plugins/antinomia/`. For real-world use, copy those files into the target vault.

---

## Prerequisites

- **Obsidian** 1.4+
- **Front Matter Title** community plugin (recommended) — shows human titles instead of timestamp basenames (`T-20260601-...`) in the File Explorer. Antinomia flags this if missing.
- **At least one AI backend** for Hunter / Propose / Map presuppositions:
  - **Free local**: [LM Studio](https://lmstudio.ai) with a loaded model (e.g., Qwen3 14B distill)
  - **Paid cloud**: Anthropic / OpenAI / Groq / OpenRouter API key

> ⚠️ **Cloud APIs incur per-token cost.** If you're cost-sensitive, use LM Studio or Ollama locally (free, private, models downloaded once).

---

## Philosophy

Antinomia is not a tool to fill up. It is a practice. The vault grows as you encounter contradictions in your own thinking (substrate). Tensions emerge from the material — they are not designed. The Hunter shows you contradictions you hadn't seen — not to resolve them for you, but to **force you to think them through**.

When you understand a tension well enough to formulate it as an operational principle (IF/THEN/GREY ZONE), you elevate it. When a belief proves false, it goes into the Defeated archive as a memory of what was not true. The graph that emerges is the map of your epistemic history.

---

## Citation

If you use Antinomia in academic or research contexts, please cite both:

**The conceptual paper** (the idea behind Personal Tension Management):

> De Martino, G. (2026). *Antinomia: Personal Tension Management*. Zenodo. https://doi.org/10.5281/zenodo.20369124

**The software** (this plugin):

> De Martino, G. (2026). *Antinomia: an Obsidian plugin for Personal Tension Management* (version 1.2.6) [Software]. Zenodo. https://doi.org/10.5281/zenodo.20506815

This is a *concept DOI* — it always resolves to the latest archived version. See [CITATION.cff](CITATION.cff) for the structured format.

---

## Intellectual references

Hegel (dialectics), David Bohm (dialogue that suspends defense), Karl Popper (falsifiability), Thomas Kuhn (scientific revolutions emerge from anomalies), Friedrich Hayek (spontaneous order, local knowledge).

---

## License

[MIT](LICENSE). © 2026 Giuseppe De Martino.

---

## Author

Giuseppe De Martino. For discussions, ideas, bug reports: open an [issue](https://github.com/demartinogiuseppe/antinomia/issues) on GitHub.
