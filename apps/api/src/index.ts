/**
 * Public entry for the Misyra API shell (MTS-003) and its MTS-005 health
 * surface.
 */
export { buildApp, type AppOptions } from "./app.js";
export {
  DEFAULT_ENV_FILE_PATH,
  parseEnvFile,
  probeDependencies,
  registerHealthRoutes,
  resolveDependencyConfig,
  type DependencyConfig,
  type DependencyProbe,
  type DependencyState,
  type HealthRoutesOptions,
  type ResolveDependencyConfigOptions,
} from "./health.js";
