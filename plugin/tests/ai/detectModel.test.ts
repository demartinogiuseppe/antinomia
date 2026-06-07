import { describe, it, expect } from "vitest";
import { detectModelCapabilities } from "../../ai/detectModel";

describe("detectModelCapabilities", () => {
  it("Claude -> anthropic, non-reasoning, vocab none", () => {
    const c = detectModelCapabilities("claude-sonnet-4-6");
    expect(c.family).toBe("anthropic");
    expect(c.isReasoning).toBe(false);
    expect(c.reasoningVocab).toBe("none");
  });

  it("gpt-4o -> openai-instruct, non-reasoning", () => {
    const c = detectModelCapabilities("gpt-4o-mini");
    expect(c.family).toBe("openai-instruct");
    expect(c.isReasoning).toBe(false);
  });

  it.each(["o1", "o3-mini", "gpt-5"])(
    "%s -> openai-reasoning, vocab openai",
    (model) => {
      const c = detectModelCapabilities(model);
      expect(c.family).toBe("openai-reasoning");
      expect(c.isReasoning).toBe(true);
      expect(c.reasoningVocab).toBe("openai");
    }
  );

  it.each(["qwen3-8b", "qwen3.5-9b", "qwq-32b", "qwen3-distill-r1"])(
    "%s -> qwen3-reasoning (BUG-014/019, community distills)",
    (model) => {
      const c = detectModelCapabilities(model);
      expect(c.family).toBe("qwen3-reasoning");
      expect(c.isReasoning).toBe(true);
      expect(c.reasoningVocab).toBe("on_off");
    }
  );

  it("qwen2.5 -> qwen-instruct (older, non-reasoning)", () => {
    const c = detectModelCapabilities("qwen2.5-7b-instruct");
    expect(c.family).toBe("qwen-instruct");
    expect(c.isReasoning).toBe(false);
  });

  it("deepseek-r1 -> deepseek-reasoning", () => {
    const c = detectModelCapabilities("deepseek-r1");
    expect(c.family).toBe("deepseek-reasoning");
    expect(c.isReasoning).toBe(true);
  });

  it.each(["gemma-4-9b", "gemma-3-12b"])(
    "%s -> gemma reasoning (BUG-019)",
    (model) => {
      const c = detectModelCapabilities(model);
      expect(c.family).toBe("gemma");
      expect(c.isReasoning).toBe(true);
    }
  );

  it("gemma-2 -> gemma instruct (non-reasoning)", () => {
    const c = detectModelCapabilities("gemma-2-9b");
    expect(c.family).toBe("gemma");
    expect(c.isReasoning).toBe(false);
  });

  it.each(["llama-3.1-8b-instant", "llama-3.3-70b-versatile"])(
    "%s -> llama instruct",
    (model) => {
      const c = detectModelCapabilities(model);
      expect(c.family).toBe("llama");
      expect(c.isReasoning).toBe(false);
    }
  );

  it.each(["mistral-large", "mixtral-8x7b-32768"])(
    "%s -> mistral instruct",
    (model) => {
      expect(detectModelCapabilities(model).family).toBe("mistral");
    }
  );

  it("unknown -> unknown family with safe conservative defaults", () => {
    const c = detectModelCapabilities("totally-made-up-model");
    expect(c.family).toBe("unknown");
    expect(c.isReasoning).toBe(false);
    expect(c.reasoningVocab).toBe("none");
    expect(c.recommended).toEqual({ short: 500, medium: 1500, deep: 3000 });
  });

  it("handles empty / undefined model names without throwing", () => {
    expect(detectModelCapabilities("").family).toBe("unknown");
    expect(detectModelCapabilities(undefined as never).family).toBe("unknown");
  });
});
