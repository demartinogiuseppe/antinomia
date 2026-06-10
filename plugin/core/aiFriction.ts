// Antinomia — AI Friction & Model Transparency (PTM Core).
//
// PTM means staying IN the contradiction instead of resolving it fast. The AI
// is the opposite pole: fluid, persuasive, fast. Left unchecked, the user
// accepts AI output blindly — anti-PTM behaviour. This module adds visible
// (and, at "high", behavioural) micro-frictions to EVERY AI output to return
// the user to the role of thinker, not consumer.
//
// Source is hybrid:
//   - The AI declares reasoning_short + confidence_self + limitations (best
//     effort; parsed from its JSON, falling back to "not provided").
//   - The plugin always adds hardcoded UNIVERSAL limitations per operation
//     type — these never depend on the model cooperating.

import { extractJson } from "../ai/parseResponse";
import type { ClaudeResponse } from "./types";

export type FrictionLevel = "off" | "low" | "medium" | "high";

/** Operation keys — one per AI command type. Drives HARDCODED_LIMITATIONS. */
export type FrictionOperation =
  | "hunter"
  | "mapPresuppositions"
  | "elevation"
  | "classify"
  | "title"
  | "conceptExtraction"
  | "freeInput";

export interface FrictionPayload {
  // --- Model transparency (always shown, any level except off) ---
  modelName: string;
  backend: string; // "Anthropic" | "LM Studio" | …
  /** Sampling temperature. Undefined = provider default (Antinomia never overrides it). */
  temperature?: number;
  tokensUsed?: { in: number; out: number };

  // --- From the AI (best effort; absent → "not provided") ---
  aiConfidenceSelf?: "high" | "medium" | "low";
  reasoningShort?: string; // max ~2 sentences

  // --- Hardcoded universal, always added by the plugin ---
  hardcodedLimitations: string[];

  // --- From the AI (best effort) ---
  aiLimitations?: string[];
}

/**
 * Universal limitations the plugin always states, per operation type. These are
 * structural truths about what an LLM cannot do here — independent of which
 * model ran or whether it cooperated with the friction prompt.
 */
export const HARDCODED_LIMITATIONS: Record<FrictionOperation, string[]> = {
  hunter: [
    "I cannot see notes outside the scan range",
    "I cannot know your personal context behind each tension",
    "Contradiction is a structural pattern, not lived truth",
  ],
  mapPresuppositions: [
    "I cannot know unspoken assumptions from your domain",
    "Surface presuppositions only; deeper ones may exist",
    "I cannot validate whether these match your beliefs",
  ],
  elevation: [
    "The IF/THEN proposal is a hypothesis, not a derivation",
    "I cannot test the rule against your real cases",
    "Operational rules need lived validation",
  ],
  classify: [
    "Classification is based on surface text patterns",
    "I cannot know your intended framing",
  ],
  title: [
    "A title is a compression — meaning may be lost",
    "Your phrasing carries context I cannot infer",
  ],
  conceptExtraction: [
    "Concepts may overlap or be redundant — review for invariants",
    "Surface concepts only; the thematic core may be implicit",
    "Selection bias toward the most repeated phrases",
  ],
  freeInput: [
    "I classify from surface text, not your intent",
    "Tension vs substrate is a judgment call I can get wrong",
  ],
};

/**
 * Appended to the system prompts that output a JSON OBJECT, asking the model to
 * also declare its reasoning, self-confidence, and limitations. Best effort:
 * old / uncooperative models simply omit the fields and the plugin falls back
 * to "not provided" while still showing the hardcoded limitations.
 *
 * NOT appended to array-output prompts (e.g. the presupposition map) so their
 * behaviour-critical shape is untouched.
 */
export const FRICTION_PROMPT_SUFFIX = `

ADDITIONALLY (Antinomia friction layer): in the SAME top-level JSON object, include three more fields:
- "reasoning_short": at most 2 sentences naming the MAIN BASIS for your output (what you keyed on).
- "confidence_self": your own confidence — one of "high" | "medium" | "low".
- "limitations": an array of up to 3 short strings naming what you might be missing or where you could be wrong.
These are metacognitive aids for the user, NOT part of the primary result. Keep them brief.`;

/** Append the friction suffix to an object-output system prompt. */
export function withFrictionSuffix(systemPrompt: string): string {
  return systemPrompt + FRICTION_PROMPT_SUFFIX;
}

/** Human label for a backend, derived from its base URL. */
export function backendLabel(baseUrl: string): string {
  const u = (baseUrl || "").toLowerCase();
  if (u.includes("anthropic.com")) return "Anthropic";
  if (u.includes("openai.com")) return "OpenAI";
  if (u.includes("groq.com")) return "Groq";
  if (u.includes("openrouter.ai")) return "OpenRouter";
  if (u.includes("localhost") || u.includes("127.0.0.1") || u.includes("0.0.0.0")) {
    // LM Studio defaults to :1234, Ollama to :11434.
    if (u.includes("11434")) return "Ollama (local)";
    if (u.includes("1234")) return "LM Studio (local)";
    return "Local backend";
  }
  return "Custom backend";
}

/** What parseFrictionFields pulls out of an AI JSON response. */
export interface ParsedFrictionFields {
  reasoningShort?: string;
  aiConfidenceSelf?: "high" | "medium" | "low";
  aiLimitations?: string[];
}

/**
 * Extract the optional friction fields (reasoning_short / confidence_self /
 * limitations) from an AI response. Independent of each flow's own parser —
 * both read the same JSON text. Returns {} when nothing parses or the fields
 * are absent (uncooperative model).
 */
export function parseFrictionFields(rawText: string): ParsedFrictionFields {
  if (!rawText || !rawText.trim()) return {};
  const obj = extractJson<Record<string, unknown>>(rawText);
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return {};

  const out: ParsedFrictionFields = {};

  const rs = obj["reasoning_short"];
  if (typeof rs === "string" && rs.trim()) out.reasoningShort = rs.trim();

  const cs = String(obj["confidence_self"] ?? "").toLowerCase().trim();
  if (cs === "high" || cs === "medium" || cs === "low") out.aiConfidenceSelf = cs;

  const lim = obj["limitations"];
  if (Array.isArray(lim)) {
    const cleaned = lim
      .map((x) => String(x ?? "").trim())
      .filter((x) => x.length > 0)
      .slice(0, 3);
    if (cleaned.length > 0) out.aiLimitations = cleaned;
  }
  return out;
}

/** Inputs for building a full FrictionPayload at a call site. */
export interface BuildFrictionArgs {
  operation: FrictionOperation;
  modelName: string;
  baseUrl: string;
  temperature?: number;
  usage?: ClaudeResponse["usage"];
  ai?: ParsedFrictionFields;
}

/** Assemble the complete FrictionPayload from transparency + AI + hardcoded. */
export function buildFrictionPayload(args: BuildFrictionArgs): FrictionPayload {
  const tokensUsed =
    args.usage && (args.usage.input_tokens != null || args.usage.output_tokens != null)
      ? { in: args.usage.input_tokens ?? 0, out: args.usage.output_tokens ?? 0 }
      : undefined;
  return {
    modelName: args.modelName,
    backend: backendLabel(args.baseUrl),
    temperature: args.temperature,
    tokensUsed,
    aiConfidenceSelf: args.ai?.aiConfidenceSelf,
    reasoningShort: args.ai?.reasoningShort,
    hardcodedLimitations: HARDCODED_LIMITATIONS[args.operation] ?? [],
    aiLimitations: args.ai?.aiLimitations,
  };
}
