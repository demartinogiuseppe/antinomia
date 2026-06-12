// Antinomia — migrate a vault from the v1.1.x Italian schema to the v1.4
// English schema. Idempotent, backup-first. The frontmatter/body transforms
// are pure functions (unit-tested); the vault orchestration wraps them with a
// mandatory pre-migration backup.

import { App, Notice, TFile } from "obsidian";
import { ensureFolder } from "../core/utils";

// --- mappings -------------------------------------------------------------

/** Frontmatter key renames (16). */
export const KEY_MAP: Record<string, string> = {
  antinomia_tipo: "antinomia_type",
  stato: "status",
  collegamenti: "links",
  fonte: "source",
  motivo: "motive",
  sostituita_da: "replaced_by",
  origine_tensione: "origin_tension",
  lingua_originale: "original_language",
  lingua_base: "base_language",
  data_creazione: "creation_date",
  data_modifica: "modified_date",
  data: "date",
  origine: "origin",
  titolo: "title",
  hunter_falsi_positivi: "hunter_false_positives",
  antinomia_esempio: "antinomia_example",
};

/** antinomia_type enum value renames. */
export const TYPE_MAP: Record<string, string> = {
  tensione: "tension",
  principio: "principle",
  meta_nota: "meta_note",
};

/** status enum value renames. */
export const STATUS_MAP: Record<string, string> = {
  aperta: "open",
  risolta: "resolved",
  elevata: "elevated",
};

/** motive (defeated) enum value renames. */
export const MOTIVE_MAP: Record<string, string> = {
  falso_positivo: "false_positive",
  elevata: "elevated",
  sconfitta_genuina: "genuinely_defeated",
};

/** Body marker renames (exact string replace). */
export const BODY_MARKERS: ReadonlyArray<readonly [string, string]> = [
  ["## Origine (tensione)", "## Origin (tension)"],
  ["> Deriva da:", "> Derived from:"],
  ["> Sostituita da:", "> Replaced by:"],
  ["> Vedi anche:", "> See also:"],
  ["- **A (originale):**", "- **A (original):**"],
  ["- **B (originale):**", "- **B (original):**"],
  ["- **Presupposizioni A:**", "- **Presuppositions A:**"],
  ["- **Presupposizioni B:**", "- **Presuppositions B:**"],
  ["- **Contenuto (base):**", "- **Content (base):**"],
  ["- **Originale:**", "- **Original:**"],
];

/** Legacy frontmatter keys whose presence flags a note as v1.1 schema. */
export const LEGACY_KEYS: readonly string[] = [
  "antinomia_tipo",
  "titolo",
  "stato",
  "collegamenti",
  "fonte",
  "motivo",
  "sostituita_da",
  "origine_tensione",
  "lingua_originale",
  "lingua_base",
  "data_creazione",
  "data_modifica",
  "origine",
  "hunter_falsi_positivi",
  "antinomia_esempio",
];

const BACKUP_PREFIX = "notes/.antinomia-pre-migration-backup-";

// --- pure transforms ------------------------------------------------------

/**
 * Rename legacy frontmatter keys and enum values to the v1.4 English schema.
 * Pure + idempotent: keys/values already in English pass through untouched.
 * Unknown keys are preserved. `changedKeys` counts every individual rename
 * applied (each key rename and each enum-value rewrite counts as one).
 */
export function migrateFrontmatter(
  fm: unknown
): { migrated: Record<string, unknown>; changedKeys: number } {
  const out: Record<string, unknown> = {};
  let changed = 0;
  if (!fm || typeof fm !== "object") return { migrated: {}, changedKeys: 0 };

  for (const [key, value] of Object.entries(fm as Record<string, unknown>)) {
    const newKey = KEY_MAP[key] ?? key;
    if (newKey !== key) changed++;

    let newValue: unknown = value;
    if (newKey === "antinomia_type" && typeof value === "string" && TYPE_MAP[value]) {
      newValue = TYPE_MAP[value];
      changed++;
    } else if (newKey === "status" && typeof value === "string" && STATUS_MAP[value]) {
      newValue = STATUS_MAP[value];
      changed++;
    } else if (newKey === "motive" && typeof value === "string" && MOTIVE_MAP[value]) {
      newValue = MOTIVE_MAP[value];
      changed++;
    }
    out[newKey] = newValue;
  }
  return { migrated: out, changedKeys: changed };
}

/**
 * Rename legacy body markers to the v1.4 English wording. Pure + idempotent
 * (already-English markers aren't present, so nothing changes). `changedMarkers`
 * counts the total number of marker occurrences replaced.
 */
export function migrateBody(body: string): { migrated: string; changedMarkers: number } {
  if (!body) return { migrated: body, changedMarkers: 0 };
  let out = body;
  let changed = 0;
  for (const [it, en] of BODY_MARKERS) {
    let idx = out.indexOf(it);
    while (idx !== -1) {
      out = out.slice(0, idx) + en + out.slice(idx + it.length);
      changed++;
      idx = out.indexOf(it, idx + en.length);
    }
  }
  return { migrated: out, changedMarkers: changed };
}

// --- types ----------------------------------------------------------------

export interface MigrationReport {
  scanned: number;
  legacy: number;
  migrated: number;
  skipped: number;
  failed: number;
  fmKeysChanged: number;
  bodyMarkersChanged: number;
  backupPath: string;
  durationMs: number;
}

export interface RestoreReport {
  ok: boolean;
  restored: number;
  backupPath: string;
  message: string;
}

// --- vault operations -----------------------------------------------------

function isBackupPath(path: string): boolean {
  return path.includes("/.antinomia-pre-migration-backup-") || path.startsWith(BACKUP_PREFIX);
}

/**
 * All `.md` files whose frontmatter carries at least one legacy v1.1 key.
 * Backup folders (dot-prefixed) are excluded.
 */
export async function scanVaultForLegacyNotes(app: App): Promise<TFile[]> {
  const out: TFile[] = [];
  for (const file of app.vault.getMarkdownFiles()) {
    if (isBackupPath(file.path)) continue;
    const fm = app.metadataCache.getFileCache(file)?.frontmatter;
    if (fm && LEGACY_KEYS.some((k) => k in fm)) out.push(file);
  }
  return out;
}

/**
 * Copy every given file verbatim into
 * `notes/.antinomia-pre-migration-backup-<iso>/<original path>`, preserving
 * folder structure. Uses the vault adapter (raw fs) so the dot-prefixed,
 * Obsidian-hidden backup folder isn't re-indexed. Returns the backup folder.
 */
export async function createPreMigrationBackup(
  app: App,
  files: TFile[]
): Promise<string> {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupFolder = `${BACKUP_PREFIX}${stamp}`;
  const adapter = app.vault.adapter;
  await adapter.mkdir(backupFolder);
  for (const file of files) {
    const content = await app.vault.read(file);
    const dest = `${backupFolder}/${file.path}`;
    const parent = dest.slice(0, dest.lastIndexOf("/"));
    if (parent && !(await adapter.exists(parent))) await adapter.mkdir(parent);
    await adapter.write(dest, content);
  }
  return backupFolder;
}

/**
 * Migrate one note in place: body markers via vault.process, frontmatter via
 * fileManager.processFrontMatter (safe YAML reserialization). Returns the
 * number of changes (0 = already v1.4, skipped).
 */
export async function migrateNote(
  app: App,
  file: TFile
): Promise<{ ok: boolean; changes: number; fmKeys: number; bodyMarkers: number }> {
  try {
    let bodyMarkers = 0;
    await app.vault.process(file, (content) => {
      const { migrated, changedMarkers } = migrateBody(content);
      bodyMarkers = changedMarkers;
      return migrated;
    });

    let fmKeys = 0;
    await app.fileManager.processFrontMatter(file, (fm) => {
      const { migrated, changedKeys } = migrateFrontmatter({ ...fm });
      fmKeys = changedKeys;
      if (changedKeys > 0) {
        for (const k of Object.keys(fm)) delete (fm as Record<string, unknown>)[k];
        Object.assign(fm, migrated);
      }
    });

    return { ok: true, changes: fmKeys + bodyMarkers, fmKeys, bodyMarkers };
  } catch (e) {
    console.error("[Antinomia] migrateNote failed:", file.path, e);
    return { ok: false, changes: 0, fmKeys: 0, bodyMarkers: 0 };
  }
}

/**
 * Full migration: scan -> mandatory backup -> migrate each legacy note,
 * reporting progress. Never touches non-legacy notes or backup folders.
 */
export async function migrateVault(
  app: App,
  onProgress?: (done: number, total: number) => void
): Promise<MigrationReport> {
  const t0 = Date.now();
  const all = app.vault.getMarkdownFiles().filter((f) => !isBackupPath(f.path));
  const legacyFiles = await scanVaultForLegacyNotes(app);

  const backupPath =
    legacyFiles.length > 0 ? await createPreMigrationBackup(app, legacyFiles) : "";

  let migrated = 0;
  let skipped = 0;
  let failed = 0;
  let fmKeysChanged = 0;
  let bodyMarkersChanged = 0;

  for (let i = 0; i < legacyFiles.length; i++) {
    const r = await migrateNote(app, legacyFiles[i]);
    if (!r.ok) failed++;
    else if (r.changes === 0) skipped++;
    else {
      migrated++;
      fmKeysChanged += r.fmKeys;
      bodyMarkersChanged += r.bodyMarkers;
    }
    onProgress?.(i + 1, legacyFiles.length);
  }

  return {
    scanned: all.length,
    legacy: legacyFiles.length,
    migrated,
    skipped,
    failed,
    fmKeysChanged,
    bodyMarkersChanged,
    backupPath,
    durationMs: Date.now() - t0,
  };
}

/** Find the most recent backup folder name, or null if none exist. */
export async function findLatestBackup(app: App): Promise<string | null> {
  const adapter = app.vault.adapter;
  try {
    const listing = await adapter.list("notes");
    const backups = (listing.folders ?? []).filter((f) =>
      f.includes("/.antinomia-pre-migration-backup-")
    );
    if (backups.length === 0) return null;
    // ISO-stamped names sort lexically == chronologically.
    backups.sort();
    return backups[backups.length - 1];
  } catch {
    return null;
  }
}

/**
 * Restore every file from the most recent pre-migration backup, overwriting
 * the current versions. Friendly no-op (no crash) when there's no backup.
 */
export async function restoreFromLatestBackup(app: App): Promise<RestoreReport> {
  const backupFolder = await findLatestBackup(app);
  if (!backupFolder) {
    new Notice("Antinomia: no pre-migration backup found to restore.");
    return { ok: false, restored: 0, backupPath: "", message: "No backup found." };
  }
  const adapter = app.vault.adapter;

  // Walk the backup tree.
  const files: string[] = [];
  const walk = async (dir: string): Promise<void> => {
    const listing = await adapter.list(dir);
    for (const f of listing.files ?? []) files.push(f);
    for (const sub of listing.folders ?? []) await walk(sub);
  };
  await walk(backupFolder);

  let restored = 0;
  for (const backupFile of files) {
    const original = backupFile.slice(backupFolder.length + 1); // strip "<backup>/"
    const content = await adapter.read(backupFile);
    const existing = app.vault.getAbstractFileByPath(original);
    if (existing instanceof TFile) {
      await app.vault.modify(existing, content);
    } else {
      const parent = original.slice(0, original.lastIndexOf("/"));
      if (parent) await ensureFolder(app, parent);
      await app.vault.create(original, content);
    }
    restored++;
  }

  new Notice(`Antinomia: restored ${restored} notes from backup.`);
  return {
    ok: true,
    restored,
    backupPath: backupFolder,
    message: `Restored ${restored} notes from ${backupFolder}.`,
  };
}
