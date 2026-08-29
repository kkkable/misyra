import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const azureRoot = join(root, "infra", "azure");
const mainPath = join(azureRoot, "main.bicep");
const validatorPath = join(root, "scripts", "validate-infra.mjs");
const parameterFiles = {
  development: join(azureRoot, "parameters", "development.bicepparam"),
  staging: join(azureRoot, "parameters", "staging.bicepparam"),
  production: join(azureRoot, "parameters", "production.bicepparam"),
};
const moduleFiles = [
  join(azureRoot, "modules", "network.bicep"),
  join(azureRoot, "modules", "data.bicep"),
  join(azureRoot, "modules", "compute.bicep"),
  join(azureRoot, "modules", "observability.bicep"),
];

function read(path) {
  assert.equal(existsSync(path), true, `${relative(root, path)} must exist`);
  return readFileSync(path, "utf8");
}

function collectInfraSources(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    return statSync(path).isDirectory() ? collectInfraSources(path) : [path];
  });
}

test("MTS-006 defines a Bicep root, modular topology, and all environment parameter shapes", () => {
  const main = read(mainPath);
  for (const path of moduleFiles) read(path);
  for (const path of Object.values(parameterFiles)) read(path);

  assert.match(main, /targetScope\s*=\s*['"]resourceGroup['"]/);
  assert.match(main, /param\s+location\s+string\s*=\s*['"]japaneast['"]/);
  assert.match(main, /param\s+resourceNames\s+object/);
  assert.match(main, /\.\/modules\/network\.bicep/);
  assert.match(main, /\.\/modules\/data\.bicep/);
  assert.match(main, /\.\/modules\/compute\.bicep/);
  assert.match(main, /\.\/modules\/observability\.bicep/);
});

test("development, staging, and production files compile against one explicit parameter contract", () => {
  for (const [environment, path] of Object.entries(parameterFiles)) {
    const source = read(path);
    assert.match(source, /using\s+['"]\.\.\/main\.bicep['"]/);
    assert.match(source, new RegExp(`param\\s+environmentName\\s*=\\s*['"]${environment}['"]`));
    assert.match(source, /param\s+location\s*=\s*['"]japaneast['"]/);
    assert.match(source, /param\s+resourceNames\s*=\s*\{/);
  }

  const production = read(parameterFiles.production);
  assert.match(production, /param\s+enablePrivateNetworking\s*=\s*true/);
  assert.match(production, /param\s+allowPublicDataPlaneAccess\s*=\s*false/);
});

test("the Bicep modules represent the approved Azure server topology", () => {
  const combined = moduleFiles.map(read).join("\n");
  const resourceTypes = [
    "Microsoft.App/managedEnvironments",
    "Microsoft.App/containerApps",
    "Microsoft.App/jobs",
    "Microsoft.DBforPostgreSQL/flexibleServers",
    "Microsoft.ServiceBus/namespaces",
    "Microsoft.Storage/storageAccounts",
    "Microsoft.KeyVault/vaults",
    "Microsoft.ContainerRegistry/registries",
    "Microsoft.Insights/components",
  ];

  for (const resourceType of resourceTypes) {
    assert.ok(combined.includes(resourceType), `${resourceType} must be represented`);
  }
});

test("production data and secret boundaries are explicit, connected, and least-privilege shaped", () => {
  const main = read(mainPath);
  const data = read(join(azureRoot, "modules", "data.bicep"));
  const network = read(join(azureRoot, "modules", "network.bicep"));
  const compute = read(join(azureRoot, "modules", "compute.bicep"));
  const observability = read(join(azureRoot, "modules", "observability.bicep"));

  assert.match(data, /allowBlobPublicAccess\s*:\s*false/);
  assert.match(data, /enableRbacAuthorization\s*:\s*true/);
  assert.match(data, /publicNetworkAccess\s*:/);
  assert.match(data, /enablePrivateNetworking/);
  assert.match(data, /Microsoft\.Network\/privateEndpoints/);
  assert.match(data, /privateEndpointSubnetId/);
  for (const groupId of ["blob", "vault", "namespace", "registry", "postgresqlServer"]) {
    assert.match(data, new RegExp(`['"]${groupId}['"]`));
  }
  assert.match(main, /privateEndpointSubnetId\s*:\s*network\.outputs\.privateEndpointsSubnetId/);
  assert.match(network, /Microsoft\.Network\/virtualNetworks/);
  assert.match(network, /privateEndpointNetworkPolicies\s*:\s*['"]Disabled['"]/);
  assert.match(compute, /identity\s*:\s*\{[\s\S]*type\s*:\s*['"]SystemAssigned['"]/);
  assert.doesNotMatch(data, /accessPolicies\s*:\s*\[(?!\s*\])/);
  assert.doesNotMatch(main, /output\s+\w*ConnectionString\b/i);
  assert.doesNotMatch(observability, /output\s+\w*ConnectionString\b/i);
});

test("resource names are supplied through the parameter contract rather than fixed production identifiers", () => {
  const main = read(mainPath);
  const fields = [
    "virtualNetwork",
    "containerAppsEnvironment",
    "apiContainerApp",
    "workerContainerApp",
    "cleanupJob",
    "repairJob",
    "postgresqlServer",
    "serviceBusNamespace",
    "storageAccount",
    "keyVault",
    "containerRegistry",
    "logAnalyticsWorkspace",
    "applicationInsights",
  ];

  for (const field of fields) {
    assert.match(main, new RegExp(`resourceNames\\.${field}\\b`));
  }
});

test("GATE-D cost and capacity choices remain parameterized shape inputs", () => {
  const main = read(mainPath);
  const data = read(join(azureRoot, "modules", "data.bicep"));
  const compute = read(join(azureRoot, "modules", "compute.bicep"));
  const observability = read(join(azureRoot, "modules", "observability.bicep"));
  const fields = [
    "postgresqlSkuTier",
    "postgresqlStorageSizeGb",
    "storageAccountSkuName",
    "keyVaultSkuName",
    "containerCpu",
    "containerMemory",
    "minReplicas",
    "maxReplicas",
    "logAnalyticsRetentionDays",
  ];

  assert.match(main, /param\s+capacitySettings\s+object/);
  for (const field of fields) {
    assert.match(main, new RegExp(`capacitySettings\\.${field}\\b`));
  }
  for (const path of Object.values(parameterFiles)) {
    assert.match(read(path), /param\s+capacitySettings\s*=\s*\{/);
  }

  assert.doesNotMatch(data, /tier\s*:\s*['"]Burstable['"]/);
  assert.doesNotMatch(data, /storageSizeGB\s*:\s*\d+/);
  assert.doesNotMatch(data, /name\s*:\s*['"]Standard_LRS['"]/);
  assert.doesNotMatch(data, /name\s*:\s*['"]standard['"]/);
  assert.doesNotMatch(compute, /memory\s*:\s*['"]1Gi['"]/);
  assert.doesNotMatch(compute, /minReplicas\s*:\s*\d+/);
  assert.doesNotMatch(compute, /maxReplicas\s*:\s*\d+/);
  assert.doesNotMatch(observability, /retentionInDays\s*:\s*\d+/);
});

test("infrastructure validation uses a real Bicep compiler without writing deployment artifacts", () => {
  const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  const validator = read(validatorPath);

  assert.equal(packageJson.scripts["validate:infra"], "node scripts/validate-infra.mjs");
  assert.match(validator, /build-params/);
  assert.match(validator, /--stdout/);
  assert.match(validator, /development\.bicepparam/);
  assert.match(validator, /staging\.bicepparam/);
  assert.match(validator, /production\.bicepparam/);
  assert.doesNotMatch(validator, /\bdeployment\s+(?:group|sub|mg|tenant)\s+create\b/i);
});

test("static infrastructure secret scan rejects committed credential values", () => {
  const sources = collectInfraSources(azureRoot).filter((path) => /\.bicep(?:param)?$/.test(path));
  assert.ok(sources.length > 0, "Bicep sources must exist before the secret scan can pass");

  const forbidden = [
    /AccountKey\s*=/i,
    /SharedAccessKey\s*=/i,
    /\b(?:password|clientSecret|accountKey|sharedAccessKey|connectionString)\s*=\s*['"][^'"]+['"]/i,
    /postgres(?:ql)?:\/\/[^\s:'"]+:[^\s@'"]+@/i,
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  ];

  for (const path of sources) {
    const source = readFileSync(path, "utf8");
    for (const pattern of forbidden) {
      assert.doesNotMatch(source, pattern, `${relative(root, path)} contains a secret-like value`);
    }
  }
});
