// Antinomia — render the origin-tension context box inside a modal.
// Extracted from main.ts (refactor v1.5).

import { stripFrontmatter } from "../core/frontmatter";

export function renderTensionContext(parent: HTMLElement, rawContent: string): void {
  const body = stripFrontmatter(rawContent).trim();
  const extract = (re: RegExp): string =>
    (body.match(re)?.[1] ?? "").trim();
  const aBase = extract(/-\s*\*\*A \(base\):\*\*\s*([^\n]*)/);
  const aOrig = extract(/-\s*\*\*A \(originale\):\*\*\s*([^\n]*)/);
  const bBase = extract(/-\s*\*\*B \(base\):\*\*\s*([^\n]*)/);
  const bOrig = extract(/-\s*\*\*B \(originale\):\*\*\s*([^\n]*)/);
  const presupA = extract(/-\s*\*\*Presuppositions A:\*\*\s*([^\n]*)/);
  const presupB = extract(/-\s*\*\*Presuppositions B:\*\*\s*([^\n]*)/);

  const box = parent.createEl("div");
  box.setCssStyles({
    padding: "10px 12px",
    marginBottom: "14px",
    background: "var(--background-secondary)",
    borderLeft: "3px solid var(--text-accent)",
    borderRadius: "4px",
    maxHeight: "240px",
    overflowY: "auto",
    fontSize: "0.88em",
  });

  const header = box.createEl("div");
  header.setCssStyles({
    fontWeight: "bold",
    marginBottom: "6px",
  });
  header.setText("Origin tension");

  const mkRow = (label: string, value: string) => {
    if (!value) return;
    const r = box.createEl("div");
    r.setCssStyles({
      marginBottom: "4px",
      lineHeight: "1.35",
    });
    const lab = r.createEl("strong");
    lab.setText(`${label}: `);
    r.appendText(value);
  };

  if (aBase) mkRow("A", aBase);
  if (aOrig) mkRow("A (original)", aOrig);
  if (bBase) mkRow("B", bBase);
  if (bOrig) mkRow("B (original)", bOrig);
  if (presupA) mkRow("Presuppositions A", presupA);
  if (presupB) mkRow("Presuppositions B", presupB);

  // If absolutely nothing was extracted, show the whole body as fallback
  if (!aBase && !bBase && !presupA && !presupB) {
    const fallback = box.createEl("pre");
    fallback.setCssStyles({
      whiteSpace: "pre-wrap",
      fontSize: "0.85em",
      margin: "0",
    });
    fallback.setText(body.slice(0, 1000));
  }
}
