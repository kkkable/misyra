/**
 * Shared type-aware ESLint configuration for Misyra TypeScript sources.
 *
 * Runs @typescript-eslint with real type information (explicit project
 * tsconfig) and enforces workspace package boundaries: no deep imports into
 * `@misyra/<package>/src` internals from anywhere.
 */
import tseslint from "typescript-eslint";

/** Recommended typescript-eslint rule sets, flattened into one rule map. */
const recommendedRules = /** @type {{ rules?: Record<string, unknown> }[]} */ (
  /** @type {unknown} */ (tseslint.configs.recommended)
).reduce(
  (merged, config) => ({ ...merged, ...(config.rules ?? {}) }),
  /** @type {Record<string, unknown>} */ ({}),
);

/**
 * @param {{ files?: readonly string[], project: string }} options
 *   files: globs of TypeScript sources to lint with type information.
 *   project: absolute path to the tsconfig providing type information.
 */
export function typescriptConfig({ files, project }) {
  return [
    {
      files: [...(files ?? ["**/*.ts"])],
      plugins: {
        "@typescript-eslint": tseslint.plugin,
      },
      languageOptions: {
        parser: tseslint.parser,
        parserOptions: {
          project,
          projectService: false,
        },
      },
      rules: {
        ...recommendedRules,
        // Type-aware proof rule: unhandled promises must fail loudly.
        "@typescript-eslint/no-floating-promises": "error",
        // Package boundary: internals live behind the exports map only.
        "no-restricted-imports": [
          "error",
          {
            patterns: [
              {
                group: ["@misyra/*/src", "@misyra/*/src/**"],
                message:
                  "Deep imports into package source are forbidden; use the package's public exports.",
              },
            ],
          },
        ],
        // The typed replacement owns unused-symbol reporting for .ts files.
        "no-unused-vars": "off",
        "@typescript-eslint/no-unused-vars": [
          "error",
          { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
        ],
      },
    },
  ];
}

export default typescriptConfig;
