/**
 * Central hover bus — a tiny singleton pub/sub that lets every Antinomia pane
 * (the Cytoscape graph, the sidebar list views, the note cards) react to the
 * same "the user is pointing at this file" signal.
 *
 * Publishers `emit()` an enter/leave event tagged with their own `source`.
 * Subscribers `on()` it and ignore events whose `source` matches their own —
 * that single check is what prevents a highlight feedback loop (graph highlights
 * a card → card would otherwise re-emit → graph re-highlights → …).
 */

export type HoverEvent = "enter" | "leave";

export interface HoverPayload {
  /** Vault-relative path of the hovered file, e.g. "Tensions/T-123.md". */
  path: string;
  /** File basename (also the Cytoscape node id), e.g. "T-123". */
  basename: string;
  /** Who emitted this — subscribers skip events from their own source. */
  source: string;
}

type Listener = (ev: HoverEvent, p: HoverPayload) => void;

class HoverBus {
  private listeners = new Set<Listener>();

  /** Subscribe. Returns an unsubscribe fn. */
  on(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Notify every subscriber. */
  emit(ev: HoverEvent, p: HoverPayload): void {
    // Copy first: a listener that unsubscribes mid-iteration must not mutate
    // the set we're walking.
    for (const fn of [...this.listeners]) fn(ev, p);
  }

  /** Drop every subscriber — called on plugin unload. */
  clear(): void {
    this.listeners.clear();
  }
}

export const hoverBus = new HoverBus();

/**
 * Trailing-throttle helper: at most one call per `ms`, last args win.
 * Used to keep rapid mousemove-driven hover events from flooding the bus.
 */
export function throttle<A extends unknown[]>(
  fn: (...args: A) => void,
  ms: number
): (...args: A) => void {
  let last = 0;
  let pending: A | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  // performance.now() avoids the Date.now() forbidden in some sandboxes and is
  // monotonic — fine here since this runs only in the live plugin, not tests.
  const now = () =>
    typeof performance !== "undefined" ? performance.now() : 0;
  const run = (args: A) => {
    last = now();
    fn(...args);
  };
  return (...args: A) => {
    const elapsed = now() - last;
    if (elapsed >= ms) {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      run(args);
    } else {
      pending = args;
      if (!timer) {
        timer = setTimeout(() => {
          timer = null;
          if (pending) {
            const a = pending;
            pending = null;
            run(a);
          }
        }, ms - elapsed);
      }
    }
  };
}
