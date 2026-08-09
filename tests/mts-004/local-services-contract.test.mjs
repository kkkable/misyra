/**
 * MTS-004 contract: local development services.
 *
 * Verifies the Docker Compose surface, environment template, and local
 * service tooling contracts WITHOUT requiring a running Docker engine, so
 * the suite stays portable across Windows and Linux CI. Live-service
 * evidence lives in integration/mts-004 and runs behind pnpm test:services.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { test } from "node:test";
import { parse } from "yaml";
import { fileExists, readJson, readText, repoRoot } from "../toolchain/helpers.mjs";

const INTERPOLATION = /\$\{([A-Z0-9_]+):-([^}]*)\}/g;

/**
 * Parse compose.yaml from the repository root.
 *
 * @returns {Record<string, unknown>}
 */
function composeDocument() {
  return /** @type {Record<string, unknown>} */ (parse(readText("compose.yaml")));
}

/**
 * Collect every ${VAR:-default} interpolation used by compose.yaml.
 *
 * @returns {Map<string, string>} variable name to default value
 */
function interpolatedVariables() {
  const variables = new Map();
  for (const match of readText("compose.yaml").matchAll(INTERPOLATION)) {
    variables.set(String(match[1]), String(match[2]));
  }
  return variables;
}

/**
 * Run a repository node script and capture its exit code and combined output.
 *
 * @param {readonly string[]} args
 * @param {Record<string, string>} [extraEnv]
 * @returns {{ code: number; output: string }}
 */
function runRepoScript(args, extraEnv = {}) {
  try {
    const output = execFileSync(process.execPath, args, {
      cwd: repoRoot,
      encoding: "utf8",
      env: { ...process.env, ...extraEnv },
    });
    return { code: 0, output };
  } catch (error) {
    const failure = /** @type {{ status?: number; stdout?: string; stderr?: string }} */ (error);
    return {
      code: typeof failure.status === "number" ? failure.status : 1,
      output: `${failure.stdout ?? ""}${failure.stderr ?? ""}`,
    };
  }
}

test("compose.yaml exists at the repository root", () => {
  assert.ok(fileExists("compose.yaml"), "expected compose.yaml at the repository root");
});

test("compose.yaml declares exactly the Misyra local PostgreSQL and Azurite services", () => {
  const services = /** @type {Record<string, unknown>} */ (composeDocument().services ?? {});
  assert.deepEqual(
    Object.keys(services).sort(),
    ["azurite", "postgres"],
    "compose.yaml must ship only the postgres and azurite local services",
  );
});

test("compose.yaml pins PostgreSQL 18 and a stable pinned Azurite image", () => {
  const services = /** @type {Record<string, Record<string, unknown>>} */ (
    composeDocument().services
  );
  const postgres = /** @type {Record<string, unknown> | undefined} */ (services["postgres"]);
  const azurite = /** @type {Record<string, unknown> | undefined} */ (services["azurite"]);
  assert.ok(postgres, "compose.yaml must define the postgres service");
  assert.ok(azurite, "compose.yaml must define the azurite service");
  assert.equal(postgres.image, "postgres:18", "PostgreSQL must be the approved major version 18");
  assert.match(
    String(azurite.image ?? ""),
    /^mcr\.microsoft\.com\/azure-storage\/azurite:\d+\.\d+\.\d+$/,
    "Azurite must use a stable pinned MCR image tag (no latest/alpha/previews)",
  );
});

test("compose.yaml defines a healthcheck for every local service", () => {
  const services = /** @type {Record<string, Record<string, unknown>>} */ (
    composeDocument().services
  );
  for (const [name, service] of Object.entries(services)) {
    const healthcheck = /** @type {Record<string, unknown> | undefined} */ (service.healthcheck);
    assert.ok(healthcheck, `${name} must declare a healthcheck for deterministic readiness`);
    assert.ok(
      Array.isArray(healthcheck.test) && healthcheck.test.length > 0,
      `${name} healthcheck must declare an executable test command`,
    );
  }
});

test("compose.yaml publishes the deterministic local ports", () => {
  const services = /** @type {Record<string, Record<string, unknown>>} */ (
    composeDocument().services
  );
  const postgres = /** @type {Record<string, unknown> | undefined} */ (services["postgres"]);
  const azurite = /** @type {Record<string, unknown> | undefined} */ (services["azurite"]);
  assert.ok(postgres, "compose.yaml must define the postgres service");
  assert.ok(azurite, "compose.yaml must define the azurite service");
  const postgresPorts = /** @type {string[]} */ (postgres.ports ?? []);
  const azuritePorts = /** @type {string[]} */ (azurite.ports ?? []);
  assert.ok(
    postgresPorts.some((entry) => entry.endsWith(":5432")),
    "PostgreSQL must publish the deterministic 5432 development port",
  );
  for (const containerPort of ["10000", "10001", "10002"]) {
    assert.ok(
      azuritePorts.some((entry) => entry.endsWith(`:${containerPort}`)),
      `Azurite must publish the deterministic ${containerPort} development port`,
    );
  }
});

test("compose.yaml persists state in Misyra-owned named volumes only", () => {
  const doc = composeDocument();
  const volumes = /** @type {Record<string, unknown>} */ (doc.volumes ?? {});
  assert.deepEqual(
    Object.keys(volumes).sort(),
    ["misyra-azurite-data", "misyra-postgres-data"],
    "compose.yaml must declare exactly the Misyra-owned local data volumes",
  );
  const services = /** @type {Record<string, Record<string, unknown>>} */ (doc.services);
  for (const [name, service] of Object.entries(services)) {
    const mounts = /** @type {string[]} */ (service.volumes ?? []);
    assert.ok(mounts.length > 0, `${name} must persist its state in a named volume`);
    for (const mount of mounts) {
      assert.ok(
        mount.startsWith("misyra-"),
        `${name} volume mount must reference a Misyra-owned volume: ${mount}`,
      );
      const volumeName = mount.split(":")[0] ?? mount;
      assert.ok(
        !volumeName.includes("/"),
        `${name} must not bind-mount host directories: ${mount}`,
      );
    }
  }
});

test("compose.yaml keeps a fixed local project name so resets stay scoped", () => {
  assert.equal(
    composeDocument().name,
    "misyra-local",
    "compose.yaml must pin the project name so reset tooling never touches unknown Docker resources",
  );
});

test("compose.yaml interpolates only MISYRA_-prefixed variables with deterministic defaults", () => {
  const variables = interpolatedVariables();
  assert.ok(variables.size > 0, "compose.yaml must allow local overrides through variables");
  for (const [name, fallback] of variables) {
    assert.match(name, /^MISYRA_[A-Z0-9_]+$/, `variable must be MISYRA_-prefixed: ${name}`);
    assert.ok(fallback.length > 0, `variable must ship a deterministic default: ${name}`);
  }
});

test("compose.yaml ships no production credentials or cloud dependencies", () => {
  const text = readText("compose.yaml");
  assert.ok(!text.includes("-----BEGIN"), "compose.yaml must not embed key material");
  for (const marker of ["vault.azure.net", "blob.core.windows.net", "AZURE_CLIENT_SECRET"]) {
    assert.ok(!text.includes(marker), `compose.yaml must stay cloud-free: ${marker}`);
  }
  assert.equal(
    composeDocument().secrets,
    undefined,
    "compose.yaml must not declare Docker secrets",
  );
});

test("local.env.example documents every interpolated variable and local-only credentials", () => {
  assert.ok(
    fileExists("local.env.example"),
    "expected local.env.example template at the repository root",
  );
  const template = readText("local.env.example");
  for (const name of interpolatedVariables().keys()) {
    assert.ok(template.includes(name), `local.env.example must document ${name}`);
  }
  assert.ok(
    template.includes("devstoreaccount1"),
    "local.env.example must document the well-known Azurite development account",
  );
  assert.ok(
    !readText("compose.yaml").includes("AccountKey="),
    "compose.yaml must not inline storage account keys",
  );
});

test("root package.json exposes the local service lifecycle scripts portably", () => {
  const { scripts } = readJson("package.json");
  for (const name of ["dev:up", "dev:down", "dev:reset", "dev:health", "test:services"]) {
    assert.equal(typeof scripts[name], "string", `missing local services script: ${name}`);
    assert.match(
      String(scripts[name]),
      /^node /,
      `${name} must be a single portable node invocation`,
    );
  }
  assert.match(
    String(scripts["test:services"]),
    /integration\/mts-004/,
    "test:services must run the live MTS-004 integration suite",
  );
});

test("dev:reset refuses to run without explicit confirmation", () => {
  const result = runRepoScript(["scripts/dev/reset.mjs"]);
  assert.notEqual(result.code, 0, "reset must fail without explicit confirmation");
  assert.match(
    result.output,
    /--yes/,
    "reset failure output must name the required --yes confirmation flag",
  );
});

test("dev:reset --yes --dry-run reports its scope without touching Docker", () => {
  const result = runRepoScript(["scripts/dev/reset.mjs", "--yes", "--dry-run"]);
  assert.equal(result.code, 0, `dry-run reset must succeed without Docker: ${result.output}`);
  assert.match(result.output, /misyra-local/, "dry-run must report the scoped project name");
  assert.match(result.output, /volumes/i, "dry-run must state that volumes are removed");
});

test("dev:health fails clearly when a dependency port is unreachable", () => {
  const result = runRepoScript([
    "scripts/dev/health.mjs",
    "--ports-only",
    "--postgres-port",
    "59999",
    "--azurite-blob-port",
    "59998",
  ]);
  assert.notEqual(result.code, 0, "health check must fail when dependencies are unavailable");
  assert.match(
    result.output,
    /unavailable|unreachable/i,
    "health failure output must explain the unavailable dependency",
  );
});
