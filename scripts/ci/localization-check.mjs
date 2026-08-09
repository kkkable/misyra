#!/usr/bin/env node
/**
 * MTS-007 localization-completeness gate.
 *
 * Technical specification section 25: CI blocks missing keys in either
 * locale. Verifies that the English and zh-HK catalogs expose exactly the
 * same key inventory with non-empty values. Optional arguments override the
 * catalog paths (the contract tests use throwaway copies so the approved
 * catalogs are never modified).
 *
 * Exit code 0 = complete, 1 = problems found.
 */
import { readFileSync } from "node:fs";

const DEFAULT_EN = "packages/localization/src/catalogs/en.ts";
const DEFAULT_ZH = "packages/localization/src/catalogs/zh-hk.ts";

function catalogKeys(source) {
  const keys = [];
  const pattern = /"([^"]+)":/g;
  let match;
  while ((match = pattern.exec(source)) !== null) {
    keys.push(match[1]);
  }
  return keys;
}

function catalogValues(source) {
  const values = new Map();
  const pattern = /"([^"]+)"\s*:\s*"([^"]*)"/g;
  let match;
  while ((match = pattern.exec(source)) !== null) {
    values.set(match[1], match[2]);
  }
  return values;
}

const [enPathArg, zhPathArg] = process.argv.slice(2);
const enPath = enPathArg ?? DEFAULT_EN;
const zhPath = zhPathArg ?? DEFAULT_ZH;

const problems = [];
let enSource;
let zhSource;
for (const [label, path] of [
  ["en", enPath],
  ["zh-HK", zhPath],
]) {
  try {
    if (label === "en") {
      enSource = readFileSync(path, "utf8");
    } else {
      zhSource = readFileSync(path, "utf8");
    }
  } catch (error) {
    problems.push(`unable to read ${label} catalog: ${path} (${error.code})`);
  }
}

if (enSource !== undefined && zhSource !== undefined) {
  const enKeys = new Set(catalogKeys(enSource));
  const zhKeys = new Set(catalogKeys(zhSource));
  if (enKeys.size === 0) {
    problems.push(`en catalog defines no keys: ${enPath}`);
  }
  if (zhKeys.size === 0) {
    problems.push(`zh-HK catalog defines no keys: ${zhPath}`);
  }
  for (const key of enKeys) {
    if (!zhKeys.has(key)) problems.push(`missing zh-HK key: ${key}`);
  }
  for (const key of zhKeys) {
    if (!enKeys.has(key)) problems.push(`extra zh-HK key: ${key}`);
  }
  const enValues = catalogValues(enSource);
  const zhValues = catalogValues(zhSource);
  for (const [key, value] of enValues) {
    if (value.length === 0) problems.push(`empty en value: ${key}`);
  }
  for (const [key, value] of zhValues) {
    if (value.length === 0) problems.push(`empty zh-HK value: ${key}`);
  }
}

for (const problem of problems) {
  console.log(problem);
}
if (problems.length > 0) {
  console.log(`localization check: ${problems.length} problem(s) found`);
  process.exitCode = 1;
} else {
  console.log("localization check: en and zh-HK catalogs are key-complete");
}
