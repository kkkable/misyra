/**
 * Compile-time proof that public package imports resolve through declared
 * exports maps. A deep import (for example `@misyra/test-config/src/...`)
 * would fail TypeScript resolution and ESLint boundary rules instead.
 */
import testConfig from "@misyra/test-config";

export const publicImportProof = `shared test runner: ${testConfig.testRunner}`;
