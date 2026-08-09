#!/usr/bin/env node
/**
 * MTS-007 privacy/logging static gate.
 *
 * Technical specification section 28 requires privacy/logging checks on
 * every pull request. Flags console logging of sensitive data, environment
 * variables, and HTTP request/response payloads in tracked source files
 * (.ts/.tsx/.mjs/.js/.cjs/.mts/.cts), or explicit paths when given.
 * Comments and string literals are ignored so static prose cannot trip the
 * gate; only actual code arguments are evaluated. Each console.* call is
 * examined over its balanced argument region: quoted literals and static
 * template text are skipped, while ${...} interpolation expressions inside
 * template literals are executable code and are inspected. Matched values
 * are never printed — only file paths and violation kinds.
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

/**
 * True when `index` sits inside a quoted string literal or inside static
 * template text of `source`. Executable `${...}` interpolation regions are
 * code, not literal text: they can contain real console.* calls, so an
 * index inside one returns false. Nested strings, braces, and templates
 * inside an interpolation are handled by the balancing helpers.
 */
function isInsideString(source, index) {
  return insideCodeRegion(source, 0, index);
}

/**
 * Classify `index` within executable code scanned from `start` (no literal
 * is open at `start`). Returns true when `index` sits inside a quoted
 * string literal or inside the static text of a nested template literal.
 *
 * @param {string} source
 * @param {number} start
 * @param {number} index
 * @returns {boolean}
 */
function insideCodeRegion(source, start, index) {
  let i = start;
  while (i < index) {
    const ch = source[i];
    if (ch === "\\") {
      i += 2;
      continue;
    }
    if (ch === '"' || ch === "'") {
      const end = skipString(source, i, ch);
      if (index < end) return true;
      i = end;
      continue;
    }
    if (ch === "`") {
      if (insideTemplateStatic(source, i + 1, index)) return true;
      i = skipTemplate(source, i);
      continue;
    }
    i += 1;
  }
  return false;
}

/**
 * Walk the template literal whose opening backtick precedes `i`. Returns
 * true when `index` sits inside static template text (or a nested literal
 * inside an interpolation); false when it sits in executable interpolation
 * code or past the template's closing backtick.
 *
 * @param {string} source
 * @param {number} i
 * @param {number} index
 * @returns {boolean}
 */
function insideTemplateStatic(source, i, index) {
  while (i < index) {
    const ch = source[i];
    if (ch === "\\") {
      i += 2;
      continue;
    }
    if (ch === "`") return false; // template closed before index
    if (ch === "$" && source[i + 1] === "{") {
      const end = skipInterpolation(source, i + 2);
      if (index < end) return insideCodeRegion(source, i + 2, index);
      i = end;
      continue;
    }
    i += 1;
  }
  return true; // reached index while still in static template text
}

/**
 * Return the index just past the closing quote of the string literal opened
 * at `i` (which must point at the opening quote). Handles backslash escapes.
 *
 * @param {string} source
 * @param {number} i
 * @param {string} quote
 * @returns {number}
 */
function skipString(source, i, quote) {
  i += 1;
  while (i < source.length) {
    if (source[i] === "\\") {
      i += 2;
      continue;
    }
    if (source[i] === quote) return i + 1;
    i += 1;
  }
  return i;
}

/**
 * Return the index just past the closing "}" of the ${...} expression that
 * starts just after "${" at position `i`. Nested braces, strings, and
 * templates inside the expression are handled.
 *
 * @param {string} source
 * @param {number} i
 * @returns {number}
 */
function skipInterpolation(source, i) {
  let depth = 1;
  while (i < source.length) {
    const ch = source[i];
    if (ch === "\\") {
      i += 2;
      continue;
    }
    if (ch === '"' || ch === "'") {
      i = skipString(source, i, ch);
      continue;
    }
    if (ch === "`") {
      i = skipTemplate(source, i);
      continue;
    }
    if (ch === "{") {
      depth += 1;
    } else if (ch === "}") {
      depth -= 1;
      if (depth === 0) return i + 1;
    }
    i += 1;
  }
  return i;
}

/**
 * Return the index just past the closing backtick of the template literal
 * opened at `i`. ${...} interpolation regions are skipped as units.
 *
 * @param {string} source
 * @param {number} i
 * @returns {number}
 */
function skipTemplate(source, i) {
  i += 1;
  while (i < source.length) {
    if (source[i] === "\\") {
      i += 2;
      continue;
    }
    if (source[i] === "`") return i + 1;
    if (source[i] === "$" && source[i + 1] === "{") {
      i = skipInterpolation(source, i + 2);
      continue;
    }
    i += 1;
  }
  return i;
}

/**
 * Return the raw text between the parentheses of the call opened at
 * `openIndex`, or null when the call is unbalanced. Literals (including
 * templates with interpolations) are skipped so parentheses inside them
 * cannot confuse balance; interpolation expressions are self-contained
 * brace-balanced units in valid JavaScript.
 *
 * @param {string} source
 * @param {number} openIndex
 * @returns {string | null}
 */
function callArguments(source, openIndex) {
  let depth = 1;
  let i = openIndex + 1;
  while (i < source.length) {
    const ch = source[i];
    if (ch === '"' || ch === "'") {
      i = skipString(source, i, ch);
      continue;
    }
    if (ch === "`") {
      i = skipTemplate(source, i);
      continue;
    }
    if (ch === "(") {
      depth += 1;
    } else if (ch === ")") {
      depth -= 1;
      if (depth === 0) return source.slice(openIndex + 1, i);
    }
    i += 1;
  }
  return null;
}

/**
 * Append the executable code of the template literal opened at `i` to
 * `parts` and return the index just past its closing backtick. Static text
 * between interpolations contributes spaces only (so tokens cannot merge
 * across a boundary); each ${...} expression contributes its own code.
 *
 * @param {string} source
 * @param {number} i
 * @param {string[]} parts
 * @returns {number}
 */
function templateExecutable(source, i, parts) {
  i += 1;
  while (i < source.length) {
    if (source[i] === "\\") {
      i += 2;
      continue;
    }
    if (source[i] === "`") return i + 1;
    if (source[i] === "$" && source[i + 1] === "{") {
      i += 2;
      let depth = 1;
      while (i < source.length && depth > 0) {
        const ch = source[i];
        if (ch === '"' || ch === "'") {
          i = skipString(source, i, ch);
          parts.push(" ");
          continue;
        }
        if (ch === "`") {
          i = templateExecutable(source, i, parts);
          continue;
        }
        if (ch === "{") {
          depth += 1;
        } else if (ch === "}") {
          depth -= 1;
          if (depth === 0) {
            i += 1;
            break;
          }
        } else {
          parts.push(ch);
        }
        i += 1;
      }
      continue;
    }
    parts.push(" ");
    i += 1;
  }
  return i;
}

/**
 * Reduce a call argument region to its executable code: quoted string
 * literals and static template text are skipped (spaces are left so tokens
 * cannot merge across a boundary), while ${...} interpolations and all
 * other code characters are kept for pattern matching.
 *
 * @param {string} region
 * @returns {string}
 */
function executableText(region) {
  const parts = [];
  let i = 0;
  while (i < region.length) {
    const ch = region[i];
    if (ch === '"' || ch === "'") {
      i = skipString(region, i, ch);
      parts.push(" ");
      continue;
    }
    if (ch === "`") {
      i = templateExecutable(region, i, parts);
      continue;
    }
    parts.push(ch);
    i += 1;
  }
  return parts.join("");
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
    const args = callArguments(source, match.index + match[0].length - 1);
    if (args === null) {
      continue; // unbalanced call; nothing to evaluate
    }
    const code = executableText(args);
    if (ENV_ACCESS.test(code)) {
      violations.push(`${relPosix}: environment-variable-logging`);
    }
    if (HTTP_PAYLOAD.test(code)) {
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
