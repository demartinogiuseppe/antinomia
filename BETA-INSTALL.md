# Antinomia v1.2 — Beta tester installation guide

Thanks for trying Antinomia. This file walks you from install to first use. Estimated time: **10 minutes** (5 of which are downloading the local AI model).

> ⚠️ **Breaking change from v1.1.x**: the frontmatter schema is now fully English (`antinomia_type`, `status: open`, `links`, etc.). Vaults built with v1.1.x will NOT be read. Start a fresh vault.

---

## Prerequisites

- **Obsidian** version 1.4 or later (download from [obsidian.md](https://obsidian.md))
- (Optional but recommended) **LM Studio** if you want to use a free local AI model — see Step 4

---

## Step 1 — Prepare a dedicated vault for testing

> ⚠️ **Don't install Antinomia in your main vault on the first try.** Antinomia creates demo notes (prefix `EXAMPLE-`) + an `EXAMPLE-KEY.md` file at the vault root. If you delete the wrong file by mistake, they could mix with your real notes.

1. Open Obsidian
2. Click the vault icon at the bottom left → **Open another vault** → **Create new vault**
3. Name it: `AntinomiaTest` (or whatever you prefer)
4. Confirm → an empty vault opens

---

## Step 2 — Install the Antinomia plugin

1. **Unzip** the `antinomia-v1.2.0.zip` you received. You'll get an `antinomia/` folder containing `main.js`, `manifest.json` (and possibly `styles.css`).
2. Open the **vault folder** on your filesystem (e.g. `Documents/AntinomiaTest/`). If you don't know where it is, in Obsidian: Settings → About → "Open vault location" or via the icon under the vault name.
3. Navigate to `<vault>/.obsidian/plugins/`. If the `plugins` folder doesn't exist, create it.
4. **Copy the unzipped `antinomia/` folder** into `<vault>/.obsidian/plugins/`. The final structure must be:
   ```
   <vault>/.obsidian/plugins/antinomia/main.js
   <vault>/.obsidian/plugins/antinomia/manifest.json
   ```
5. Go back to Obsidian
6. Settings → **Community plugins**
7. If you see "Community plugins are currently restricted", click **"Turn on community plugins"** → Trust author and enable
8. **"Installed plugins"** section → find **Antinomia** → toggle on
9. Antinomia activates. On first launch the **Welcome Modal** opens with the paradigm and the 5 layers.

---

## Step 3 — Install the recommended Front Matter Title plugin

Without this plugin, the File Explorer shows technical basenames like `T-20260530-091416.md` instead of the human titles you gave the notes. Antinomia warns you about this with a **yellow banner in the Welcome Modal**.

1. Settings → **Community plugins** → **Browse**
2. Search for **Front Matter Title** (author: Snezhig)
3. Install → Enable
4. Settings → **Front Matter Title** (community plugin section) → "Common main template" → enter the word `title`
5. Save

Now you'll see human titles everywhere (File Explorer, tabs, wikilinks).

---

## Step 4 — Configure an AI backend

Antinomia uses AI models for Hunter, propose IF/THEN, map presuppositions, classify. Two options:

### 4A — Free local (recommended for beta testers)

1. Download and install **LM Studio** from [lmstudio.ai](https://lmstudio.ai)
2. Launch LM Studio
3. **Discover** or **Search** section → look for `qwen3-14b-claude-4.5-opus-high-reasoning-distill` (or another Qwen 14B / 9B if you have less VRAM). Download (~6-9 GB).
4. **Local Server** or **Developer** section → load the model → start the server (default `http://localhost:1234`)
5. In Obsidian: Settings → **Antinomia** → **AI Profiles** section → edit the Default profile (or add a new one)
6. **Backend preset** → "LM Studio (local)" (or "LM Studio OpenAI-compat" if you prefer OpenAI format)
7. API key: leave it as `lmstudio` (placeholder; LM Studio doesn't verify it)
8. Click **Test** → it should respond "pong" or equivalent

### 4B — Paid cloud

1. Create an API key from:
   - Anthropic: [console.anthropic.com](https://console.anthropic.com) (Claude)
   - OpenAI: [platform.openai.com](https://platform.openai.com) (GPT)
   - Groq: [console.groq.com](https://console.groq.com) (Llama 3.3, super fast)
   - OpenRouter: [openrouter.ai](https://openrouter.ai) (gateway to 100+ models)
2. Settings → Antinomia → AI Profiles → edit → matching Backend preset
3. Paste the key → Test

> ⚠️ Cloud APIs have **per-token costs**. If you're cost-sensitive, use LM Studio locally.

---

## Step 5 — Explore the example vault

Now the interesting part: see what Antinomia does with a pre-built note set.

1. Settings → **Antinomia** → scroll down to **Onboarding**
2. Click the **"Create examples"** button
3. Confirm the warning modal
4. **21 notes** are created (3 tensions + 15 substrate + 1 defeated + 1 Design C principle) inside `notes/` + an `EXAMPLE-KEY.md` file at the vault root

### What to do now (5-10 minutes)

1. **Open `EXAMPLE-KEY.md`** (at the vault root, top file in the File Explorer). It contains the guide to the seeded contradictions (CN1-CN5).

2. **Explore the Antinomia sidebars** (ribbon icons on the left or via the nav menu at the top of every view):
   - 📊 Dashboard (right sidebar)
   - 📝 Open tensions
   - 📚 Substrate
   - 🧭 Principles
   - 🗄 Defeated archive

3. **Open the Antinomia Graph** (auto-opened at plugin startup, or via nav menu → 🕸 Graph). You'll see:
   - 21 colored nodes by layer (orange = open tensions, grey = substrate, green = principle, red = defeated)
   - 1 **red edge** between the defeated and the principle of the Design C example (`EXAMPLE-D-quantity-quality` → `EXAMPLE-P-quantity-quality`)
   - Toggle checkboxes at the top to filter by layer (animated fade-in/out)
   - Drag the dots, spin the wheel to zoom (1.6×/step animated 320 ms), use the vertical slider

4. **Run the Hunter**:
   - `Ctrl+P` → "**Antinomia: find contradictions (Hunter)**"
   - Wait for completion (with LM Studio 14B on 18 notes: ~2 minutes)
   - Compare the output against the **KEY**. Expected: it finds CN2, CN3, CN4 (substrate-substrate test), CN5. CN1 is the hardest case for small local models.
   - If you want to stop the Hunter before completion: click the "⛔ Stop Hunter" button in the results sidebar.

5. **Hunter on a single note** (focus mode):
   - Global nav menu → **🔍 Hunter ▾** → **"Hunter on a note (focus)"**
   - A picker opens → choose e.g. "I always buy the cheapest"
   - The Hunter scans only pairs involving that specific note

6. **Try the other AI features**:
   - Open a tension → Open Tensions sidebar → **"Presuppositions"** button → "Propose presuppositions (AI)" → AI suggests them
   - Open a tension → **"↑ Elevate"** button → IF/THEN/GREY form → "Propose IF/THEN (AI)" → a new principle is created + the original tension becomes a defeated (Design C)

---

## Step 6 — Clean up when you're done

When you understand how it works and want to start your real vault:

1. Settings → Antinomia → **Onboarding** → **"Delete examples"** button
2. Confirm → all `EXAMPLE-*` notes + the `EXAMPLE-KEY.md` go into the Obsidian trash (recoverable from trash if you change your mind)
3. The vault is clean. Start with: `Ctrl+P` → "Antinomia: new tension" or via nav menu → ➕ Create

---

## Important warnings

⚠️ **Antinomia is not a decision-support system.** The pairs the Hunter proposes are prompts for thinking, not truths. The AI model can hallucinate, oversimplify, misinterpret. **Don't use it to decide in real situations** (work, health, finance, relationships). See the disclaimer when the Welcome Modal opens.

---

## Feedback for the team

Particularly useful things to report:

- **Bugs and crashes**: Obsidian's console (Ctrl+Shift+I) → Console tab → copy any `[Antinomia] ...` errors
- **Hunter on your own vault**: how many pairs it finds, how many are good, how many are false positives
- **Real-world workflow**: what's clunky, what's missing, what you don't use
- **Comparison between AI models**: if you've tried both cloud and local, report quality differences

Thanks for spending time on this. Antinomia is a practice, not a tool: any feedback on how the system feels in real use matters a lot.

---

## Quick troubleshooting

- **Plugin doesn't appear in "Installed plugins"**: the `antinomia/` folder must be DIRECTLY inside `.obsidian/plugins/`, not nested in another level. Check that `manifest.json` is directly readable at `.obsidian/plugins/antinomia/manifest.json`.
- **"Failed to fetch" when clicking AI features**: reload the plugin (Settings → Community plugins → toggle off/on Antinomia). Obsidian doesn't re-read `main.js` if it changes on disk without a reload.
- **LM Studio "Processing prompt 100%" hangs**: the model is slow on the long prompt. Press "⛔ Stop Hunter" (the button actually works, it closes the TCP socket and stops generation on LM Studio's side). Lower the note cap in Settings or use a smaller model.
- **File Explorer shows `T-20260530-...` instead of titles**: Front Matter Title is missing (Step 3).
