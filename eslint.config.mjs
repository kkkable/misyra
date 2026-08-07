import { baseConfig } from "@misyra/eslint-config/base";
import { typescriptConfig } from "@misyra/eslint-config/typescript";
import { join } from "node:path";

export default [
  ...baseConfig,
  ...typescriptConfig({
    files: ["packages/*/src/**/*.ts", "tests/fixtures/mts-002/**/*.ts"],
    // Type information comes from the MTS-002 fixture lint project, which
    // includes both the expected-failure fixtures and workspace src.
    project: join(import.meta.dirname, "tests", "fixtures", "mts-002", "tsconfig.json"),
  }),
  ...typescriptConfig({
    files: ["apps/api/src/**/*.ts"],
    // The API shell is its own lint project; it ships no expected-failure
    // fixtures, so its workspace tsconfig provides the type information.
    project: join(import.meta.dirname, "apps", "api", "tsconfig.json"),
  }),
  ...typescriptConfig({
    files: ["apps/worker/src/**/*.ts"],
    project: join(import.meta.dirname, "apps", "worker", "tsconfig.json"),
  }),
  ...typescriptConfig({
    files: [
      "apps/mobile/app/**/*.tsx",
      "apps/mobile/src/**/*.ts",
      "apps/mobile/src/**/*.tsx",
      "apps/mobile/app.config.ts",
    ],
    project: join(import.meta.dirname, "apps", "mobile", "tsconfig.json"),
  }),
  {
    // Expected-failure fixtures are globally ignored for repository-wide
    // lint runs; contract tests lint them individually with --no-ignore so
    // the exact expected diagnostics still execute.
    ignores: ["tests/fixtures/**"],
  },
];
