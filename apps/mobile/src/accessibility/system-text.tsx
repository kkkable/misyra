import { createElement } from 'react';
import { StyleSheet, Text as NativeText, type TextProps, type TextStyle } from 'react-native';

import { systemBoldFontWeight, useBoldTextPreference } from './bold-text-preference.js';

function flattenTextStyle(style: unknown): TextStyle | undefined {
  if (style === undefined || style === null || style === false) return undefined;

  const flatten = StyleSheet.flatten;
  if (typeof flatten === 'function') return flatten(style as TextProps['style']);

  if (Array.isArray(style)) {
    return style.reduce<TextStyle>((result, value) => {
      const flattened = flattenTextStyle(value);
      return flattened === undefined ? result : { ...result, ...flattened };
    }, {});
  }

  return typeof style === 'object' ? style : undefined;
}

export function SystemText(props: TextProps) {
  const boldTextEnabled = useBoldTextPreference();
  const fontWeight = flattenTextStyle(props.style)?.fontWeight;
  const style = boldTextEnabled
    ? [props.style, { fontWeight: systemBoldFontWeight(fontWeight ?? 'normal', true) }]
    : props.style;

  return createElement(NativeText, { ...props, style });
}
