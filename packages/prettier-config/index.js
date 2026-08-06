/**
 * Shared Prettier formatting policy for every Misyra workspace.
 *
 * The root `.prettierrc.json` delegates to this package so formatting stays
 * deterministic on Windows and Linux. Change the policy here, nowhere else.
 */
module.exports = {
  endOfLine: "lf",
  printWidth: 100,
  trailingComma: "all",
};
