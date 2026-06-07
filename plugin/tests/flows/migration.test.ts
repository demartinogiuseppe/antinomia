import { describe, it, expect } from "vitest";
import {
  migrateFrontmatter,
  migrateBody,
  KEY_MAP,
  BODY_MARKERS,
} from "../../flows/migration";

describe("migrateFrontmatter — keys", () => {
  it("renames all 16 legacy keys", () => {
    const legacy: Record<string, unknown> = {
      antinomia_tipo: "substrate",
      stato: "x",
      collegamenti: [],
      fonte: "f",
      motivo: "m",
      sostituita_da: "s",
      origine_tensione: "o",
      lingua_originale: "it",
      lingua_base: "it",
      data_creazione: "2026-01-01",
      data_modifica: "2026-01-02",
      data: "2026-01-03",
      origine: "user_input",
      titolo: "Titolo X",
      hunter_falsi_positivi: ["A"],
      antinomia_esempio: true,
    };
    const { migrated, changedKeys } = migrateFrontmatter(legacy);
    for (const en of Object.values(KEY_MAP)) {
      expect(migrated).toHaveProperty(en);
    }
    // No legacy key should remain.
    for (const it of Object.keys(KEY_MAP)) {
      expect(migrated).not.toHaveProperty(it);
    }
    // 16 key renames (none of these values are mapped enums).
    expect(changedKeys).toBe(16);
  });

  it("is a no-op on already-English frontmatter (idempotent)", () => {
    const en = {
      antinomia_type: "substrate",
      status: "open",
      title: "Already English",
      links: [],
    };
    const { migrated, changedKeys } = migrateFrontmatter(en);
    expect(migrated).toEqual(en);
    expect(changedKeys).toBe(0);
  });

  it("renames only the Italian keys in a mixed object", () => {
    const mixed = { antinomia_type: "tension", titolo: "Mixed", status: "open" };
    const { migrated, changedKeys } = migrateFrontmatter(mixed);
    expect(migrated).toEqual({
      antinomia_type: "tension",
      title: "Mixed",
      status: "open",
    });
    expect(changedKeys).toBe(1); // only `titolo` -> `title`
  });

  it("preserves unknown keys untouched", () => {
    const { migrated } = migrateFrontmatter({ custom_field: 42, titolo: "T" });
    expect(migrated).toMatchObject({ custom_field: 42, title: "T" });
  });
});

describe("migrateFrontmatter — enum values", () => {
  it("antinomia_tipo='tensione' -> antinomia_type='tension' (key + value)", () => {
    const { migrated, changedKeys } = migrateFrontmatter({ antinomia_tipo: "tensione" });
    expect(migrated).toEqual({ antinomia_type: "tension" });
    expect(changedKeys).toBe(2);
  });

  it("maps principio/meta_nota type values", () => {
    expect(migrateFrontmatter({ antinomia_tipo: "principio" }).migrated).toEqual({
      antinomia_type: "principle",
    });
    expect(migrateFrontmatter({ antinomia_tipo: "meta_nota" }).migrated).toEqual({
      antinomia_type: "meta_note",
    });
  });

  it("stato='aperta' -> status='open' (key + value)", () => {
    const { migrated, changedKeys } = migrateFrontmatter({ stato: "aperta" });
    expect(migrated).toEqual({ status: "open" });
    expect(changedKeys).toBe(2);
  });

  it("maps risolta/elevata status values", () => {
    expect(migrateFrontmatter({ stato: "risolta" }).migrated).toEqual({
      status: "resolved",
    });
    expect(migrateFrontmatter({ stato: "elevata" }).migrated).toEqual({
      status: "elevated",
    });
  });

  it("motive='elevata' -> motive='elevated' (value only, key already EN)", () => {
    const { migrated, changedKeys } = migrateFrontmatter({ motive: "elevata" });
    expect(migrated).toEqual({ motive: "elevated" });
    expect(changedKeys).toBe(1);
  });

  it("maps all defeated motive values", () => {
    expect(migrateFrontmatter({ motivo: "falso_positivo" }).migrated).toEqual({
      motive: "false_positive",
    });
    expect(migrateFrontmatter({ motivo: "sconfitta_genuina" }).migrated).toEqual({
      motive: "genuinely_defeated",
    });
  });

  it("renames hunter_falsi_positivi key but preserves the array value", () => {
    const { migrated, changedKeys } = migrateFrontmatter({
      hunter_falsi_positivi: ["Note A", "Note B"],
    });
    expect(migrated).toEqual({ hunter_false_positives: ["Note A", "Note B"] });
    expect(changedKeys).toBe(1);
  });
});

describe("migrateBody", () => {
  it("renames all legacy body markers", () => {
    const body = BODY_MARKERS.map(([it]) => it).join("\n");
    const { migrated, changedMarkers } = migrateBody(body);
    expect(changedMarkers).toBe(BODY_MARKERS.length);
    for (const [it, en] of BODY_MARKERS) {
      expect(migrated).toContain(en);
      expect(migrated).not.toContain(it);
    }
  });

  it("is a no-op on already-English body (idempotent)", () => {
    const body = BODY_MARKERS.map(([, en]) => en).join("\n");
    const { migrated, changedMarkers } = migrateBody(body);
    expect(migrated).toBe(body);
    expect(changedMarkers).toBe(0);
  });

  it("renames only the Italian markers in a mixed body", () => {
    const body = "- **A (base):** keep\n- **A (originale):** change";
    const { migrated, changedMarkers } = migrateBody(body);
    expect(migrated).toBe("- **A (base):** keep\n- **A (original):** change");
    expect(changedMarkers).toBe(1);
  });

  it("leaves a generic note (no Antinomia markers) untouched", () => {
    const body = "# My note\n\nJust some text, nothing special.";
    const { migrated, changedMarkers } = migrateBody(body);
    expect(migrated).toBe(body);
    expect(changedMarkers).toBe(0);
  });
});

describe("idempotency", () => {
  it("migrateFrontmatter(migrateFrontmatter(x)) === migrateFrontmatter(x)", () => {
    const x = {
      antinomia_tipo: "tensione",
      stato: "aperta",
      titolo: "T",
      hunter_falsi_positivi: ["A"],
    };
    const once = migrateFrontmatter(x).migrated;
    const twice = migrateFrontmatter(once);
    expect(twice.migrated).toEqual(once);
    expect(twice.changedKeys).toBe(0);
  });

  it("migrateBody applied twice is stable", () => {
    const body = BODY_MARKERS.map(([it]) => it).join("\n");
    const once = migrateBody(body).migrated;
    const twice = migrateBody(once);
    expect(twice.migrated).toBe(once);
    expect(twice.changedMarkers).toBe(0);
  });
});
