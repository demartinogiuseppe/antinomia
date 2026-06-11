import { describe, it, expect } from "vitest";
import {
  yamlQuote,
  stripFrontmatter,
  humanTitle,
  layerKey,
} from "../../core/frontmatter";

describe("yamlQuote", () => {
  it("wraps a plain string in double quotes", () => {
    expect(yamlQuote("hello")).toBe('"hello"');
  });
  it("escapes embedded double quotes", () => {
    expect(yamlQuote('say "hi"')).toBe('"say \\"hi\\""');
  });
  it("escapes backslashes", () => {
    expect(yamlQuote("a\\b")).toBe('"a\\\\b"');
  });
  it("keeps colons and # (the reason quoting exists)", () => {
    expect(yamlQuote("key: value # note")).toBe('"key: value # note"');
  });
  it("handles empty and numeric-looking values", () => {
    expect(yamlQuote("")).toBe('""');
    expect(yamlQuote("42")).toBe('"42"');
  });
  it("preserves a leading apostrophe (only \\ and \" are escaped)", () => {
    expect(yamlQuote("it's fine")).toBe('"it\'s fine"');
  });
});

describe("stripFrontmatter", () => {
  it("removes a complete frontmatter block", () => {
    const raw = "---\ntitle: X\nstatus: open\n---\nThe body here";
    expect(stripFrontmatter(raw)).toBe("The body here");
  });
  it("returns the input unchanged when there is no frontmatter", () => {
    expect(stripFrontmatter("just a body, no fm")).toBe("just a body, no fm");
  });
  it("returns the input unchanged when frontmatter is unterminated", () => {
    const raw = "---\ntitle: X\nno closing fence";
    expect(stripFrontmatter(raw)).toBe(raw);
  });
});

// --- humanTitle: needs a mock App + TFile ---
function makeApp(cache: unknown) {
  return {
    metadataCache: {
      getFileCache: () => cache,
    },
  };
}
function makeFile(basename: string) {
  return { basename };
}

describe("humanTitle", () => {
  it("prefers frontmatter.title", () => {
    const app = makeApp({ frontmatter: { title: "Explicit Title" }, headings: [] });
    expect(humanTitle(app as never, makeFile("F-123") as never)).toBe(
      "Explicit Title"
    );
  });
  it("falls back to the first heading", () => {
    const app = makeApp({ frontmatter: {}, headings: [{ heading: "First H" }] });
    expect(humanTitle(app as never, makeFile("F-123") as never)).toBe("First H");
  });
  it("falls back to the basename", () => {
    const app = makeApp({ frontmatter: {}, headings: [] });
    expect(humanTitle(app as never, makeFile("F-123") as never)).toBe("F-123");
  });
  it("falls back to basename when there is no cache at all", () => {
    const app = makeApp(null);
    expect(humanTitle(app as never, makeFile("F-456") as never)).toBe("F-456");
  });
});

describe("layerKey", () => {
  it("maps an open tension", () => {
    expect(layerKey({ antinomia_type: "tension", status: "open" })).toBe(
      "tensione_aperta"
    );
  });
  it("maps a tension with no status to open", () => {
    expect(layerKey({ antinomia_type: "tension" })).toBe("tensione_aperta");
  });
  it("maps a resolved tension", () => {
    expect(layerKey({ antinomia_type: "tension", status: "resolved" })).toBe(
      "tensione_risolta"
    );
  });
  it("maps a legacy elevated tension", () => {
    expect(layerKey({ antinomia_type: "tension", status: "elevated" })).toBe(
      "tensione_elevata"
    );
  });
  it("maps a substrate", () => {
    expect(layerKey({ antinomia_type: "substrate" })).toBe("substrate");
  });
  it("maps a principle", () => {
    expect(layerKey({ antinomia_type: "principle" })).toBe("principle");
  });
  it("maps a plain defeated", () => {
    expect(layerKey({ antinomia_type: "defeated" })).toBe("defeated");
  });
  it("maps a defeated with motive=elevated to the elevated layer", () => {
    expect(layerKey({ antinomia_type: "defeated", motive: "elevated" })).toBe(
      "tensione_elevata"
    );
  });
  it("maps a meta_note", () => {
    expect(layerKey({ antinomia_type: "meta_note" })).toBe("meta_note");
  });
  it("returns null for unknown / non-Antinomia frontmatter", () => {
    expect(layerKey({ antinomia_type: "whatever" })).toBeNull();
    expect(layerKey({})).toBeNull();
    expect(layerKey(null)).toBeNull();
  });
});
