// MTS-006 — Azure Service Bus module.
//
// Namespace for asynchronous commands with a single commands queue. Local
// authentication (shared-access keys) is disabled and public network access
// is denied: producers and consumers authenticate with managed identity
// (least-privilege shape, no committed credentials).

@description('Deployment environment: development, staging, or production.')
param environment string

@description('Short resource-name prefix identifying the solution instance.')
@minLength(3)
@maxLength(12)
param namePrefix string

@description('Azure region for the namespace.')
param location string = 'japaneast'

var baseName = '${namePrefix}${environment}'

resource namespace 'Microsoft.ServiceBus/namespaces@2022-10-01-preview' = {
  name: '${baseName}sb'
  location: location
  sku: {
    name: 'Standard'
    tier: 'Standard'
  }
  properties: {
    publicNetworkAccess: 'Disabled'
    disableLocalAuth: true
  }
}

resource commandsQueue 'Microsoft.ServiceBus/namespaces/queues@2022-10-01-preview' = {
  parent: namespace
  name: 'commands'
  properties: {
    lockDuration: 'PT1M'
    maxSizeInMegabytes: 1024
    defaultMessageTimeToLive: 'P14D'
  }
}

output name string = namespace.name
output id string = namespace.id
