import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "node:test";

import { readText, repoRoot } from "../toolchain/helpers.mjs";

const nativeEntryPath = join(repoRoot, "tests", "mts-012", "image-harness", "native-entry.tsx");

test("the android capture entry seeds safe-area metrics before the first authoritative frame", () => {
  const source = readText(nativeEntryPath);

  assert.match(
    source,
    /SafeAreaProvider\s*,\s*initialWindowMetrics|initialWindowMetrics\s*,\s*SafeAreaProvider/,
    "the android capture entry must import initialWindowMetrics from react-native-safe-area-context",
  );
  assert.match(
    source,
    /<SafeAreaProvider\s+initialMetrics=\{initialWindowMetrics\}>/,
    "the harness provider must seed the real native initial window metrics so SafeAreaView cannot repaint the whole capture after /ready",
  );
});
