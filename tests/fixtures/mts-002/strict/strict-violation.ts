/**
 * Intentional strict-mode violation fixture for MTS-002.
 *
 * This file must fail compilation under the shared strict configuration with
 * diagnostic TS7006 (parameter implicitly has an 'any' type). It is excluded
 * from the regular typecheck program and exercised only by the contract test
 * tests/config/workspace-strictness.test.mjs.
 */
export function describeValue(value) {
  return `value: ${value}`;
}
