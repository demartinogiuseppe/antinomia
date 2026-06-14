// Antinomia — unified AI call (Anthropic + OpenAI-compatible backends).
// Extracted from main.ts (refactor v1.5).

import { requestUrl } from "obsidian";
import type { ClaudeMessage, ClaudeResponse } from "../core/types";
import { isLocalBaseUrl } from "../core/utils";
import { detectModelCapabilities } from "./detectModel";
import { parseAIResponse } from "./parseResponse";
import { pingLocalBackend } from "./pingBackend";

// Tracks model|taskClass combos we've already warned about (reasoning model on
// a short task) so the Notice fires once per session, not per call.
const _reasoningWarningShown = new Set<string>();

// Minimal shape of Node's http/https module (only the bits we use), loaded via
// Electron's window.require to get a cancellable request for local backends.
interface NodeIncomingMessage {
  statusCode?: number;
  on(event: "data", cb: (chunk: Buffer) => void): void;
  on(event: "end", cb: () => void): void;
  on(event: "error", cb: (err: Error) => void): void;
}
interface NodeClientRequest {
  on(event: "error", cb: (err: Error) => void): void;
  write(chunk: string): void;
  end(): void;
  destroy(): void;
}
interface NodeHttpModule {
  request(
    options: unknown,
    callback: (res: NodeIncomingMessage) => void
  ): NodeClientRequest;
}

export function detectApiFormat(baseUrl: string): "anthropic" | "openai" {
  const u = baseUrl.toLowerCase();
  if (u.includes("anthropic.com")) return "anthropic";
  // Everything else (groq, openai, openrouter, lmstudio, ollama, custom) → OpenAI-compatible
  return "openai";
}

export async function callAI(opts: {
  baseUrl: string;
  apiKey: string;
  model: string;
  system: string;
  messages: ClaudeMessage[];
  /**
   * Explicit `max_tokens` cap. If omitted AND `taskClass` is provided, the
   * recommended value for the detected model family is used. If both are
   * omitted, falls back to 1024.
   */
  maxTokens?: number;
  /**
   * "Task category" used by the autoadaptive layer to derive sensible
   * `max_tokens` per model family (titles: small, Hunter: large) and to
   * decide whether to inject `disableThinking` automatically. Reasoning
   * models get a generous budget on short tasks because their internal
   * <think> burns tokens before producing the JSON output.
   */
  taskClass?: "short" | "medium" | "deep";
  signal?: AbortSignal;
  /**
   * Explicit override of the autoadaptive reasoning disable. When omitted,
   * we default to `taskClass === "short" || "medium"` (i.e. short and
   * medium tasks turn thinking off, deep tasks leave it on).
   *
   * The actual `reasoning_effort` vocabulary sent depends on the detected
   * model family — OpenAI o-series gets "low", LM Studio Qwen3 / DeepSeek
   * gets "off" (sending the wrong vocabulary either errors out or — worse —
   * silently promotes the value back to "on").
   *
   * Backup signals are always sent alongside:
   *  - `chat_template_kwargs.enable_thinking: false`  (Qwen3 via vLLM)
   *  - `extra_body.enable_thinking: false`            (Ollama)
   *
   * No-op for the Anthropic format.
   */
  disableThinking?: boolean;
}): Promise<{ text: string; usage?: ClaudeResponse["usage"] }> {
  if (!opts.apiKey) throw new Error("API key missing.");
  if (!opts.baseUrl) throw new Error("Base URL missing.");

  // Autoadaptive: classify the model once, then derive everything from it.
  const caps = detectModelCapabilities(opts.model);
  const effectiveMaxTokens =
    opts.maxTokens ??
    (opts.taskClass ? caps.recommended[opts.taskClass] : 1024);
  const shouldDisableThinking =
    opts.disableThinking ??
    (opts.taskClass === "short" || opts.taskClass === "medium");

  const apiFormat = detectApiFormat(opts.baseUrl);
  const baseClean = opts.baseUrl.replace(/\/$/, "");
  const url =
    apiFormat === "anthropic"
      ? `${baseClean}/v1/messages`
      : `${baseClean}/chat/completions`;

  // Detect local backend EARLY (before body construction) so we can decide
  // which optional body fields are safe to send. Cloud providers (Groq,
  // OpenAI, OpenRouter) reject `chat_template_kwargs` / `extra_body` with
  // 400 — those are runtime-specific (LM Studio / vLLM / Ollama) and must
  // not leak to cloud.
  // Single source of truth (recognizes localhost + bridge addresses:
  // Tailscale, LAN, internal TLDs). See core/utils.ts.
  const isLocal = isLocalBaseUrl(url);

  // Build the request body in the right shape for each API style. Index type
  // because we conditionally add backend-specific fields (reasoning_effort,
  // chat_template_kwargs, extra_body) below.
  const body: Record<string, unknown> =
    apiFormat === "anthropic"
      ? {
          model: opts.model,
          max_tokens: effectiveMaxTokens,
          system: opts.system,
          messages: opts.messages,
        }
      : {
          model: opts.model,
          max_tokens: effectiveMaxTokens,
          messages: [
            { role: "system", content: opts.system },
            ...opts.messages,
          ],
        };

  // Autoadaptive reasoning disable.
  //
  // `reasoning_effort` is a minefield across runtimes:
  //   - OpenAI cloud o-series:        "low" | "medium" | "high"  (rejects others)
  //   - LM Studio OLD (~0.3.x):       "on" | "off"               (silently promotes unknowns → "on")
  //   - LM Studio NEW (0.4.x+):       "none" | "minimal" | "low" | "medium" | "high" | "xhigh"  (rejects "off" with 400)
  //   - Ollama / vLLM:                varies by model, often ignored
  //
  // Strategy:
  //   - For OpenAI cloud reasoning models (o-series, GPT-5) we send "low" —
  //     safe and supported.
  //   - For everything else (local Qwen3, DeepSeek-R1, etc.) we DO NOT send
  //     `reasoning_effort` at all. Any value we pick will be wrong on some
  //     version of LM Studio. Instead we rely on `chat_template_kwargs.
  //     enable_thinking: false` which Qwen3 honors at the template level
  //     regardless of runtime version. Harmless on backends that ignore it.
  if (shouldDisableThinking && apiFormat !== "anthropic") {
    if (caps.reasoningVocab === "openai") {
      // `reasoning_effort: "low"` is a recognized OpenAI field — safe to send
      // to cloud (OpenAI o-series / GPT-5). Ignored by Groq/Llama and others.
      body.reasoning_effort = "low";
    }
    // `chat_template_kwargs` (LM Studio / vLLM) and `extra_body` (Ollama) are
    // RUNTIME-SPECIFIC fields. Groq cloud rejects them with HTTP 400
    // ("property 'chat_template_kwargs' is unsupported"). Send them ONLY to
    // local backends — for cloud we rely on `reasoning_effort` (when it's an
    // OpenAI reasoning model) or nothing at all (cloud non-reasoning models
    // don't have a thinking mode to disable in the first place).
    if (isLocal) {
      // These keys are not set anywhere earlier on `body`, so a plain
      // assignment is equivalent to the previous spread-merge.
      body.chat_template_kwargs = { enable_thinking: false };
      body.extra_body = { enable_thinking: false };
    }
  }

  // Friendly heads-up the first time per session: reasoning model used for
  // a short task is almost always wasted tokens (the model burns reasoning
  // on something the user just wanted a 5-word answer for).
  if (
    caps.isReasoning &&
    opts.taskClass === "short" &&
    !_reasoningWarningShown.has(`${opts.model}|short`)
  ) {
    _reasoningWarningShown.add(`${opts.model}|short`);
    console.warn(
      `[Antinomia] Heads-up: model "${opts.model}" is a reasoning model ` +
        `(${caps.family}). For short tasks (titles, classification) it will ` +
        `burn many tokens on internal <think>. Consider creating a "Fast" ` +
        `profile with a non-reasoning model (Llama 3.x, Mistral, Phi) for ` +
        `short calls and keeping the reasoning model for Hunter / deep tasks.`
    );
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    authorization: `Bearer ${opts.apiKey}`,
  };
  if (apiFormat === "anthropic") {
    headers["x-api-key"] = opts.apiKey;
    headers["anthropic-version"] = "2023-06-01";
    headers["anthropic-dangerous-direct-browser-access"] = "true";
  }

  // (isLocal already detected above before body construction.)

  // Pre-check: for local backends, ping the server first so we fail fast with
  // a friendly message instead of a cryptic ECONNREFUSED deep in the request.
  if (isLocal) {
    const ping = await pingLocalBackend(baseClean);
    if (!ping.ok) {
      throw new Error(
        `Local AI backend not reachable at ${baseClean}. Start LM Studio / Ollama (Local Server) and try again. [${ping.error || "no response"}]`
      );
    }
  }

  if (isLocal && opts.signal) {
    // Use Node http/https (available in Obsidian desktop via require) so we
    // can abort with req.destroy(). Bypasses CORS (which fetch() trips on)
    // AND lets us actually cancel mid-generation (which requestUrl can't).
    try {
      const u = new URL(url);
      const isHttps = u.protocol === "https:";
      let nodeMod: NodeHttpModule | null = null;
      try {
        // window.require is injected by Electron at runtime; not in DOM typings.
        const req = (window as unknown as { require?: (m: string) => unknown })
          .require;
        nodeMod = req ? (req(isHttps ? "https" : "http") as NodeHttpModule) : null;
      } catch {
        nodeMod = null;
      }
      if (!nodeMod) throw new Error("node_http_unavailable");

      const bodyStr = JSON.stringify(body);
      const result = await new Promise<{ status: number; text: string }>(
        (resolve, reject) => {
          const req = nodeMod.request(
            {
              hostname: u.hostname,
              port: u.port || (isHttps ? 443 : 80),
              path: u.pathname + u.search,
              method: "POST",
              headers: {
                ...headers,
                "Content-Length": Buffer.byteLength(bodyStr).toString(),
              },
            },
            (res: NodeIncomingMessage) => {
              const chunks: Buffer[] = [];
              res.on("data", (c: Buffer) => chunks.push(c));
              res.on("end", () => {
                const text = Buffer.concat(chunks).toString("utf8");
                resolve({ status: res.statusCode || 0, text });
              });
              res.on("error", (e: Error) => reject(e));
            }
          );
          req.on("error", (e: Error) => {
            if (opts.signal?.aborted) {
              reject(new Error("hunter_aborted"));
            } else {
              reject(e);
            }
          });
          opts.signal!.addEventListener("abort", () => {
            try {
              req.destroy();
            } catch {
              /* ignore */
            }
          });
          req.write(bodyStr);
          req.end();
        }
      );

      if (result.status < 200 || result.status >= 300) {
        throw new Error(
          `AI error ${result.status} (${url}): ${result.text.slice(0, 500)}`
        );
      }
      const data: unknown = JSON.parse(result.text);
      return parseAIResponse(data, apiFormat);
    } catch (e) {
      if ((e as Error).message === "hunter_aborted") throw e;
      if ((e as Error).message === "node_http_unavailable") {
        // Fall through to requestUrl below (no cancellation possible)
        console.warn(
          "[Antinomia] Node http unavailable — falling back to requestUrl (no abort)."
        );
      } else {
        throw e;
      }
    }
  }

  // Remote backend (or no signal) — use requestUrl to bypass CORS.
  const res = await requestUrl({
    url,
    method: "POST",
    contentType: "application/json",
    headers,
    body: JSON.stringify(body),
    throw: false,
  });
  if (res.status < 200 || res.status >= 300) {
    let detail = "";
    try {
      detail = res.text.slice(0, 500);
    } catch { /* intentionally ignored */ }
    throw new Error(`AI error ${res.status} (${url}): ${detail}`);
  }
  const data: unknown = res.json;
  return parseAIResponse(data, apiFormat);
}
