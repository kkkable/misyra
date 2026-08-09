/**
 * MTS-006 — Bicep infrastructure skeleton contracts.
 *
 * The MTS-006 ticket establishes the repository's Azure infrastructure
 * boundary (`infra/azure/`): a non-deploying Bicep skeleton that
 *
 *   1. composes the approved foundation modules (Container Registry,
 *      Container Apps for the API/worker, Container Apps Jobs for scheduled
 *      cleanup/repair, PostgreSQL, Service Bus, private Blob Storage,
 *      Key Vault, and Application Insights/OpenTelemetry monitoring);
 *   2. parameterizes every environment-specific name, region, and setting
 *      instead of hard-coding production identifiers;
 *   3. represents the production network and secret boundaries statically
 *      (deny-by-default network ACLs, disabled public access, RBAC-only Key
 *      Vault, no committed credentials);
 *   4. compiles cleanly for the development, staging, and production
 *      parameter shapes; and
 *   5. exposes deterministic outputs so later infrastructure tickets can
 *      compose the same modules.
 *
 * These tests are the RED/GREEN contract for the skeleton. They are
 * deterministic and never require Azure tooling: when a Bicep compiler is
 * available locally the optional build test also runs the real compiler;
 * when it is not, the deterministic contracts remain the validation gate.
 *
 * @module tests/mts-006/bicep-skeleton
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { test } from "node:test";

import { repoRoot, run } from "../toolchain/helpers.mjs";

/** Root of the approved Azure infrastructure boundary. */
const INFRA_AZURE = join(repoRoot, "infra", "azure");
/** Root Bicep entry point composing every foundation module. */
const MAIN_BICEP = join(INFRA_AZURE, "main.bicep");
/** Directory holding the approved foundation modules. */
const MODULES_DIR = join(INFRA_AZURE, "modules");
/** Directory holding the per-environment parameter shapes. */
const PARAMS_DIR = join(INFRA_AZURE, "params");
/** Deployment environments with a committed parameter shape. */
const ENVIRONMENTS = ["development", "staging", "production"];
/** Approved foundation modules and the resource boundary each must declare. */
const APPROVED_BOUNDARIES = [
  {
    module: "container-registry.bicep",
    types: ["Microsoft.ContainerRegistry/registries"],
  },
  {
    module: "container-apps.bicep",
    types: ["Microsoft.App/managedEnvironments", "Microsoft.App/containerApps"],
  },
  {
    module: "container-apps-job.bicep",
    types: ["Microsoft.App/jobs"],
  },
  {
    module: "postgresql.bicep",
    types: ["Microsoft.DBforPostgreSQL/flexibleServers"],
  },
  {
    module: "service-bus.bicep",
    types: ["Microsoft.ServiceBus/namespaces"],
  },
  {
    module: "blob-storage.bicep",
    types: ["Microsoft.Storage/storageAccounts"],
  },
  {
    module: "key-vault.bicep",
    types: ["Microsoft.KeyVault/vaults"],
  },
  {
    module: "monitoring.bicep",
    types: ["Microsoft.Insights/components", "Microsoft.OperationalInsights/workspaces"],
  },
];

/**
 * True when the absolute path exists and is a regular file.
 *
 * @param {string} path - Absolute path to test.
 * @returns {boolean} Whether the path is a regular file.
 */
function isFile(path) {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

/**
 * True when the absolute path exists and is a directory.
 *
 * @param {string} path - Absolute path to test.
 * @returns {boolean} Whether the path is a directory.
 */
function isDirectory(path) {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Reads a text file inside the infra/azure boundary, failing with a clear
 * message when the skeleton file is absent.
 *
 * @param {string} file - Absolute path to the file to read.
 * @returns {string} File contents.
 */
function readInfraFile(file) {
  const rel = relative(repoRoot, file);
  assert.ok(isFile(file), `MTS-006 skeleton file ${rel} is missing — GREEN must create it`);
  return readFileSync(file, "utf8");
}

/**
 * Lists every committed file under the infra/azure boundary.
 *
 * @returns {string[]} Absolute paths of files inside the boundary.
 */
function infraFiles() {
  /** @type {string[]} */
  const out = [];
  const walk = (/** @type {string} */ dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else out.push(full);
    }
  };
  walk(INFRA_AZURE);
  return out;
}

/**
 * Resolves the Bicep compiler available on PATH: the Azure CLI extension
 * (`az bicep ...`) or the standalone binary (`bicep ...`), preferring the
 * Azure CLI exactly like the detection contract always did. Returns null
 * when neither compiler is available. Never installs or modifies global
 * tooling.
 *
 * The resolved compiler is the one the compile contract must invoke: the
 * detection and compilation paths must agree, otherwise a machine with a
 * standalone `bicep` binary (but no `az`) would be told a compiler exists
 * and then fail invoking `az`.
 *
 * The returned `kind` selects the toolchain-specific argument adapter so
 * each compiler receives its documented syntax:
 *
 * - Azure CLI (`"az"`):        `az bicep build --file <file> --stdout` /
 *                              `az bicep build-params --file <file> --stdout`;
 * - standalone (`"standalone"`): `bicep build <file> --stdout` /
 *                              `bicep build-params <file> --stdout`.
 *
 * @returns {{ kind: "az" | "standalone", cmd: string, args: string[] } | null}
 *   The invocation prefix and toolchain kind of the available compiler, or
 *   null when none is available.
 */
function resolveBicepCompiler() {
  /**
   * Candidate compilers in detection order. `kind` selects the
   * toolchain-specific argument adapter for the compile path.
   *
   * @type {ReadonlyArray<{ kind: "az" | "standalone", cmd: string, args: readonly string[], detect: readonly string[] }>}
   */
  const candidates = [
    { kind: "az", cmd: "az", args: ["bicep"], detect: ["bicep", "version"] },
    { kind: "standalone", cmd: "bicep", args: [], detect: ["--version"] },
  ];
  for (const candidate of candidates) {
    try {
      run(candidate.cmd, candidate.detect);
      return { kind: candidate.kind, cmd: candidate.cmd, args: [...candidate.args] };
    } catch {
      // candidate compiler not available — try the next one
    }
  }
  return null;
}

/**
 * Build the toolchain-specific argument list for compiling a Bicep entry
 * file to stdout: `--file <path>` for the Azure CLI, a positional file
 * argument for the standalone CLI (Microsoft reference:
 * https://learn.microsoft.com/en-us/azure/azure-resource-manager/bicep/bicep-cli).
 *
 * @param {"az" | "standalone"} kind - Resolved compiler toolchain.
 * @param {readonly string[]} prefix - Compiler invocation prefix args.
 * @param {string} command - `"build"` or `"build-params"`.
 * @param {string} file - Repository-relative path of the input file.
 * @returns {string[]} Complete argument list for the resolved toolchain.
 */
function bicepCompileArgs(kind, prefix, command, file) {
  if (kind === "az") {
    return [...prefix, command, "--file", file, "--stdout", "--no-restore"];
  }
  return [...prefix, command, file, "--stdout"];
}

test("the Bicep skeleton root entry point exists", () => {
  assert.ok(
    isFile(MAIN_BICEP),
    "MTS-006 root entry point infra/azure/main.bicep is missing — GREEN must create the skeleton",
  );
});

test("main.bicep parameterizes environment, naming, and region", () => {
  const main = readInfraFile(MAIN_BICEP);
  assert.match(main, /param\s+environment\s+string/, "environment parameter");
  assert.match(main, /param\s+namePrefix\s+string/, "name prefix parameter");
  assert.match(
    main,
    /param\s+location\s+string\s*=\s*'japaneast'/,
    "region parameter must preserve the approved primary region default (Azure Japan East)",
  );
});

test("main.bicep wires every approved foundation module", () => {
  const main = readInfraFile(MAIN_BICEP);
  for (const { module } of APPROVED_BOUNDARIES) {
    const escaped = module.replace(".", "\\.");
    assert.match(
      main,
      new RegExp(`module\\s+\\w+\\s+'\\./modules/${escaped}'`),
      `main.bicep must wire modules/${module}`,
    );
  }
});

test("every approved foundation module exists and declares its resource boundary", () => {
  for (const { module, types } of APPROVED_BOUNDARIES) {
    const text = readInfraFile(join(MODULES_DIR, module));
    for (const type of types) {
      const escaped = type.replace(".", "\\.");
      assert.match(text, new RegExp(`'${escaped}@`), `${module} must declare the ${type} boundary`);
    }
  }
});

test("every module derives resource names from environment parameters", () => {
  for (const { module } of APPROVED_BOUNDARIES) {
    const text = readInfraFile(join(MODULES_DIR, module));
    assert.match(text, /\bnamePrefix\b/, `${module} must accept the name prefix parameter`);
    assert.match(text, /\benvironment\b/, `${module} must accept the environment parameter`);
  }
});

test("top-level resource names are parameterized, never hard-coded", () => {
  for (const { module } of APPROVED_BOUNDARIES) {
    const text = readInfraFile(join(MODULES_DIR, module));
    for (const block of text.split(/^resource\s+/m).slice(1)) {
      const typeMatch = block.match(/^[A-Za-z_][A-Za-z0-9_]*\s+'([^']+)'@[0-9-]+/);
      if (typeMatch === null) {
        continue;
      }
      // Top-level resource types have exactly one '/' (provider/type). Child
      // resources (queues, containers, blob services) have additional path
      // segments and are allowed deterministic fixed names.
      const typeName = typeMatch[1];
      if (typeName === undefined || typeName.split("/").length - 1 > 1) {
        continue;
      }
      const nameLine = block.split("\n").find((line) => /^\s*name\s*:/.test(line));
      assert.ok(nameLine, `${module}: top-level resource block is missing a name: property`);
      assert.match(
        nameLine,
        /\$\{/,
        `${module}: top-level resource names must derive from parameters (interpolated), got: ${nameLine.trim()}`,
      );
    }
  }
});

test("the production network and secret boundaries are represented", () => {
  const keyVault = readInfraFile(join(MODULES_DIR, "key-vault.bicep"));
  assert.match(
    keyVault,
    /defaultAction\s*:\s*'Deny'/,
    "Key Vault must deny network access by default",
  );
  assert.match(
    keyVault,
    /enableRbacAuthorization\s*:\s*true/,
    "Key Vault must use RBAC authorization (no committed access policies)",
  );

  const blobStorage = readInfraFile(join(MODULES_DIR, "blob-storage.bicep"));
  assert.match(
    blobStorage,
    /allowBlobPublicAccess\s*:\s*false/,
    "Blob storage must not allow public blob access",
  );
  assert.match(
    blobStorage,
    /publicNetworkAccess\s*:\s*'Disabled'/,
    "Blob storage must disable public network access",
  );

  const postgresql = readInfraFile(join(MODULES_DIR, "postgresql.bicep"));
  assert.match(
    postgresql,
    /publicNetworkAccess\s*:\s*'Disabled'/,
    "PostgreSQL must disable public network access",
  );

  const registry = readInfraFile(join(MODULES_DIR, "container-registry.bicep"));
  assert.match(
    registry,
    /adminUserEnabled\s*:\s*false/,
    "Container registry must not enable admin credentials",
  );
});

test("modules and the root entry point expose deterministic composition outputs", () => {
  const main = readInfraFile(MAIN_BICEP);
  assert.match(
    main,
    /^output\s+\w+/m,
    "main.bicep must expose composition outputs for later infrastructure tickets",
  );
  for (const { module } of APPROVED_BOUNDARIES) {
    const text = readInfraFile(join(MODULES_DIR, module));
    assert.match(text, /^output\s+\w+/m, `${module} must expose at least one deterministic output`);
  }
});

test("parameter shapes exist for development, staging, and production", () => {
  for (const env of ENVIRONMENTS) {
    const file = join(PARAMS_DIR, `${env}.bicepparam`);
    const text = readInfraFile(file);
    assert.match(
      text,
      /^using\s+'\.\.\/main\.bicep'/m,
      `${env}.bicepparam must target the root entry point`,
    );
    assert.match(
      text,
      new RegExp(`param\\s+environment\\s*=\\s*'${env}'`),
      `${env}.bicepparam must select the ${env} environment`,
    );
    assert.match(text, /param\s+namePrefix\s*=\s*'/, `${env}.bicepparam must set the name prefix`);
    assert.match(text, /param\s+location\s*=\s*'/, `${env}.bicepparam must set the region`);
  }
});

test("no secret values, credentials, or provider identifiers are committed", () => {
  assert.ok(isDirectory(INFRA_AZURE), "infra/azure boundary is missing — GREEN must create it");
  const patterns = [
    {
      name: "subscription/tenant GUID",
      re: /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i,
    },
    {
      name: "connection string / account key",
      re: /(AccountKey|SharedAccessKey|DefaultEndpointsProtocol|Endpoint=sb:)/i,
    },
    {
      name: "private key material",
      re: /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/i,
    },
    {
      name: "hard-coded Azure endpoint",
      re: /\.(blob\.core\.windows\.net|servicebus\.windows\.net|database\.windows\.net|azurecr\.io|azurewebsites\.net)/i,
    },
    {
      name: "secret value assignment",
      re: /\b(password|clientSecret|client_secret|apiKey|accessKey|secretValue|connectionString)\b\s*[:=]\s*['"][^'"]+/i,
    },
    {
      name: "secure parameter with a committed non-empty default",
      re: /@secure\(\)\s*\r?\n\s*param\s+\w+\s+\w+\s*=\s*['"][^'"]+/i,
    },
  ];
  const violations = [];
  for (const file of infraFiles()) {
    const rel = relative(repoRoot, file);
    const text = readFileSync(file, "utf8");
    for (const { name, re } of patterns) {
      const match = text.match(re);
      if (match) {
        violations.push(`${rel}: ${name} (${match[0].slice(0, 60)})`);
      }
    }
  }
  assert.deepEqual(
    violations,
    [],
    `infra/azure must contain no committed secret material:\n${violations.join("\n")}`,
  );
});

test("the skeleton compiles for every environment parameter shape (optional compiler)", (t) => {
  const compiler = resolveBicepCompiler();
  if (compiler === null) {
    t.skip(
      "Azure CLI/Bicep not installed — deterministic contracts above remain the validation gate (CI installs no Bicep tooling by design)",
    );
    return;
  }
  // Invoke the SAME compiler the detection path resolved, with the
  // toolchain-specific argument adapter: `az bicep ... --file <path>` when
  // the Azure CLI is available, positional `bicep <file>` arguments when
  // only the standalone binary is. Detection and compilation must never
  // disagree, and each compiler must receive its documented syntax.
  /** @type {(command: "build" | "build-params", file: string) => string} */
  const bicep = (command, file) =>
    run(compiler.cmd, bicepCompileArgs(compiler.kind, compiler.args, command, file));
  // --stdout keeps compiled ARM templates out of the source tree.
  bicep("build", relative(repoRoot, MAIN_BICEP));
  for (const env of ENVIRONMENTS) {
    bicep("build-params", relative(repoRoot, join(PARAMS_DIR, `${env}.bicepparam`)));
  }
});
