import js from "@eslint/js";
import globals from "globals";

export default [
  {
    ignores: ["**/node_modules/**", "**/dist/**", "**/coverage/**", ".turbo/**"],
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
];
