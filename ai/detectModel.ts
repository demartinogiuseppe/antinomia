// Antinomia — model capability detection (heuristic, by model name).
// Extracted from main.ts (refactor v1.5).

export type ModelFamily =
  | "anthropic"            // Claude — non-reasoning by default
  | "openai-reasoning"     // o1/o3/o4 family, GPT-5
  | "openai-instruct"      // GPT-4o/4/3.5 — non-reasoning
  | "qwen3-reasoning"      // Qwen3 thinking / distill / QwQ
  | "qwen-instruct"        // Qwen 2.5 / Qwen3 base (toggle-able)
  | "deepseek-reasoning"   // DeepSeek-R1 and distills
  | "llama"                // Llama 3.x Instruct, etc.
  | "mistral"              // Mistral / Mixtral
  | "phi"                  // Microsoft Phi
  | "gemma"                // Google Gemma
  | "unknown";

/**
 * "Reasoning vocabulary" — the set of values the backend accepts for the
 * `reasoning_effort` field. Sending the wrong vocabulary either errors
 * (OpenAI rejects "off") or silently does the opposite (LM Studio Qwen3
 * promotes unknown values back to "on").
 */
export type ReasoningVocab = "openai" | "on_off" | "none";

export interface ModelCapabilities {
  family: ModelFamily;
  isReasoning: boolean;
  reasoningVocab: ReasoningVocab;
  /** Suggested `max_tokens` per task category. */
  recommended: {
    short: number;   // titles, classification, free-input analysis
    medium: number;  // IF/THEN proposal, presuppositions
    deep: number;    // Hunter, long syntheses
  };
}

export function detectModelCapabilities(modelName: string): ModelCapabilities {
  const m = (modelName || "").toLowerCase();

  // Anthropic Claude — non-reasoning by default (extended thinking opt-in)
  if (/^claude/.test(m)) {
    return {
      family: "anthropic",
      isReasoning: false,
      reasoningVocab: "none",
      recommended: { short: 200, medium: 800, deep: 2000 },
    };
  }

  // OpenAI reasoning: o-series, GPT-5
  if (/^(o\d+(?:-|$)|gpt-5)/.test(m)) {
    return {
      family: "openai-reasoning",
      isReasoning: true,
      reasoningVocab: "openai",
      recommended: { short: 4000, medium: 6000, deep: 12000 },
    };
  }

  // OpenAI instruct (GPT-4o/4/3.5, GPT-4.1, etc.)
  if (/^gpt-(4o|4\.1|4(?:-|$)|3\.5)/.test(m)) {
    return {
      family: "openai-instruct",
      isReasoning: false,
      reasoningVocab: "none",
      recommended: { short: 200, medium: 800, deep: 2000 },
    };
  }

  // Qwen3 reasoning — IMPORTANT: Qwen3 (3.x and 3.5) has extended thinking
  // ENABLED by default in its chat template, regardless of model name.
  // Treating it as reasoning gives a big enough max_tokens budget AND
  // injects the reasoning_effort=off signal. If the user has a non-thinking
  // variant they can override `maxTokens` explicitly at the call site.
  //
  // Explicit reasoning distills (QwQ, R1-distill) are an even stronger case.
  if (
    /qwen\d?.*(reason|thinking|distill|r1)/.test(m) ||
    /\bqwq\b/.test(m) ||
    /qwen3/.test(m)
  ) {
    return {
      family: "qwen3-reasoning",
      isReasoning: true,
      reasoningVocab: "on_off",
      recommended: { short: 4000, medium: 6000, deep: 10000 },
    };
  }

  // DeepSeek reasoning
  if (/deepseek[-_]?r1|^r1[-_]|deepseek.*reason/.test(m)) {
    return {
      family: "deepseek-reasoning",
      isReasoning: true,
      reasoningVocab: "on_off",
      recommended: { short: 4000, medium: 6000, deep: 10000 },
    };
  }

  // Qwen 2.5 and earlier — non-reasoning instruct family.
  // (Qwen3.x was already captured above and routed to qwen3-reasoning.)
  if (/qwen/.test(m)) {
    return {
      family: "qwen-instruct",
      isReasoning: false,
      reasoningVocab: "none",
      recommended: { short: 200, medium: 800, deep: 2000 },
    };
  }

  if (/llama/.test(m)) {
    return {
      family: "llama",
      isReasoning: false,
      reasoningVocab: "none",
      recommended: { short: 200, medium: 800, deep: 2000 },
    };
  }
  if (/mistral|mixtral/.test(m)) {
    return {
      family: "mistral",
      isReasoning: false,
      reasoningVocab: "none",
      recommended: { short: 200, medium: 800, deep: 2000 },
    };
  }
  if (/phi/.test(m)) {
    return {
      family: "phi",
      isReasoning: false,
      reasoningVocab: "none",
      recommended: { short: 200, medium: 800, deep: 2000 },
    };
  }
  if (/gemma/.test(m)) {
    // IMPORTANT: Gemma 3+ and Gemma 4 ship with extended thinking ENABLED
    // by default in the chat template, similar to Qwen3 distills. They
    // write the actual output into `reasoning_content` and return an
    // empty `content` when truncated by max_tokens.
    //
    // Detect the major version from the model name: gemma-[34]+ → reasoning,
    // gemma-2 and earlier → plain instruct.
    const isGemma3Plus = /gemma[-_ ]?[34-9]\b|gemma[-_ ]?1[0-9]/.test(m);
    if (isGemma3Plus) {
      return {
        family: "gemma",
        isReasoning: true,
        reasoningVocab: "on_off", // gemma supports enable_thinking template signal
        recommended: { short: 4000, medium: 6000, deep: 10000 },
      };
    }
    return {
      family: "gemma",
      isReasoning: false,
      reasoningVocab: "none",
      recommended: { short: 200, medium: 800, deep: 2000 },
    };
  }

  // Unknown — safe conservative defaults, no reasoning controls injected
  return {
    family: "unknown",
    isReasoning: false,
    reasoningVocab: "none",
    recommended: { short: 500, medium: 1500, deep: 3000 },
  };
}
