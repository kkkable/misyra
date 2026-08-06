/**
 * Shared Node built-in test runner configuration for Misyra.
 */
export interface MisyraTestConfig {
  /** Test runner identifier: the Node built-in runner. */
  readonly testRunner: string;
  /** Portable glob patterns used for repository-wide test discovery. */
  readonly testGlobs: readonly string[];
}

declare const testConfig: MisyraTestConfig;
export default testConfig;
