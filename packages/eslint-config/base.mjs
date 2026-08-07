/**
 * Shared ESLint base configuration for Misyra toolchain code.
 *
 * Covers the Node/MJS sources that run the repository toolchain (root
 * scripts, contract tests, workspace scripts) so every workspace lints the
 * same way without repeating this setup.
 */
import js from "@eslint/js";
import globals from "globals";

export const baseConfig = [
  {
    ignores: ["**/node_modules/**", "**/dist/**", "**/coverage/**", "**/.expo/**", ".turbo/**"],
  },
  js.configs.recommended,
  {
    files: ["**/*.mjs"],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: "module",
      globals: {
        ...globals.node,
      },
    },
    rules: {
      "no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
  {
    files: ["packages/**/*.cjs", "packages/**/*.js"],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: "commonjs",
      globals: {
        ...globals.node,
      },
    },
    rules: {
      "no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
];

export default baseConfig;
