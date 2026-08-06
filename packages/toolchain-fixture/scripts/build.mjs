/**
 * Build probe for the MTS-001 toolchain fixture.
 *
 * This script exists only to prove that Turborepo can schedule a workspace
 * `build` task end to end. It is not product code and produces no artifacts.
 */
process.stdout.write("@misyra/toolchain-fixture build ok\n");
