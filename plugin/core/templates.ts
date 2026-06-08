// Antinomia — markdown note templates (raw frontmatter + body).
// Extracted from main.ts (refactor v1.5).

import type {
  TensionFields,
  SubstrateFields,
  PrincipleFields,
  PresuppositionFields,
} from "./types";
import { TYPE } from "./constants";
import { todayISO } from "./utils";
import { yamlQuote } from "./frontmatter";

/**
 * Build a presupposition (U-) note: an implicit assumption a principle rests on.
 * `presupposes_of` lists the principle basenames that depend on it.
 */
export function presuppositionTemplate(fields: PresuppositionFields = {}): string {
  const date = todayISO();
  const titleLine = fields.title ? `title: ${yamlQuote(fields.title)}` : "title:";
  const of = (fields.presupposes_of ?? []).map((p) => `"[[${p}]]"`).join(", ");
  const text = fields.text?.trim() ?? "";
  return `---
antinomia_type: ${TYPE.presupposition}
${titleLine}
status: active
confidence: ${fields.confidence ?? "medium"}
presupposes_of: [${of}]
creation_date: ${date}
modified_date: ${date}
base_language: en
---
${text}

> Describe when this assumption holds, counter-examples, and sources.
`;
}

export function tensionTemplate(fields: TensionFields = {}): string {
  const date = todayISO();
  const titoloLine = fields.title
    ? `title: ${yamlQuote(fields.title)}`
    : "title:";
  const a = fields.statementA?.trim() ?? "";
  const b = fields.statementB?.trim() ?? "";
  return `---
antinomia_type: ${TYPE.tension}
${titoloLine}
status: open
base_language: english
creation_date: ${date}
modified_date: ${date}
origin: user_input
links: []
---
- **A (base):** ${a}
- **A (original):**
- **B (base):** ${b}
- **B (original):**
- **Presuppositions A:**
- **Presuppositions B:**
`;
}

export function substrateTemplate(fields: SubstrateFields = {}): string {
  const date = todayISO();
  const titoloLine = fields.title
    ? `title: ${yamlQuote(fields.title)}`
    : "title:";
  const c = fields.content?.trim() ?? "";
  return `---
antinomia_type: ${TYPE.substrate}
${titoloLine}
base_language: english
original_language: english
source: user_input
date: ${date}
---
- **Content (base):** ${c}
- **Original:**
`;
}

/**
 * Build the principle body (the IF/THEN/GREY block) from optional fields.
 * If a field is empty, falls back to the original placeholder so the user
 * can still spot what's missing in the editor.
 */
export function principleBodyTemplate(fields: PrincipleFields = {}): string {
  const ifA = fields.ifA?.trim() ?? "";
  const thenA = fields.thenA?.trim() ?? "";
  const ifB = fields.ifB?.trim() ?? "";
  const thenB = fields.thenB?.trim() ?? "";
  const grey = fields.greyZone?.trim() ?? "";

  const lineA =
    ifA || thenA
      ? `IF ${ifA || "[condition A]"} -> ${thenA || "[outcome X]"}`
      : "IF [condition A] -> [outcome X]";
  const lineB =
    ifB || thenB
      ? `IF ${ifB || "[condition B]"} -> ${thenB || "[outcome Y]"}`
      : "IF [condition B] -> [outcome Y]";

  return `- **${lineA}**
- **${lineB}**
- **GREY ZONE:** ${grey}
`;
}
