import { describe, it, expect } from "vitest";
import { normalizeHunterPair } from "../../ai/parseResponse";

describe("normalizeHunterPair", () => {
  it("passes through the English schema", () => {
    expect(
      normalizeHunterPair({
        note_a: "A",
        note_b: "B",
        description: "they conflict",
        confidence: "high",
      })
    ).toEqual({
      note_a: "A",
      note_b: "B",
      description: "they conflict",
      confidence: "high",
    });
  });

  it("maps the legacy Italian schema (nota_a/descrizione/alta)", () => {
    expect(
      normalizeHunterPair({
        nota_a: "A",
        nota_b: "B",
        descrizione: "si contraddicono",
        confidence: "alta",
      })
    ).toEqual({
      note_a: "A",
      note_b: "B",
      description: "si contraddicono",
      confidence: "high",
    });
  });

  it("maps media/bassa confidence to medium/low", () => {
    expect(normalizeHunterPair({ confidence: "media" }).confidence).toBe("medium");
    expect(normalizeHunterPair({ confidence: "bassa" }).confidence).toBe("low");
  });

  it("accepts mixed / partial fields", () => {
    expect(normalizeHunterPair({ note_a: "A", descrizione: "x" })).toEqual({
      note_a: "A",
      note_b: "",
      description: "x",
      confidence: undefined,
    });
  });

  it("fills missing fields with safe defaults (empty object)", () => {
    expect(normalizeHunterPair({})).toEqual({
      note_a: "",
      note_b: "",
      description: "",
      confidence: undefined,
    });
  });

  it("leaves an unknown/gibberish confidence undefined", () => {
    expect(normalizeHunterPair({ confidence: "gibberish" }).confidence).toBeUndefined();
  });
});
