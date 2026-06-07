import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

// Vitest config for Antinomia's pure-function test suite.
//
// - environment "node": the units under test (core/utils, core/frontmatter,
//   ai/parseResponse, ai/detectModel, hunter normalizePair) are pure; no DOM.
//   Add happy-dom later only if a test needs document/window.
// - "obsidian" is aliased to a local stub so source files that import from it
//   resolve during tests (real Obsidian is only available inside the app).
// - main.ts (the plugin entry / class) is excluded — it needs the live
//   Obsidian runtime and is out of scope for unit tests.
export default defineConfig({
  resolve: {
    alias: {
      obsidian: resolve(__dirname, "tests/mocks/obsidian.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    exclude: ["node_modules/**", "backups/**", "main.ts"],
    coverage: {
      provider: "v8",
      reportsDirectory: "coverage",
      include: ["core/**/*.ts", "ai/**/*.ts"],
      exclude: ["**/*.test.ts", "tests/**", "main.ts"],
      reporter: ["text", "html"],
    },
  },
});
