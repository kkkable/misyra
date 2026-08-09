// MTS-006 — development parameter shape.
//
// Local development infrastructure. Uses the approved primary region default
// and a single replica for every Container App.
using '../main.bicep'

param environment = 'development'
param namePrefix = 'misyra'
param location = 'japaneast'
