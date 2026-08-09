/**
 * MTS-007 intentional privacy-gate fixture: logging an environment variable
 * must be flagged by scripts/ci/privacy-logging-check.mjs. Contains no real
 * secret; the variable name is illustrative only.
 */
export function logApiKeySource() {
  console.log("api key source", process.env.MISYRA_API_KEY);
}
