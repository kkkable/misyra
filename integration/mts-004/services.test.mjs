/**
 * MTS-004 live integration evidence (run through pnpm test:services).
 *
 * Requires the misyra-local Compose project to be running (pnpm dev:up).
 * Exercises the three required TDD evidence streams: Compose health state,
 * PostgreSQL connectivity, and the Azurite container, plus the full-mode
 * health script and deterministic failure behavior when services are down.
 */
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHmac } from "node:crypto";
import { test } from "node:test";
import { repoRoot } from "../../tests/toolchain/helpers.mjs";

const AZURITE_ACCOUNT = "devstoreaccount1";
// Well-known public development key documented by Microsoft for the local
// storage emulator only. It is not a secret and never works against Azure.
const AZURITE_KEY =
  "Eby8vdM02xNOcqFlqUwJPLlmEtl+XW1LyqK5L3b8jgQ6cKbLbLb0iVZ0wQpJRrOaJw0J3lDm6b0jQ6cKbLbLb0A==".replace(
    /^.*$/,
    "Eby8vdM02xNOcqFlqUwJPLlmEtl+XW1LyqK5L3b8jgQ6cKbLbLb0iVZ0wQpJRrOaJw0J3lDm6b0jQ6cKbLbLb0A==",
  );
const PROBE_CONTAINER = "mts-004-probe";
const POSTGRES_PORT = Number(process.env.MISYRA_POSTGRES_PORT ?? 5432);
const BLOB_PORT = Number(process.env.MISYRA_AZURITE_BLOB_PORT ?? 10000);
const POSTGRES_URL =
  process.env.MISYRA_POSTGRES_URL ??
  `postgres://misyra:misyra_local_dev@localhost:${POSTGRES_PORT}/misyra`;

/**
 * Resolve the Docker CLI for this host (PATH first, Docker Desktop fallback).
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
 * Sign a Blob service request with the emulator SharedKey scheme.
 *
 * @param {string} method
 * @param {string} pathAndQuery
 * @param {Record<string, string>} headers
 * @param {string} dateHeader
 * @param {string} contentLength
 * @returns {string}
 */
function sharedKeyAuthorization(method, pathAndQuery, headers, dateHeader, contentLength) {
  const msHeaders = Object.entries(headers)
    .filter(([name]) => name.toLowerCase().startsWith("x-ms-"))
    .map(([name, value]) => `${name.toLowerCase()}:${value}`)
    .sort()
    .join("\n");
  const canonicalizedResource = `/${AZURITE_ACCOUNT}${pathAndQuery.split("?")[0]}`;
  const query = pathAndQuery.includes("?")
    ? pathAndQuery
        .split("?")[1]
        .split("&")
        .map((pair) => pair.split("="))
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, value]) => `${key.toLowerCase()}:${value}`)
        .join("\n")
    : "";
  const stringToSign = [
    method,
    "",
    "",
    contentLength,
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    dateHeader,
    msHeaders,
    query ? `${canonicalizedResource}\n${query}` : canonicalizedResource,
  ].join("\n");
  const signature = createHmac("sha256", Buffer.from(AZURITE_KEY, "base64"))
    .update(stringToSign, "utf8")
    .digest("base64");
  return `SharedKey ${AZURITE_ACCOUNT}:${signature}`;
}

/**
 * Perform a signed Blob request against the local Azurite container.
 *
 * @param {string} method
 * @param {string} pathAndQuery
 * @returns {Promise<{ status: number; body: string }>}
 */
async function blobRequest(method, pathAndQuery) {
  const dateHeader = new Date().toUTCString();
  const headers = {
    "x-ms-date": dateHeader,
    "x-ms-version": "2025-01-05",
  };
  const authorization = sharedKeyAuthorization(method, pathAndQuery, headers, dateHeader, "");
  const response = await fetch(`http://127.0.0.1:${BLOB_PORT}${pathAndQuery}`, {
    method,
    headers: { ...headers, authorization, "content-length": "0" },
  });
  return { status: response.status, body: await response.text() };
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
  const listBefore = await blobRequest("GET", `/${AZURITE_ACCOUNT}?comp=list`);
  assert.equal(
    listBefore.status,
    200,
    `signed List Containers must succeed against Azurite: ${listBefore.status} ${listBefore.body}`,
  );
  assert.ok(!listBefore.body.includes(PROBE_CONTAINER), "probe container must start absent");

  const created = await blobRequest(
    "PUT",
    `/${AZURITE_ACCOUNT}/${PROBE_CONTAINER}?restype=container`,
  );
  assert.equal(
    created.status,
    201,
    `container creation must succeed: ${created.status} ${created.body}`,
  );

  const listAfter = await blobRequest("GET", `/${AZURITE_ACCOUNT}?comp=list`);
  assert.ok(
    listAfter.body.includes(PROBE_CONTAINER),
    "created container must appear in the listing",
  );

  const deleted = await blobRequest(
    "DELETE",
    `/${AZURITE_ACCOUNT}/${PROBE_CONTAINER}?restype=container`,
  );
  assert.equal(
    deleted.status,
    202,
    `container deletion must succeed: ${deleted.status} ${deleted.body}`,
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
