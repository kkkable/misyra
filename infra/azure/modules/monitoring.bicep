// MTS-006 — Application Insights / OpenTelemetry monitoring module.
//
// Log Analytics workspace with the Application Insights component wired to
// it — the telemetry destination later tickets connect the API, worker, and
// jobs to.

@description('Deployment environment: development, staging, or production.')
param environment string

@description('Short resource-name prefix identifying the solution instance.')
@minLength(3)
@maxLength(12)
param namePrefix string

@description('Azure region for the monitoring resources.')
param location string = 'japaneast'

var baseName = '${namePrefix}${environment}'

resource workspace 'Microsoft.OperationalInsights/workspaces@2022-10-01' = {
  name: '${baseName}logs'
  location: location
  properties: {
    sku: {
      name: 'PerGB2018'
    }
    retentionInDays: 30
  }
}

resource appInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: '${baseName}ai'
  location: location
  kind: 'web'
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: workspace.id
  }
}

output appInsightsName string = appInsights.name
output workspaceName string = workspace.name
output workspaceId string = workspace.id
