// Minimal in-memory App/Vault/adapter mock for migration integration tests.
// Loads cloned file contents into memory — never touches disk — and implements
// just the surface flows/migration.ts uses: getMarkdownFiles, read, process,
// modify, create, getAbstractFileByPath, adapter (mkdir/exists/write/read/list),
// metadataCache.getFileCache, fileManager.processFrontMatter.

import * as yaml from "js-yaml";
import { TFile } from "obsidian";

function parentOf(path: string): string {
  const i = path.lastIndexOf("/");
  return i === -1 ? "" : path.slice(0, i);
}

function readFm(content: string): Record<string, unknown> | undefined {
  const m = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return undefined;
  try {
    const parsed = yaml.load(m[1]);
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

export function makeMockApp(initial: Record<string, string>) {
  // Vault note contents.
  const contents = new Map<string, string>(Object.entries(initial));
  const fileObjs = new Map<string, TFile>();
  for (const path of contents.keys()) {
    const f = new TFile();
    f.path = path;
    f.basename = path.slice(path.lastIndexOf("/") + 1).replace(/\.md$/, "");
    f.extension = "md";
    fileObjs.set(path, f);
  }

  // Adapter-level (raw fs) state — backup folders/files live here.
  const adapterFiles = new Map<string, string>();
  const adapterFolders = new Set<string>();

  const adapter = {
    async mkdir(path: string) {
      adapterFolders.add(path);
    },
    async exists(path: string) {
      return adapterFiles.has(path) || adapterFolders.has(path);
    },
    async write(path: string, data: string) {
      adapterFiles.set(path, data);
    },
    async read(path: string) {
      return adapterFiles.get(path) ?? "";
    },
    async list(dir: string) {
      const norm = dir.replace(/\/$/, "");
      const files = [...adapterFiles.keys()].filter((p) => parentOf(p) === norm);
      const folders = [...adapterFolders].filter((p) => parentOf(p) === norm);
      return { files, folders };
    },
  };

  const vault = {
    getMarkdownFiles(): TFile[] {
      return [...fileObjs.values()];
    },
    async read(file: TFile): Promise<string> {
      return contents.get(file.path) ?? "";
    },
    async process(file: TFile, fn: (c: string) => string): Promise<string> {
      const next = fn(contents.get(file.path) ?? "");
      contents.set(file.path, next);
      return next;
    },
    async modify(file: TFile, data: string): Promise<void> {
      contents.set(file.path, data);
    },
    async create(path: string, data: string): Promise<TFile> {
      contents.set(path, data);
      const f = new TFile();
      f.path = path;
      f.basename = path.slice(path.lastIndexOf("/") + 1).replace(/\.md$/, "");
      f.extension = "md";
      fileObjs.set(path, f);
      return f;
    },
    getAbstractFileByPath(path: string): TFile | null {
      return fileObjs.get(path) ?? null;
    },
    adapter,
  };

  const metadataCache = {
    getFileCache(file: TFile) {
      const fm = readFm(contents.get(file.path) ?? "");
      return fm ? { frontmatter: fm } : {};
    },
  };

  const fileManager = {
    async processFrontMatter(
      file: TFile,
      fn: (fm: Record<string, unknown>) => void
    ): Promise<void> {
      const content = contents.get(file.path) ?? "";
      const m = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
      const fm: Record<string, unknown> = m
        ? ((yaml.load(m[1]) as Record<string, unknown>) ?? {})
        : {};
      const body = m ? content.slice(m[0].length) : content;
      fn(fm);
      const dumped = yaml.dump(fm).trimEnd();
      contents.set(file.path, `---\n${dumped}\n---\n${body}`);
    },
  };

  return {
    app: { vault, metadataCache, fileManager } as never,
    // test helpers
    getContent: (path: string) => contents.get(path) ?? "",
    adapterFolders,
    adapterFiles,
  };
}
