/**
 * Intentional type-aware lint violation fixture for MTS-002.
 *
 * This file is syntactically valid JavaScript-compatible TypeScript and would
 * pass syntax-only linting, but it violates the semantic, type-aware rule
 * @typescript-eslint/no-floating-promises. It is excluded from the regular
 * lint run and exercised only by tests/config/fixtures.test.mjs.
 */
export function startWork(): Promise<string> {
  return Promise.resolve("done");
}

startWork();
