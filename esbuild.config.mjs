import esbuild from "esbuild";
import { promises as fs } from "fs";
import fsSync from "fs";
import path from "path";
import { builtinModules as builtins } from "node:module";

// Output va direttamente nel TestVault cosi al rebuild Obsidian vede subito il file aggiornato.
// Path relativo dalla root del repo: TestVault/.obsidian/plugins/antinomia/
const TARGET_DIR = path.resolve("TestVault/.obsidian/plugins/antinomia");

await fs.mkdir(TARGET_DIR, { recursive: true });

// ---------- Backup automatico di main.ts ----------
// Prima di ogni build (o watch start), copia main.ts in backups/ con
// timestamp. Tiene gli ultimi 30 backup, cancella i piu' vecchi (rotation).
// Difende dalla corruzione del file in caso di edit multipli/race conditions.
function backupMainTs() {
  const srcFile = path.resolve("main.ts");
  if (!fsSync.existsSync(srcFile)) return;
  const backupsDir = path.resolve("backups");
  if (!fsSync.existsSync(backupsDir))
    fsSync.mkdirSync(backupsDir, { recursive: true });

  // Skip se il backup piu' recente e' identico (no duplicati su build successive)
  const existing = fsSync
    .readdirSync(backupsDir)
    .filter((f) => f.startsWith("main-") && f.endsWith(".ts"))
    .sort();
  if (existing.length > 0) {
    const latest = path.join(backupsDir, existing[existing.length - 1]);
    const a = fsSync.readFileSync(latest);
    const b = fsSync.readFileSync(srcFile);
    if (a.length === b.length && a.equals(b)) {
      return; // nessuna modifica: niente backup
    }
  }

  // Validazione veloce: rifiuta backup di un file troncato (fine senza '}' o
  // ultima riga senza newline di chiusura). Meglio non sovrascrivere backup
  // sani con un file rotto.
  const txt = fsSync.readFileSync(srcFile, "utf8");
  const lastNonEmpty = txt.split("\n").filter((l) => l.trim().length > 0).pop() || "";
  const looksOk = lastNonEmpty.trim() === "}" || txt.trim().endsWith("}");
  if (!looksOk) {
    console.warn(
      "[backup] main.ts sembra troncato (non termina con '}'). Backup SALTATO. " +
        "Ripristina manualmente da backups/ se il build fallisce."
    );
    return;
  }

  const ts = new Date()
    .toISOString()
    .replace(/[:.]/g, "-")
    .slice(0, 19); // YYYY-MM-DDTHH-MM-SS
  const dest = path.join(backupsDir, `main-${ts}.ts`);
  fsSync.copyFileSync(srcFile, dest);
  console.log(`[backup] main.ts -> backups/main-${ts}.ts`);

  // Rotation: mantieni solo gli ultimi 30
  const files = fsSync
    .readdirSync(backupsDir)
    .filter((f) => f.startsWith("main-") && f.endsWith(".ts"))
    .sort();
  while (files.length > 30) {
    const f = files.shift();
    fsSync.unlinkSync(path.join(backupsDir, f));
  }
}

backupMainTs();

const isProd = process.argv.includes("--prod");

const buildOptions = {
  entryPoints: ["main.ts"],
  bundle: true,
  external: [
    "obsidian",
    "electron",
    "@codemirror/autocomplete",
    "@codemirror/collab",
    "@codemirror/commands",
    "@codemirror/language",
    "@codemirror/lint",
    "@codemirror/search",
    "@codemirror/state",
    "@codemirror/view",
    "@lezer/common",
    "@lezer/highlight",
    "@lezer/lr",
    ...builtins,
  ],
  format: "cjs",
  target: "es2020",
  logLevel: "info",
  sourcemap: isProd ? false : "inline",
  treeShaking: true,
  // Production build (npm run build) emits main.js at the REPO ROOT — that's
  // the artifact uploaded as a GitHub Release asset (store / BRAT fetch it by
  // name). Dev/watch builds emit into the TestVault so Obsidian hot-reloads.
  outfile: isProd ? path.resolve("main.js") : path.join(TARGET_DIR, "main.js"),
  minify: isProd,
};

if (process.argv.includes("--watch")) {
  const ctx = await esbuild.context(buildOptions);
  await ctx.watch();
  console.log("Watching for changes...");
} else {
  await esbuild.build(buildOptions);
  if (isProd) {
    // Release artifacts live at the root (main.js built here; manifest.json +
    // styles.css are source files already at the root).
    console.log("Build complete. Production main.js at repo root.");
  } else {
    // Dev: deploy manifest + styles alongside main.js so Obsidian recognizes
    // the plugin in the TestVault.
    await fs.copyFile("manifest.json", path.join(TARGET_DIR, "manifest.json"));
    if (fsSync.existsSync("styles.css")) {
      await fs.copyFile("styles.css", path.join(TARGET_DIR, "styles.css"));
    }
    console.log("Build complete. Output in:", TARGET_DIR);
  }
}
