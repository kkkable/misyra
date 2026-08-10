/**
 * MTS-007 privacy-gate fixture that must pass: logs a port number and a
 * static message, never sensitive data.
 */
/**
 * @param {number} port
 */
export function logStartup(port) {
  console.log("service ready on port", port);
}
