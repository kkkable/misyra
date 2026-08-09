/**
 * MTS-005 correction contract: committed MTS-005 tests must never open,
 * read, write, truncate, or delete the developer's real repository root
 * .env (the file Docker Compose and the API tooling read at the repository
 * root). Reading it couples test results to developer-local state and
 * pulls potentially sensitive values into the test process.
 *
 * This suite is the enforcement point: it scans the committed MTS-005 test
 * sources and fails if any of them references the real root .env through
 * the historical REAL_ENV_FILE binding or through a filesystem opener
 * invoked with a `join(repoRoot, ".env")`-style path expression. The
 * path-equality contract (DEFAULT_ENV_FILE_PATH === join(repoRoot, ".env"))
 * is a pure string comparison and does not open the file, so it is NOT a
 * violation.
 *
 * The scanner deliberately reads only the repository's own committed test
 * sources under tests/mts-005 — never the root .env itself.
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { repoRoot } from "../toolchain/helpers.mjs";

/** Directory holding the committed MTS-005 test sources. */
const MTS_TEST_DIR = join(repoRoot, "tests", "mts-005");

/** This enforcement file scans the other committed tests, never itself. */
const SELF_NAME = "root-env-isolation.test.mjs";

/** fs entry points that can open or read the real root .env. */
const FS_OPENERS = [
  "readFileSync",
  "readFile",
  "existsSync",
  "openSync",
  "accessSync",
  "statSync",
  "lstatSync",
  "realpathSync",
  "watchFile",
  "unlinkSync",
  "rmSync",
  "writeFileSync",
  "appendFileSync",
  "createReadStream",
  "createWriteStream",
];

/** The historical binding used to point at the real root .env. */
const realBinding = /\bREAL_ENV_FILE\b/;

/** Any fs opener called with a repoRoot-root .env path expression. */
const realPathOpenCall = new RegExp(
  `(?:${FS_OPENERS.join("|")})\\([^)]*\\b(?:join|resolve)\\s*\\(\\s*repoRoot\\s*,\\s*["'].env["']\\s*\\)`,
  "g",
);

test("committed MTS-005 tests never open or read the real repository root .env", () => {
  const sources = readdirSync(MTS_TEST_DIR, { withFileTypes: true })
    .filter(
      (entry) => entry.isFile() && entry.name.endsWith(".test.mjs") && entry.name !== SELF_NAME,
    )
    .map((entry) => ({
      name: entry.name,
      text: readFileSync(join(MTS_TEST_DIR, entry.name), "utf8"),
    }));

  assert.ok(sources.length > 0, "expected at least one committed MTS-005 test source to scan");

  const violations = [];
  for (const { name, text } of sources) {
    const lines = text.split("\n");
    /**
     * @param {RegExp} pattern
     * @returns {string[]}
     */
    const flagged = (pattern) => {
      const hits = [];
      let index = 0;
      for (const line of lines) {
        index += 1;
        if (pattern.test(line)) {
          hits.push(`${name}:${index}: ${line.trim()}`);
        }
      }
      return hits;
    };
    for (const hit of [...flagged(realBinding), ...flagged(realPathOpenCall)]) {
      violations.push(hit);
    }
  }

  assert.deepEqual(
    violations,
    [],
    `committed MTS-005 tests must not open or read the real repository root .env; found:\n${violations.join(
      "\n",
    )}`,
  );
});
