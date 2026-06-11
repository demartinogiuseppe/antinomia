import { describe, it, expect } from "vitest";
import {
  linkToBasename,
  basenamesFromFrontmatter,
  toWikilinks,
  mergeUnique,
  presuppositionTitle,
} from "../../flows/presuppositionMap";
import { parsePresuppositionsFromAIResponse } from "../../ai/parseResponse";

describe("linkToBasename", () => {
  it("strips wikilink brackets and aliases", () => {
    expect(linkToBasename("[[U-001]]")).toBe("U-001");
    expect(linkToBasename("[[U-001|some alias]]")).toBe("U-001");
  });
  it("passes a bare basename through", () => {
    expect(linkToBasename("U-001")).toBe("U-001");
  });
});

describe("basenamesFromFrontmatter", () => {
  it("maps a list of wikilinks/bare to basenames", () => {
    expect(basenamesFromFrontmatter(["[[A]]", "[[B|x]]", "C"])).toEqual(["A", "B", "C"]);
  });
  it("returns [] for non-arrays", () => {
    expect(basenamesFromFrontmatter(undefined)).toEqual([]);
    expect(basenamesFromFrontmatter("[[A]]")).toEqual([]);
  });
});

describe("toWikilinks", () => {
  it("wraps basenames", () => {
    expect(toWikilinks(["A", "B"])).toEqual(["[[A]]", "[[B]]"]);
  });
});

describe("mergeUnique", () => {
  it("unions and de-duplicates, order-stable", () => {
    expect(mergeUnique(["A", "B"], ["B", "C"])).toEqual(["A", "B", "C"]);
    expect(mergeUnique([], ["X", "X"])).toEqual(["X"]);
  });
});

describe("presuppositionTitle", () => {
  it("takes the first ~8 words and caps length", () => {
    const t = presuppositionTitle(
      "If a client cannot articulate a budget range it is not a priority."
    );
    expect(t.split(/\s+/).length).toBeLessThanOrEqual(8);
    expect(t.length).toBeLessThanOrEqual(60);
  });
});

describe("parsePresuppositionsFromAIResponse", () => {
  it("parses a bare JSON array", () => {
    const r = parsePresuppositionsFromAIResponse(
      '[{"text":"X holds","confidence":"high","similar_existing":"U-1"}]'
    );
    expect(r).toEqual([{ text: "X holds", confidence: "high", similar_existing: "U-1" }]);
  });
  it("parses a {presuppositions:[]} wrapper", () => {
    const r = parsePresuppositionsFromAIResponse(
      '{"presuppositions":[{"text":"Y","confidence":"low","similar_existing":null}]}'
    );
    expect(r).toEqual([{ text: "Y", confidence: "low", similar_existing: null }]);
  });
  it("tolerates prose around the array", () => {
    const r = parsePresuppositionsFromAIResponse(
      'Sure! Here:\n[{"text":"Z","confidence":"medium","similar_existing":null}]\nDone.'
    );
    expect(r?.[0].text).toBe("Z");
  });
  it("normalizes bad confidence to medium and 'null' string to null", () => {
    const r = parsePresuppositionsFromAIResponse(
      '[{"text":"W","confidence":"bogus","similar_existing":"null"}]'
    );
    expect(r?.[0]).toEqual({ text: "W", confidence: "medium", similar_existing: null });
  });
  it("returns null when nothing usable", () => {
    expect(parsePresuppositionsFromAIResponse("no json here")).toBeNull();
    expect(parsePresuppositionsFromAIResponse("[]")).toBeNull();
  });
});
