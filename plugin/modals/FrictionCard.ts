// Antinomia — reusable Friction Card (PTM Core: AI Friction & Model Transparency).
//
// A small, level-aware card placed beside every AI output. It shows model
// transparency (always) and, when expanded, the AI's self-declared reasoning +
// confidence and the limitations (hardcoded universal + AI-declared).
//
//   off    → nothing rendered
//   low    → header only (model · backend · temp · tokens), no expand
//   medium → collapsible card, default CLOSED
//   high   → always expanded, NOT collapsible (+ gateAcceptButton enforces a
//            "I acknowledge these limitations" checkbox before Accept)

import type { FrictionLevel, FrictionPayload } from "../core/aiFriction";

const DIM = "var(--text-muted)";

function headerText(p: FrictionPayload): string {
  const bits = [`🤖 ${p.modelName}`, p.backend];
  bits.push(p.temperature != null ? `temp ${p.temperature}` : "temp default");
  if (p.tokensUsed) bits.push(`${p.tokensUsed.in}→${p.tokensUsed.out} tok`);
  return bits.join("  ·  ");
}

/**
 * Render the friction card into `container`. Returns the root element, or null
 * when the level is "off" (nothing rendered).
 */
export function renderFrictionCard(
  container: HTMLElement,
  payload: FrictionPayload,
  level: FrictionLevel
): HTMLElement | null {
  if (level === "off") return null;

  const card = container.createEl("div");
  card.style.border = "1px solid var(--background-modifier-border)";
  card.style.borderRadius = "6px";
  card.style.background = "var(--background-secondary)";
  card.style.margin = "8px 0";
  card.style.fontSize = "0.85em";
  card.style.overflow = "hidden";

  // --- Header (always) ---
  const header = card.createEl("div");
  header.style.display = "flex";
  header.style.alignItems = "center";
  header.style.justifyContent = "space-between";
  header.style.gap = "8px";
  header.style.padding = "6px 10px";

  const label = header.createEl("span");
  label.setText(headerText(payload));
  label.style.fontFamily = "var(--font-monospace, monospace)";
  label.style.color = DIM;
  label.style.whiteSpace = "nowrap";
  label.style.overflow = "hidden";
  label.style.textOverflow = "ellipsis";

  const expandable = level === "medium" || level === "high";
  const caret = expandable ? header.createEl("span") : null;

  // --- Body (built lazily; shown per level) ---
  const body = card.createEl("div");
  body.style.padding = "0 10px 10px";
  body.style.borderTop = "1px solid var(--background-modifier-border)";

  const sectionTitle = (text: string): void => {
    const t = body.createEl("div");
    t.setText(text);
    t.style.fontWeight = "600";
    t.style.marginTop = "8px";
    t.style.marginBottom = "2px";
  };

  // AI reasoning
  sectionTitle("AI reasoning");
  const reasoning = body.createEl("div");
  reasoning.style.opacity = "0.9";
  reasoning.style.lineHeight = "1.45";
  if (payload.reasoningShort) {
    reasoning.setText(payload.reasoningShort);
  } else {
    reasoning.setText("not provided by AI");
    reasoning.style.fontStyle = "italic";
    reasoning.style.color = DIM;
  }

  // AI confidence
  const conf = body.createEl("div");
  conf.style.marginTop = "6px";
  const confVal = payload.aiConfidenceSelf ?? "not provided";
  conf.createEl("span", { text: "AI confidence: " }).style.fontWeight = "600";
  conf.createEl("span", { text: confVal });

  // Limitations
  sectionTitle("Limitations");
  const ul = body.createEl("ul");
  ul.style.margin = "2px 0 0";
  ul.style.paddingLeft = "18px";
  ul.style.lineHeight = "1.5";
  for (const lim of payload.hardcodedLimitations) {
    ul.createEl("li", { text: lim });
  }
  if (payload.aiLimitations && payload.aiLimitations.length > 0) {
    for (const lim of payload.aiLimitations) {
      const li = ul.createEl("li", { text: `${lim}` });
      li.style.color = DIM;
      li.title = "Declared by the AI";
    }
  }

  // Footer
  const footer = body.createEl("div");
  footer.setText("This is a prompt for thinking, not a truth to act on.");
  footer.style.fontStyle = "italic";
  footer.style.color = DIM;
  footer.style.marginTop = "10px";
  footer.style.fontSize = "0.95em";

  // --- Level behaviour ---
  if (level === "low") {
    body.style.display = "none";
    return card;
  }

  // medium / high: caret + expand state
  let open = level === "high"; // high starts open
  const sync = (): void => {
    body.style.display = open ? "block" : "none";
    if (caret) caret.setText(open ? "▴" : "▾");
  };
  if (caret) {
    caret.style.color = DIM;
    caret.style.cursor = "pointer";
  }
  sync();

  if (level === "medium") {
    header.style.cursor = "pointer";
    header.addEventListener("click", () => {
      open = !open;
      sync();
    });
  }
  // high: no toggle — header is not clickable, body stays open.

  return card;
}

/**
 * Enforce the "high" friction accept gate on an existing primary button.
 *
 * At level "high": inserts a "☐ I acknowledge these limitations" checkbox just
 * before `buttonEl`, relabels the button to "Accept anyway (acknowledge
 * limitations)", and disables it until the box is checked.
 *
 * At any other level: no-op (the button keeps its own label/enabled state).
 *
 * Returns a getter for whether the user has acknowledged (always true when not
 * "high", so callers can gate uniformly).
 */
export function gateAcceptButton(
  buttonEl: HTMLButtonElement,
  level: FrictionLevel
): () => boolean {
  if (level !== "high") return () => true;

  buttonEl.setText("Accept anyway (acknowledge limitations)");
  buttonEl.disabled = true;

  const wrap = document.createElement("label");
  wrap.style.display = "flex";
  wrap.style.alignItems = "center";
  wrap.style.gap = "6px";
  wrap.style.margin = "8px 0";
  wrap.style.cursor = "pointer";
  wrap.style.fontSize = "0.88em";

  const box = wrap.createEl("input", { type: "checkbox" });
  box.style.cursor = "pointer";
  wrap.createEl("span", { text: "I acknowledge these limitations" });

  // Place the checkbox right before the button's setting row, if possible.
  const anchor = buttonEl.closest(".setting-item") ?? buttonEl;
  anchor.parentElement?.insertBefore(wrap, anchor);

  box.addEventListener("change", () => {
    buttonEl.disabled = !box.checked;
  });

  return () => box.checked;
}
