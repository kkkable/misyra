/**
 * Shared Node built-in test runner configuration for Misyra.
 *
 * Misyra keeps the Node built-in test runner (no Jest/Vitest). This module
 * centralizes the approved invocation settings so every workspace uses the
 * same runner behavior.
 */
module.exports = {
  /** Test runner: the Node built-in runner, invoked through `node --test`. */
  testRunner: "node --test",
  /** Portable glob patterns used for repository-wide test discovery. */
  testGlobs: ["tests/**/*.test.mjs"],
};
