# The Plugin

I had been thinking about Personal Tension Management as a concept for two months before I built the tool. The two months were necessary. The grammar — the five layers, the unit of work, the relations between them — couldn't have been worked out from a clean architecture diagram. It had to come out of a folder full of notes that refused to organize themselves correctly.

But at some point the framework was clear enough that the next constraint became practical. You can't test whether a grammar holds without using it. And you can't use a grammar that lives only in your head while you're trying to write down the next note.

So the framework needed to become a thing.

This is that thing.

---

## What it is

Antinomia is an Obsidian plugin. It implements the five-layer grammar — tension, substrate, principle, defeated, meta-note — as YAML frontmatter on plain markdown notes.

The decision that took the longest was the smallest one. The layer of a note is a property in the frontmatter. Not a folder. Not a tag. Not a database index.

Why does that matter? Because the moment you move a file when its layer changes, every wikilink that pointed to it breaks. And the moment links start breaking, you stop changing layers. And the moment you stop changing layers, the system reverts to a static taxonomy — which is exactly what a PKM is and exactly what PTM was supposed to escape.

A tension that becomes a defeated belief is the same file with a different `antinomia_type`. The graph remembers the transition.

---

## What it does that nothing else does

Four things, in increasing order of how convinced I am that they are the right design.

**Contradiction Hunter.** The plugin can send your open tensions and substrate notes to an AI model and ask one question: which of these pairs contradict each other? The model returns a list with a confidence rating. Then it stops. It does not propose how to resolve the contradiction. It does not synthesize a position. That is the constraint, not a limit. Resolution is a human act. The Hunter exists so that pairs you would otherwise miss surface as candidates for your attention.

**PDF concept extraction.** A recent addition. Drop a PDF in your vault, ask Antinomia to ingest it, and the AI extracts standalone concepts — quotes, claims, facts — as candidate substrate notes. You preview the list, check which to keep, and the plugin creates one substrate per concept in a dedicated subfolder, all linked back to a single hub note that represents the PDF in your graph. A blob of reading becomes a constellation of interrogable material. The point is not to summarize; it is to atomize. The Hunter then sees each fragment as something it can pair against everything else in the vault.

**Local-first by design, multi-backend by necessity.** Antinomia runs against LM Studio or Ollama on your laptop with the same code path it uses against Anthropic or Groq. The plugin auto-detects which family of model you are talking to — reasoning model with extended thinking, cloud o-series, open-weights instruct — and adapts max-tokens, request shape, and stop conditions accordingly. The right move for serious use is the local backend: zero per-token cost, your notes never leave your machine, no third party gets a copy of your unresolved contradictions. The cloud profiles exist because sometimes you need a specific model and that model is not yet local. When you switch to a cloud profile the plugin reminds you, once, that you are leaving local-first.

**Graph as epistemic history.** The Antinomia graph view is not Obsidian's default graph. It clusters nodes by layer, draws the transitions explicitly — a defeated belief points to the principle that replaced it; a principle points back to the tension it resolved — and lets you filter by layer. Over time this graph becomes the map of how your thinking has actually changed. Not a snapshot of what you currently believe. A trace of the work of believing.

---

## How to try it

The plugin is in public beta, distributed via BRAT.

1. Install **BRAT** from the Obsidian Community plugins.
2. In BRAT settings → Add Beta plugin → paste `demartinogiuseppe/antinomia`.
3. Enable Antinomia in Community plugins.

BRAT picks up new releases automatically.

There is an example vault you can generate from the plugin itself: 21 notes with deliberately planted contradictions — some sharp and explicit, some subtle, some across substrate-to-substrate boundaries — and an `EXAMPLE-KEY.md` that documents what was planted. Run the Hunter on it. You will see which pairs it finds, which it misses, which false positives it generates. That comparison is more useful than any benchmark I could publish. The point is not to evaluate the model. The point is to calibrate your trust in the Hunter against ground truth you control.

The minimum AI setup that costs nothing: LM Studio with a Llama 3.1 8B Instruct or Mistral 7B Instruct loaded. Both run on most laptops with eight gigabytes of video memory. The Hunter on a small vault takes a few seconds. The output quality is good enough to start a practice; the practice is what tells you whether to upgrade the model.

Full README, BRAT install guide, and an extended beta-tester walkthrough live at `github.com/demartinogiuseppe/antinomia`.

---

## What it is not

Antinomia is not a decision-support system. The contradictions the Hunter surfaces are prompts for thinking, not truths on which to base real choices about work, money, health, relationships. Models hallucinate. Models oversimplify. The reading of any single pair is yours to make. The disclaimer is in the plugin, in the welcome modal, in the settings tab, in the Hunter sidebar. It needs to be there because the failure mode is real: a system that surfaces contradictions can be misused as a system that adjudicates them. Antinomia refuses that role explicitly.

Antinomia is not finished. It is a research preview. There are edge cases the plugin handles poorly, flows that are more brittle than they should be, documentation that lags the code. If you find something odd, open an issue on the repo. I read all of them.

Antinomia is not a productivity tool. It will not make you write notes faster. It will not summarize your reading for you. It will not let you avoid the hard part. What it does is hold the unresolved in a form that does not let you forget that it is unresolved.

---

The plugin exists because the framework was not enough. The framework exists because the existing tools were not enough. Both are still incomplete. The version you can install today is the version that was clear enough to be worth committing to disk. There will be others.

If you try Antinomia and the Hunter finds a contradiction you hadn't noticed in your own thinking, tell me. That is the kind of feedback that matters for this project. Everything else is noise.

— G. De Martino

---

*The paper behind this work: <https://doi.org/10.5281/zenodo.20369124>*
*The software (citable): <https://doi.org/10.5281/zenodo.20506815>*
