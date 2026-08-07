/**
 * Intentional package-boundary violation fixture for MTS-002 (relative
 * traversal across a workspace boundary).
 *
 * Lives under a non-source fixture directory inside the owning workspace
 * packages/toolchain-fixture so production source discovery (tsconfig
 * includes, typed lint projects, build emit) never ingests the intentional
 * violation. Resolved from this file, the relative specifier crosses into
 * the real sibling workspace packages/test-config, which the boundary
 * scanner in tests/config/fixtures.test.mjs must reject.
 */
import testConfig from "../../../test-config/index.js";

export const stolen = testConfig;
