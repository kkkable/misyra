// MTS-006 — Container Apps module (API and worker).
//
// One managed environment hosting the API and worker Container Apps. Both
// apps use system-assigned managed identity to pull images from the
// registry; no registry credentials are committed. The API exposes an
// external ingress on its target port; the worker has no ingress.

@description('Deployment environment: development, staging, or production.')
param environment string

@description('Short resource-name prefix identifying the solution instance.')
@minLength(3)
@maxLength(12)
param namePrefix string

@description('Azure region for the Container Apps environment.')
param location string = 'japaneast'

@description('Container registry login server the apps pull images from.')
param registryLoginServer string

@description('Minimum replicas for both apps (environment-tunable).')
param minReplicas int = 1

@description('Container image name (without registry) for the API app.')
param apiImageName string = 'misyra-api:latest'

@description('Container image name (without registry) for the worker app.')
param workerImageName string = 'misyra-worker:latest'

@description('TCP port the API container listens on (matches the app default PORT=3000).')
param apiTargetPort int = 3000

var baseName = '${namePrefix}${environment}'

resource managedEnv 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: '${baseName}env'
  location: location
}

resource api 'Microsoft.App/containerApps@2024-03-01' = {
  name: '${baseName}api'
  location: location
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    managedEnvironmentId: managedEnv.id
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        external: true
        targetPort: apiTargetPort
        transport: 'http'
      }
      registries: [
        {
          server: registryLoginServer
          identity: 'system'
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'api'
          image: '${registryLoginServer}/${apiImageName}'
          resources: {
            cpu: 1
            memory: '0.5Gi'
          }
        }
      ]
      scale: {
        minReplicas: minReplicas
        maxReplicas: max(minReplicas, 1)
      }
    }
  }
}

resource worker 'Microsoft.App/containerApps@2024-03-01' = {
  name: '${baseName}worker'
  location: location
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    managedEnvironmentId: managedEnv.id
    configuration: {
      activeRevisionsMode: 'Single'
      registries: [
        {
          server: registryLoginServer
          identity: 'system'
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'worker'
          image: '${registryLoginServer}/${workerImageName}'
          resources: {
            cpu: 1
            memory: '0.5Gi'
          }
        }
      ]
      scale: {
        minReplicas: minReplicas
        maxReplicas: max(minReplicas, 1)
      }
    }
  }
}

output environmentName string = managedEnv.name
output environmentId string = managedEnv.id
output apiName string = api.name
output workerName string = worker.name
