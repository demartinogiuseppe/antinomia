// Async-only ESLint config used as a CI regression guard. The full
// eslint.config.js (obsidianmd recommended) still reports many out-of-scope
// problems, so it can't gate CI yet; this scoped config enforces just the
// async-hygiene rules that v1.7.3 brought to zero.
import tseslint from "typescript-eslint";

export default tseslint.config(
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
      "**/*.json",
    ],
  },
  {
    files: ["**/*.ts"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: { "@typescript-eslint": tseslint.plugin },
    rules: {
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/await-thenable": "error",
    },
  }
);
