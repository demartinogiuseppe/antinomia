// Antinomia — AI usage notices, error modal, and usage banner rendering.
// Extracted from main.ts (refactor v1.5).

import { App, Modal, Notice, Setting } from "obsidian";
import type { AIUsageMeta } from "../core/types";

export function notifyAIUsage(
  operation: string,
  usage?: { input_tokens?: number; output_tokens?: number },
  durationMs?: number,
  context?: { app: App; profile?: string; model?: string; url?: string },
  attachToButton?: HTMLButtonElement
): void {
  const parts: string[] = [`Antinomia · ${operation}`];
  if (usage && (usage.input_tokens != null || usage.output_tokens != null)) {
    parts.push(`↓ ${usage.input_tokens ?? "?"} in / ↑ ${usage.output_tokens ?? "?"} out`);
  }
  if (typeof durationMs === "number") {
    parts.push(`${(durationMs / 1000).toFixed(1)}s`);
  }
  const summary = parts.join(" · ");
  const notice = new Notice(summary, 5000);

  // Inline persistent badge next to the triggering button — survives the
  // Notice auto-dismiss so the user can see the cost at a glance for as
  // long as the parent modal is open. Click to open the full details modal.
  if (attachToButton && usage) {
    // Remove any previous badge attached to this button
    const prev = attachToButton.parentElement?.querySelector(
      ".antinomia-ai-usage-badge"
    );
    if (prev) prev.remove();

    const badge = document.createElement("span");
    badge.className = "antinomia-ai-usage-badge";
    badge.style.marginLeft = "8px";
    badge.style.fontSize = "0.72em";
    badge.style.opacity = "0.75";
    badge.style.padding = "2px 7px";
    badge.style.background = "var(--background-secondary)";
    badge.style.color = "var(--text-muted)";
    badge.style.borderRadius = "10px";
    badge.style.fontFamily = "var(--font-monospace, monospace)";
    badge.style.userSelect = "text";
    (badge.style as any).webkitUserSelect = "text";

    const dur =
      typeof durationMs === "number" ? `${(durationMs / 1000).toFixed(1)}s` : "—";
    badge.textContent = `Tokens: ↓${usage.input_tokens ?? "?"} ↑${usage.output_tokens ?? "?"} · ${dur}`;

    if (context?.app) {
      badge.style.cursor = "pointer";
      badge.title = "Click for full AI call details";
      badge.addEventListener("click", () => {
        const inTok = usage.input_tokens ?? null;
        const outTok = usage.output_tokens ?? null;
        const totalTok = (inTok ?? 0) + (outTok ?? 0);
        const tokPerSec =
          typeof durationMs === "number" && durationMs > 0 && outTok != null
            ? (outTok / (durationMs / 1000)).toFixed(1) + " tok/s"
            : "—";
        const details = [
          `Operation:     ${operation}`,
          `Profile:       ${context.profile ?? "—"}`,
          `Model:         ${context.model ?? "—"}`,
          `URL:           ${context.url ?? "—"}`,
          ``,
          `Input tokens:  ${inTok ?? "—"}`,
          `Output tokens: ${outTok ?? "—"}`,
          `Total tokens:  ${totalTok || "—"}`,
          ``,
          `Duration:      ${dur}`,
          `Throughput:    ${tokPerSec}`,
        ].join("\n");
        const message =
          totalTok > 1000
            ? `This call used ${totalTok} tokens. Likely a reasoning model burning tokens on internal <think>. For short tasks, a non-reasoning model (Llama 3.x, Mistral, Phi) would use ~50 tokens.`
            : `Call completed in ${dur}.`;
        new ErrorAckModal(
          context.app,
          `Antinomia — AI call · ${operation}`,
          message,
          details
        ).open();
      });
    }

    attachToButton.parentElement?.insertBefore(
      badge,
      attachToButton.nextSibling
    );
  }

  if (context?.app) {
    const el = (notice as any).noticeEl as HTMLElement | undefined;
    if (el) {
      el.style.cursor = "pointer";
      el.title = "Click for full AI call details";
      el.addEventListener("click", () => {
        const inTok = usage?.input_tokens ?? null;
        const outTok = usage?.output_tokens ?? null;
        const totalTok = (inTok ?? 0) + (outTok ?? 0);
        const dur = typeof durationMs === "number" ? (durationMs / 1000).toFixed(2) + "s" : "—";
        const tokPerSec =
          typeof durationMs === "number" && durationMs > 0 && outTok != null
            ? (outTok / (durationMs / 1000)).toFixed(1) + " tok/s"
            : "—";

        const details = [
          `Operation:     ${operation}`,
          `Profile:       ${context.profile ?? "—"}`,
          `Model:         ${context.model ?? "—"}`,
          `URL:           ${context.url ?? "—"}`,
          ``,
          `Input tokens:  ${inTok ?? "—"}`,
          `Output tokens: ${outTok ?? "—"}`,
          `Total tokens:  ${totalTok || "—"}`,
          ``,
          `Duration:      ${dur}`,
          `Throughput:    ${tokPerSec}`,
        ].join("\n");

        const message =
          totalTok > 1000
            ? `Heads-up: this call used ${totalTok} tokens. If this was a short task (title, classification) the model is likely a reasoning distill (Qwen3, DeepSeek-R1) burning tokens on internal <think>. For short tasks, a non-reasoning model (Llama 3.x, Mistral, Phi) would use ~50 tokens.`
            : `Call completed in ${dur}.`;

        new ErrorAckModal(
          context.app,
          `Antinomia — AI call · ${operation}`,
          message,
          details
        ).open();
      });
    }
  }
}

export function renderUsageMetaBanner(
  parent: HTMLElement,
  meta: AIUsageMeta,
  app?: App
): void {
  const u = meta.usage;
  const dur =
    typeof meta.durationMs === "number"
      ? `${(meta.durationMs / 1000).toFixed(1)}s`
      : "—";
  const tokTxt =
    u && (u.input_tokens != null || u.output_tokens != null)
      ? `Tokens: ↓${u.input_tokens ?? "?"} ↑${u.output_tokens ?? "?"}`
      : "Tokens: —";

  const wrap = parent.createEl("div");
  wrap.style.display = "flex";
  wrap.style.alignItems = "center";
  wrap.style.gap = "8px";
  wrap.style.padding = "6px 10px";
  wrap.style.margin = "4px 0 12px 0";
  wrap.style.background = "var(--background-secondary)";
  wrap.style.borderRadius = "6px";
  wrap.style.fontSize = "0.78em";
  wrap.style.color = "var(--text-muted)";
  wrap.style.fontFamily = "var(--font-monospace, monospace)";
  wrap.style.userSelect = "text";
  (wrap.style as any).webkitUserSelect = "text";

  const label = wrap.createEl("span");
  label.style.opacity = "0.7";
  label.setText(`Pre-filled by ${meta.operation ?? "AI"} ·`);

  const tokSpan = wrap.createEl("span");
  tokSpan.setText(tokTxt);

  const durSpan = wrap.createEl("span");
  durSpan.style.opacity = "0.7";
  durSpan.setText(`· ${dur}`);

  if (app) {
    wrap.style.cursor = "pointer";
    wrap.title = "Click for full AI call details";
    wrap.addEventListener("click", () => {
      const inTok = u?.input_tokens ?? null;
      const outTok = u?.output_tokens ?? null;
      const totalTok = (inTok ?? 0) + (outTok ?? 0);
      const tokPerSec =
        typeof meta.durationMs === "number" && meta.durationMs > 0 && outTok != null
          ? (outTok / (meta.durationMs / 1000)).toFixed(1) + " tok/s"
          : "—";
      const details = [
        `Operation:     ${meta.operation ?? "AI"}`,
        `Profile:       ${meta.profile ?? "—"}`,
        `Model:         ${meta.model ?? "—"}`,
        `URL:           ${meta.url ?? "—"}`,
        ``,
        `Input tokens:  ${inTok ?? "—"}`,
        `Output tokens: ${outTok ?? "—"}`,
        `Total tokens:  ${totalTok || "—"}`,
        ``,
        `Duration:      ${dur}`,
        `Throughput:    ${tokPerSec}`,
      ].join("\n");
      new ErrorAckModal(
        app,
        `Antinomia — AI call · ${meta.operation ?? "AI"}`,
        `Call completed in ${dur}.`,
        details
      ).open();
    });
  }
}

export class ErrorAckModal extends Modal {
  constructor(
    app: App,
    private heading: string,
    private message: string,
    private details?: string,
    private action?: { label: string; onClick: () => void }
  ) {
    super(app);
  }
  onOpen(): void {
    const { contentEl, titleEl } = this;
    titleEl.setText(this.heading);

    // Force the whole modal content to be text-selectable. Obsidian's default
    // modal stylesheet sometimes applies `user-select: none` which prevents
    // users from copying the error message — defeats the purpose of an ack
    // modal that exists exactly to let people read & share the error.
    contentEl.style.userSelect = "text";
    (contentEl.style as any).webkitUserSelect = "text";
    contentEl.style.cursor = "text";

    const msg = contentEl.createEl("p");
    msg.style.whiteSpace = "pre-wrap";
    msg.style.lineHeight = "1.5";
    msg.style.fontSize = "0.95em";
    msg.style.userSelect = "text";
    (msg.style as any).webkitUserSelect = "text";
    msg.style.cursor = "text";
    msg.setText(this.message);

    if (this.details && this.details.trim()) {
      const det = contentEl.createEl("details");
      det.style.marginTop = "12px";
      const sum = det.createEl("summary", { text: "Technical details" });
      sum.style.cursor = "pointer";
      sum.style.fontSize = "0.8em";
      sum.style.opacity = "0.65";
      sum.style.marginBottom = "6px";
      sum.style.userSelect = "none"; // summary stays click-only
      const pre = det.createEl("pre");
      pre.style.fontSize = "0.75em";
      pre.style.maxHeight = "240px";
      pre.style.overflow = "auto";
      pre.style.padding = "8px";
      pre.style.background = "var(--background-secondary)";
      pre.style.borderRadius = "4px";
      pre.style.whiteSpace = "pre-wrap";
      pre.style.wordBreak = "break-word";
      pre.style.userSelect = "text";
      (pre.style as any).webkitUserSelect = "text";
      pre.style.cursor = "text";
      pre.setText(this.details);

      // "Copy details" button so the user can quickly share the technical
      // info on GitHub/Discord without manually selecting + Ctrl+C.
      const copyBtn = det.createEl("button", { text: "Copy details" });
      copyBtn.style.marginTop = "6px";
      copyBtn.style.fontSize = "0.75em";
      copyBtn.style.padding = "2px 8px";
      copyBtn.style.cursor = "pointer";
      copyBtn.onclick = async () => {
        try {
          await navigator.clipboard.writeText(this.details ?? "");
          copyBtn.setText("Copied ✓");
          setTimeout(() => copyBtn.setText("Copy details"), 1500);
        } catch {
          copyBtn.setText("Copy failed");
          setTimeout(() => copyBtn.setText("Copy details"), 1500);
        }
      };
    }

    const footer = new Setting(contentEl)
      .addButton((b) => {
        b.setButtonText("Copy message").onClick(async () => {
          const payload =
            this.heading +
            "\n\n" +
            this.message +
            (this.details && this.details.trim()
              ? "\n\n--- Technical details ---\n" + this.details
              : "");
          try {
            await navigator.clipboard.writeText(payload);
            const btnEl = (b as any).buttonEl as HTMLButtonElement;
            const orig = btnEl.textContent ?? "Copy message";
            btnEl.textContent = "Copied ✓";
            setTimeout(() => {
              btnEl.textContent = orig;
            }, 1500);
          } catch {
            const btnEl = (b as any).buttonEl as HTMLButtonElement;
            btnEl.textContent = "Copy failed";
            setTimeout(() => {
              btnEl.textContent = "Copy message";
            }, 1500);
          }
        });
      });
    if (this.action) {
      const act = this.action;
      footer.addButton((b) =>
        b.setButtonText(act.label).onClick(() => {
          this.close();
          act.onClick();
        })
      );
    }
    footer.addButton((b) =>
      b.setButtonText("OK").setCta().onClick(() => this.close())
    );
  }
  onClose(): void {
    this.contentEl.empty();
  }
}

export function showErrorModal(
  app: App,
  heading: string,
  message: string,
  details?: string,
  action?: { label: string; onClick: () => void }
): void {
  new ErrorAckModal(app, `Antinomia — ${heading}`, message, details, action).open();
}
