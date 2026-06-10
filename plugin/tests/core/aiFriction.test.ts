import { describe, it, expect } from "vitest";
import {
  parseFrictionFields,
  buildFrictionPayload,
  backendLabel,
  withFrictionSuffix,
  HARDCODED_LIMITATIONS,
} from "../../core/aiFriction";

describe("parseFrictionFields", () => {
  it("extracts the three optional fields from a JSON object response", () => {
    const raw = JSON.stringify({
      title: "Speed vs Quality",
      reasoning_short: "Keyed on the two opposing imperatives.",
      confidence_self: "high",
      limitations: ["I can't see your real constraints", "  ", "Surface only"],
    });
    const f = parseFrictionFields(raw);
    expect(f.reasoningShort).toBe("Keyed on the two opposing imperatives.");
    expect(f.aiConfidenceSelf).toBe("high");
    // empty/whitespace items dropped, capped at 3
    expect(f.aiLimitations).toEqual([
      "I can't see your real constraints",
      "Surface only",
    ]);
  });

  it("tolerates prose around the JSON (uses extractJson)", () => {
    const raw =
      'Here is the result:\n```json\n{"title":"X","confidence_self":"low"}\n```\nDone.';
    const f = parseFrictionFields(raw);
    expect(f.aiConfidenceSelf).toBe("low");
  });

  it("returns empty object when the model did not cooperate (no fields)", () => {
    expect(parseFrictionFields('{"title":"X"}')).toEqual({});
  });

  it("returns empty object for a bare array response (no top-level fields)", () => {
    expect(parseFrictionFields('[{"text":"a"}]')).toEqual({});
  });

  it("ignores an invalid confidence value", () => {
    const f = parseFrictionFields('{"confidence_self":"very-high"}');
    expect(f.aiConfidenceSelf).toBeUndefined();
  });

  it("returns empty object for empty / unparseable input", () => {
    expect(parseFrictionFields("")).toEqual({});
    expect(parseFrictionFields("not json at all")).toEqual({});
  });
});

describe("backendLabel", () => {
  it("maps known hosts", () => {
    expect(backendLabel("https://api.anthropic.com")).toBe("Anthropic");
    expect(backendLabel("https://api.openai.com/v1")).toBe("OpenAI");
    expect(backendLabel("https://api.groq.com/openai/v1")).toBe("Groq");
    expect(backendLabel("https://openrouter.ai/api/v1")).toBe("OpenRouter");
    expect(backendLabel("http://localhost:1234/v1")).toBe("LM Studio (local)");
    expect(backendLabel("http://localhost:11434/v1")).toBe("Ollama (local)");
    expect(backendLabel("http://127.0.0.1:8080")).toBe("Local backend");
    expect(backendLabel("https://my.proxy.example/v1")).toBe("Custom backend");
  });
});

describe("buildFrictionPayload", () => {
  it("combines transparency + AI fields + hardcoded limitations", () => {
    const p = buildFrictionPayload({
      operation: "hunter",
      modelName: "claude-sonnet-4-6",
      baseUrl: "https://api.anthropic.com",
      usage: { input_tokens: 1200, output_tokens: 340 },
      ai: { reasoningShort: "r", aiConfidenceSelf: "medium", aiLimitations: ["x"] },
    });
    expect(p.modelName).toBe("claude-sonnet-4-6");
    expect(p.backend).toBe("Anthropic");
    expect(p.temperature).toBeUndefined();
    expect(p.tokensUsed).toEqual({ in: 1200, out: 340 });
    expect(p.reasoningShort).toBe("r");
    expect(p.aiConfidenceSelf).toBe("medium");
    expect(p.aiLimitations).toEqual(["x"]);
    expect(p.hardcodedLimitations).toEqual(HARDCODED_LIMITATIONS.hunter);
  });

  it("omits tokensUsed when usage is absent and AI fields when not provided", () => {
    const p = buildFrictionPayload({
      operation: "title",
      modelName: "gpt-4o",
      baseUrl: "https://api.openai.com/v1",
    });
    expect(p.tokensUsed).toBeUndefined();
    expect(p.reasoningShort).toBeUndefined();
    expect(p.aiConfidenceSelf).toBeUndefined();
    expect(p.hardcodedLimitations).toEqual(HARDCODED_LIMITATIONS.title);
  });
});

describe("withFrictionSuffix", () => {
  it("appends the friction instruction once", () => {
    const out = withFrictionSuffix("BASE PROMPT");
    expect(out.startsWith("BASE PROMPT")).toBe(true);
    expect(out).toContain("reasoning_short");
    expect(out).toContain("confidence_self");
    expect(out).toContain("limitations");
  });
});
