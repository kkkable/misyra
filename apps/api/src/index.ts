/**
 * Public entry for the Misyra API shell (MTS-003) and its MTS-005 health
 * surface.
 */
export { buildApp, type AppOptions } from "./app.js";
export {
  probeDependencies,
  registerHealthRoutes,
  resolveDependencyConfig,
  type DependencyConfig,
  type DependencyProbe,
  type DependencyState,
  type HealthRoutesOptions,
} from "./health.js";
