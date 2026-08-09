/**
 * MTS-004 live integration evidence (run through pnpm test:services).
 *
 * Requires the misyra-local Compose project to be running (pnpm dev:up).
 * Exercises the three required TDD evidence streams: Compose health state,
 * PostgreSQL connectivity, and the Azurite container, plus the full-mode
 * health script and deterministic failure behavior when services are down.
 *
 * Endpoints resolve through the shared local-service configuration, so the
 * suite agrees with Docker Compose about root .env overrides (explicit
 * process.env > .env file > deterministic default).
 */
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { test } from "node:test";
import { BlobServiceClient, StorageSharedKeyCredential } from "@azure/storage-blob";
import { serviceConfig } from "../../scripts/dev/local-services.mjs";
import { repoRoot } from "../../tests/toolchain/helpers.mjs";

const AZURITE_ACCOUNT = "devstoreaccount1";
// Well-known public development key documented by Microsoft for the local
// storage emulator only. It is not a secret and never works against Azure.
const AZURITE_KEY =
  "Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==";
const PROBE_CONTAINER = "mts-004-probe";
const POSTGRES_PORT = serviceConfig.postgresPort;
const BLOB_PORT = serviceConfig.azuriteBlobPort;
const POSTGRES_URL =
  process.env.MISYRA_POSTGRES_URL ??
  `postgres://${serviceConfig.postgresUser}:${serviceConfig.postgresPassword}@localhost:${POSTGRES_PORT}/${serviceConfig.postgresDb}`;

/**
 * Resolve the Docker CLI for this host. Docker Desktop installs may not be
 * on PATH in every session, so MISYRA_DOCKER_BIN overrides the lookup.
 *
 * @returns {string}
 */
function dockerCli() {
  return process.env.MISYRA_DOCKER_BIN ?? "docker";
}

/**
 * Run a docker compose command and return trimmed stdout.
 *
 * @param {readonly string[]} args
 * @returns {string}
 */
function compose(args) {
  return execFileSync(dockerCli(), ["compose", ...args], {
    cwd: repoRoot,
    encoding: "utf8",
  }).trim();
}

/**
 * Container states reported by docker compose ps --format json.
 *
 * @returns {Array<{ Service: string; State: string; Health: string }>}
 */
function composeServiceStates() {
  const raw = compose(["ps", "--format", "json"]);
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map(
      (line) =>
        /** @type {{ Service: string; State: string; Health: string }} */ (JSON.parse(line)),
    );
}

/**
 * Authenticated Blob service client for the local Azurite container.
 *
 * @returns {BlobServiceClient}
 */
function blobServiceClient() {
  const credential = new StorageSharedKeyCredential(AZURITE_ACCOUNT, AZURITE_KEY);
  return new BlobServiceClient(`http://127.0.0.1:${BLOB_PORT}/${AZURITE_ACCOUNT}`, credential);
}

/**
 * Names of all Blob containers currently stored by Azurite.
 *
 * @param {BlobServiceClient} client
 * @returns {Promise<string[]>}
 */
async function containerNames(client) {
  const names = [];
  for await (const container of client.listContainers()) {
    names.push(container.name);
  }
  return names;
}

test("Compose reports every misyra-local service running and healthy", () => {
  const services = new Map(composeServiceStates().map((entry) => [entry.Service, entry]));
  for (const name of ["postgres", "azurite"]) {
    const service = services.get(name);
    assert.ok(service, `compose project misyra-local must define service ${name}`);
    assert.equal(service.State, "running", `${name} must be running (is pnpm dev:up done?)`);
    assert.equal(service.Health, "healthy", `${name} must pass its Compose healthcheck`);
  }
});

test("PostgreSQL 18 accepts connections and read/write queries", async () => {
  const { default: pg } = await import("pg");
  const client = new pg.Client({ connectionString: POSTGRES_URL });
  await client.connect();
  try {
    const version = await client.query("SELECT version()");
    assert.match(
      String(version.rows[0].version),
      /PostgreSQL 18\./,
      "the local database must be the approved PostgreSQL major version 18",
    );
    await client.query(
      "CREATE TABLE IF NOT EXISTS mts_004_probe (id integer PRIMARY KEY, note text NOT NULL)",
    );
    await client.query(
      "INSERT INTO mts_004_probe (id, note) VALUES (1, 'mts-004') ON CONFLICT (id) DO UPDATE SET note = EXCLUDED.note",
    );
    const probe = await client.query("SELECT note FROM mts_004_probe WHERE id = 1");
    assert.equal(probe.rows[0].note, "mts-004");
    await client.query("DROP TABLE mts_004_probe");
  } finally {
    await client.end();
  }
});

test("Azurite serves authenticated Blob container lifecycle operations", async () => {
  const client = blobServiceClient();

  const namesBefore = await containerNames(client);
  assert.ok(
    !namesBefore.includes(PROBE_CONTAINER),
    "probe container must start absent from Azurite storage",
  );

  await client.createContainer(PROBE_CONTAINER);
  const namesAfterCreate = await containerNames(client);
  assert.ok(
    namesAfterCreate.includes(PROBE_CONTAINER),
    "created container must appear in the authenticated listing",
  );

  await client.deleteContainer(PROBE_CONTAINER);
  const namesAfterDelete = await containerNames(client);
  assert.ok(
    !namesAfterDelete.includes(PROBE_CONTAINER),
    "deleted container must disappear from the authenticated listing",
  );
});

test("dev:health succeeds in full mode while the local services are up", () => {
  const result = spawnSync(process.execPath, ["scripts/dev/health.mjs", "--full"], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  assert.equal(
    result.status,
    0,
    `full-mode health check must pass while services are up: ${result.stdout}${result.stderr}`,
  );
  assert.match(result.stdout, /postgres.+healthy/is, "health output must report postgres state");
  assert.match(result.stdout, /azurite.+healthy/is, "health output must report azurite state");
});

test("dev:health fails clearly when the dependency containers are stopped", () => {
  compose(["stop"]);
  try {
    const result = spawnSync(process.execPath, ["scripts/dev/health.mjs", "--full"], {
      cwd: repoRoot,
      encoding: "utf8",
    });
    assert.notEqual(result.status, 0, "health check must fail while dependencies are down");
    assert.match(
      `${result.stdout}${result.stderr}`,
      /unavailable|not healthy|unreachable/i,
      "health failure must name the unavailable dependency",
    );
  } finally {
    compose(["start"]);
    const deadline = Date.now() + 120_000;
    while (Date.now() < deadline) {
      const healthy = composeServiceStates().every(
        (entry) => entry.State === "running" && entry.Health === "healthy",
      );
      if (healthy) break;
      execFileSync(process.execPath, ["-e", "setTimeout(() => {}, 2000)"]);
    }
  }
});
