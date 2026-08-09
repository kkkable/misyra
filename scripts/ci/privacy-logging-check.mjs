#!/usr/bin/env node
/**
 * MTS-007 privacy/logging static gate.
 *
 * Technical specification section 28 requires privacy/logging checks on
 * every pull request. Flags console logging of sensitive data, environment
 * variables, and HTTP request/response payloads in tracked source files
 * (.ts/.tsx/.mjs/.js/.cjs/.mts/.cts), or explicit paths when given.
 * Comments and string literals are ignored so static prose cannot trip the
 * gate; only actual code arguments are evaluated. Matched values are never
 * printed — only file paths and violation kinds.
 *
 * Exit code 0 = clean, 1 = violations found, 2 = usage/scan error.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const ROOT = process.cwd();
const FIXTURE_PREFIX = "tests/mts-007/fixtures";
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".mjs", ".js", ".cjs", ".mts", ".cts"]);

const LOG_CALL = /console\.(log|info|warn|error|debug)\s*\(/g;
const ENV_ACCESS = /process\.env\b/;
const HTTP_PAYLOAD =
  /\b(?:req(?:uest)?\.(?:body|headers|query|params)|res(?:ponse)?\.(?:body|headers)|reply\.(?:body|headers))\b/;
const SENSITIVE_TOKEN =
  /\b[A-Za-z_$]?[\w$]*(?:password|passwd|secret|token|api[_-]?key|access[_-]?key|client[_-]?secret|authorization|credential|private[_-]?key|connection[_-]?string|account[_-]?key|session[_-]?id)[\w$]*\b/i;

/**
 * Remove line and block comments so commented-out code cannot trip the
 * gate, while preserving string and template literals verbatim (a literal
 * may itself contain "//" or "/*").
 */
function stripComments(source) {
  let out = "";
  let i = 0;
  let inDouble = false;
  let inSingle = false;
  let inTemplate = false;
  while (i < source.length) {
    const char = source[i];
    const next = source[i + 1];
    if (inDouble || inSingle || inTemplate) {
      out += char;
      if (char === "\\") {
        out += next ?? "";
        i += 2;
        continue;
      }
      if (
        (inDouble && char === '"') ||
        (inSingle && char === "'") ||
        (inTemplate && char === "`")
      ) {
        inDouble = false;
        inSingle = false;
        inTemplate = false;
      }
      i += 1;
      continue;
    }
    if (char === '"') {
      inDouble = true;
      out += char;
      i += 1;
    } else if (char === "'") {
      inSingle = true;
      out += char;
      i += 1;
    } else if (char === "`") {
      inTemplate = true;
      out += char;
      i += 1;
    } else if (char === "/" && next === "/") {
      while (i < source.length && source[i] !== "\n") i += 1;
      out += "\n";
    } else if (char === "/" && next === "*") {
      i += 2;
      while (i < source.length && !(source[i] === "*" && source[i + 1] === "/")) i += 1;
      i += Math.min(2, source.length - i);
      out += " ";
    } else {
      out += char;
      i += 1;
    }
  }
  return out;
}

/** True when `index` sits inside a string or template literal of `source`. */
function isInsideString(source, index) {
  let inDouble = false;
  let inSingle = false;
  let inTemplate = false;
  for (let i = 0; i < index; i += 1) {
    const char = source[i];
    if (char === "\\") {
      i += 1;
      continue;
    }
    if (inDouble) {
      if (char === '"') inDouble = false;
    } else if (inSingle) {
      if (char === "'") inSingle = false;
    } else if (inTemplate) {
      if (char === "`") inTemplate = false;
    } else if (char === '"') {
      inDouble = true;
    } else if (char === "'") {
      inSingle = true;
    } else if (char === "`") {
      inTemplate = true;
    }
  }
  return inDouble || inSingle || inTemplate;
}

function posix(path) {
  return path.split("\\").join("/");
}

function gitTracked() {
  const result = spawnSync("git", ["ls-files"], { cwd: ROOT, encoding: "utf8" });
  if (result.status !== 0) {
    console.error(`privacy check: git ls-files failed: ${result.stderr}`);
    process.exit(2);
  }
  return result.stdout.split(/\r?\n/).filter(Boolean).map(posix);
}

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const abs = join(dir, name);
    const stat = statSync(abs);
    if (stat.isDirectory()) {
      out.push(...walk(abs));
    } else {
      out.push(abs);
    }
  }
  return out;
}

function scanFile(abs) {
  const relPosix = posix(relative(ROOT, abs));
  const source = stripComments(readFileSync(abs, "utf8"));
  const violations = [];
  LOG_CALL.lastIndex = 0;
  let match;
  while ((match = LOG_CALL.exec(source)) !== null) {
    if (isInsideString(source, match.index)) {
      continue; // quoted code or documentation, not a real call
    }
    const span = source.slice(match.index, match.index + 400);
    const code = span
      .replace(/"[^"]*"/g, "")
      .replace(/'[^']*'/g, "")
      .replace(/`[^`]*`/g, "");
    if (ENV_ACCESS.test(span)) {
      violations.push(`${relPosix}: environment-variable-logging`);
    }
    if (HTTP_PAYLOAD.test(span)) {
      violations.push(`${relPosix}: http-payload-logging`);
    }
    if (SENSITIVE_TOKEN.test(code)) {
      violations.push(`${relPosix}: sensitive-data-logging`);
    }
  }
  return violations;
}

const explicit = process.argv.slice(2);
let files;
if (explicit.length > 0) {
  files = [];
  for (const entry of explicit) {
    const abs = resolve(ROOT, entry);
    if (!existsSync(abs)) {
      console.error(`privacy check: no such path: ${entry}`);
      process.exit(2);
    }
    files.push(...(statSync(abs).isDirectory() ? walk(abs) : [abs]));
  }
} else {
  files = gitTracked()
    .filter((file) => SOURCE_EXTENSIONS.has(file.slice(file.lastIndexOf("."))))
    .filter((file) => !file.startsWith(FIXTURE_PREFIX))
    .map((file) => resolve(ROOT, file));
}

const violations = [];
for (const file of files) {
  violations.push(...scanFile(file));
}
for (const violation of violations) {
  console.log(violation);
}
if (violations.length > 0) {
  console.log(`privacy check: ${violations.length} violation(s) found`);
  process.exitCode = 1;
} else {
  console.log("privacy check: clean");
}
