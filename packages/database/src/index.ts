/**
 * Public entry for the Misyra database shell (MTS-003).
 *
 * This package is the future home of the Drizzle schema and migrations
 * (technical specification section 13 and MTS-022). MTS-003 only
 * establishes the package boundary; no schema or migration belongs here
 * yet.
 */

/** Declared boundary identity of the database package shell. */
export const databasePackage = {
  name: "@misyra/database",
  boundary: "schema-and-migrations",
} as const;
