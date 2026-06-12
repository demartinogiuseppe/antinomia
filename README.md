# Antinomia

<p align="center">
  <a href="obsidian://show-plugin?id=antinomia">
    <img src="https://img.shields.io/badge/Install%20in%20Obsidian-7c3aed?style=for-the-badge&logo=obsidian&logoColor=white" alt="Install in Obsidian" height="44" />
  </a>
</p>

> 🎉 **Now available on the [Obsidian Community Store](obsidian://show-plugin?id=antinomia)** — or install from Obsidian → Settings → Community plugins → Browse → "Antinomia".

> "Notes preserve. Contradictions interrogate."

**Antinomia** is an Obsidian plugin for **Personal Tension Management (PTM)** — the in-tension counterpart of Personal Knowledge Management. If **PKM** organizes explicit knowledge (*what I know*), **PTM** organizes where things don't fit (*where something jars*): contradictions, tradeoffs, anomalies, persistent doubts, weak signals, conflicts between goals. Clean ideas emerge later — as operational principles derived from resolving a tension, not before.

[![Obsidian Store](https://img.shields.io/badge/Obsidian-Community%20Store-7c3aed?logo=obsidian&logoColor=white)](obsidian://show-plugin?id=antinomia)
[![tests](https://github.com/demartinogiuseppe/antinomia/actions/workflows/test.yml/badge.svg)](https://github.com/demartinogiuseppe/antinomia/actions/workflows/test.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-1.6.5-blue)](CHANGELOG.md)
[![Obsidian](https://img.shields.io/badge/Obsidian-1.7.2%2B-7c3aed)](https://obsidian.md)
[![Paper DOI](https://img.shields.io/badge/Paper%20DOI-10.5281%2Fzenodo.20369124-blue)](https://doi.org/10.5281/zenodo.20369124)
[![Software DOI](https://img.shields.io/badge/Software%20DOI-10.5281%2Fzenodo.20506815-blue)](https://doi.org/10.5281/zenodo.20506815)
[![Substack](https://img.shields.io/badge/Newsletter-The%20Deeper%20Layer-orange?logo=substack)](https://giuseppedemartino.substack.com)

> 📓 I write about the ideas behind this work — the why, the architecture, the practice — at **[The Deeper Layer](https://giuseppedemartino.substack.com)** newsletter. Start with [*The Problem Nobody Is Solving*](https://giuseppedemartino.substack.com/p/the-problem-nobody-is-solving) and [*The Architecture of PTM*](https://giuseppedemartino.substack.com/p/the-architecture-of-ptm).

---

## ✅ Status: v1.6.5 — on the Obsidian Community Store

Antinomia is **available on the Obsidian Community Store** (and also installable via BRAT). Features are stable, but a few edge-case flows (e.g., duplicate Elevate modal in certain conditions) are under observation. Please open an issue if you find anything odd.

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

### From the Obsidian Community Store (recommended)

1. In Obsidian: **Settings → Community plugins → Browse**
2. Search **"Antinomia"** and click **Install**, then **Enable**

Or open it directly: [obsidian://show-plugin?id=antinomia](obsidian://show-plugin?id=antinomia). Updates arrive automatically through Obsidian.

### With BRAT (early/beta builds)

[BRAT](https://github.com/TfTHacker/obsidian42-brat) (Beta Reviewers Auto-update Tool) tracks this repo's latest release directly — useful for pre-store builds:

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
npm install
npm run build
```

This produces a production `main.js` at the repo root (alongside `manifest.json` + `styles.css`). For real-world use, copy those files into `<YOUR_VAULT>/.obsidian/plugins/antinomia/`.

---

## Prerequisites

- **Obsidian** 1.7.2+
- **Front Matter Title** community plugin (recommended) — shows human titles instead of timestamp basenames (`T-20260601-...`) in the File Explorer. Antinomia flags this if missing.
- **At least one AI backend** for Hunter / Propose / Map presuppositions:
  - **Free local**: [LM Studio](https://lmstudio.ai) with a loaded model (e.g., Qwen3 14B distill)
  - **Paid cloud**: Anthropic / OpenAI / Groq / OpenRouter API key

> ⚠️ **Cloud APIs incur per-token cost.** If you're cost-sensitive, use LM Studio or Ollama locally (free, private, models downloaded once).

---

## Privacy & network use

Antinomia makes **no autonomous network requests** and contains **no telemetry, analytics, or tracking** of any kind. It never "phones home."

- **The network is used only when you explicitly invoke an AI feature** (Contradiction Hunter, propose title, propose IF/THEN, map presuppositions, classify, free-form input, PDF / YouTube concept extraction). Each such action sends a single request to the **AI backend you configured**, and nowhere else.
- **Cloud backends** (Anthropic, OpenAI, Groq, OpenRouter): when you run an AI feature, the content of the notes involved in that action (the text the feature needs) is sent to that provider for processing, subject to the provider's own terms and privacy policy. Choose your provider accordingly.
- **Local backends** (LM Studio, Ollama): requests go only to `localhost` — **nothing leaves your machine**. This is the privacy-preserving option.
- **YouTube transcript fetch** additionally contacts YouTube's public `timedtext` endpoint to download captions for a video URL you provide; if that fails it offers an opt-in paste fallback. No video data is sent anywhere else.
- **API keys are stored locally** in your vault's `.obsidian/plugins/antinomia/data.json` (Obsidian's standard plugin-settings file), in plain text. If you sync your vault (Obsidian Sync, iCloud, Git, Dropbox, …), that file — and your keys — travels with it. Keep it out of public repositories and shared folders.

---

## Using local LLMs from mobile

Antinomia works on Obsidian mobile. By default, the mobile app can reach cloud backends (Anthropic, OpenAI, Groq, OpenRouter) directly. **Local backends** (LM Studio, Ollama) are by default reachable only at `localhost`, which mobile devices cannot access.

To use your home LM Studio or Ollama from mobile, you need to expose them via a network-reachable address. Three setup paths, in increasing complexity:

### Option 1 — Tailscale (recommended)

[Tailscale](https://tailscale.com) creates a private mesh VPN between your devices. Your phone is "virtually" on the same network as your desktop, even from cellular. End-to-end encrypted, zero firewall configuration, free for personal use.

1. Install Tailscale on your **desktop** (where LM Studio / Ollama runs) and on your **phone**.
2. Sign in to both with the same account.
3. On the desktop, find your Tailscale Magic DNS name (e.g., `mydesktop.tail1234.ts.net`).
4. In LM Studio (or Ollama), bind the server to `0.0.0.0` (all interfaces) instead of `127.0.0.1`.
5. In Antinomia mobile, set the profile baseUrl to: `http://mydesktop.tail1234.ts.net:1234/v1` (LM Studio) or `http://mydesktop.tail1234.ts.net:11434/v1` (Ollama).

Your notes never leave your devices — Tailscale is end-to-end encrypted.

### Option 2 — Same-WiFi LAN

If both devices are on the same home WiFi:

1. Find your desktop's local IP (e.g., `192.168.1.50`). On Windows: `ipconfig`. On macOS: System Settings → Network.
2. In LM Studio / Ollama, bind to `0.0.0.0`.
3. Configure your desktop firewall to allow inbound connections on port 1234 (LM Studio) or 11434 (Ollama) from the local network only.
4. In Antinomia mobile, set baseUrl to: `http://192.168.1.50:1234/v1`.

Works only when the phone is on the same WiFi.

### Option 3 — Cloudflare Tunnel

For access from anywhere via the public internet, with HTTPS:

1. Install [cloudflared](https://github.com/cloudflare/cloudflared) on your desktop.
2. Run `cloudflared tunnel --url http://localhost:1234` (or your local port).
3. Cloudflare gives you a public HTTPS URL (e.g., `https://random-name.trycloudflare.com`).
4. In Antinomia mobile, set baseUrl to that URL + `/v1`.

Cloudflare proxies the traffic. For long-term use, configure an Argo Tunnel with a custom domain.

### Why this matters

These setups let you run **fully private AI** from your phone — your notes go to your desktop's local model, never to a cloud provider. Antinomia treats Tailscale / LAN / Cloudflare addresses as `Local backend` in the UI (Privacy notices reflect this).

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
