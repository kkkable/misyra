/**
 * MTS-004 correction contract: root .env overrides must reach the Node
 * local-service configuration layer.
 *
 * compose.yaml automatically reads the repository root .env, so a developer
 * who edits .env (the workflow pnpm dev:up documents) moves the published
 * host ports. The Node tooling (dev:health and the live integration suite)
 * must resolve the same endpoints with Compose-compatible precedence:
 *
 *   explicit process.env value > root .env value > deterministic default
 *
 * Every test here uses an isolated temporary fixture (or a nonexistent path)
 * and never writes the user's real root .env. The suite stays portable: it
 * needs no Docker engine and no running services.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";
import {
  parseEnvFile,
  repoRoot,
  resolveServiceConfig,
  serviceConfig,
} from "../../scripts/dev/local-services.mjs";

const REAL_ENV_FILE = join(repoRoot, ".env");
const REAL_ENV_BEFORE = existsSync(REAL_ENV_FILE) ? readFileSync(REAL_ENV_FILE, "utf8") : null;

/** Non-default host ports proving overrides actually move the config layer. */
const OVERRIDE_PORTS = {
  postgres: 55432,
  blob: 10010,
  queue: 10011,
  table: 10012,
};

/**
 * Create a temporary .env fixture containing the override ports plus parser
 * edge cases (comments, blank lines, quoted values).
 *
 * @param {string} dir
 * @returns {string} absolute path of the fixture file
 */
function writeEnvFixture(dir) {
  const fixture = join(dir, ".env");
  writeFileSync(
    fixture,
    [
      "# Misyra override fixture (test-only, never the real root .env)",
      "",
      `MISYRA_POSTGRES_PORT=${OVERRIDE_PORTS.postgres}`,
      `MISYRA_AZURITE_BLOB_PORT=${OVERRIDE_PORTS.blob}`,
      `MISYRA_AZURITE_QUEUE_PORT=${OVERRIDE_PORTS.queue}`,
      `MISYRA_AZURITE_TABLE_PORT=${OVERRIDE_PORTS.table}`,
      'MISYRA_POSTGRES_PASSWORD="quoted local value"',
      "MISYRA_POSTGRES_DB='single-quoted-db'",
      "# trailing comment line",
      "",
    ].join("\n"),
    "utf8",
  );
  return fixture;
}

/**
 * Run the shared local-service module in a fresh Node process and print the
 * configuration resolved from a given .env fixture. This exercises the exact
 * module dev:health imports, so a non-default port in the output proves the
 * health/config layer consumes the fixture rather than defaulting.
 *
 * @param {string} envFilePath
 * @returns {Record<string, unknown>}
 */
function resolveConfigInFreshProcess(envFilePath) {
  const moduleUrl = pathToFileURL(join(repoRoot, "scripts/dev/local-services.mjs")).href;
  const script =
    `const mod = await import(${JSON.stringify(moduleUrl)});` +
    `const config = mod.resolveServiceConfig({ env: {}, envFilePath: process.argv[1] });` +
    `console.log(JSON.stringify(config));`;
  const result = spawnSync(process.execPath, ["--input-type=module", "-e", script, envFilePath], {
    encoding: "utf8",
  });
  assert.equal(
    result.status,
    0,
    `fresh-process config resolution must succeed: ${result.stdout}${result.stderr}`,
  );
  return /** @type {Record<string, unknown>} */ (JSON.parse(result.stdout.trim()));
}

test("parseEnvFile parses dotenv fixtures with comments, blanks, and quoted values", () => {
  const dir = mkdtempSync(join(tmpdir(), "mts004-env-"));
  try {
    const values = parseEnvFile(readFileSync(writeEnvFixture(dir), "utf8"));
    assert.equal(values.get("MISYRA_POSTGRES_PORT"), String(OVERRIDE_PORTS.postgres));
    assert.equal(values.get("MISYRA_POSTGRES_PASSWORD"), "quoted local value");
    assert.equal(values.get("MISYRA_POSTGRES_DB"), "single-quoted-db");
    assert.equal(values.has("trailing"), false, "comments must never become variables");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("resolveServiceConfig consumes non-default ports from a .env fixture", () => {
  const dir = mkdtempSync(join(tmpdir(), "mts004-env-"));
  try {
    const config = resolveServiceConfig({ env: {}, envFilePath: writeEnvFixture(dir) });
    assert.equal(
      config.postgresPort,
      OVERRIDE_PORTS.postgres,
      "the fixture's non-default PostgreSQL port must drive the resolved configuration",
    );
    assert.equal(
      config.azuriteBlobPort,
      OVERRIDE_PORTS.blob,
      "the fixture's non-default Azurite blob port must drive the resolved configuration",
    );
    assert.equal(config.azuriteQueuePort, OVERRIDE_PORTS.queue);
    assert.equal(config.azuriteTablePort, OVERRIDE_PORTS.table);
    assert.equal(config.postgresPassword, "quoted local value");
    assert.equal(config.postgresDb, "single-quoted-db");
    assert.equal(
      config.postgresUser,
      "misyra",
      "variables absent from the fixture must keep the deterministic default",
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("an explicit process.env value overrides the same .env fixture value", () => {
  const dir = mkdtempSync(join(tmpdir(), "mts004-env-"));
  try {
    const config = resolveServiceConfig({
      env: { MISYRA_POSTGRES_PORT: "5433", MISYRA_AZURITE_BLOB_PORT: "19999" },
      envFilePath: writeEnvFixture(dir),
    });
    assert.equal(
      config.postgresPort,
      5433,
      "explicit environment values must win over .env file values (Compose precedence)",
    );
    assert.equal(config.azuriteBlobPort, 19999);
    assert.equal(
      config.azuriteQueuePort,
      OVERRIDE_PORTS.queue,
      "fixture values without an explicit environment counterpart must still apply",
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("resolveServiceConfig keeps deterministic defaults when no .env exists", () => {
  const config = resolveServiceConfig({
    env: {},
    envFilePath: join(tmpdir(), "mts004-missing-env-file"),
  });
  assert.deepEqual(config, {
    postgresUser: "misyra",
    postgresPassword: "misyra_local_dev",
    postgresDb: "misyra",
    postgresPort: 5432,
    azuriteBlobPort: 10000,
    azuriteQueuePort: 10001,
    azuriteTablePort: 10002,
  });
});

test("the shared health/config module resolves fixture ports in a fresh process", () => {
  const dir = mkdtempSync(join(tmpdir(), "mts004-env-"));
  try {
    const config = resolveConfigInFreshProcess(writeEnvFixture(dir));
    assert.equal(
      config.postgresPort,
      OVERRIDE_PORTS.postgres,
      "the module imported by dev:health must report the fixture's non-default PostgreSQL port",
    );
    assert.equal(
      config.azuriteBlobPort,
      OVERRIDE_PORTS.blob,
      "the module imported by dev:health must report the fixture's non-default blob port",
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the module-level serviceConfig matches an explicit default resolution", () => {
  const config = resolveServiceConfig({
    env: {},
    envFilePath: join(tmpdir(), "mts004-missing-env-file"),
  });
  assert.deepEqual(serviceConfig, config, "serviceConfig must be a resolveServiceConfig product");
});

test("the suite never mutates the user's real root .env", () => {
  const after = existsSync(REAL_ENV_FILE) ? readFileSync(REAL_ENV_FILE, "utf8") : null;
  assert.equal(
    after,
    REAL_ENV_BEFORE,
    "the real repository root .env must be byte-identical after this suite runs",
  );
});
