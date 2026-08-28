using '../main.bicep'

// Shape-only values. GATE-D resource naming, SKU/budget choices, and deployment remain unapproved.
param environmentName = 'staging'
param location = 'japaneast'
param enablePrivateNetworking = true
param allowPublicDataPlaneAccess = false
param apiImage = 'example.invalid/misyra/api:unconfigured'
param workerImage = 'example.invalid/misyra/worker:unconfigured'
param resourceNames = {
  virtualNetwork: 'replace-me-staging-vnet'
  containerAppsEnvironment: 'replace-me-staging-cae'
  apiContainerApp: 'replace-me-staging-api'
  workerContainerApp: 'replace-me-staging-worker'
  cleanupJob: 'replace-me-staging-cleanup'
  repairJob: 'replace-me-staging-repair'
  postgresqlServer: 'replace-me-staging-pg'
  serviceBusNamespace: 'replace-me-staging-sb'
  storageAccount: 'replacemestagingstorage'
  keyVault: 'replace-me-staging-kv'
  containerRegistry: 'replacemestagingacr'
  logAnalyticsWorkspace: 'replace-me-staging-law'
  applicationInsights: 'replace-me-staging-ai'
}
param skuNames = {
  postgresql: 'REPLACE_ME_POSTGRESQL_SKU'
  serviceBus: 'REPLACE_ME_SERVICEBUS_SKU'
  containerRegistry: 'REPLACE_ME_CONTAINER_REGISTRY_SKU'
  logAnalytics: 'REPLACE_ME_LOG_ANALYTICS_SKU'
}
