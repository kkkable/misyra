/**
 * MTS-012 image harness — react-native web resolution shim.
 *
 * The screenshot harness renders the REAL MTS-009 primitives and the REAL
 * MTS-010 shell-screen surface in headless Chromium. React Native itself
 * cannot run in a browser, so imports of "react-native" inside the bundled
 * application sources resolve here to react-native-web (same renderer Expo
 * Web uses), with Text and TextInput wrapped so the "enlarged text"
 * (textScale 2x) capture dimension multiplies font sizes exactly like the
 * native Android fontScale contract in the technical specification.
 *
 * Everything in this module is deterministic: no device identity, no
 * network access, no runtime data.
 */
import * as React from "react";
import * as ReactNativeWeb from "react-native-web";

export * from "react-native-web";

/** Window key the capture page sets before the bundle executes. */
const TEXT_SCALE_KEY = "__MISYRA_TEXT_SCALE__";

/** Per-window global bag (capture page globals are not in the TS lib). */
const pageGlobal = /** @type {Record<string, any>} */ (globalThis);

/** Resolve the current capture text scale (1 or 2), clamped to sane bounds. */
function currentTextScale() {
  const raw = pageGlobal[TEXT_SCALE_KEY];
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    return 1;
  }
  return Math.min(3, value);
}

/**
 * Flatten a react-native style value (object or nested arrays) safely.
 * @param {any} style
 * @returns {Record<string, any>}
 */
function flattenStyle(style) {
  /** @type {Record<string, any>} */
  const out = {};
  const queue = Array.isArray(style) ? [...style] : [style];
  while (queue.length > 0) {
    const item = queue.shift();
    if (Array.isArray(item)) {
      queue.unshift(...item);
    } else if (item !== null && typeof item === "object") {
      Object.assign(out, item);
    }
  }
  return out;
}

/**
 * Round a scaled length so every capture dimension stays integral.
 * @param {number | undefined} value
 * @returns {number | undefined}
 */
function scaledLength(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return value;
  }
  return Math.max(1, Math.round(value * currentTextScale()));
}

/**
 * Wrap a react-native-web text component so its font metrics honour the
 * capture text scale, mirroring the native fontScale contract.
 * @param {any} RNWTextComponent
 * @returns {any}
 */
function scaledText(RNWTextComponent) {
  /** @type {any} */
  const ScaledTextLabel = React.forwardRef(
    /**
     * @param {any} props
     * @param {any} ref
     */
    function ScaledTextLabel(props, ref) {
      const { style, ...rest } = props;
      const flattened = flattenStyle(style);
      const isScaled = Number(currentTextScale()) !== 1;
      /** @type {Record<string, any>} */
      const scaledStyle = isScaled ? { ...flattened } : flattened;
      if (isScaled) {
        if (scaledStyle.fontSize !== undefined) {
          scaledStyle.fontSize = scaledLength(scaledStyle.fontSize);
        }
        if (scaledStyle.lineHeight !== undefined) {
          scaledStyle.lineHeight = scaledLength(scaledStyle.lineHeight);
        }
      }
      return React.createElement(RNWTextComponent, { ...rest, ref, style: scaledStyle });
    },
  );
  ScaledTextLabel.displayName = `ScaledText(${RNWTextComponent.displayName ?? RNWTextComponent.name ?? "Component"})`;
  return ScaledTextLabel;
}

/** Text and TextInput honour the capture text scale; everything else is RNW. */
export const Text = scaledText(ReactNativeWeb.Text);
export const TextInput = scaledText(ReactNativeWeb.TextInput);
