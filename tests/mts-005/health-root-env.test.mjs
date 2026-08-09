/**
 * MTS-005 correction contract: API readiness must honor the MTS-004 root
 * .env local-service overrides.
 *
 * compose.yaml automatically reads the repository root .env, and the MTS-004
 * Node tooling resolves local services with Compose-compatible precedence:
 *
 *   non-empty explicit environment > non-empty root .env > deterministic Compose fallback
 *
 * The API /health/ready probe must resolve the same effective local ports as
 * the MTS-004 configuration contract, otherwise a supported setup that moves
 * PostgreSQL/Azurite ports in the root .env leaves a normally-launched API
 * probing the old default ports and reporting 503.
 *
 * Every test uses an isolated temporary fixture .env (or an explicit
 * nonexistent path) and never reads, writes, truncates, or deletes the
 * developer's real root .env. The suite needs no Docker engine and no
 * running services, and its pass/fail result never depends on the values a
 * developer keeps in the real root .env.
 */
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";
import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolveServiceConfig } from "../../scripts/dev/local-services.mjs";
import { repoRoot } from "../toolchain/helpers.mjs";

const REAL_ENV_FILE = join(repoRoot, ".env");
const REAL_ENV_BEFORE = existsSync(REAL_ENV_FILE) ? readFileSync(REAL_ENV_FILE, "utf8") : null;

/** Non-default host ports proving root-.env overrides move the API config. */
const OVERRIDE_PORTS = {
  postgres: 55432,
  blob: 10010,
};

/**
 * Import the built api workspace entry, building it when dist output is
 * missing. The public entry re-exports the health resolvers under test.
 *
 * @returns {Promise<any>} the @misyra/api public entry module
 */
async function loadBuiltApi() {
  const distEntry = join(repoRoot, "apps/api", "dist", "index.js");
  if (!existsSync(distEntry)) {
    execFileSync("pnpm", ["--filter", "@misyra/api", "run", "build"], {
      cwd: repoRoot,
      encoding: "utf8",
      shell: process.platform === "win32",
      stdio: "pipe",
    });
  }
  assert.ok(existsSync(distEntry), "apps/api produced no dist/index.js after build");
  return import(pathToFileURL(distEntry).href);
}

/**
 * Create a temporary .env fixture containing the override ports.
 *
 * @param {string} dir
 * @param {Array<[string, string]>} entries KEY=VALUE lines in fixture order
 * @returns {string} absolute path of the fixture file
 */
function writeEnvFixture(dir, entries, name = ".env") {
  const fixture = join(dir, name);
  writeFileSync(
    fixture,
    [
      "# Misyra override fixture (test-only, never the real root .env)",
      ...entries.map(([key, value]) => `${key}=${value}`),
      "",
    ].join("\n"),
    "utf8",
  );
  return fixture;
}

/** Every dependency available (deterministic fake probe). */
const allUp = async () => [
  { name: "postgres", ok: true },
  { name: "azurite", ok: true },
];

test("the API resolver selects fixture root-.env ports when explicit environment values are absent", async () => {
  const api = await loadBuiltApi();
  const dir = mkdtempSync(join(tmpdir(), "mts005-api-env-"));
  try {
    const fixture = writeEnvFixture(dir, [
      ["MISYRA_POSTGRES_PORT", String(OVERRIDE_PORTS.postgres)],
      ["MISYRA_AZURITE_BLOB_PORT", String(OVERRIDE_PORTS.blob)],
    ]);
    const config = api.resolveDependencyConfig({}, { envFilePath: fixture });
    assert.equal(
      config.postgresPort,
      OVERRIDE_PORTS.postgres,
      "a fixture .env MISYRA_POSTGRES_PORT must drive the API config when explicit environment is empty",
    );
    assert.equal(
      config.azuriteBlobPort,
      OVERRIDE_PORTS.blob,
      "a fixture .env MISYRA_AZURITE_BLOB_PORT must drive the API config when explicit environment is empty",
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("an explicit API environment value still wins over a non-empty fixture .env value", async () => {
  const api = await loadBuiltApi();
  const dir = mkdtempSync(join(tmpdir(), "mts005-api-env-"));
  try {
    const fixture = writeEnvFixture(dir, [
      ["MISYRA_POSTGRES_PORT", String(OVERRIDE_PORTS.postgres)],
      ["MISYRA_AZURITE_BLOB_PORT", String(OVERRIDE_PORTS.blob)],
    ]);
    const config = api.resolveDependencyConfig(
      { MISYRA_POSTGRES_PORT: "54444", MISYRA_AZURITE_BLOB_PORT: "10099" },
      { envFilePath: fixture },
    );
    assert.equal(
      config.postgresPort,
      54444,
      "explicit non-empty env must win over the .env fixture",
    );
    assert.equal(
      config.azuriteBlobPort,
      10099,
      "explicit non-empty env must win over the .env fixture",
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("an empty explicit port value falls through to the non-empty fixture .env value", async () => {
  const api = await loadBuiltApi();
  const dir = mkdtempSync(join(tmpdir(), "mts005-api-env-"));
  try {
    const fixture = writeEnvFixture(dir, [
      ["MISYRA_POSTGRES_PORT", String(OVERRIDE_PORTS.postgres)],
      ["MISYRA_AZURITE_BLOB_PORT", String(OVERRIDE_PORTS.blob)],
    ]);
    const config = api.resolveDependencyConfig(
      { MISYRA_POSTGRES_PORT: "", MISYRA_AZURITE_BLOB_PORT: "" },
      { envFilePath: fixture },
    );
    assert.equal(
      config.postgresPort,
      OVERRIDE_PORTS.postgres,
      "an empty explicit MISYRA_POSTGRES_PORT must fall through to the non-empty fixture .env port (Compose :-), not resolve to 0",
    );
    assert.equal(
      config.azuriteBlobPort,
      OVERRIDE_PORTS.blob,
      "an empty explicit MISYRA_AZURITE_BLOB_PORT must fall through to the non-empty fixture .env port (Compose :-), not resolve to 0",
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("empty values in both explicit environment and fixture .env resolve to the deterministic Compose fallback", async () => {
  const api = await loadBuiltApi();
  const dir = mkdtempSync(join(tmpdir(), "mts005-api-env-"));
  try {
    const fixture = writeEnvFixture(dir, [
      ["MISYRA_POSTGRES_PORT", ""],
      ["MISYRA_AZURITE_BLOB_PORT", ""],
    ]);
    const config = api.resolveDependencyConfig(
      { MISYRA_POSTGRES_PORT: "", MISYRA_AZURITE_BLOB_PORT: "" },
      { envFilePath: fixture },
    );
    assert.equal(
      config.postgresPort,
      5432,
      "empty env and empty .env must use the Compose fallback 5432, not 0",
    );
    assert.equal(
      config.azuriteBlobPort,
      10000,
      "empty env and empty .env must use the Compose fallback 10000, not 0",
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the API resolver and the MTS-004 local-services resolver agree on identical inputs", async () => {
  const api = await loadBuiltApi();
  const dir = mkdtempSync(join(tmpdir(), "mts005-api-env-"));
  try {
    const fixtures = {
      nonDefault: writeEnvFixture(
        dir,
        [
          ["MISYRA_POSTGRES_PORT", String(OVERRIDE_PORTS.postgres)],
          ["MISYRA_AZURITE_BLOB_PORT", String(OVERRIDE_PORTS.blob)],
        ],
        "nondefault.env",
      ),
      emptyValues: writeEnvFixture(
        dir,
        [
          ["MISYRA_POSTGRES_PORT", ""],
          ["MISYRA_AZURITE_BLOB_PORT", ""],
        ],
        "empty.env",
      ),
      missing: join(dir, "does-not-exist.env"),
    };
    const cases = [
      { env: {}, file: fixtures.nonDefault },
      {
        env: { MISYRA_POSTGRES_PORT: "54444", MISYRA_AZURITE_BLOB_PORT: "10099" },
        file: fixtures.nonDefault,
      },
      {
        env: { MISYRA_POSTGRES_PORT: "", MISYRA_AZURITE_BLOB_PORT: "" },
        file: fixtures.nonDefault,
      },
      {
        env: { MISYRA_POSTGRES_PORT: "", MISYRA_AZURITE_BLOB_PORT: "" },
        file: fixtures.emptyValues,
      },
      { env: {}, file: fixtures.missing },
    ];
    for (const entry of cases) {
      const apiCfg = api.resolveDependencyConfig(entry.env, { envFilePath: entry.file });
      const svcCfg = resolveServiceConfig({ env: entry.env, envFilePath: entry.file });
      assert.deepEqual(
        { postgresPort: apiCfg.postgresPort, azuriteBlobPort: apiCfg.azuriteBlobPort },
        { postgresPort: svcCfg.postgresPort, azuriteBlobPort: svcCfg.azuriteBlobPort },
        `parity mismatch for env=${JSON.stringify(entry.env)} file=${entry.file}`,
      );
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the API's default env file path is the repository root .env (compose semantics)", async () => {
  const api = await loadBuiltApi();
  assert.equal(
    api.DEFAULT_ENV_FILE_PATH,
    join(repoRoot, ".env"),
    "the default env source must be the repository root .env that Docker Compose reads",
  );
});

test("a normally wired readiness probe receives the same effective local ports as the MTS-004 contract", async () => {
  const api = await loadBuiltApi();
  const dir = mkdtempSync(join(tmpdir(), "mts005-api-env-"));
  try {
    const fixture = writeEnvFixture(dir, [
      ["MISYRA_POSTGRES_PORT", String(OVERRIDE_PORTS.postgres)],
      ["MISYRA_AZURITE_BLOB_PORT", String(OVERRIDE_PORTS.blob)],
    ]);
    /** @type {Array<{ postgresPort: number; azuriteBlobPort: number }>} */
    const captured = [];
    /** @type {import("node:net").Socket} @returns {Promise<Array<{ name: string; ok: boolean }>>} */
    const recordingProbe = async (config) => {
      captured.push(config);
      return allUp();
    };
    const app = await api.buildApp({ env: {}, envFilePath: fixture, healthProbe: recordingProbe });
    try {
      await app.ready();
      const response = await app.inject({ method: "GET", url: "/health/ready" });
      assert.equal(
        response.statusCode,
        200,
        "readiness must report 200 when dependencies are reachable",
      );
      assert.equal(response.body, '{"status":"ok"}');
      assert.equal(captured.length, 1, "the probe must be consulted exactly once");
      assert.deepEqual(
        captured[0],
        { postgresPort: OVERRIDE_PORTS.postgres, azuriteBlobPort: OVERRIDE_PORTS.blob },
        "the connected probe must receive the fixture .env ports",
      );
    } finally {
      await app.close();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the suite never mutates the user's real root .env", () => {
  const after = existsSync(REAL_ENV_FILE) ? readFileSync(REAL_ENV_FILE, "utf8") : null;
  assert.equal(
    after,
    REAL_ENV_BEFORE,
    "the real repository root .env must be byte-identical after this suite runs",
  );
});
