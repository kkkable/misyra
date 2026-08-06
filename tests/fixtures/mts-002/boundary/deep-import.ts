/**
 * Intentional package-boundary violation fixture for MTS-002 (deep import).
 *
 * Imports a package-private source path instead of a declared public export.
 * ESLint must reject this with no-restricted-imports. Exercised only by
 * tests/config/fixtures.test.mjs.
 */
import { marker } from "@misyra/test-config/src/internal";

export const stolen = marker;
