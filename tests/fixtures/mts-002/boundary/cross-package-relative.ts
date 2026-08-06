/**
 * Intentional package-boundary violation fixture for MTS-002 (relative
 * traversal across a workspace boundary).
 *
 * Resolved from this file, the relative specifier crosses out of the
 * packages/toolchain-fixture workspace into a sibling workspace, which the
 * boundary scanner in tests/config/fixtures.test.mjs must reject.
 */
import { something } from "../../../typescript-config/src/internal";

export const stolen = something;
