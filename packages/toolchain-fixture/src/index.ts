/**
 * Public entry point of the MTS-002 toolchain fixture.
 *
 * This package is a non-product consumer of the shared strict TypeScript
 * configuration: it compiles only because it extends
 * @misyra/typescript-config/strict-base.json, and it proves that public
 * package imports through declared exports work at runtime.
 */
import testConfig from "@misyra/test-config";

export const toolchainFixture = {
  name: "@misyra/toolchain-fixture",
  testRunner: testConfig.testRunner,
} as const;
