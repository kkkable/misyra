import { createElement } from 'react';
import { StyleSheet, Text as NativeText, type TextProps, type TextStyle } from 'react-native';

import { systemBoldFontWeight, useBoldTextPreference } from './bold-text-preference.js';

type OptionalStyleSheetFlatten = Readonly<{
  flatten?: (style: TextProps['style']) => TextStyle | undefined;
}>;

function flattenTextStyle(style: TextProps['style']): TextStyle | undefined {
  if (style === undefined || style === null || style === false) return undefined;

  const flatten = (StyleSheet as unknown as OptionalStyleSheetFlatten).flatten;
  if (typeof flatten === 'function') return flatten(style);

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
  const style =
    fontWeight === undefined
      ? props.style
      : [props.style, { fontWeight: systemBoldFontWeight(fontWeight, boldTextEnabled) }];

  return createElement(NativeText, { ...props, style });
}
