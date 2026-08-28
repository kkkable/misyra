param location string
param postgresqlServerName string
param serviceBusNamespaceName string
param storageAccountName string
param keyVaultName string
param containerRegistryName string
param postgresqlSkuName string
param postgresqlSkuTier string
param postgresqlStorageSizeGb string
param postgresqlHighAvailabilityMode string
param serviceBusSkuName string
param storageAccountSkuName string
param keyVaultSkuName string
param containerRegistrySkuName string
param enablePrivateNetworking bool
param allowPublicDataPlaneAccess bool
param privateEndpointSubnetId string
param postgresqlAdministratorLogin string

@secure()
param postgresqlAdministratorPassword string

var publicNetworkAccess = enablePrivateNetworking || !allowPublicDataPlaneAccess ? 'Disabled' : 'Enabled'

resource postgresql 'Microsoft.DBforPostgreSQL/flexibleServers@2024-08-01' = {
  name: postgresqlServerName
  location: location
  sku: {
    name: postgresqlSkuName
    tier: postgresqlSkuTier
  }
  properties: {
    version: '18'
    administratorLogin: postgresqlAdministratorLogin
    administratorLoginPassword: postgresqlAdministratorPassword
    storage: {
      storageSizeGB: int(postgresqlStorageSizeGb)
    }
    network: {
      publicNetworkAccess: publicNetworkAccess
    }
    highAvailability: {
      mode: postgresqlHighAvailabilityMode
    }
  }
}

resource serviceBus 'Microsoft.ServiceBus/namespaces@2022-10-01-preview' = {
  name: serviceBusNamespaceName
  location: location
  sku: {
    name: serviceBusSkuName
  }
  properties: {
    publicNetworkAccess: publicNetworkAccess
    minimumTlsVersion: '1.2'
    disableLocalAuth: true
  }
}

resource storage 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: storageAccountName
  location: location
  kind: 'StorageV2'
  sku: {
    name: storageAccountSkuName
  }
  properties: {
    allowBlobPublicAccess: false
    allowSharedKeyAccess: false
    supportsHttpsTrafficOnly: true
    minimumTlsVersion: 'TLS1_2'
    publicNetworkAccess: publicNetworkAccess
  }
}

resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2023-05-01' = {
  parent: storage
  name: 'default'
  properties: {
    deleteRetentionPolicy: {
      enabled: false
    }
    containerDeleteRetentionPolicy: {
      enabled: false
    }
  }
}

resource evidenceWorking 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  parent: blobService
  name: 'evidence-working'
  properties: {
    publicAccess: 'None'
  }
}

resource storyWorking 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  parent: blobService
  name: 'story-working'
  properties: {
    publicAccess: 'None'
  }
}

resource plannerWorking 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  parent: blobService
  name: 'planner-working'
  properties: {
    publicAccess: 'None'
  }
}

resource styleReferences 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  parent: blobService
  name: 'style-references'
  properties: {
    publicAccess: 'None'
  }
}

resource feedbackRetained 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  parent: blobService
  name: 'feedback-retained'
  properties: {
    publicAccess: 'None'
  }
}

resource keyVault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: keyVaultName
  location: location
  properties: {
    tenantId: subscription().tenantId
    sku: {
      family: 'A'
      name: keyVaultSkuName
    }
    accessPolicies: []
    enableRbacAuthorization: true
    enablePurgeProtection: true
    publicNetworkAccess: publicNetworkAccess
  }
}

resource containerRegistry 'Microsoft.ContainerRegistry/registries@2023-07-01' = {
  name: containerRegistryName
  location: location
  sku: {
    name: containerRegistrySkuName
  }
  properties: {
    adminUserEnabled: false
    publicNetworkAccess: publicNetworkAccess
  }
}

resource postgresqlPrivateEndpoint 'Microsoft.Network/privateEndpoints@2024-05-01' = if (enablePrivateNetworking) {
  name: '${postgresqlServerName}-pe'
  location: location
  properties: {
    subnet: {
      id: privateEndpointSubnetId
    }
    privateLinkServiceConnections: [
      {
        name: 'postgresql'
        properties: {
          privateLinkServiceId: postgresql.id
          groupIds: [
            'postgresqlServer'
          ]
        }
      }
    ]
  }
}

resource serviceBusPrivateEndpoint 'Microsoft.Network/privateEndpoints@2024-05-01' = if (enablePrivateNetworking) {
  name: '${serviceBusNamespaceName}-pe'
  location: location
  properties: {
    subnet: {
      id: privateEndpointSubnetId
    }
    privateLinkServiceConnections: [
      {
        name: 'service-bus'
        properties: {
          privateLinkServiceId: serviceBus.id
          groupIds: [
            'namespace'
          ]
        }
      }
    ]
  }
}

resource blobPrivateEndpoint 'Microsoft.Network/privateEndpoints@2024-05-01' = if (enablePrivateNetworking) {
  name: '${storageAccountName}-blob-pe'
  location: location
  properties: {
    subnet: {
      id: privateEndpointSubnetId
    }
    privateLinkServiceConnections: [
      {
        name: 'blob'
        properties: {
          privateLinkServiceId: storage.id
          groupIds: [
            'blob'
          ]
        }
      }
    ]
  }
}

resource keyVaultPrivateEndpoint 'Microsoft.Network/privateEndpoints@2024-05-01' = if (enablePrivateNetworking) {
  name: '${keyVaultName}-pe'
  location: location
  properties: {
    subnet: {
      id: privateEndpointSubnetId
    }
    privateLinkServiceConnections: [
      {
        name: 'vault'
        properties: {
          privateLinkServiceId: keyVault.id
          groupIds: [
            'vault'
          ]
        }
      }
    ]
  }
}

resource containerRegistryPrivateEndpoint 'Microsoft.Network/privateEndpoints@2024-05-01' = if (enablePrivateNetworking) {
  name: '${containerRegistryName}-pe'
  location: location
  properties: {
    subnet: {
      id: privateEndpointSubnetId
    }
    privateLinkServiceConnections: [
      {
        name: 'registry'
        properties: {
          privateLinkServiceId: containerRegistry.id
          groupIds: [
            'registry'
          ]
        }
      }
    ]
  }
}

output postgresqlServerId string = postgresql.id
output serviceBusNamespaceId string = serviceBus.id
output storageAccountId string = storage.id
output keyVaultId string = keyVault.id
output containerRegistryId string = containerRegistry.id
output containerRegistryLoginServer string = containerRegistry.properties.loginServer
