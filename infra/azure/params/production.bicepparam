// MTS-006 — production parameter shape.
//
// Production infrastructure: two minimum replicas for the API and worker
// Container Apps so a single instance loss is absorbed. Names, region, and
// scaling remain parameters — no production identifiers are hard-coded
// anywhere in the skeleton.
using '../main.bicep'

param environment = 'production'
param namePrefix = 'misyra'
param location = 'japaneast'
param minReplicas = 2
