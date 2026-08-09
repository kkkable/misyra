// MTS-006 — Azure Key Vault module.
//
// Secret boundary: RBAC-only authorization, soft delete enabled, and network
// access denied by default (Azure services bypass). No secrets or access
// policies are committed — the vault is the boundary later tickets wire
// identities into.

@description('Deployment environment: development, staging, or production.')
param environment string

@description('Short resource-name prefix identifying the solution instance.')
@minLength(3)
@maxLength(12)
param namePrefix string

@description('Azure region for the vault.')
param location string = 'japaneast'

var baseName = '${namePrefix}${environment}'

resource vault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: '${baseName}kv'
  location: location
  properties: {
    sku: {
      family: 'A'
      name: 'standard'
    }
    tenantId: subscription().tenantId
    enableRbacAuthorization: true
    enableSoftDelete: true
    networkAcls: {
      defaultAction: 'Deny'
      bypass: 'AzureServices'
    }
  }
}

output name string = vault.name
output id string = vault.id
