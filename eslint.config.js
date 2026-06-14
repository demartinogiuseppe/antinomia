// Flat ESLint config for the Obsidian Community store rule set.
// Wraps eslint-plugin-obsidianmd's recommended config (which bundles the
// typescript-eslint typed ruleset + Obsidian-specific rules) and turns on the
// TypeScript project service so the type-aware rules (no-floating-promises,
// no-misused-promises, await-thenable, no-unsafe-*) actually run.
import obsidianmd from "eslint-plugin-obsidianmd";

export default [
  {
    ignores: [
      "node_modules/**",
      "backups/**",
      "tests/**",
      "docs/**",
      "releases/**",
      "release-temp/**",
      "TestVault/**",
      "TestVaultDisordinato/**",
      "scripts/**",
      "main.js",
      "esbuild.config.mjs",
      "eslint.config.js",
      "eslint.async.config.js",
      "**/*.ps1",
      // JSON manifest checks are ERROR-level (already handled) and the online
      // scorecard re-validates them; the local run here is scoped to .ts so the
      // type-aware rules don't choke on package.json / manifest.json.
      "**/*.json",
    ],
  },
  ...obsidianmd.configs.recommended,
  {
    files: ["**/*.ts"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
];
