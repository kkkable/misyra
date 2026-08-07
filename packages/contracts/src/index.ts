/**
 * Public entry for the Misyra contracts shell (MTS-003).
 *
 * This package is the future home of the shared API and event schemas
 * (technical specification section 17 and MTS-023). MTS-003 only
 * establishes the package boundary so API request/response bodies have a
 * dedicated home later.
 */

/** Declared boundary identity of the contracts package shell. */
export const contractsPackage = {
  name: "@misyra/contracts",
  boundary: "api-and-event-schemas",
} as const;
