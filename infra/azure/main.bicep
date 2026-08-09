// MTS-006 — Bicep infrastructure skeleton (root entry point).
//
// Static, non-deploying infrastructure-as-code only. This entry point
// composes the approved foundation modules; nothing here is deployed or
// activated by this ticket, and no secret values, credentials, or production
// identifiers are committed anywhere under infra/azure. Every name, region,
// and setting is an environment parameter; the parameter files under
// params/ supply the development, staging, and production shapes.
//
// Approved resource classes (technical specification §4.3): Azure Container
// Apps for the API and worker, Container Apps Jobs for scheduled cleanup and
// repair, Azure Database for PostgreSQL (Flexible Server), Service Bus,
// private Blob Storage, Key Vault, Container Registry, and Application
// Insights/OpenTelemetry monitoring.
//
// The primary approved region default is Azure Japan East (technical
// specification §2) and remains overridable per environment.
targetScope = 'resourceGroup'

@description('Deployment environment: development, staging, or production.')
param environment string

@description('Short resource-name prefix identifying the solution instance.')
@minLength(3)
@maxLength(12)
param namePrefix string

@description('Azure region for the deployment. Default preserves the approved primary region (Azure Japan East).')
param location string = 'japaneast'

@description('Minimum replicas for the API and worker Container Apps (environment-tunable).')
param minReplicas int = 1

@description('Cron schedule for the cleanup Container App Job (UTC).')
param cleanupSchedule string = '0 3 * * *'

@description('Cron schedule for the repair Container App Job (UTC).')
param repairSchedule string = '0 5 * * *'

// --- approved foundation modules -----------------------------------------

module containerRegistry './modules/container-registry.bicep' = {
  name: 'container-registry'
  params: {
    environment: environment
    namePrefix: namePrefix
    location: location
  }
}

module monitoring './modules/monitoring.bicep' = {
  name: 'monitoring'
  params: {
    environment: environment
    namePrefix: namePrefix
    location: location
  }
}

module containerApps './modules/container-apps.bicep' = {
  name: 'container-apps'
  params: {
    environment: environment
    namePrefix: namePrefix
    location: location
    registryLoginServer: containerRegistry.outputs.loginServer
    minReplicas: minReplicas
  }
}

module cleanupJob './modules/container-apps-job.bicep' = {
  name: 'cleanup-job'
  params: {
    environment: environment
    namePrefix: namePrefix
    location: location
    environmentId: containerApps.outputs.environmentId
    registryLoginServer: containerRegistry.outputs.loginServer
    jobName: 'cleanup'
    schedule: cleanupSchedule
  }
}

module repairJob './modules/container-apps-job.bicep' = {
  name: 'repair-job'
  params: {
    environment: environment
    namePrefix: namePrefix
    location: location
    environmentId: containerApps.outputs.environmentId
    registryLoginServer: containerRegistry.outputs.loginServer
    jobName: 'repair'
    schedule: repairSchedule
  }
}

module postgresql './modules/postgresql.bicep' = {
  name: 'postgresql'
  params: {
    environment: environment
    namePrefix: namePrefix
    location: location
  }
}

module serviceBus './modules/service-bus.bicep' = {
  name: 'service-bus'
  params: {
    environment: environment
    namePrefix: namePrefix
    location: location
  }
}

module blobStorage './modules/blob-storage.bicep' = {
  name: 'blob-storage'
  params: {
    environment: environment
    namePrefix: namePrefix
    location: location
  }
}

module keyVault './modules/key-vault.bicep' = {
  name: 'key-vault'
  params: {
    environment: environment
    namePrefix: namePrefix
    location: location
  }
}

// --- deterministic composition references --------------------------------

output environment string = environment
output location string = location
output containerRegistryName string = containerRegistry.outputs.name
output containerRegistryLoginServer string = containerRegistry.outputs.loginServer
output containerAppsEnvironmentName string = containerApps.outputs.environmentName
output apiContainerAppName string = containerApps.outputs.apiName
output workerContainerAppName string = containerApps.outputs.workerName
output cleanupJobName string = cleanupJob.outputs.name
output repairJobName string = repairJob.outputs.name
output postgreSqlServerName string = postgresql.outputs.name
output serviceBusNamespaceName string = serviceBus.outputs.name
output blobStorageAccountName string = blobStorage.outputs.name
output keyVaultName string = keyVault.outputs.name
output applicationInsightsName string = monitoring.outputs.appInsightsName
