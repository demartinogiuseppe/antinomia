// example-vault seeding flow. Extracted from main.ts (refactor v1.5).

import { Notice } from "obsidian";
import type AntinomiaPlugin from "../main";
import { FOLDER, TYPE, VIEW_TYPE_OPEN_TENSIONS } from "../core/constants";
import { yamlQuote, readFrontmatter } from "../core/frontmatter";
import { ensureFolder, todayISO } from "../core/utils";

export async function createExampleNotes(plugin: AntinomiaPlugin): Promise<void> {
    await ensureFolder(plugin.app, FOLDER.notes);
    const today = todayISO();

    const tensionTpl = (
      title: string,
      a: string,
      b: string,
      presupA = "",
      presupB = ""
    ) => `---
antinomia_type: ${TYPE.tension}
title: ${yamlQuote(title)}
status: open
base_language: english
creation_date: ${today}
modified_date: ${today}
origin: example
antinomia_example: true
links: []
---
- **A (base):** ${a}
- **A (original):**
- **B (base):** ${b}
- **B (original):**
- **Presuppositions A:** ${presupA}
- **Presuppositions B:** ${presupB}
`;

    const substrateTpl = (title: string, contenuto: string) => `---
antinomia_type: ${TYPE.substrate}
title: ${yamlQuote(title)}
base_language: english
original_language: english
source: example
date: ${today}
antinomia_example: true
---
- **Content (base):** ${contenuto}
- **Original:**
`;

    // Principle template (Design C: separate file, origin_tension points to defeated)
    const principleTpl = (
      title: string,
      ifA: string, thenA: string,
      ifB: string, thenB: string,
      grey: string,
      origineBasename: string
    ) => `---
antinomia_type: ${TYPE.principle}
title: ${yamlQuote(title)}
date: ${today}
modified_date: ${today}
origin_tension: "[[${origineBasename}]]"
antinomia_example: true
links: []
---
## IF / THEN

- **IF (A):** ${ifA}
- **THEN (A):** ${thenA}

- **IF (B):** ${ifB}
- **THEN (B):** ${thenB}

## GREY ZONE

${grey}

## Origin (tension)

> Derived from: [[${origineBasename}]]

_(original text preserved in the linked defeated)_
`;

    // Defeated template motive=elevated (Design C: original tension converted into defeated)
    const defeatedTpl = (
      title: string,
      a: string, b: string,
      sostituitaDaBasename: string
    ) => `---
antinomia_type: ${TYPE.defeated}
title: ${yamlQuote(title)}
motive: elevated
date: ${today}
modified_date: ${today}
replaced_by: "[[${sostituitaDaBasename}]]"
antinomia_example: true
links: []
---
- **A (original):** ${a}
- **B (original):** ${b}

> Replaced by: [[${sostituitaDaBasename}]]
`;

    // Presupposition-demo templates (v1.5): a principle that lists the U- notes
    // it rests on, and a presupposition that lists the principles resting on it.
    const links = (ids: string[]) => ids.map((i) => `"[[${i}]]"`).join(", ");
    const presupPrincipleTpl = (
      title: string,
      ifClause: string,
      thenClause: string,
      presupposes: string[]
    ) => `---
antinomia_type: ${TYPE.principle}
title: ${yamlQuote(title)}
date: ${today}
modified_date: ${today}
origin: example
antinomia_example: true
presupposes: [${links(presupposes)}]
links: []
---
- **IF ${ifClause} -> THEN ${thenClause}**
- **GREY ZONE:**
`;
    const presuppositionTpl = (
      title: string,
      text: string,
      confidence: string,
      of: string[]
    ) => `---
antinomia_type: ${TYPE.presupposition}
title: ${yamlQuote(title)}
status: active
confidence: ${confidence}
presupposes_of: [${links(of)}]
creation_date: ${today}
modified_date: ${today}
base_language: en
antinomia_example: true
---
${text}

> Describe when this assumption holds, counter-examples, and sources.
`;
    const P_A = "EXAMPLE-P-decline-vague-budget";
    const P_B = "EXAMPLE-P-require-written-scope";
    const U_SHARED = "EXAMPLE-U-budget-seriousness";

    // 18 messy-vault notes + 2 Design C (P + D linked).
    // Basenames use the EXAMPLE- prefix for easy visual identification.
    const PRINC_ID = "EXAMPLE-P-quantity-quality";
    const DEF_ID = "EXAMPLE-D-quantity-quality";
    type Item = { id: string; content: string };
    const items: Item[] = [
      // ====== 3 declared tensions ======
      { id: "EXAMPLE-T-02-remote-vs-office",
        content: tensionTpl(
          "EXAMPLE - Remote work vs office",
          "Remote work makes me more productive because no one interrupts me.",
          "In the office I get much more done; direct exchange unblocks things."
        )},
      { id: "EXAMPLE-T-08-experiences-vs-things",
        content: tensionTpl(
          "EXAMPLE - Experiences vs material goods",
          "Spending on experiences (travel, courses) is worth more than accumulating material goods.",
          "Goods last, experiences fade; investing in solid things is wiser."
        )},
      { id: "EXAMPLE-T-15-social-time-vs-brand",
        content: tensionTpl(
          "EXAMPLE - Social media: waste of time vs personal brand",
          "Social media is a waste of time that should be eliminated.",
          "Social media helped me grow professionally; it's an investment in my personal brand."
        )},

      // ====== 15 substrate ======
      { id: "EXAMPLE-S-01-gut-decisions",
        content: substrateTpl("EXAMPLE - Gut decisions",
          "Important decisions should be made by gut feeling; instinct rarely fails.")},
      { id: "EXAMPLE-S-03-impulse-decisions-data",
        content: substrateTpl("EXAMPLE - Impulse decisions — data",
          "Quote from a management book: data shows that impulse decisions have an error rate three times higher than those weighed with analysis.")},
      { id: "EXAMPLE-S-04-shopping",
        content: substrateTpl("EXAMPLE - Operational note: shopping",
          "Today I bought milk and bread. I need to remember to call the plumber.")},
      { id: "EXAMPLE-S-05-discipline-beats-talent",
        content: substrateTpl("EXAMPLE - Discipline beats talent",
          "Discipline counts more than talent: those who commit consistently always surpass the lazy prodigy.")},
      { id: "EXAMPLE-S-06-productivity-results",
        content: substrateTpl("EXAMPLE - Productivity = results",
          "Productivity is not measured in hours but in results. Spending more time at the desk doesn't mean producing more.")},
      { id: "EXAMPLE-S-07-talent-is-everything",
        content: substrateTpl("EXAMPLE - Talent is everything",
          "Talent is everything. Without a natural gift, no matter how hard you try, you stay mediocre in the things that matter.")},
      { id: "EXAMPLE-S-09-preferences",
        content: substrateTpl("EXAMPLE - Neutral preferences",
          "I like coffee in the morning. Blue is my favorite color.")},
      { id: "EXAMPLE-S-10-seneca",
        content: substrateTpl("EXAMPLE - Seneca quote on time",
          "Seneca: we don't have too little time, we waste a lot. Life is long enough if you know how to use it.")},
      { id: "EXAMPLE-S-11-carpe-diem",
        content: substrateTpl("EXAMPLE - Carpe diem",
          "Life is too short to plan for the long term; you have to enjoy the moment because you don't know what tomorrow brings.")},
      { id: "EXAMPLE-S-12-delegate-grow",
        content: substrateTpl("EXAMPLE - Delegate = growth",
          "Delegating is the key to growth: those who want to do everything alone never scale beyond themselves.")},
      { id: "EXAMPLE-S-13-do-it-yourself",
        content: substrateTpl("EXAMPLE - Do it yourself to do it well",
          "If you want something done well, do it yourself. Others never have your same care.")},
      { id: "EXAMPLE-S-14-sleep",
        content: substrateTpl("EXAMPLE - Operational note: sleep",
          "Slept badly last night. Meeting tomorrow at 10.")},
      { id: "EXAMPLE-S-16-frugal-false-economy",
        content: substrateTpl("EXAMPLE - Obsessive saving = false economy",
          "Saving obsessively on everything is a false economy: time spent chasing discounts is worth more than the discount itself.")},
      { id: "EXAMPLE-S-17-buy-cheapest",
        content: substrateTpl("EXAMPLE - I always buy the cheapest",
          "I always buy the cheapest product available, regardless. Every penny saved is a penny earned.")},
      { id: "EXAMPLE-S-18-ai-changes-everything",
        content: substrateTpl("EXAMPLE - AI will change everything",
          "AI will change everything in the coming years; it's the biggest revolution since the internet.")},

      // ====== 2 Design C notes: defeated <- principle (to show red edge in the graph) ======
      { id: DEF_ID,
        content: defeatedTpl(
          "EXAMPLE - Quantity vs quality (original tension)",
          "To grow you need to produce a lot: more output, more iterations, more speed.",
          "Quantity without care dilutes the result; better less and done well.",
          PRINC_ID
        )},
      { id: PRINC_ID,
        content: principleTpl(
          "EXAMPLE - Principle: quantity or quality depending on context",
          "exploratory phase, low production cost, fast feedback",
          "prefer volume: iterate a lot, discard fast",
          "consolidation phase, high cost, lasting consequences",
          "prefer care: less output but high quality",
          "There is a grey zone when exploration and consolidation overlap (e.g. professional creative work): in that case the criterion becomes the cost of a single error.",
          DEF_ID
        )},
      // --- Presupposition demo (v1.5): 2 principles, 5 presuppositions, one
      // shared (EXAMPLE-U-budget-seriousness has degree 2 -> load-bearing). ---
      { id: P_A,
        content: presupPrincipleTpl(
          "EXAMPLE - Principle: decline projects with a vague budget",
          "the client's budget is still vague after one clarification",
          "decline the project",
          [U_SHARED, "EXAMPLE-U-cant-clarify-quickly", "EXAMPLE-U-bad-fit-costly"]
        )},
      { id: P_B,
        content: presupPrincipleTpl(
          "EXAMPLE - Principle: require a written scope before starting",
          "the scope was agreed only verbally",
          "require a written scope first",
          [U_SHARED, "EXAMPLE-U-verbal-scope-drifts", "EXAMPLE-U-clients-accept-process"]
        )},
      { id: U_SHARED,
        content: presuppositionTpl(
          "EXAMPLE - Budget clarity signals client seriousness",
          "If a client cannot articulate a budget range, the project usually is not a real priority for them.",
          "high",
          [P_A, P_B]
        )},
      { id: "EXAMPLE-U-cant-clarify-quickly",
        content: presuppositionTpl(
          "EXAMPLE - A vague budget cannot be clarified in a short call",
          "One clarifying conversation is not enough to turn a vague budget into a reliable one.",
          "medium",
          [P_A]
        )},
      { id: "EXAMPLE-U-bad-fit-costly",
        content: presuppositionTpl(
          "EXAMPLE - A bad-fit project costs more than its revenue",
          "The hidden cost of a misaligned project (rework, stress, reputation) outweighs the money it brings in.",
          "high",
          [P_A]
        )},
      { id: "EXAMPLE-U-verbal-scope-drifts",
        content: presuppositionTpl(
          "EXAMPLE - Verbal scope inevitably drifts",
          "Scope agreed only in conversation expands over time because neither side has a fixed reference.",
          "high",
          [P_B]
        )},
      { id: "EXAMPLE-U-clients-accept-process",
        content: presuppositionTpl(
          "EXAMPLE - Good clients accept a written process",
          "A client worth working with will not refuse to put the scope in writing.",
          "medium",
          [P_B]
        )},
    ];

    let created = 0;
    for (const it of items) {
      const path = `${FOLDER.notes}/${it.id}.md`;
      try {
        await plugin.app.vault.create(path, it.content);
        created++;
      } catch (e) {
        console.error("[Antinomia] example create failed for", it.id, e);
      }
      // Yield to the main thread every few files so bulk-creating the ~21
      // example notes doesn't freeze the UI during first-run onboarding (#189).
      if (created % 4 === 0) {
        await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
      }
    }

    // ====== EXAMPLE-KEY.md in the ROOT of the vault (NOT in notes/) ======
    const chiaveContent = `---
antinomia_example: true
title: "EXAMPLE — Key to the seeded contradictions"
---
# Example vault — key

> This file accompanies the EXAMPLE-* notes in your vault. It explains which contradictions were seeded, what the Hunter should find, and what counts as control noise.
>
> Delete this file (and all EXAMPLE-* notes) via: Settings -> Antinomia -> "Delete examples" or command palette "Antinomia: delete examples".

---

## REAL contradictions seeded (what the Hunter SHOULD find)

### CN1 — SHARP. Gut decisions vs deliberated
- **Gut decisions** ↔ **Impulse decisions — data**
- Frontal contradiction, almost explicit. Expected confidence: **alta**.

### CN2 — SHARP. Talent vs discipline
- **Discipline beats talent** ↔ **Talent is everything**
- Direct opposition on which factor counts. Expected confidence: **alta**.

### CN3 — MEDIUM. Do it yourself vs delegate
- **Delegate = growth** ↔ **Do it yourself to do it well**
- Clear contradiction but expressed in different registers. Expected confidence: **medium-high**.

### CN4 — MEDIUM, substrate↔substrate. Saving
- **Obsessive saving = false economy** ↔ **I always buy the cheapest**
- Test of substrate↔substrate scanning. Expected confidence: **media**.

### CN5 — SUBTLE. Time: Seneca vs carpe diem
- **Seneca quote on time** ↔ **Carpe diem**
- Philosophical contradiction, less lexically evident. Expected confidence: **low-medium**.

---

## NOISE — elements that should NOT generate contradictions

- **Operational note: shopping** (milk, bread, plumber)
- **Neutral preferences** (coffee, blue color)
- **Operational note: sleep** (slept badly, meeting tomorrow)
- **AI will change everything** (isolated opinion, no opposite in the vault)

If the Hunter pairs any of these as "contradiction", it's a FALSE POSITIVE.

---

## Tensions already declared (NOT for the Hunter to discover — already open)

- **Remote work vs office**
- **Experiences vs material goods**
- **Social media: waste of time vs personal brand**

NB: "Productivity = results" touches the same theme as "Remote work vs office". The Hunter MIGHT link them — legitimate weak connection, not an error.

---

## Design C example (visible in the graph)

- **Defeated**: EXAMPLE - Quantity vs quality (original tension)
- **Principle**: EXAMPLE - Principle: quantity or quality depending on context

Open the Antinomia Graph — you'll see the two nodes connected by a red edge (defeated → replaced_by → principle). This is an example of a tension already elevated: the operational principle emerges from resolving the tension, the defeated preserves the history.

---

## Load-bearing assumptions (presuppositions, v1.5)

Two example principles are seeded with the implicit assumptions they rest on:

- **"Decline projects with a vague budget"** presupposes: *budget clarity signals client seriousness*, *a vague budget can't be clarified in a short call*, *a bad-fit project costs more than its revenue*.
- **"Require a written scope before starting"** presupposes: *budget clarity signals client seriousness*, *verbal scope inevitably drifts*, *good clients accept a written process*.

Notice that **"Budget clarity signals client seriousness"** is shared by BOTH principles. In the Graph (or the dedicated **Presuppositions Map**, key icon in the ribbon) it shows up as a larger, gold, glowing node — a **load-bearing assumption**. If that single assumption turned out to be false, BOTH principles would collapse with it. Run **"What collapses if this fails?"** on it to see exactly which.

That is the point of the presupposition layer: surfacing the invariants your principles silently depend on, so you can see what your thinking is actually resting on.

---

## How to measure the Hunter

- **Recall on CN1, CN2** (sharp): if even one is missed, serious model problem.
- **CN4 substrate↔substrate**: does it find it? -> full scanning works.
- **CN5 subtle**: does it find it? -> the model reasons well; if it skips it -> model limit, not design.
- **False positives on noise**: zero is ideal.
- **Confidence ordering**: the sharp ones (CN1, CN2) should rank above the subtle one (CN5).
`;
    try {
      await plugin.app.vault.create("EXAMPLE-KEY.md", chiaveContent);
      created++;
    } catch (e) {
      console.error("[Antinomia] example key create failed", e);
    }

    new Notice(
      `Examples created: ${created} notes (18 messy + 2 Design C + 2 principles + 5 presuppositions + 1 KEY). Removable via 'delete examples'.`
    );
    await plugin.activateView(VIEW_TYPE_OPEN_TENSIONS);

    // Force a relayout of any open Graph view: a batch of 20+ new nodes added
    // at (0,0) collapses into a single cluster otherwise. Small delay gives
    // Obsidian's metadataCache time to process the newly created notes.
    window.setTimeout(() => plugin.refreshOpenGraphViews(), 300);
}

export async function deleteExampleNotes(plugin: AntinomiaPlugin): Promise<void> {
    const toDelete = plugin.app.vault.getMarkdownFiles().filter((f) => {
      const fm = readFrontmatter(plugin.app, f);
      return fm?.antinomia_example === true;
    });
    if (toDelete.length === 0) {
      new Notice("No example notes found.");
      return;
    }
    let deleted = 0;
    for (const f of toDelete) {
      try {
        await plugin.app.fileManager.trashFile(f);
        deleted++;
      } catch (e) {
        console.error("[Antinomia] example delete failed", e);
      }
    }
    new Notice(`Deleted ${deleted} example notes.`);
}
