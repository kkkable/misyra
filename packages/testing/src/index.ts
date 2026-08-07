/**
 * Public entry for the Misyra testing shell (MTS-003).
 *
 * This package is the future home of reusable builders, deterministic
 * provider fakes, and clock helpers (technical specification sections
 * 4.5 and 27). MTS-003 only establishes the package boundary; no live
 * provider or infrastructure test tooling belongs here yet.
 */

/** Declared boundary identity of the testing package shell. */
export const testingPackage = {
  name: "@misyra/testing",
  boundary: "builders-fakes-and-deterministic-clocks",
} as const;
