// MTS-006 — Container Apps Job module (scheduled cleanup/repair).
//
// One schedule-triggered Container App Job. main.bicep instantiates this
// module twice (cleanup and repair) with different schedules and names. The
// job uses system-assigned managed identity to pull images; no registry
// credentials are committed.

@description('Deployment environment: development, staging, or production.')
param environment string

@description('Short resource-name prefix identifying the solution instance.')
@minLength(3)
@maxLength(12)
param namePrefix string

@description('Azure region for the job.')
param location string = 'japaneast'

@description('Managed environment the job runs in.')
param environmentId string

@description('Container registry login server the job pulls images from.')
param registryLoginServer string

@description('Short job kind used in the resource name (for example cleanup or repair).')
param jobName string

@description('UTC cron expression for the schedule trigger.')
param schedule string

@description('Container image name (without registry) for the job.')
param imageName string = 'misyra-toolbox:latest'

var baseName = '${namePrefix}${environment}'

resource job 'Microsoft.App/jobs@2024-03-01' = {
  name: '${baseName}${jobName}'
  location: location
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    environmentId: environmentId
    configuration: {
      triggerType: 'Schedule'
      replicaTimeout: 600
      scheduleTriggerConfig: {
        cronExpression: schedule
        parallelism: 1
        replicaCompletionCount: 1
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
          name: 'job'
          image: '${registryLoginServer}/${imageName}'
          resources: {
            cpu: 1
            memory: '0.5Gi'
          }
        }
      ]
    }
  }
}

output name string = job.name
output id string = job.id
