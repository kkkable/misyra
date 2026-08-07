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
  {
    // Expected-failure fixtures are globally ignored for repository-wide
    // lint runs; contract tests lint them individually with --no-ignore so
    // the exact expected diagnostics still execute.
    ignores: ["tests/fixtures/**"],
  },
];
