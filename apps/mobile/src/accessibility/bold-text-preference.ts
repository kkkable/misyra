import { createContext, createElement, useContext, type PropsWithChildren } from 'react';
import { StyleSheet, Text as NativeText, type TextProps, type TextStyle } from 'react-native';

type FontWeight = NonNullable<TextStyle['fontWeight']>;

const BoldTextPreferenceContext = createContext(false);

export function BoldTextPreferenceProvider({
  children,
  enabled,
}: PropsWithChildren<{ readonly enabled: boolean }>) {
  return createElement(BoldTextPreferenceContext.Provider, { value: enabled }, children);
}

export function useBoldTextPreference(): boolean {
  return useContext(BoldTextPreferenceContext);
}

export function systemBoldFontWeight(weight: FontWeight, enabled: boolean): FontWeight {
  if (!enabled) return weight;
  if (weight === '400' || weight === 'normal') return '600';
  if (weight === '500' || weight === '600') return '700';
  return weight;
}

function flattenTextStyle(style: TextProps['style']): TextStyle | undefined {
  if (style === undefined || style === null || style === false) return undefined;

  if (typeof StyleSheet.flatten === 'function') {
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
