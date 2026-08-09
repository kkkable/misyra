// MTS-006 — staging parameter shape.
//
// Pre-production validation infrastructure. Mirrors production settings
// where safe; replicas remain at the single default.
using '../main.bicep'

param environment = 'staging'
param namePrefix = 'misyra'
param location = 'japaneast'
param minReplicas = 1
