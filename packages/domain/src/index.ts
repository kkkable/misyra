/**
 * Public entry for the Misyra domain shell (MTS-003).
 *
 * This package is the future home of the pure domain model (technical
 * specification sections 11 and 12). MTS-003 only establishes the package
 * boundary: no framework, database, or provider imports may ever appear
 * here, and the automated architecture test in tests/mts-003 enforces it.
 */

/** Declared boundary identity of the domain package shell. */
export const domainPackage = {
  name: "@misyra/domain",
  boundary: "pure-typescript",
} as const;
