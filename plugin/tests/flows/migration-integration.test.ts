import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import * as yaml from "js-yaml";
import { makeMockApp } from "../mocks/vault";
import {
  migrateVault,
  restoreFromLatestBackup,
} from "../../flows/migration";

const FIXTURE_DIR = new URL("../fixtures/legacy-v1.1/", import.meta.url);

// Load every fixture file cloned into memory under notes/<name>.md. The disk
// fixtures are read-only; the mock vault holds the working copies.
function loadFixtureVault(): Record<string, string> {
  const names = readdirSync(FIXTURE_DIR).filter((n) => n.endsWith(".md"));
  const out: Record<string, string> = {};
  for (const n of names) {
    out[`notes/${n}`] = readFileSync(new URL(n, FIXTURE_DIR), "utf8");
  }
  return out;
}

function fmOf(content: string): Record<string, unknown> {
  const m = content.match(/^---\n([\s\S]*?)\n---/);
  return m ? ((yaml.load(m[1]) as Record<string, unknown>) ?? {}) : {};
}

// Migration logs to console.error on the (intentional) malformed fixture path
// only if something throws; silence noise either way.
beforeEach(() => vi.spyOn(console, "error").mockImplementation(() => {}));
afterEach(() => vi.restoreAllMocks());

describe("migrateVault — integration over the legacy-v1.1 fixture vault", () => {
  it("reports correct counts and migrates only legacy notes", async () => {
    const mock = makeMockApp(loadFixtureVault());
    const report = await migrateVault(mock.app);

    expect(report.scanned).toBe(10);
    expect(report.legacy).toBe(7); // already-en, malformed-fm, generic excluded
    expect(report.migrated).toBe(7);
    expect(report.skipped).toBe(0);
    expect(report.failed).toBe(0);
    expect(report.backupPath).toMatch(/\.antinomia-pre-migration-backup-/);
    expect(report.fmKeysChanged).toBeGreaterThan(0);
    expect(report.bodyMarkersChanged).toBeGreaterThan(0);
  });

  it("rewrites frontmatter keys + enum values", async () => {
    const mock = makeMockApp(loadFixtureVault());
    await migrateVault(mock.app);

    const tension = fmOf(mock.getContent("notes/tensione-aperta.md"));
    expect(tension.antinomia_type).toBe("tension");
    expect(tension.status).toBe("open");
    expect(tension.title).toBe("Velocita contro correttezza");
    expect(tension).not.toHaveProperty("antinomia_tipo");
    expect(tension).not.toHaveProperty("stato");

    const defeated = fmOf(mock.getContent("notes/defeated-elevata.md"));
    expect(defeated.antinomia_type).toBe("defeated");
    expect(defeated.motive).toBe("elevated");
    expect(defeated.replaced_by).toBe("P-20251103-principio");
  });

  it("rewrites body markers", async () => {
    const mock = makeMockApp(loadFixtureVault());
    await migrateVault(mock.app);
    const body = mock.getContent("notes/tensione-aperta.md");
    expect(body).toContain("- **A (original):**");
    expect(body).toContain("- **Presuppositions A:**");
    expect(body).not.toContain("(originale)");
  });

  it("leaves already-English and non-Antinomia notes untouched", async () => {
    const original = loadFixtureVault();
    const mock = makeMockApp(original);
    await migrateVault(mock.app);
    expect(mock.getContent("notes/already-en.md")).toBe(original["notes/already-en.md"]);
    expect(mock.getContent("notes/generic.md")).toBe(original["notes/generic.md"]);
  });

  it("never modifies the disk fixtures (clone-only)", () => {
    const onDisk = readFileSync(new URL("tensione-aperta.md", FIXTURE_DIR), "utf8");
    expect(onDisk).toContain("antinomia_tipo: tensione");
    expect(onDisk).toContain("(originale)");
  });

  it("is idempotent: a second run migrates nothing", async () => {
    const mock = makeMockApp(loadFixtureVault());
    await migrateVault(mock.app);
    const second = await migrateVault(mock.app);
    expect(second.migrated).toBe(0);
    expect(second.legacy).toBe(0);
  });
});

describe("restoreFromLatestBackup", () => {
  it("reverts notes to their pre-migration state", async () => {
    const original = loadFixtureVault();
    const mock = makeMockApp(original);
    await migrateVault(mock.app);
    expect(mock.getContent("notes/tensione-aperta.md")).not.toContain("antinomia_tipo");

    const r = await restoreFromLatestBackup(mock.app);
    expect(r.ok).toBe(true);
    expect(r.restored).toBe(7);
    expect(mock.getContent("notes/tensione-aperta.md")).toBe(
      original["notes/tensione-aperta.md"]
    );
  });

  it("is a friendly no-op when no backup exists (no crash)", async () => {
    const mock = makeMockApp({ "notes/x.md": "# nothing" });
    const r = await restoreFromLatestBackup(mock.app);
    expect(r.ok).toBe(false);
    expect(r.restored).toBe(0);
  });
});
