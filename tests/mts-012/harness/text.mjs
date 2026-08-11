/**
 * MTS-012 harness text model — deterministic advance-width measurement and
 * greedy wrapping used by the manifest builder.
 *
 * This is an explicit MODEL, not a real font rasterizer: every glyph class
 * has a fixed advance factor (latin 0.5em, CJK/full-width 1em, space 0.25em,
 * punctuation 0.5em) and line height is fontSize * LINE_HEIGHT_FACTOR. The
 * model is conservative about wrapping (it does not kern or compress), so a
 * manifest that fits under this model leaves comfortable margin in reality.
 */
import { FONT_ADVANCE, LINE_HEIGHT_FACTOR } from "../fixtures/device-frames.mjs";

const FULL_WIDTH_RE =
  /[\u1100-\u11FF\u2E80-\uA4CF\uAC00-\uD7AF\uF900-\uFAFF\uFF00-\uFFEF\u3000-\u303F\u3040-\u30FF\u31F0-\u31FF\uA960-\uA97F]/;

const CJK_PUNCT_RE =
  /[\u3001\u3002\u3008-\u3011\u3014\u3015\uFF01\uFF0C\uFF0E\uFF1A\uFF1B\uFF1F\uFF08\uFF09\u2018\u2019\u201C\u201D]/;

/**
 * Advance width in em for a single character under the deterministic model.
 *
 * @param {string} ch single character.
 * @returns {number} advance in em.
 */
export function charAdvance(ch) {
  if (FULL_WIDTH_RE.test(ch)) {
    return 1;
  }
  if (ch === " ") {
    return FONT_ADVANCE.space;
  }
  return FONT_ADVANCE.latin;
}

/**
 * Line height in points for a scaled font size.
 *
 * @param {number} fontSize already-scaled font size in pt (includes textScale).
 * @returns {number} line height in pt.
 */
export function lineHeight(fontSize) {
  return fontSize * LINE_HEIGHT_FACTOR;
}

/**
 * Measure a single line of text at a font size.
 *
 * @param {string} text line content.
 * @param {number} fontSize scaled font size in pt.
 * @returns {number} advance width in pt.
 */
export function measureLine(text, fontSize) {
  let total = 0;
  for (const ch of text) {
    total += charAdvance(ch) * fontSize;
  }
  return total;
}

/**
 * Tokenize text into breakable units: Latin runs are whole words, CJK
 * characters are individually breakable, and CJK punctuation stays glued to
 * the preceding CJK character (renderers never orphan a full-width period).
 *
 * @param {string} text input text.
 * @returns {string[]} tokens without spaces.
 */
function tokenize(text) {
  const tokens = [];
  let latinRun = "";
  const flushLatin = () => {
    if (latinRun !== "") {
      tokens.push(latinRun);
      latinRun = "";
    }
  };
  for (const ch of text) {
    if (ch === " ") {
      flushLatin();
      continue;
    }
    if (CJK_PUNCT_RE.test(ch)) {
      const last = tokens[tokens.length - 1];
      const lastChar = last === undefined ? undefined : last[last.length - 1];
      if (lastChar !== undefined && FULL_WIDTH_RE.test(lastChar)) {
        tokens[tokens.length - 1] += ch;
      } else {
        tokens.push(ch);
      }
      continue;
    }
    if (FULL_WIDTH_RE.test(ch)) {
      flushLatin();
      tokens.push(ch);
      continue;
    }
    latinRun += ch;
  }
  flushLatin();
  return tokens;
}

/**
 * Greedy word wrap under the deterministic model.
 *
 * @param {string} text text to wrap.
 * @param {number} fontSize scaled font size in pt.
 * @param {number} maxWidth available width in pt.
 * @returns {{lines: string[], lineWidths: number[]}} wrapped lines and their widths.
 */
export function wrapText(text, fontSize, maxWidth) {
  const lines = [];
  const lineWidths = [];
  let current = "";
  let currentWidth = 0;
  const separatorWidth = FONT_ADVANCE.space * fontSize;
  for (const token of tokenize(text)) {
    const width = measureLine(token, fontSize);
    const sepWidth = current === "" ? 0 : separatorWidth;
    if (current !== "" && currentWidth + sepWidth + width > maxWidth) {
      lines.push(current);
      lineWidths.push(currentWidth);
      current = token;
      currentWidth = width;
    } else {
      current = current === "" ? token : `${current} ${token}`;
      currentWidth += sepWidth + width;
    }
  }
  if (current !== "") {
    lines.push(current);
    lineWidths.push(currentWidth);
  }
  return { lines, lineWidths };
}
