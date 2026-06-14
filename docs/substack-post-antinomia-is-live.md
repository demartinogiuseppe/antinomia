# The notes I don't want to resolve yet

**Subhead** (one-liner sotto il titolo, critica per click): *Why I built an Obsidian plugin for the contradictions in my own thinking — and what three months of refusing to resolve them taught me.*

**Section Substack**: Practice (or Theory — tua scelta)
**Cover image suggerita**: una sezione del tuo graph view di Antinomia (i nodi azzurri su sfondo nebula) o screenshot di una nota frontmatter `antinomia_type: tension`. Niente stock photo.

---

For the last decade, every note-taking system I built had the same secret goal: to make my confusion go away.

I didn't notice this until recently.

I'd encounter a contradiction in my own thinking — two beliefs that didn't fit together, two principles I held in different moods, an observation that didn't square with what I claimed to know — and I'd open my vault. I'd type. By the time the note was filed, the contradiction was gone. Resolved. Synthesized into a clean third position with bullet points beneath it. Future-me, opening that note later, would never know there had been friction at all.

I called this "processing." I thought it was the work.

It wasn't. It was the work of avoiding the work.

---

I want to be specific, because abstract claims about PKM are cheap. So here's the note that started undoing my whole approach.

I have a long-running interest in attention and how to manage it. I'd written, at various points over two years, notes that said things like:

- "Deep work requires long, uninterrupted blocks of time."
- "My best ideas have come from interrupting one project with another."
- "Single-tasking is the discipline that compounds."
- "The breakthroughs I remember happened during context switches."

Read individually, each note made sense. They cited research. They had a thesis. They were good notes by every standard PKM metric — atomic, linked, well-titled.

Read together, they were nonsense. I was claiming two opposite things simultaneously. I'd just never read them together.

The PKM-correct move, when I finally noticed, was obvious: write a synthesis note. *"Long blocks are for execution; interruptions seed ideation; here's how to schedule both."* Clean. Filed. Done. I'd be back in coherent territory within an hour.

I started writing that synthesis. I got two paragraphs in before I stopped.

Because I didn't actually believe it. I'd written it because the contradiction made me uncomfortable, not because I had figured anything out. The synthesis was a story I was telling myself to *stop thinking about it*. The actual decision — *when do I need long blocks, when do I need interruption, what conditions tip me one way or the other* — I had no idea. The synthesis was lying.

I deleted the draft. Then I sat there for ten minutes staring at the four contradictory notes and felt, for the first time, what those notes were actually doing.

They were data. The contradiction wasn't a bug to fix. It was an instrument reading. Something I didn't yet understand about my own attention was making me write incompatible things, and the PKM workflow I'd built was optimized to obliterate that signal as fast as possible.

---

What I want to say about this is going to sound bigger than it is, so let me undersell it first: I don't think PKM is wrong. I don't think clean notes are bad. I don't think contradictions are sacred. I'm not building a new movement.

What I think is narrower than that, and harder to dismiss:

**Most PKM systems treat unresolved tension as a transitional state — something that exists briefly between encountering a confusing thought and producing a clean note about it. The implicit goal is to minimize the time you spend in tension.**

I started to suspect that the time spent in tension *is the thinking*. And every workflow that helps me resolve faster is, in some real sense, helping me think less.

I don't have a clean proof of this. What I have is three months of an experiment I started running on myself, where I deliberately refused to resolve certain contradictions, and watched what happened.

---

Here is what I did, mechanically, before describing what it taught me.

I started keeping a small set of notes in my vault that were explicitly *unresolved contradictions*. Each one said, in essence: *Position A claims X; position B claims not-X; I am not picking a side yet; here is the substrate (quotes, observations, half-thoughts) that feeds each side.*

These notes were not meant to be temporary. They were not waypoints on the road to a clean synthesis. They were meant to sit, sometimes for weeks, sometimes for months, as standing questions I was actively in.

When something shifted — when I encountered a new observation, ran an experiment, or noticed that one side started losing under specific conditions — I'd update the substrate. Occasionally a tension would mature into something I could write as an actual rule: not a hand-wave synthesis, but a real conditional. *IF I'm in [these conditions], THEN [this side wins], BECAUSE [I have evidence for it].* When that happened, the rule went into a separate layer — what I started calling principles.

Sometimes, a tension didn't mature. One side just turned out to be wrong, or to apply to a much narrower case than I'd thought. When that happened, the dead side went into a third layer — what I started calling defeated — labeled as *"I used to believe this; here's why I no longer do."*

That last archive surprised me. Having an explicit place to put dead beliefs, with the history of how they died, has felt unexpectedly important. It's the only place in my note-taking practice that admits I've been wrong about things, and shows what wrong I've been. Reading my own defeated archive is the closest I come to seeing the shape of my actual learning.

---

Three months in, here is what I notice.

Fewer of my notes get "finished," and I make peace with that. The ones that *do* finish — the principles, the rules I can defend — feel earned. They were not synthesized into existence by my discomfort with friction; they emerged from sitting with the friction long enough to see something.

I am more honest with myself about what I know. The old system let me write 800 notes and believe I understood my own thinking. The new system has roughly 40 active tensions, and I'm clear about which ones I have not figured out. Forty unresolved questions feels closer to my actual epistemic position than 800 clean notes ever did.

I make fewer decisions on the basis of synthesis notes. This sounds like a small thing. It is not. I used to draft an opinion on something, file it, and treat it as a settled position the next time the topic came up. I would defend that position to other people. Sometimes the position was a lie I'd written to avoid friction. I would have no way of knowing.

I have not become a better thinker. I have become a thinker who can see, more often than before, when I am not actually thinking. That seems like the more useful target.

---

I built an Obsidian plugin for this practice. I had to — I run too many notes and need an interface to keep this manageable. It's called Antinomia, and it does roughly what you'd expect from the description above: every note has a frontmatter field that places it in one of five layers (tension, substrate, principle, defeated, meta_note), and the plugin gives you views and commands for moving between them without files ever physically moving folders. There is an LLM-driven "Contradiction Hunter" that scans your vault and flags pairs of notes that contradict each other, often catching pairs I'd missed. It identifies; it does not resolve. The resolving stays with me.

After three weeks of building and one compliance review with the Obsidian community plugin reviewers, Antinomia is now live on the Obsidian Community Store, searchable as **Antinomia**. It's free, MIT-licensed, and works with local LLMs (LM Studio, Ollama) if you don't want to send your notes to a cloud provider.

The plugin is not the point of this post. The plugin is the consequence of the point. The point is that there's a layer of note-taking underneath PKM — call it whatever — that PKM systematically translates away from, and for some kinds of thinking, that translation is exactly what you don't want.

If you want to try the plugin, [obsidian://show-plugin?id=antinomia](obsidian://show-plugin?id=antinomia) opens it directly in Obsidian. The README on the [GitHub repo](https://github.com/demartinogiuseppe/antinomia) walks through what it does.

---

Three things I still don't know.

I don't know how this scales past a single user. I built it for me. I have no idea whether the practice of keeping notes unresolved feels right for someone with a different relationship to ambiguity than mine, or whether the layers I picked map onto the way other people actually think. I am genuinely interested in what other people running this practice find — what they keep, what they drop, what they wished I'd built differently.

I don't know whether AI-assisted contradiction hunting is the right move long-term. I built the Hunter because I have ~200 notes and finding pairs that quietly contradict each other got slow. But every time I make the LLM the agent that *notices* the friction, I'm relocating a piece of cognitive work that maybe I should keep. There's a version of this practice where you should find the contradictions yourself, and the moment of noticing is more important than the act of resolving. I'm not sure which version is right.

I don't know what to do about the cases where the contradiction is just two notes both being wrong. Most of what I described above assumes A and B are both partially right. Sometimes they're both garbage, and the synthesis-note that resolves them is just two pieces of garbage rolled into a third. I don't have a clean way to catch that.

These are not rhetorical uncertainties. They are real ones. If you have thoughts, the comments are open.

---

I'll close on something smaller.

The note I started with — the four contradictory notes about attention — is still in my vault. Still unresolved. Eight months later I have not figured out when I need long blocks and when I need interruption, and I've stopped pretending I will figure it out by writing a third note that sounds wise. The four notes sit there. They are useful to me precisely because they are not resolved. They are an honest representation of what I do and do not understand about my own attention, and they keep me from confidently claiming things I haven't earned the right to claim.

The note I would have written eight months ago — the synthesis, the clean position, the bullet points — would have made me feel productive. The four unresolved notes have made me think.

I'll take the second one.

---

*Antinomia is on the Obsidian Community Store — search "Antinomia" in Settings → Community plugins → Browse, or open [obsidian://show-plugin?id=antinomia](obsidian://show-plugin?id=antinomia). Open source ([MIT](https://github.com/demartinogiuseppe/antinomia)).*

*If you want context on the broader framework — why notes, why tensions, why this set of five layers — start with [The problem nobody is solving](https://giuseppedemartino.substack.com/p/the-problem-nobody-is-solving) and [The architecture of PTM](https://giuseppedemartino.substack.com/p/the-architecture-of-ptm).*

---

## Note tattiche per la pubblicazione

**Lunghezza finale**: ~2100 parole. Sweet spot per long-form Substack (5-7 min lettura).

**Subhead**: critico per click — è la "trailer" del post. La proposta è dichiarata sopra; sentiti libero di iterarla.

**Cover image**: due opzioni:
- A) Screenshot del tuo Graph view con nodi azzurri su nebula — visivo, specifico al prodotto, "wow" factor
- B) Photo concettuale di Unsplash — più editoriale (es. "tangled rope", "split path", "double exposure")
Raccomandata A per questo post specifico — il graph è bellissimo e riconoscibile.

**Section setup**: se non hai ancora 2 section, crea "Practice" e "Theory" come ti suggerivo. Questo post va in **Practice** (più operativo).

**Cross-link**: i 2 post precedenti che linki in fondo sono perfetti (Problem nobody is solving + Architecture of PTM). Niente plugin self-link più di 2 volte nel body.

**Tags Substack**: PKM, Obsidian, AI tools, knowledge work, thinking

**Subject email**: probabilmente il titolo va bene. Alternativa: *"Antinomia is live (and what 3 months of unresolved notes taught me)"*

**Quando pubblicare**: lunedì 15 giugno 8-10am italiana è il sweet spot Substack (US wakeup + EU lunch). Il post va via in email a tutti i subscriber automaticamente.

**Post-publish action checklist**:
- [ ] Substack Note breve (1 paragrafo) che linka al post, postata 4-6h dopo
- [ ] LinkedIn post che linka al Substack (nuovo, con bridge framing — vedi nota sotto)
- [ ] X / Twitter tweet che linka al post (se attivi account dedicated)
- [ ] Reddit r/ObsidianMD: NON linkare questo post direttamente (sembrerebbe content marketing). Usa il post Showcase v3 indipendente

**Bridge LinkedIn**: per pubblicare su LinkedIn senza il fail dell'altro post, framing: *"3 months into an experiment with my own thinking, I noticed I was deleting all my interesting questions. Here's what I'm trying instead."* — niente plugin nel titolo. Plugin emerge dal post Substack linkato.

## Cosa è diverso da v3 Reddit Showcase

Il post Substack è **diverso** dal post Reddit, deliberatamente:

| | Reddit Showcase | Substack Post |
|---|---|---|
| Lunghezza | 280 parole | 2100 parole |
| Tono | Builder voice, asciutto | Confession, riflessivo |
| Plugin mention | 1 paragrafo, casuale | 2 brevi mention, plugin come consequence |
| Closing | Apertura a domande tecniche | Riflessione personale, eco |
| Audience target | PKM power user che cercano tool | Pensatori interessati a meta-cognition |

Stesso insight di fondo. Voice e profondità completamente diversi. **Non riciclare letteralmente** tra i due — uno parla a chi cerca un tool, l'altro a chi sta pensando di pensare.