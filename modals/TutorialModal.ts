// step-by-step tutorial modal. Extracted from main.ts (refactor v1.5).

import { App, Modal } from "obsidian";
import type { TutorialStep } from "../core/types";

export class TutorialModal extends Modal {
  private currentStep = 0;
  constructor(app: App, startStep = 0) {
    super(app);
    if (startStep > 0) this.currentStep = startStep;
  }
  onOpen(): void {
    this.render();
  }
  private render(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.style.maxHeight = "70vh";
    contentEl.style.overflowY = "auto";

    const step = TUTORIAL_STEPS[this.currentStep];

    // Progress indicator
    const progress = contentEl.createEl("div");
    progress.style.fontSize = "0.8em";
    progress.style.opacity = "0.6";
    progress.style.marginBottom = "8px";
    progress.setText(
      `Step ${this.currentStep + 1} of ${TUTORIAL_STEPS.length}`
    );

    contentEl.createEl("h2", { text: step.title });

    for (const p of step.paragraphs) {
      const para = contentEl.createEl("p");
      para.style.lineHeight = "1.5";
      para.setText(p);
    }

    if (step.exampleTitle && step.exampleLines && step.exampleLines.length) {
      const box = contentEl.createEl("div");
      box.style.padding = "10px 12px";
      box.style.marginTop = "12px";
      box.style.background = "var(--background-secondary)";
      box.style.borderLeft = "3px solid var(--text-accent)";
      box.style.borderRadius = "4px";
      const exTitle = box.createEl("div");
      exTitle.style.fontWeight = "600";
      exTitle.style.marginBottom = "6px";
      exTitle.setText(step.exampleTitle);
      for (const line of step.exampleLines) {
        const l = box.createEl("div");
        l.style.fontSize = "0.9em";
        l.style.lineHeight = "1.5";
        l.style.marginBottom = "3px";
        l.setText(line);
      }
    }

    // Navigation buttons
    const navRow = contentEl.createEl("div");
    navRow.style.display = "flex";
    navRow.style.gap = "8px";
    navRow.style.justifyContent = "space-between";
    navRow.style.marginTop = "20px";

    const leftGroup = navRow.createEl("div");
    leftGroup.style.display = "flex";
    leftGroup.style.gap = "6px";

    const backBtn = leftGroup.createEl("button", { text: "← Back" });
    backBtn.style.padding = "6px 12px";
    backBtn.style.cursor = "pointer";
    backBtn.disabled = this.currentStep === 0;
    backBtn.onclick = () => {
      if (this.currentStep > 0) {
        this.currentStep--;
        this.render();
      }
    };

    const exitBtn = leftGroup.createEl("button", { text: "Exit" });
    exitBtn.style.padding = "6px 12px";
    exitBtn.style.cursor = "pointer";
    exitBtn.onclick = () => this.close();

    const rightGroup = navRow.createEl("div");
    const isLast = this.currentStep === TUTORIAL_STEPS.length - 1;
    const nextBtn = rightGroup.createEl("button", {
      text: isLast ? "Finish" : "Next →",
    });
    nextBtn.style.padding = "6px 14px";
    nextBtn.style.cursor = "pointer";
    nextBtn.style.background = "var(--interactive-accent)";
    nextBtn.style.color = "var(--text-on-accent)";
    nextBtn.style.fontWeight = "600";
    nextBtn.onclick = () => {
      if (isLast) {
        this.close();
      } else {
        this.currentStep++;
        this.render();
      }
    };
  }
  onClose(): void {
    this.contentEl.empty();
  }
}

const TUTORIAL_STEPS: TutorialStep[] = [
  {
    title: "1. Tension",
    paragraphs: [
      "A tension captures a contradiction between two positions A and B. The more incompatible they are, the more fertile the tension. The tension is the fundamental unit of antinomian thought — you don't start from 'clean' ideas, you start from conflicts.",
      "A tension is not necessarily resolved: some stay open for years, others get 'elevated' to operational principles, others archived as 'defeated'.",
    ],
    exampleTitle: "Example — Creative solitude",
    exampleLines: [
      "A: Deep creative work requires prolonged solitude.",
      "B: Continuous sharing with others corrects errors and prevents thoughts from spinning in circles.",
    ],
  },
  {
    title: "2. Substrate",
    paragraphs: [
      "A substrate is raw material: a quote, a fact, an observation, a reading note. It is not yet a tension nor a principle.",
      "Substrate notes are the reservoir from which tensions emerge. When the Hunter relates them to existing tensions, you discover contradictions you hadn't seen.",
    ],
    exampleTitle: "Example — Kahneman quote",
    exampleLines: [
      "\"In isolation the brain amplifies confirmation bias. Discussing with a peer reduces errors by 40%.\"",
    ],
  },
  {
    title: "3. Principle",
    paragraphs: [
      "A principle emerges from resolving a tension. It doesn't pick a side — it absorbs both sides as contextual cases.",
      "Standard form: IF/THEN/GREY ZONE. You identify the contexts where A wins and those where B wins. The GREY ZONE is the edge cases where the rule isn't enough.",
    ],
    exampleTitle: "Example — Processes vs judgment",
    exampleLines: [
      "IF [predictable risk, costly errors] -> codified processes, checklists",
      "IF [unique context, distributed local knowledge] -> decentralized judgment, exceptions",
      "GREY ZONE: complex projects where repeatability seems to exist but there is tacit knowledge",
    ],
  },
  {
    title: "4. Defeated",
    paragraphs: [
      "Defeated is the archive of defeated beliefs. They are NOT deleted: they remain as historical memory of what was NOT true.",
      "Three possible motives: 'false_positive' (it was a misjudgment), 'elevated' (it became a principle, link to the replacing principle), 'genuinely_defeated' (the evidence demolished it).",
    ],
    exampleTitle: "Example",
    exampleLines: [
      "Belief: 'Every important decision is better made in solitude.'",
      "Motive: genuinely_defeated (experience showed that decisions deliberated together were better).",
    ],
  },
  {
    title: "5. Presuppositions",
    paragraphs: [
      "Presuppositions are the epistemic / value / metaphysical assumptions that A and B take for granted, often unspoken.",
      "Mapping them makes explicit why A and B cannot coexist without trade-offs. And often it is in the presuppositions that the tension dissolves (or is found to be ill-posed).",
    ],
    exampleTitle: "Example — Creative solitude",
    exampleLines: [
      "Presuppositions A: the isolated individual has access to a better source of knowledge than the social one.",
      "Presuppositions B: individual thought, without external correction, systematically tends toward error.",
    ],
  },
  {
    title: "6. Hunter (Contradiction Hunter)",
    paragraphs: [
      "The Hunter scans open tensions + substrate notes in the vault and proposes contradictory PAIRS. The system's real value: it finds contradictions you had NOT seen.",
      "Important constraint: the Hunter IDENTIFIES, it does not resolve. The resolution is your work (through the dialogue on presuppositions). Having the AI suggest resolutions would destroy the epistemic value of the system.",
      "Pairs have confidence (high/medium/low) and can be dismissed if they are false positives.",
    ],
  },
  {
    title: "7. Graph and links",
    paragraphs: [
      "Obsidian's graph shows the wikilinks between notes. In Antinomia, links represent explicit epistemic relationships: a tension was born from which substrate, a principle derives from which tension, a defeated was replaced by which principle.",
      "When you elevate a tension the plugin writes 'Derived from: [[T-...]]' in the principle's body. When you archive a defeated as 'elevated', it writes 'Replaced by: [[P-...]]'. The 'Link this note to...' command adds bidirectional wikilinks.",
      "The resulting graph is NOT the network of contradictions found by the Hunter — that one is implicit. The graph is the map of connections that YOU have declared.",
    ],
  },
  {
    title: "Why friction?",
    paragraphs: [
      "PTM (Personal Tension Management) means STAYING in a contradiction long enough to think it through — not resolving it as fast as possible. The AI is the opposite pole: fluid, persuasive, fast. Left unchecked, it nudges you to accept its output blindly, which is exactly the anti-PTM move.",
      "So every AI output in Antinomia carries a small friction card: which model and backend produced it, its own stated confidence and reasoning, and — always — the structural limitations of what an LLM can and cannot know here. The card is a brake, not a verdict: 'a prompt for thinking, not a truth to act on.'",
      "Pick your level in Settings → AI Friction. 'Off' removes the card entirely (pre-friction behaviour). 'Low' shows just the model line. 'Medium' (default) adds a collapsible card. 'High' keeps the card open and asks you to tick 'I acknowledge these limitations' before you can accept an AI result.",
    ],
    exampleTitle: "The point",
    exampleLines: [
      "The AI identifies; YOU decide. Friction keeps you in the loop as the thinker.",
    ],
  },
];

/** Index of the "Why friction?" card — for deep-linking from settings. */
export const WHY_FRICTION_STEP = TUTORIAL_STEPS.findIndex(
  (s) => s.title === "Why friction?"
);
