// MTS-006 — Azure Blob Storage module.
//
// Storage account with private containers only: public blob access and
// public network access are disabled, HTTPS is enforced, and blob versions
// keep a short soft-delete retention. All names derive from environment
// parameters; no identifiers are hard-coded.

@description('Deployment environment: development, staging, or production.')
param environment string

@description('Short resource-name prefix identifying the solution instance.')
@minLength(3)
@maxLength(12)
param namePrefix string

@description('Azure region for the storage account.')
param location string = 'japaneast'

var baseName = '${namePrefix}${environment}'

resource storage 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: '${baseName}st'
  location: location
  sku: {
    name: 'Standard_LRS'
  }
  kind: 'StorageV2'
  properties: {
    allowBlobPublicAccess: false
    publicNetworkAccess: 'Disabled'
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
  }
}

resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2023-05-01' = {
  parent: storage
  name: 'default'
  properties: {
    deleteRetentionPolicy: {
      enabled: true
      days: 7
    }
  }
}

resource privateContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  parent: blobService
  name: 'private'
  properties: {
    publicAccess: 'None'
  }
}

output name string = storage.name
output id string = storage.id
