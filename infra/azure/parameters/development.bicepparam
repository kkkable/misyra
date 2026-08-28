using '../main.bicep'

// Shape-only values. GATE-D resource naming, SKU/budget choices, and deployment remain unapproved.
param environmentName = 'development'
param location = 'japaneast'
param enablePrivateNetworking = false
param allowPublicDataPlaneAccess = true
param apiImage = 'example.invalid/misyra/api:unconfigured'
param workerImage = 'example.invalid/misyra/worker:unconfigured'
param resourceNames = {
  virtualNetwork: 'replace-me-development-vnet'
  containerAppsEnvironment: 'replace-me-development-cae'
  apiContainerApp: 'replace-me-development-api'
  workerContainerApp: 'replace-me-development-worker'
  cleanupJob: 'replace-me-development-cleanup'
  repairJob: 'replace-me-development-repair'
  postgresqlServer: 'replace-me-development-pg'
  serviceBusNamespace: 'replace-me-development-sb'
  storageAccount: 'replacemedevelopmentstorage'
  keyVault: 'replace-me-development-kv'
  containerRegistry: 'replacemedevelopmentacr'
  logAnalyticsWorkspace: 'replace-me-development-law'
  applicationInsights: 'replace-me-development-ai'
}
param skuNames = {
  postgresql: 'REPLACE_ME_POSTGRESQL_SKU'
  serviceBus: 'REPLACE_ME_SERVICEBUS_SKU'
  containerRegistry: 'REPLACE_ME_CONTAINER_REGISTRY_SKU'
  logAnalytics: 'REPLACE_ME_LOG_ANALYTICS_SKU'
}
