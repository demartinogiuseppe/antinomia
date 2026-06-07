import { describe, it, expect } from "vitest";
import {
  timestampId,
  todayISO,
  extractYouTubeId,
  truncate,
  decodeHtmlEntities,
  alphabeticOwner,
  isLocalBaseUrl,
} from "../../core/utils";

describe("timestampId", () => {
  it("formats as YYYYMMDD-HHmmss", () => {
    expect(timestampId()).toMatch(/^\d{8}-\d{6}$/);
  });
});

describe("todayISO", () => {
  it("formats as YYYY-MM-DD", () => {
    expect(todayISO()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("extractYouTubeId", () => {
  it("parses youtu.be short links", () => {
    expect(extractYouTubeId("https://youtu.be/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
  });
  it("parses watch?v= links", () => {
    expect(extractYouTubeId("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe(
      "dQw4w9WgXcQ"
    );
  });
  it("parses watch?v= with extra query params", () => {
    expect(
      extractYouTubeId("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s&list=x")
    ).toBe("dQw4w9WgXcQ");
  });
  it("parses embed/ links", () => {
    expect(extractYouTubeId("https://www.youtube.com/embed/dQw4w9WgXcQ")).toBe(
      "dQw4w9WgXcQ"
    );
  });
  it("parses shorts/ links", () => {
    expect(extractYouTubeId("https://youtube.com/shorts/dQw4w9WgXcQ")).toBe(
      "dQw4w9WgXcQ"
    );
  });
  it("accepts a bare 11-char id", () => {
    expect(extractYouTubeId("dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
  });
  it("returns null for non-YouTube URLs", () => {
    expect(extractYouTubeId("https://example.com/watch?v=abc")).toBeNull();
  });
  it("returns null for plain text", () => {
    expect(extractYouTubeId("not a url at all")).toBeNull();
  });
});

describe("truncate", () => {
  it("leaves short strings unchanged", () => {
    expect(truncate("hello", 10)).toBe("hello");
  });
  it("cuts and appends an ellipsis marker", () => {
    expect(truncate("hello world", 5)).toBe("hello [...]");
  });
});

describe("decodeHtmlEntities", () => {
  it("decodes the common entities", () => {
    expect(decodeHtmlEntities("a &amp; b &lt;c&gt; &quot;d&quot; &#39;e&#39;")).toBe(
      "a & b <c> \"d\" 'e'"
    );
  });
});

describe("alphabeticOwner", () => {
  it("returns the alphabetically smaller string", () => {
    expect(alphabeticOwner("banana", "apple")).toBe("apple");
    expect(alphabeticOwner("apple", "banana")).toBe("apple");
  });
});

describe("isLocalBaseUrl", () => {
  it.each([
    "http://localhost:1234/v1",
    "http://127.0.0.1:11434/v1",
    "http://0.0.0.0:8080",
    "http://my-box.local:1234",
  ])("treats %s as local", (url) => {
    expect(isLocalBaseUrl(url)).toBe(true);
  });
  it.each([
    "https://api.anthropic.com",
    "https://api.groq.com/openai/v1",
    "https://api.openai.com/v1",
    "not-a-url",
  ])("treats %s as not local", (url) => {
    expect(isLocalBaseUrl(url)).toBe(false);
  });
});
