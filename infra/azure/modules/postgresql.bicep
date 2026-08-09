// MTS-006 — Azure Database for PostgreSQL (Flexible Server) module.
//
// Private-boundary server: public network access is disabled. The
// administrator login is a parameterized placeholder and the password is a
// secure parameter with an empty default — real deployments must supply both
// through environment pipelines; no credential value is ever committed here.

@description('Deployment environment: development, staging, or production.')
param environment string

@description('Short resource-name prefix identifying the solution instance.')
@minLength(3)
@maxLength(12)
param namePrefix string

@description('Azure region for the server.')
param location string = 'japaneast'

@description('PostgreSQL major version (approved stack default, technical specification §3).')
param postgresVersion string = '18'

@description('Administrator login name. Placeholder only; override per deployment.')
param administratorLogin string = 'misyra_admin'

@description('Administrator password. Secure parameter with an empty default; must be supplied at deployment time and is never committed.')
@secure()
param administratorLoginPassword string = ''

@description('Compute SKU name for the flexible server.')
param skuName string = 'Standard_B1ms'

@description('Storage size in GB for the flexible server.')
param storageSizeGB int = 32

var baseName = '${namePrefix}${environment}'

resource server 'Microsoft.DBforPostgreSQL/flexibleServers@2024-08-01' = {
  name: '${baseName}pg'
  location: location
  sku: {
    name: skuName
    tier: 'Burstable'
  }
  properties: {
    version: postgresVersion
    administratorLogin: administratorLogin
    administratorLoginPassword: administratorLoginPassword
    storage: {
      storageSizeGB: storageSizeGB
    }
    network: {
      publicNetworkAccess: 'Disabled'
    }
    highAvailability: {
      mode: 'Disabled'
    }
  }
}

output name string = server.name
output id string = server.id
