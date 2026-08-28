targetScope = 'resourceGroup'

@allowed([
  'development'
  'staging'
  'production'
])
param environmentName string

@description('Azure region. Japan East is the approved primary region.')
param location string = 'japaneast'

@description('Environment-specific resource names. Values remain externally approved deployment configuration.')
param resourceNames object

@description('Environment-specific cost/SKU choices. Values remain externally approved deployment configuration.')
param skuNames object

@description('Represent private production data-plane boundaries without performing a deployment.')
param enablePrivateNetworking bool = false

@description('Whether Azure data-plane resources may expose public network access for this parameter shape.')
param allowPublicDataPlaneAccess bool = true

@description('API image reference supplied by a future deployment pipeline.')
param apiImage string = 'example.invalid/misyra/api:unconfigured'

@description('Worker image reference supplied by a future deployment pipeline.')
param workerImage string = 'example.invalid/misyra/worker:unconfigured'

@description('PostgreSQL administrator login placeholder; deployment configuration must replace it.')
param postgresqlAdministratorLogin string = 'replace_me'

@secure()
@description('No credential is committed. A future approved deployment must supply this secure value.')
param postgresqlAdministratorPassword string = ''

module network './modules/network.bicep' = {
  name: 'network-${environmentName}'
  params: {
    location: location
    virtualNetworkName: resourceNames.virtualNetwork
  }
}

module observability './modules/observability.bicep' = {
  name: 'observability-${environmentName}'
  params: {
    location: location
    logAnalyticsWorkspaceName: resourceNames.logAnalyticsWorkspace
    applicationInsightsName: resourceNames.applicationInsights
    logAnalyticsSkuName: skuNames.logAnalytics
  }
}

module data './modules/data.bicep' = {
  name: 'data-${environmentName}'
  params: {
    location: location
    postgresqlServerName: resourceNames.postgresqlServer
    serviceBusNamespaceName: resourceNames.serviceBusNamespace
    storageAccountName: resourceNames.storageAccount
    keyVaultName: resourceNames.keyVault
    containerRegistryName: resourceNames.containerRegistry
    postgresqlSkuName: skuNames.postgresql
    serviceBusSkuName: skuNames.serviceBus
    containerRegistrySkuName: skuNames.containerRegistry
    enablePrivateNetworking: enablePrivateNetworking
    allowPublicDataPlaneAccess: allowPublicDataPlaneAccess
    postgresqlAdministratorLogin: postgresqlAdministratorLogin
    postgresqlAdministratorPassword: postgresqlAdministratorPassword
  }
}

module compute './modules/compute.bicep' = {
  name: 'compute-${environmentName}'
  params: {
    location: location
    containerAppsEnvironmentName: resourceNames.containerAppsEnvironment
    apiContainerAppName: resourceNames.apiContainerApp
    workerContainerAppName: resourceNames.workerContainerApp
    cleanupJobName: resourceNames.cleanupJob
    repairJobName: resourceNames.repairJob
    containerAppsSubnetId: network.outputs.containerAppsSubnetId
    apiImage: apiImage
    workerImage: workerImage
  }
}

output environmentName string = environmentName
output location string = location
output virtualNetworkName string = resourceNames.virtualNetwork
output containerAppsEnvironmentName string = resourceNames.containerAppsEnvironment
output apiContainerAppName string = resourceNames.apiContainerApp
output workerContainerAppName string = resourceNames.workerContainerApp
output cleanupJobName string = resourceNames.cleanupJob
output repairJobName string = resourceNames.repairJob
output postgresqlServerName string = resourceNames.postgresqlServer
output serviceBusNamespaceName string = resourceNames.serviceBusNamespace
output storageAccountName string = resourceNames.storageAccount
output keyVaultName string = resourceNames.keyVault
output containerRegistryName string = resourceNames.containerRegistry
output logAnalyticsWorkspaceName string = resourceNames.logAnalyticsWorkspace
output applicationInsightsName string = resourceNames.applicationInsights
output containerRegistryLoginServer string = data.outputs.containerRegistryLoginServer
output applicationInsightsConnectionString string = observability.outputs.applicationInsightsConnectionString
