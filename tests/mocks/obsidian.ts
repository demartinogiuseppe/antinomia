// Minimal "obsidian" stub for Vitest. The real module only exists inside the
// Obsidian runtime; vitest.config.ts aliases `obsidian` here so source files
// that `import { ... } from "obsidian"` resolve during unit tests.
//
// `moment` is the genuine moment.js (re-exported) so date-format helpers
// produce real output to assert against. Everything else is a lightweight stub
// — these symbols are only referenced as types or as constructor params by the
// pure functions under test, never actually exercised.

import realMoment from "moment";

export const moment = realMoment;

export class App {}
export class TFile {
  basename = "";
  path = "";
  extension = "md";
}
export class TFolder {}
export class TAbstractFile {}
export class Notice {
  constructor(public message?: unknown, public timeout?: number) {}
}
export class Modal {
  app: unknown;
  contentEl: unknown;
  constructor(app: unknown) {
    this.app = app;
  }
  open(): void {}
  close(): void {}
}
export class Setting {
  constructor(_el?: unknown) {}
  setName(): this {
    return this;
  }
  setDesc(): this {
    return this;
  }
  addButton(): this {
    return this;
  }
  addToggle(): this {
    return this;
  }
  addDropdown(): this {
    return this;
  }
  addText(): this {
    return this;
  }
}
export class ItemView {}
export class FuzzySuggestModal {}
export class SuggestModal {}
export class WorkspaceLeaf {}
export class Menu {}
export class Plugin {}
export class PluginSettingTab {}
export class MarkdownView {}

export function requestUrl(): Promise<unknown> {
  return Promise.resolve({});
}
export function normalizePath(p: string): string {
  return p;
}
export function setIcon(): void {}
export function debounce<T extends (...a: unknown[]) => unknown>(fn: T): T {
  return fn;
}
