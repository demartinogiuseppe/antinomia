// Antinomia — unified AI call (Anthropic + OpenAI-compatible backends).
// Extracted from main.ts (refactor v1.5).

import { requestUrl } from "obsidian";
import type { ClaudeMessage, ClaudeResponse } from "../core/types";
import { detectModelCapabilities } from "./detectModel";
import { parseAIResponse } from "./parseResponse";
import { pingLocalBackend } from "./pingBackend";

// Tracks model|taskClass combos we've already warned about (reasoning model on
// a short task) so the Notice fires once per session, not per call.
const _reasoningWarningShown = new Set<string>();

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

  // Build the request body in the right shape for each API style.
  const body: any =
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
      body.reasoning_effort = "low";
    }
    // Template-level signal — survives LM Studio version churn:
    body.chat_template_kwargs = {
      ...(body.chat_template_kwargs ?? {}),
      enable_thinking: false,
    };
    // Ollama / some vLLM deployments use extra_body:
    body.extra_body = {
      ...(body.extra_body ?? {}),
      enable_thinking: false,
    };
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

  // Detect local backend: localhost, 127.0.0.1, or any *.local hostname.
  // For local backends we use native fetch() so AbortSignal actually closes
  // the connection — LM Studio / Ollama stop generating when the socket dies.
  let isLocal = false;
  try {
    const u = new URL(url);
    isLocal =
      u.hostname === "localhost" ||
      u.hostname === "127.0.0.1" ||
      u.hostname === "0.0.0.0" ||
      u.hostname.endsWith(".local");
  } catch {
    /* malformed URL — fall back to requestUrl */
  }

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
      let nodeMod: any = null;
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        nodeMod = (window as any).require
          ? (window as any).require(isHttps ? "https" : "http")
          : null;
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
            (res: any) => {
              const chunks: any[] = [];
              res.on("data", (c: any) => chunks.push(c));
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
      const data = JSON.parse(result.text);
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
    } catch {}
    throw new Error(`AI error ${res.status} (${url}): ${detail}`);
  }
  const data = res.json;
  return parseAIResponse(data, apiFormat);
}
