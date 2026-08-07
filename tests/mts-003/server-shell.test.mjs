/**
 * MTS-003 contract: API and worker shells start without provider credentials.
 *
 * The Fastify API shell must boot, serve, and shut down cleanly with an empty
 * environment; the worker shell must start and stop without any Apple,
 * Google, Azure, AI, or database credentials. Both proofs import the built
 * workspace entry points (building them first when needed), so they also act
 * as the workspace runtime smoke tests.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { test } from "node:test";
import { repoRoot } from "../toolchain/helpers.mjs";

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

/** The proofs run with a deliberately empty environment: no credentials. */
const CREDENTIAL_ENV = {};

test("the API shell builds a Fastify app without provider credentials", async () => {
  const api = await loadBuiltWorkspace("apps/api", "@misyra/api");
  assert.equal(typeof api.buildApp, "function", "@misyra/api must export buildApp");
  const app = await api.buildApp({ env: CREDENTIAL_ENV });
  try {
    await app.ready();
    const response = await app.inject({ method: "GET", url: "/mts-003-shell-proof" });
    assert.equal(response.statusCode, 404, "the shell serves no product routes yet");
  } finally {
    await app.close();
  }
});

test("the API shell listens on an ephemeral port and closes cleanly", async () => {
  const api = await loadBuiltWorkspace("apps/api", "@misyra/api");
  const app = await api.buildApp({ env: CREDENTIAL_ENV });
  try {
    const address = await app.listen({ port: 0, host: "127.0.0.1" });
    assert.match(address, /^http:\/\/127\.0\.0\.1:\d+$/, "API must bind locally");
  } finally {
    await app.close();
  }
});

test("the worker shell starts and stops without provider credentials", async () => {
  const worker = await loadBuiltWorkspace("apps/worker", "@misyra/worker");
  assert.equal(
    typeof worker.createWorkerShell,
    "function",
    "@misyra/worker must export createWorkerShell",
  );
  const shell = worker.createWorkerShell({ env: CREDENTIAL_ENV });
  await shell.start();
  assert.equal(shell.running, true, "worker shell must report a running state");
  await shell.stop();
  assert.equal(shell.running, false, "worker shell must stop cleanly");
});
