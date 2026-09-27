import { createContext, createElement, useContext, type PropsWithChildren } from 'react';
import type { TextStyle } from 'react-native';

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
