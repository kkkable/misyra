import { createElement } from 'react';
import { StyleSheet, Text as NativeText, type TextProps, type TextStyle } from 'react-native';

import { systemBoldFontWeight, useBoldTextPreference } from './bold-text-preference.js';

function flattenTextStyle(style: TextProps['style']): TextStyle | undefined {
  if (style === undefined || style === null || style === false) return undefined;

  if (typeof StyleSheet?.flatten === 'function') {
    return StyleSheet.flatten(style) ?? undefined;
  }

  if (Array.isArray(style)) {
    return style.reduce<TextStyle>((result, value) => {
      const flattened = flattenTextStyle(value);
      return flattened === undefined ? result : { ...result, ...flattened };
    }, {});
  }

  return typeof style === 'object' ? (style as TextStyle) : undefined;
}

export function SystemText(props: TextProps) {
  const boldTextEnabled = useBoldTextPreference();
  const fontWeight = flattenTextStyle(props.style)?.fontWeight;
  const style =
    fontWeight === undefined
      ? props.style
      : [props.style, { fontWeight: systemBoldFontWeight(fontWeight, boldTextEnabled) }];

  return createElement(NativeText, { ...props, style });
}
