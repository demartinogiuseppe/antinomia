import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import {
  parseAIResponse,
  parseTitleFromAIResponse,
  parseFreeInputFromAIResponse,
  extractJson,
} from "../../ai/parseResponse";

// Load a captured backend response fixture.
function load(name: string): any {
  const url = new URL(`../fixtures/ai-responses/${name}`, import.meta.url);
  return JSON.parse(readFileSync(url, "utf8"));
}

// Several fixtures intentionally trigger console.warn (reasoning fallback,
// truncation) — silence it so test output stays clean.
beforeEach(() => vi.spyOn(console, "warn").mockImplementation(() => {}));
afterEach(() => vi.restoreAllMocks());

describe("fixtures — clean title responses across families", () => {
  it.each([
    ["anthropic-title-clean.json", "anthropic", "Trust versus verification"],
    ["openai-gpt4o-title-clean.json", "openai", "The cost of certainty"],
    ["groq-llama-title-clean.json", "openai", "Speed or correctness"],
    ["openai-o1-title-reasoning.json", "openai", "Means and ends"],
  ] as const)("%s -> %s", (file, format, expected) => {
    const { text } = parseAIResponse(load(file), format);
    expect(parseTitleFromAIResponse(text)).toBe(expected);
  });
});

describe("fixtures — reasoning_content fallback (BUG-009/010/019)", () => {
  it("qwen3 distill truncated: title recovered from reasoning_content", () => {
    const { text } = parseAIResponse(
      load("qwen3-distill-title-truncated.json"),
      "openai"
    );
    expect(text).toContain('"title"');
    expect(parseTitleFromAIResponse(text)).toBe("The weight of doubt");
  });

  it("gemma4 forced reasoning: title parsed from reasoning_content", () => {
    const { text } = parseAIResponse(
      load("gemma4-title-reasoning-forced.json"),
      "openai"
    );
    expect(parseTitleFromAIResponse(text)).toBe("Order and chaos");
  });

  it("qwen3 distill empty: no content and no reasoning -> null title", () => {
    const { text } = parseAIResponse(load("qwen3-distill-title-empty.json"), "openai");
    expect(text).toBe("");
    expect(parseTitleFromAIResponse(text)).toBeNull();
  });
});

describe("fixtures — prose-instead-of-JSON (v1.4.3 robust parsers)", () => {
  it("free input prose resolves via the discursive heuristic (BUG-160)", () => {
    const { text } = parseAIResponse(load("qwen3-prose-instead-json.json"), "openai");
    const parsed = parseFreeInputFromAIResponse(text);
    expect(parsed?.tipo).toBe("substrate");
    expect(parsed?.title).toBe("Financial Documentation Requirements");
  });

  it("Hunter prose yields no pairs[] (triggers retry path, BUG-161)", () => {
    const { text } = parseAIResponse(load("hunter-prose-instead-of-pairs.json"), "openai");
    const parsedRaw = extractJson<{ pairs?: unknown[] }>(text);
    const hasPairs = !!parsedRaw && Array.isArray(parsedRaw.pairs);
    expect(hasPairs).toBe(false);
  });
});

describe("fixtures — cloud rejection (BUG-CLOUD-001)", () => {
  it("Groq 400 names the unsupported chat_template_kwargs param", () => {
    const data = load("groq-chat-template-kwargs-rejection.json");
    expect(data.error.message).toContain("chat_template_kwargs");
  });
});
