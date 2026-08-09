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
    types: [
      "Microsoft.Insights/components",
      "Microsoft.OperationalInsights/workspaces",
    ],
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
  assert.ok(
    isFile(file),
    `MTS-006 skeleton file ${rel} is missing — GREEN must create it`,
  );
  return readFileSync(file, "utf8");
}

/**
 * Lists every committed file under the infra/azure boundary.
 *
 * @returns {string[]} Absolute paths of files inside the boundary.
 */
function infraFiles() {
  const out = [];
  const walk = (dir) => {
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
 * True when a Bicep compiler (Azure CLI or the standalone bicep binary) is
 * available on PATH. Never installs or modifies global tooling.
 *
 * @returns {boolean} Whether a Bicep compiler can be invoked.
 */
function bicepCompilerAvailable() {
  for (const candidate of [
    { cmd: "az", args: ["bicep", "version"] },
    { cmd: "bicep", args: ["--version"] },
  ]) {
    try {
      run(candidate.cmd, candidate.args);
      return true;
    } catch {
      // candidate compiler not available — try the next one
    }
  }
  return false;
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
      assert.match(
        text,
        new RegExp(`'${escaped}@`),
        `${module} must declare the ${type} boundary`,
      );
    }
  }
});

test("every module derives resource names from environment parameters", () => {
  for (const { module } of APPROVED_BOUNDARIES) {
    const text = readInfraFile(join(MODULES_DIR, module));
    assert.match(
      text,
      /\bnamePrefix\b/,
      `${module} must accept the name prefix parameter`,
    );
    assert.match(
      text,
      /\benvironment\b/,
      `${module} must accept the environment parameter`,
    );
  }
});

test("top-level resource names are parameterized, never hard-coded", () => {
  for (const { module } of APPROVED_BOUNDARIES) {
    const text = readInfraFile(join(MODULES_DIR, module));
    for (const block of text.split(/^resource\s+/m).slice(1)) {
      if (!/^[A-Za-z_][A-Za-z0-9_]*\s+'Microsoft\./.test(block)) {
        continue; // child resources (queues, containers, blob services)
      }
      const nameLine = block
        .split("\n")
        .find((line) => /^\s*name\s*:/.test(line));
      assert.ok(
        nameLine,
        `${module}: top-level resource block is missing a name: property`,
      );
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
    assert.match(
      text,
      /^output\s+\w+/m,
      `${module} must expose at least one deterministic output`,
    );
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
    assert.match(
      text,
      /param\s+namePrefix\s*=\s*'/,
      `${env}.bicepparam must set the name prefix`,
    );
    assert.match(
      text,
      /param\s+location\s*=\s*'/,
      `${env}.bicepparam must set the region`,
    );
  }
});

test("no secret values, credentials, or provider identifiers are committed", () => {
  assert.ok(
    isDirectory(INFRA_AZURE),
    "infra/azure boundary is missing — GREEN must create it",
  );
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

test(
  "the skeleton compiles for every environment parameter shape (optional compiler)",
  (t) => {
    if (!bicepCompilerAvailable()) {
      t.skip(
        "Azure CLI/Bicep not installed — deterministic contracts above remain the validation gate (CI installs no Bicep tooling by design)",
      );
    }
    const bicep = (args) =>
      run("az", ["bicep", ...args], { cwd: repoRoot });
    bicep([
      "build",
      "--file",
      relative(repoRoot, MAIN_BICEP),
      "--no-restore",
    ]);
    for (const env of ENVIRONMENTS) {
      bicep([
        "build-params",
        "--file",
        relative(repoRoot, join(PARAMS_DIR, `${env}.bicepparam`)),
        "--no-restore",
      ]);
    }
  },
);
