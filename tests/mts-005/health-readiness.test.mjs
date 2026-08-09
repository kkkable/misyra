/**
 * MTS-005 contract: content-free API liveness, dependency-aware readiness,
 * and independently observable worker health.
 *
 * The API must expose content-free liveness (no dependency access) and
 * dependency-aware readiness (PostgreSQL + Azurite) with deterministic
 * status behavior; the worker must expose an independent health surface
 * that is not an alias of the API endpoint. All health responses must be
 * minimal and must never leak credentials, connection strings, environment
 * dumps, stack traces, or user content.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";
import { repoRoot } from "../toolchain/helpers.mjs";

/** Guaranteed-absent .env path: the suite must never read the real root .env. */
const NO_ENV_FILE = join(tmpdir(), "mts005-no-such-env", ".env");

/**
 * Import a workspace's built entry point, building the workspace first when
 * its dist output is missing.
 *
 * @param {string} workspaceDir
 * @param {string} filterName
 * @returns {Promise<any>} the workspace public entry module
 */
async function loadBuiltWorkspace(workspaceDir, filterName) {
  const distEntry = join(repoRoot, workspaceDir, "dist", "index.js");
  if (!existsSync(distEntry)) {
    execFileSync("pnpm", ["--filter", filterName, "run", "build"], {
      cwd: repoRoot,
      encoding: "utf8",
      shell: process.platform === "win32",
      stdio: "pipe",
    });
  }
  assert.ok(existsSync(distEntry), `${workspaceDir} produced no dist/index.js after build`);
  return import(pathToFileURL(distEntry).href);
}

/** The proofs run with a deliberately credential-free environment. */
const CREDENTIAL_FREE_ENV = {};

/** Every dependency available. */
const allUp = async () => [
  { name: "postgres", ok: true },
  { name: "azurite", ok: true },
];

/** PostgreSQL unavailable; Azurite available. */
const postgresDown = async () => [
  { name: "postgres", ok: false },
  { name: "azurite", ok: true },
];

/** Azurite unavailable; PostgreSQL available. */
const azuriteDown = async () => [
  { name: "postgres", ok: true },
  { name: "azurite", ok: false },
];

/** Every required dependency unavailable. */
const allDown = async () => [
  { name: "postgres", ok: false },
  { name: "azurite", ok: false },
];

/** The only two bodies a health/readiness endpoint may ever send. */
const CANONICAL_BODIES = ['{"status":"ok"}', '{"status":"unavailable"}'];

/**
 * @typedef {Object} HealthResponse
 * @property {number} statusCode
 * @property {string} body
 * @property {Record<string, string | undefined>} [headers]
 */

/**
 * Assert an HTTP response is content-free: exact canonical body, JSON
 * content type, and a body that cannot carry secrets by construction.
 *
 * @param {HealthResponse} response
 * @param {number} expectedStatus
 */
function assertContentFree(response, expectedStatus) {
  assert.equal(response.statusCode, expectedStatus, "status code must be deterministic");
  const contentType = response.headers?.["content-type"];
  assert.match(String(contentType), /^application\/json/, "health output must be JSON");
  assert.ok(
    CANONICAL_BODIES.includes(response.body),
    `body must be one of ${CANONICAL_BODIES.join(" / ")}, got ${JSON.stringify(response.body)}`,
  );
  const parsed = JSON.parse(response.body);
  assert.deepEqual(Object.keys(parsed).sort(), ["status"], "the only field is status");
  assert.ok(["ok", "unavailable"].includes(parsed.status), "status is a stable enum value");
}

test("the API serves content-free liveness without any credentials", async () => {
  const api = await loadBuiltWorkspace("apps/api", "@misyra/api");
  const app = await api.buildApp({ env: CREDENTIAL_FREE_ENV, envFilePath: NO_ENV_FILE });
  try {
    await app.ready();
    const response = await app.inject({ method: "GET", url: "/health/live" });
    assertContentFree(response, 200);
  } finally {
    await app.close();
  }
});

test("liveness stays healthy when every required dependency is unavailable", async () => {
  const api = await loadBuiltWorkspace("apps/api", "@misyra/api");
  const app = await api.buildApp({
    env: CREDENTIAL_FREE_ENV,
    envFilePath: NO_ENV_FILE,
    healthProbe: allDown,
  });
  try {
    await app.ready();
    const live = await app.inject({ method: "GET", url: "/health/live" });
    assertContentFree(live, 200);
    const ready = await app.inject({ method: "GET", url: "/health/ready" });
    assertContentFree(ready, 503);
  } finally {
    await app.close();
  }
});

test("readiness returns 200 when every required dependency is available", async () => {
  const api = await loadBuiltWorkspace("apps/api", "@misyra/api");
  const app = await api.buildApp({
    env: CREDENTIAL_FREE_ENV,
    envFilePath: NO_ENV_FILE,
    healthProbe: allUp,
  });
  try {
    await app.ready();
    const response = await app.inject({ method: "GET", url: "/health/ready" });
    assertContentFree(response, 200);
  } finally {
    await app.close();
  }
});

test("readiness returns a stable 503 when PostgreSQL is unavailable", async () => {
  const api = await loadBuiltWorkspace("apps/api", "@misyra/api");
  const app = await api.buildApp({
    env: CREDENTIAL_FREE_ENV,
    envFilePath: NO_ENV_FILE,
    healthProbe: postgresDown,
  });
  try {
    await app.ready();
    const first = await app.inject({ method: "GET", url: "/health/ready" });
    assertContentFree(first, 503);
    const second = await app.inject({ method: "GET", url: "/health/ready" });
    assertContentFree(second, 503);
  } finally {
    await app.close();
  }
});

test("readiness returns a stable 503 when Azurite is unavailable", async () => {
  const api = await loadBuiltWorkspace("apps/api", "@misyra/api");
  const app = await api.buildApp({
    env: CREDENTIAL_FREE_ENV,
    envFilePath: NO_ENV_FILE,
    healthProbe: azuriteDown,
  });
  try {
    await app.ready();
    const response = await app.inject({ method: "GET", url: "/health/ready" });
    assertContentFree(response, 503);
  } finally {
    await app.close();
  }
});

test("readiness is deterministic across repeated probes", async () => {
  const api = await loadBuiltWorkspace("apps/api", "@misyra/api");
  const app = await api.buildApp({
    env: CREDENTIAL_FREE_ENV,
    envFilePath: NO_ENV_FILE,
    healthProbe: postgresDown,
  });
  try {
    await app.ready();
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const response = await app.inject({ method: "GET", url: "/health/ready" });
      assertContentFree(response, 503);
    }
  } finally {
    await app.close();
  }
});

test("readiness resolves dependency ports from non-empty environment overrides", async () => {
  const api = await loadBuiltWorkspace("apps/api", "@misyra/api");
  /** @type {Array<{ postgresPort: number; azuriteBlobPort: number }>} */
  const captured = [];
  /**
   * @param {{ postgresPort: number; azuriteBlobPort: number }} config
   * @returns {Promise<Array<{ name: string; ok: boolean }>>}
   */
  const recordingProbe = async (config) => {
    captured.push(config);
    return allUp();
  };
  const app = await api.buildApp({
    env: { MISYRA_POSTGRES_PORT: "55432", MISYRA_AZURITE_BLOB_PORT: "10077" },
    envFilePath: NO_ENV_FILE,
    healthProbe: recordingProbe,
  });
  try {
    await app.ready();
    const response = await app.inject({ method: "GET", url: "/health/ready" });
    assertContentFree(response, 200);
    assert.equal(captured.length, 1, "the probe must be consulted exactly once");
    assert.deepEqual(captured[0], { postgresPort: 55432, azuriteBlobPort: 10077 });
  } finally {
    await app.close();
  }
});

test("readiness treats an empty explicit port value as missing (Compose semantics)", async () => {
  const api = await loadBuiltWorkspace("apps/api", "@misyra/api");
  /** @type {Array<{ postgresPort: number; azuriteBlobPort: number }>} */
  const captured = [];
  /**
   * @param {{ postgresPort: number; azuriteBlobPort: number }} config
   * @returns {Promise<Array<{ name: string; ok: boolean }>>}
   */
  const recordingProbe = async (config) => {
    captured.push(config);
    return allUp();
  };
  const app = await api.buildApp({
    env: { MISYRA_POSTGRES_PORT: "", MISYRA_AZURITE_BLOB_PORT: "" },
    envFilePath: NO_ENV_FILE,
    healthProbe: recordingProbe,
  });
  try {
    await app.ready();
    const response = await app.inject({ method: "GET", url: "/health/ready" });
    assertContentFree(response, 200);
    assert.deepEqual(captured[0], { postgresPort: 5432, azuriteBlobPort: 10000 });
  } finally {
    await app.close();
  }
});

test("health responses are content-free snapshots (redaction contract)", async () => {
  const api = await loadBuiltWorkspace("apps/api", "@misyra/api");
  const app = await api.buildApp({
    env: CREDENTIAL_FREE_ENV,
    envFilePath: NO_ENV_FILE,
    healthProbe: postgresDown,
  });
  try {
    await app.ready();
    const live = await app.inject({ method: "GET", url: "/health/live" });
    const ready = await app.inject({ method: "GET", url: "/health/ready" });
    for (const response of [live, ready]) {
      assert.ok(
        CANONICAL_BODIES.includes(response.body),
        `body must be a fixed snapshot, got ${JSON.stringify(response.body)}`,
      );
      assert.ok(response.body.length < 64, "health output must stay tiny");
      const lower = response.body.toLowerCase();
      for (const marker of [
        "://",
        "password",
        "secret",
        "token",
        "authorization",
        "process.env",
        "stack",
        "error:",
        "postgresql",
      ]) {
        assert.ok(!lower.includes(marker), `health output must not contain ${marker}`);
      }
    }
  } finally {
    await app.close();
  }
});

test("the worker shell reports its own health state", async () => {
  const worker = await loadBuiltWorkspace("apps/worker", "@misyra/worker");
  assert.equal(typeof worker.createWorkerShell, "function");
  const shell = worker.createWorkerShell({ env: CREDENTIAL_FREE_ENV });
  await shell.start();
  assert.deepEqual(shell.getHealth(), { status: "ok" }, "running worker must report ok");
  await shell.stop();
  assert.deepEqual(
    shell.getHealth(),
    { status: "unavailable" },
    "stopped worker must report unavailable",
  );
});

test("worker health is independently observable over its own HTTP surface", async () => {
  const worker = await loadBuiltWorkspace("apps/worker", "@misyra/worker");
  assert.equal(
    typeof worker.createWorkerHealthServer,
    "function",
    "the worker must export its own health server factory",
  );
  const shell = worker.createWorkerShell({ env: CREDENTIAL_FREE_ENV });
  await shell.start();
  const healthServer = await worker.createWorkerHealthServer({
    port: 0,
    getStatus: () => (shell.running ? "ok" : "unavailable"),
  });
  try {
    assert.ok(healthServer.address, "the worker health server must expose its bound address");
    const running = await fetch(`${healthServer.address}/health/live`);
    assert.equal(running.status, 200, "worker health must be 200 while running");
    assert.equal(await running.text(), '{"status":"ok"}');

    await shell.stop();
    const stopped = await fetch(`${healthServer.address}/health/live`);
    assert.equal(stopped.status, 503, "worker health must be 503 while stopped");
    assert.equal(await stopped.text(), '{"status":"unavailable"}');
  } finally {
    await healthServer.close();
  }
});

test("worker health responses are content-free (redaction contract)", async () => {
  const worker = await loadBuiltWorkspace("apps/worker", "@misyra/worker");
  const shell = worker.createWorkerShell({ env: CREDENTIAL_FREE_ENV });
  await shell.start();
  const healthServer = await worker.createWorkerHealthServer({
    port: 0,
    getStatus: () => (shell.running ? "ok" : "unavailable"),
  });
  try {
    const running = await fetch(`${healthServer.address}/health/live`);
    const body = await running.text();
    assert.ok(
      CANONICAL_BODIES.includes(body),
      `worker health body must be a fixed snapshot, got ${body}`,
    );
    assert.ok(body.length < 64, "worker health output must stay tiny");
  } finally {
    await healthServer.close();
    await shell.stop();
  }
});
