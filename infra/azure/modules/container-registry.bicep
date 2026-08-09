// MTS-006 — Azure Container Registry module.
//
// Stores container images for the API, worker, and scheduled jobs. Admin
// credentials are disabled and public network access is denied: images are
// pulled with workload identity (least-privilege shape, no committed
// credentials).

@description('Deployment environment: development, staging, or production.')
param environment string

@description('Short resource-name prefix identifying the solution instance.')
@minLength(3)
@maxLength(12)
param namePrefix string

@description('Azure region for the registry.')
param location string = 'japaneast'

var baseName = '${namePrefix}${environment}'

resource registry 'Microsoft.ContainerRegistry/registries@2023-07-01' = {
  name: '${baseName}acr'
  location: location
  sku: {
    name: 'Basic'
  }
  properties: {
    adminUserEnabled: false
    publicNetworkAccess: 'Disabled'
  }
}

output name string = registry.name
output id string = registry.id
output loginServer string = registry.properties.loginServer
