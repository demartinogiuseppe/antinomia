import { describe, it, expect, vi, afterEach } from "vitest";
import {
  parseAIResponse,
  parseTitleFromAIResponse,
  parseFreeInputFromAIResponse,
  extractJson,
} from "../../ai/parseResponse";

afterEach(() => vi.restoreAllMocks());

describe("parseAIResponse — Anthropic format", () => {
  it("joins text blocks and passes usage through", () => {
    const data = {
      content: [
        { type: "text", text: "line one" },
        { type: "tool_use", id: "x" },
        { type: "text", text: "line two" },
      ],
      usage: { input_tokens: 11, output_tokens: 22 },
    };
    const r = parseAIResponse(data, "anthropic");
    expect(r.text).toBe("line one\nline two");
    expect(r.usage).toEqual({ input_tokens: 11, output_tokens: 22 });
  });
});

describe("parseAIResponse — OpenAI format", () => {
  it("reads choices[0].message.content and maps usage", () => {
    const data = {
      choices: [{ message: { content: "hello world" } }],
      usage: { prompt_tokens: 3, completion_tokens: 4 },
    };
    const r = parseAIResponse(data, "openai");
    expect(r.text).toBe("hello world");
    expect(r.usage).toEqual({ input_tokens: 3, output_tokens: 4 });
  });

  it("falls back to reasoning_content when content is empty (BUG-010 Qwen3)", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const data = {
      choices: [
        {
          message: { content: "", reasoning_content: "...thinking... {\"title\":\"X\"}" },
        },
      ],
    };
    const r = parseAIResponse(data, "openai");
    expect(r.text).toContain('{"title":"X"}');
    expect(warn).toHaveBeenCalled();
  });

  it("warns when finish_reason is length (truncated)", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const data = {
      choices: [{ message: { content: "partial" }, finish_reason: "length" }],
    };
    parseAIResponse(data, "openai");
    expect(
      warn.mock.calls.some((c) => String(c[0]).includes("finish_reason=length"))
    ).toBe(true);
  });
});

describe("parseTitleFromAIResponse", () => {
  it("pattern 1 — clean JSON {title}", () => {
    expect(parseTitleFromAIResponse('{"title": "Trust versus verification"}')).toBe(
      "Trust versus verification"
    );
  });
  it("pattern 2 — loose \"title\": \"...\" in prose", () => {
    expect(
      parseTitleFromAIResponse('Sure! Here it is: "title": "The cost of certainty" ok?')
    ).toBe("The cost of certainty");
  });
  it("pattern 3 — Title: label line", () => {
    expect(parseTitleFromAIResponse("Title: When silence speaks")).toBe(
      "When silence speaks"
    );
  });
  it("pattern 3 — Italian Titolo: label", () => {
    expect(parseTitleFromAIResponse("Titolo: Il prezzo del dubbio")).toBe(
      "Il prezzo del dubbio"
    );
  });
  it("pattern 4 — quoted string with smart quotes", () => {
    expect(parseTitleFromAIResponse("I propose “Speed or correctness”")).toBe(
      "Speed or correctness"
    );
  });
  it("pattern 5 — picks a short line, skipping reasoning preamble", () => {
    const raw = "Let me think about this.\nThe goal is a title.\nFreedom and order";
    expect(parseTitleFromAIResponse(raw)).toBe("Freedom and order");
  });
  it("rejects meta-content (BUG-164)", () => {
    expect(
      parseTitleFromAIResponse("as a JSON object with one title field")
    ).toBeNull();
  });
  it("strips <think> blocks before parsing", () => {
    expect(
      parseTitleFromAIResponse('<think>hmm</think>{"title":"Clarity"}')
    ).toBe("Clarity");
  });
  it("sanitizes: max 7 words", () => {
    const t = parseTitleFromAIResponse(
      '{"title":"one two three four five six seven eight nine"}'
    );
    expect(t!.split(/\s+/).length).toBeLessThanOrEqual(7);
  });
  it("sanitizes: strips surrounding markdown/quotes", () => {
    expect(parseTitleFromAIResponse('{"title":"**Bold title**"}')).toBe("Bold title");
  });
  it("returns null on empty input", () => {
    expect(parseTitleFromAIResponse("")).toBeNull();
  });
});

describe("parseFreeInputFromAIResponse", () => {
  it("pattern 1 — strict JSON", () => {
    const raw =
      '{"tipo":"tension","title":"A vs B","statementA":"A","statementB":"B","contenuto":""}';
    const r = parseFreeInputFromAIResponse(raw);
    expect(r).toMatchObject({
      tipo: "tension",
      title: "A vs B",
      statementA: "A",
      statementB: "B",
    });
  });
  it("pattern 2 — loose field patterns in non-strict JSON-ish text", () => {
    const raw = `Here you go: "tipo": "substrate", "title": "Raw note", "contenuto": "some content"`;
    const r = parseFreeInputFromAIResponse(raw);
    expect(r?.tipo).toBe("substrate");
    expect(r?.title).toBe("Raw note");
  });
  it("pattern 3 — discursive heuristic (real qwen3-distill prose, BUG-160)", () => {
    const raw =
      "The user is listing types of financial documents. I'll classify this as a 'substrate'. " +
      "The title could be something like 'Financial Documentation Requirements'. " +
      "Since this is a substrate, I won't fill in the statementA and statementB fields.";
    const r = parseFreeInputFromAIResponse(raw);
    expect(r?.tipo).toBe("substrate");
    expect(r?.title).toBe("Financial Documentation Requirements");
  });
  it("returns null when tipo cannot be determined at all", () => {
    expect(parseFreeInputFromAIResponse("totally unrelated blah blah")).toBeNull();
  });
});

describe("extractJson", () => {
  it("parses clean JSON", () => {
    expect(extractJson<{ a: number }>('{"a":1}')).toEqual({ a: 1 });
  });
  it("parses code-fence wrapped JSON (Qwen3)", () => {
    expect(extractJson<{ a: number }>("```json\n{\"a\": 2}\n```")).toEqual({ a: 2 });
  });
  it("parses single-quoted JSON", () => {
    expect(extractJson<{ tipo: string }>("{'tipo': 'substrate'}")).toEqual({
      tipo: "substrate",
    });
  });
  it("tolerates trailing commas", () => {
    expect(extractJson<{ a: number; b: number }>('{"a":1,"b":2,}')).toEqual({
      a: 1,
      b: 2,
    });
  });
  it("strips <thinking> tags then parses", () => {
    expect(
      extractJson<{ ok: boolean }>("<thinking>noise {bad}</thinking>{\"ok\":true}")
    ).toEqual({ ok: true });
  });
  it("returns null when there is no JSON object", () => {
    expect(extractJson("just prose, no json")).toBeNull();
  });
});
