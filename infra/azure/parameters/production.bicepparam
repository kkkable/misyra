using '../main.bicep'

// Shape-only values. GATE-D resource naming, SKU/budget/capacity choices, and deployment remain unapproved.
param environmentName = 'production'
param location = 'japaneast'
param enablePrivateNetworking = true
param allowPublicDataPlaneAccess = false
param apiImage = 'example.invalid/misyra/api:unconfigured'
param workerImage = 'example.invalid/misyra/worker:unconfigured'
param resourceNames = {
  virtualNetwork: 'replace-me-production-vnet'
  containerAppsEnvironment: 'replace-me-production-cae'
  apiContainerApp: 'replace-me-production-api'
  workerContainerApp: 'replace-me-production-worker'
  cleanupJob: 'replace-me-production-cleanup'
  repairJob: 'replace-me-production-repair'
  postgresqlServer: 'replace-me-production-pg'
  serviceBusNamespace: 'replace-me-production-sb'
  storageAccount: 'replacemeproductionstorage'
  keyVault: 'replace-me-production-kv'
  containerRegistry: 'replacemeproductionacr'
  logAnalyticsWorkspace: 'replace-me-production-law'
  applicationInsights: 'replace-me-production-ai'
}
param skuNames = {
  postgresql: 'REPLACE_ME_POSTGRESQL_SKU'
  serviceBus: 'REPLACE_ME_SERVICEBUS_SKU'
  containerRegistry: 'REPLACE_ME_CONTAINER_REGISTRY_SKU'
  logAnalytics: 'REPLACE_ME_LOG_ANALYTICS_SKU'
}
param capacitySettings = {
  postgresqlSkuTier: 'REPLACE_ME_POSTGRESQL_TIER'
  postgresqlStorageSizeGb: 'REPLACE_ME_POSTGRESQL_STORAGE_GB'
  postgresqlHighAvailabilityMode: 'REPLACE_ME_POSTGRESQL_HA_MODE'
  storageAccountSkuName: 'REPLACE_ME_STORAGE_SKU'
  keyVaultSkuName: 'REPLACE_ME_KEY_VAULT_SKU'
  containerCpu: 'REPLACE_ME_CONTAINER_CPU'
  containerMemory: 'REPLACE_ME_CONTAINER_MEMORY'
  minReplicas: 'REPLACE_ME_MIN_REPLICAS'
  maxReplicas: 'REPLACE_ME_MAX_REPLICAS'
  logAnalyticsRetentionDays: 'REPLACE_ME_LOG_RETENTION_DAYS'
}
