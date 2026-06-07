// Antinomia — async button helper: loading counter + Stop button + AbortSignal.
// Extracted from main.ts (refactor v1.5).

import { Notice } from "obsidian";

export async function withLoadingButton<T>(
  btn: HTMLButtonElement,
  loadingText: string,
  asyncFn: (signal: AbortSignal) => Promise<T>
): Promise<T | null> {
  const original = btn.textContent ?? "";
  btn.disabled = true;
  // Wipe any previous AI usage badge attached as sibling so the user
  // doesn't see stale token counts during the new generation. The badge
  // will be re-inserted by notifyAIUsage when the call completes.
  const prevBadge = btn.parentElement?.querySelector(
    ".antinomia-ai-usage-badge"
  );
  if (prevBadge) prevBadge.remove();
  const t0 = Date.now();
  btn.textContent = `${loadingText} 0s`;
  const interval = window.setInterval(() => {
    const elapsed = Math.floor((Date.now() - t0) / 1000);
    btn.textContent = `${loadingText} ${elapsed}s`;
  }, 1000);

  // Bottone Stop inserito accanto al bottone di loading
  const controller = new AbortController();
  const stopBtn = document.createElement("button");
  stopBtn.textContent = "⛔ Stop";
  stopBtn.style.marginLeft = "6px";
  stopBtn.style.padding = "2px 8px";
  stopBtn.style.fontSize = "0.85em";
  stopBtn.style.cursor = "pointer";
  stopBtn.title = "Stop the running AI generation.";
  stopBtn.onclick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    controller.abort();
  };
  btn.parentElement?.insertBefore(stopBtn, btn.nextSibling);

  const cleanup = (): void => {
    window.clearInterval(interval);
    btn.disabled = false;
    btn.textContent = original;
    stopBtn.remove();
  };

  try {
    const result = await asyncFn(controller.signal);
    cleanup();
    return result;
  } catch (e) {
    cleanup();
    if ((e as Error).message === "ai_aborted" || controller.signal.aborted) {
      new Notice("AI generation stopped.");
      return null;
    }
    throw e;
  }
}
