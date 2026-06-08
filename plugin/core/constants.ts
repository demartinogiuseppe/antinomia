// Antinomia — module-wide constants.
//
// Layer type tags, folder names, Obsidian view-type ids, graph colour presets
// and layer colour/shape maps. Extracted from main.ts (refactor v1.5).

import type { GraphColors, GraphFilters, BackendPreset, HunterConfidence } from "./types";

export const FOLDER = { notes: "notes" } as const;

export const TYPE = {
  tension: "tension",
  substrate: "substrate",
  principle: "principle",
  defeated: "defeated",
  meta: "meta_note",
  presupposition: "presupposition",
} as const;

export const VIEW_TYPE_OPEN_TENSIONS = "antinomia-open-tensions";
export const VIEW_TYPE_HUNTER_RESULTS = "antinomia-hunter-results";
export const VIEW_TYPE_DISMISSED_PAIRS = "antinomia-dismissed-pairs";
export const VIEW_TYPE_SUBSTRATE_LIST = "antinomia-substrate-list";
export const VIEW_TYPE_PRINCIPLES_LIST = "antinomia-principles-list";
export const VIEW_TYPE_DEFEATED_LIST = "antinomia-defeated-list";
export const VIEW_TYPE_ONBOARDING = "antinomia-onboarding-checklist";
export const VIEW_TYPE_DASHBOARD = "antinomia-dashboard";
export const VIEW_TYPE_AUDIT = "antinomia-audit";
export const VIEW_TYPE_GRAPH = "antinomia-graph";
export const VIEW_TYPE_UNCLASSIFIED = "antinomia-unclassified";
export const VIEW_TYPE_PRESUPPOSITIONS_MAP = "antinomia-presuppositions-map";

export const GRAPH_STYLE_PRESETS: Record<string, GraphColors> = {
  default: {
    tensione_aperta: "#ff8c42",
    tensione_risolta: "#fbc02d",
    tensione_elevata: "#4caf50",
    substrate: "#9aa0a6",
    principio: "#2e7d32",
    defeated: "#e53935",
    meta_nota: "#7e57c2",
    label: "#999999",
    edge: "rgba(128,128,128,0.25)",
    background: "",
  },
  scuro: {
    tensione_aperta: "#ff6b35",
    tensione_risolta: "#ffb300",
    tensione_elevata: "#66bb6a",
    substrate: "#546e7a",
    principio: "#1b5e20",
    defeated: "#c62828",
    meta_nota: "#5e35b1",
    label: "#cfcfcf",
    edge: "rgba(180,180,180,0.18)",
    background: "#0e0e10",
  },
  chiaro: {
    tensione_aperta: "#f57c00",
    tensione_risolta: "#fdd835",
    tensione_elevata: "#388e3c",
    substrate: "#90a4ae",
    principio: "#1b5e20",
    defeated: "#d32f2f",
    meta_nota: "#5e35b1",
    label: "#444444",
    edge: "rgba(100,100,100,0.3)",
    background: "#fafafa",
  },
  sepia: {
    tensione_aperta: "#bf6b27",
    tensione_risolta: "#c89b3d",
    tensione_elevata: "#6b8e23",
    substrate: "#a68d6e",
    principio: "#556b2f",
    defeated: "#a0312f",
    meta_nota: "#7a5e8c",
    label: "#5a4530",
    edge: "rgba(120,90,60,0.3)",
    background: "#f5ecd9",
  },
  minimal: {
    tensione_aperta: "#444444",
    tensione_risolta: "#666666",
    tensione_elevata: "#222222",
    substrate: "#999999",
    principio: "#000000",
    defeated: "#aa0000",
    meta_nota: "#555555",
    label: "#333333",
    edge: "rgba(0,0,0,0.15)",
    background: "#ffffff",
  },
  neon: {
    tensione_aperta: "#ff5722",
    tensione_risolta: "#ffff00",
    tensione_elevata: "#00e676",
    substrate: "#00bcd4",
    principio: "#76ff03",
    defeated: "#ff1744",
    meta_nota: "#d500f9",
    label: "#e0e0e0",
    edge: "rgba(0,229,255,0.3)",
    background: "#0a0a0f",
  },
};

export const DEFAULT_GRAPH_FILTERS: GraphFilters = {
  tensione_aperta: true,
  tensione_risolta: true,
  tensione_elevata: true,
  substrate: true,
  principle: true,
  defeated: true,
  meta_note: true,
  presupposition: true,
};

export const LAYER_COLORS: Record<string, string> = {
  tensione_aperta: "#ff8c42",   // arancione caldo
  tensione_risolta: "#fbc02d",  // giallo
  tensione_elevata: "#4caf50",  // verde (gia\' diventata principio nello stesso file)
  substrate: "#9aa0a6",         // grigio
  principle: "#2e7d32",         // verde scuro
  defeated: "#e53935",          // rosso
  meta_note: "#7e57c2",         // viola
  presupposition: "#fbbf24",    // gold — load-bearing assumptions
  unknown: "#607d8b",
};

// Tutti pallini — il colore basta per identificare il layer (vs Obsidian default style)
export const LAYER_SHAPES: Record<string, string> = {
  tensione_aperta: "ellipse",
  tensione_risolta: "ellipse",
  tensione_elevata: "ellipse",
  substrate: "ellipse",
  principio: "ellipse",
  defeated: "ellipse",
  meta_nota: "ellipse",
  presupposition: "ellipse",
  unknown: "ellipse",
};

// ---------- AI backend presets ----------

export const BACKEND_PRESETS: BackendPreset[] = [
  {
    id: "anthropic",
    label: "Anthropic Cloud",
    baseUrl: "https://api.anthropic.com",
    defaultModel: "claude-sonnet-4-6",
    defaultKey: "",
    helpKey: "Create the key at console.anthropic.com.",
  },
  {
    id: "groq",
    label: "Groq Cloud (free tier)",
    baseUrl: "https://api.groq.com/openai/v1",
    defaultModel: "llama-3.3-70b-versatile",
    defaultKey: "",
    helpKey: "Free tier with generous rate limits. Create the key at console.groq.com.",
  },
  {
    id: "openai",
    label: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-4o-mini",
    defaultKey: "",
    helpKey: "Create the key at platform.openai.com (paid, $5 credit on new accounts).",
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    defaultModel: "meta-llama/llama-3.1-8b-instruct:free",
    defaultKey: "",
    helpKey: "Aggregator with some free models. Create the key at openrouter.ai.",
  },
  {
    id: "lmstudio",
    label: "LM Studio (local, free)",
    baseUrl: "http://localhost:1234/v1",
    defaultModel: "qwen/qwen3.5-9b",
    defaultKey: "lmstudio",
    helpKey: "LM Studio ignores the key but the plugin requires it.",
  },
  {
    id: "ollama",
    label: "Ollama (local, free)",
    baseUrl: "http://localhost:11434/v1",
    defaultModel: "llama3.2",
    defaultKey: "ollama",
    helpKey: "Ollama ignores the key but the plugin requires it.",
  },
];

export const MODEL_PRESETS: Array<{ id: string; label: string }> = [
  { id: "claude-sonnet-4-6", label: "Sonnet 4.6 (Anthropic)" },
  { id: "claude-opus-4-6", label: "Opus 4.6 (Anthropic)" },
  { id: "claude-haiku-4-5-20251001", label: "Haiku 4.5 (Anthropic)" },
  { id: "llama-3.3-70b-versatile", label: "Llama 3.3 70B (Groq, free)" },
  { id: "llama-3.1-8b-instant", label: "Llama 3.1 8B (Groq, free, faster)" },
  { id: "mixtral-8x7b-32768", label: "Mixtral 8x7B (Groq, free)" },
  { id: "gpt-4o-mini", label: "GPT-4o mini (OpenAI)" },
  { id: "gpt-4o", label: "GPT-4o (OpenAI)" },
  { id: "meta-llama/llama-3.1-8b-instruct:free", label: "Llama 3.1 8B free (OpenRouter)" },
  { id: "qwen/qwen3.5-9b", label: "Qwen 3.5 9B (LM Studio)" },
];

export function detectBackend(baseUrl: string): string {
  const u = baseUrl.toLowerCase();
  if (u.includes("anthropic.com")) return "anthropic";
  if (u.includes("groq.com")) return "groq";
  if (u.includes("openai.com")) return "openai";
  if (u.includes("openrouter.ai")) return "openrouter";
  if (u.includes("localhost:1234") || u.includes("127.0.0.1:1234"))
    return "lmstudio";
  if (u.includes("localhost:11434") || u.includes("127.0.0.1:11434"))
    return "ollama";
  return "custom";
}

// ---------- Hunter confidence ordering / colours ----------

export const CONFIDENCE_ORDER: Record<HunterConfidence, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

export const CONFIDENCE_COLOR: Record<HunterConfidence, string> = {
  high: "var(--color-green, #2ecc71)",
  medium: "var(--color-yellow, #f1c40f)",
  low: "var(--color-orange, #e67e22)",
};
