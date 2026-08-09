/**
 * MTS-007 intentional privacy-gate fixture: logging a user password field
 * must be flagged by scripts/ci/privacy-logging-check.mjs. Contains no real
 * secret; "password" is a field name on a fake object.
 */
/**
 * @param {{ password: string }} user
 */
export function logUser(user) {
  console.log("user", user.password);
}
