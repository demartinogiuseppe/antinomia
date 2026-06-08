import { describe, it, expect } from "vitest";
import * as yaml from "js-yaml";
import { makeMockApp } from "../mocks/vault";
import {
  applyPresuppositionDecisions,
  removePresuppositionFromPrinciples,
  principlesDependingOn,
  basenamesFromFrontmatter,
} from "../../flows/presuppositionMap";

function fmOf(content: string): Record<string, unknown> {
  const m = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  return m ? ((yaml.load(m[1]) as Record<string, unknown>) ?? {}) : {};
}

function makeMockPlugin(initial: Record<string, string>) {
  const mock = makeMockApp(initial);
  let counter = 0;
  const plugin: any = {
    app: mock.app,
    refreshOpenGraphViews: () => {},
    async createNote(prefix: string, content: string) {
      const id = `${prefix}-test-${++counter}`;
      return (mock.app as any).vault.create(`notes/${id}.md`, content);
    },
  };
  return { plugin, mock };
}

const principle = (presupposes = "[]") =>
  `---\nantinomia_type: principle\ntitle: Decline vague budget\npresupposes: ${presupposes}\n---\n- **IF budget vague -> THEN decline**\n`;
const presup = (presupposes_of = "[]") =>
  `---\nantinomia_type: presupposition\ntitle: Budget clarity\nstatus: active\npresupposes_of: ${presupposes_of}\n---\nBudget clarity signals seriousness.\n`;

describe("applyPresuppositionDecisions — bidirectional sync", () => {
  it("creates new U-, links existing, and syncs both sides", async () => {
    const { plugin, mock } = makeMockPlugin({
      "notes/P-1.md": principle(),
      "notes/U-existing.md": presup(),
    });
    const principleFile = (mock.app as any).vault.getAbstractFileByPath("notes/P-1.md");

    await applyPresuppositionDecisions(plugin, principleFile, [
      { action: "new", text: "A vague budget cannot be clarified quickly", confidence: "medium" },
      { action: "link", basename: "U-existing" },
    ]);

    // principle.presupposes now lists both the new note and the linked one.
    const pFm = fmOf(mock.getContent("notes/P-1.md"));
    const presupposes = basenamesFromFrontmatter(pFm.presupposes);
    expect(presupposes).toContain("U-existing");
    expect(presupposes).toContain("U-test-1");

    // linked U-existing got the principle appended to presupposes_of.
    const uFm = fmOf(mock.getContent("notes/U-existing.md"));
    expect(basenamesFromFrontmatter(uFm.presupposes_of)).toContain("P-1");

    // the new U- note was created with the principle already in presupposes_of.
    const newFm = fmOf(mock.getContent("notes/U-test-1.md"));
    expect(basenamesFromFrontmatter(newFm.presupposes_of)).toContain("P-1");
  });

  it("is additive: a second run does not duplicate links", async () => {
    const { plugin, mock } = makeMockPlugin({
      "notes/P-1.md": principle('["[[U-existing]]"]'),
      "notes/U-existing.md": presup('["[[P-1]]"]'),
    });
    const principleFile = (mock.app as any).vault.getAbstractFileByPath("notes/P-1.md");
    await applyPresuppositionDecisions(plugin, principleFile, [
      { action: "link", basename: "U-existing" },
    ]);
    const presupposes = basenamesFromFrontmatter(fmOf(mock.getContent("notes/P-1.md")).presupposes);
    expect(presupposes.filter((b) => b === "U-existing")).toHaveLength(1);
  });
});

describe("removePresuppositionFromPrinciples — delete-sync", () => {
  it("strips a removed U- from every principle's presupposes", async () => {
    const { mock } = makeMockPlugin({
      "notes/P-1.md": principle('["[[U-x]]", "[[U-keep]]"]'),
      "notes/P-2.md": principle('["[[U-x]]"]'),
      "notes/S-1.md": `---\nantinomia_type: substrate\npresupposes: ["[[U-x]]"]\n---\nnot a principle\n`,
    });
    await removePresuppositionFromPrinciples(mock.app, "U-x");
    expect(basenamesFromFrontmatter(fmOf(mock.getContent("notes/P-1.md")).presupposes)).toEqual(["U-keep"]);
    expect(basenamesFromFrontmatter(fmOf(mock.getContent("notes/P-2.md")).presupposes)).toEqual([]);
    // non-principle is untouched
    expect(basenamesFromFrontmatter(fmOf(mock.getContent("notes/S-1.md")).presupposes)).toEqual(["U-x"]);
  });
});

describe("principlesDependingOn", () => {
  it("finds principles that list the presupposition (degree = invariants)", () => {
    const { mock } = makeMockPlugin({
      "notes/P-1.md": principle('["[[U-shared]]"]'),
      "notes/P-2.md": principle('["[[U-shared]]"]'),
      "notes/U-shared.md": presup('["[[P-1]]", "[[P-2]]"]'),
    });
    const u = (mock.app as any).vault.getAbstractFileByPath("notes/U-shared.md");
    const deps = principlesDependingOn(mock.app, u);
    expect(deps.map((f: any) => f.basename).sort()).toEqual(["P-1", "P-2"]);
  });
});
