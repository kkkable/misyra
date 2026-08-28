import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const composePath = join(root, "compose.yaml");
const envTemplatePath = join(root, ".env.example");
const serviceScriptPath = join(root, "scripts", "local-services.mjs");

function runDocker(args) {
  return spawnSync("docker", args, {
    cwd: root,
    encoding: "utf8",
    env: process.env,
  });
}

test("compose defines healthy local PostgreSQL 18 and Azurite services", () => {
  assert.equal(existsSync(composePath), true, "compose.yaml must exist");
  assert.equal(existsSync(envTemplatePath), true, ".env.example must exist");
  assert.equal(
    existsSync(serviceScriptPath),
    true,
    "local service command script must exist",
  );

  const compose = readFileSync(composePath, "utf8");
  const envTemplate = readFileSync(envTemplatePath, "utf8");

  assert.match(compose, /^\s{2}postgres:\s*$/m);
  assert.match(compose, /image:\s*postgres:18(?:\s|$)/);
  assert.match(compose, /^\s{4}healthcheck:\s*$/m);
  assert.match(compose, /^\s{2}azurite:\s*$/m);
  assert.match(
    compose,
    /image:\s*mcr\.microsoft\.com\/azure-storage\/azurite:[^\s]+/,
  );
  assert.doesNotMatch(compose, /azure-storage\/azurite:latest/);
  assert.match(compose, /misyra-postgres-data/);
  assert.match(compose, /misyra-azurite-data/);
  assert.match(compose, /127\.0\.0\.1:\$\{POSTGRES_PORT:-5432\}:5432/);
  assert.match(compose, /127\.0\.0\.1:\$\{AZURITE_BLOB_PORT:-10000\}:10000/);
  assert.match(compose, /127\.0\.0\.1:\$\{AZURITE_QUEUE_PORT:-10001\}:10001/);
  assert.match(compose, /127\.0\.0\.1:\$\{AZURITE_TABLE_PORT:-10002\}:10002/);

  assert.match(envTemplate, /^DATABASE_URL=postgresql:\/\/misyra:/m);
  assert.match(
    envTemplate,
    /^AZURE_STORAGE_CONNECTION_STRING=UseDevelopmentStorage=true$/m,
  );
  assert.doesNotMatch(envTemplate, /prod(?:uction)?[-_.]/i);
});

test("health command fails clearly when Docker is unavailable", () => {
  const result = spawnSync(process.execPath, [serviceScriptPath, "health"], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, PATH: "" },
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Docker CLI is unavailable/);
});

test("reset requires explicit confirmation before touching local state", () => {
  const result = spawnSync(process.execPath, [serviceScriptPath, "reset"], {
    cwd: root,
    encoding: "utf8",
    env: process.env,
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Re-run with --yes/);
});

const runIntegration = process.env.MTS004_INTEGRATION === "1";

test(
  "database connectivity integration test",
  { skip: !runIntegration },
  () => {
    const started = runDocker(["compose", "up", "-d", "--wait", "postgres"]);
    assert.equal(
      started.status,
      0,
      `PostgreSQL did not become healthy:\n${started.stderr || started.stdout}`,
    );

    const user = process.env.POSTGRES_USER ?? "misyra";
    const database = process.env.POSTGRES_DB ?? "misyra";
    const probe = runDocker([
      "compose",
      "exec",
      "-T",
      "postgres",
      "psql",
      "-U",
      user,
      "-d",
      database,
      "-Atqc",
      "SELECT 1",
    ]);

    assert.equal(
      probe.status,
      0,
      `PostgreSQL connectivity probe failed:\n${probe.stderr || probe.stdout}`,
    );
    assert.equal(probe.stdout.trim(), "1");
  },
);

test("Azurite container test", { skip: !runIntegration }, async () => {
  const started = runDocker(["compose", "up", "-d", "--wait", "azurite"]);
  assert.equal(
    started.status,
    0,
    `Azurite did not become healthy:\n${started.stderr || started.stdout}`,
  );

  const port = process.env.AZURITE_BLOB_PORT ?? "10000";
  const response = await fetch(
    `http://127.0.0.1:${port}/devstoreaccount1?comp=list`,
    {
      signal: AbortSignal.timeout(5_000),
    },
  );

  assert.ok(
    response.status >= 200 && response.status < 500,
    `unexpected Azurite status ${response.status}`,
  );
});
