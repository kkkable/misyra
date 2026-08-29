import { describe, expect, it } from 'vitest';

import {
  darkColors,
  duration,
  easing,
  elevation,
  layout,
  lightColors,
  radius,
  space,
  spring,
  typography,
} from './index.js';

const hexToLuminance = (value: string) => {
  const channels = value
    .slice(1)
    .match(/.{2}/g)
    ?.map((channel) => Number.parseInt(channel, 16) / 255);

  if (!channels || channels.length !== 3) {
    throw new Error(`Expected six-digit hex colour, received ${value}`);
  }

  const linear = channels.map((channel) =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
  );

  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
};

const contrastRatio = (foreground: string, background: string) => {
  const foregroundLuminance = hexToLuminance(foreground);
  const backgroundLuminance = hexToLuminance(background);
  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);

  return (lighter + 0.05) / (darker + 0.05);
};

describe('MTS-008 design-token schema', () => {
  it('exposes the approved spacing, radius, phone-layout, timing, easing, and spring primitives', () => {
    expect(space).toEqual({
      0: 0,
      1: 4,
      2: 8,
      3: 12,
      4: 16,
      5: 20,
      6: 24,
      8: 32,
      10: 40,
      12: 48,
    });
    expect(radius).toEqual({ xs: 8, sm: 10, md: 14, lg: 18, xl: 24, pill: 999 });
    expect(layout).toEqual({
      referencePhoneWidth: 393,
      minimumPhoneWidth: 360,
      maximumPhoneWidth: 412,
      screenHorizontalPadding: 16,
      minimumTouchTarget: 44,
    });
    expect(duration).toEqual({
      instant: 80,
      fast: 140,
      standard: 220,
      sheet: 280,
      emphasis: 420,
      celebrationMin: 600,
      celebrationMax: 900,
    });
    expect(easing).toEqual({
      standard: [0.2, 0, 0, 1],
      enter: [0, 0, 0.2, 1],
      exit: [0.4, 0, 1, 1],
    });
    expect(spring).toEqual({ damping: 22, stiffness: 260, mass: 0.8 });
  });

  it('provides semantic typography and restrained cross-platform elevation tokens', () => {
    expect(typography).toEqual({
      caption2: { fontSize: 11, fontWeight: '500' },
      caption1: { fontSize: 12, fontWeight: '500' },
      bodySmall: { fontSize: 14, fontWeight: '400', mediumFontWeight: '500' },
      body: { fontSize: 16, fontWeight: '400', mediumFontWeight: '500' },
      headline: { fontSize: 18, fontWeight: '600' },
      title3: { fontSize: 22, fontWeight: '700' },
      title2: { fontSize: 28, fontWeight: '700' },
      title1: { fontSize: 34, fontWeight: '700' },
    });
    expect(elevation).toEqual({
      card: {
        ios: { shadowOpacity: 0.08, shadowRadius: 3, shadowOffsetY: 1 },
        android: 2,
      },
      sheet: {
        ios: { shadowOpacity: 0.14, shadowRadius: 12, shadowOffsetY: -2 },
        android: 8,
      },
      floating: {
        ios: { shadowOpacity: 0.16, shadowRadius: 10, shadowOffsetY: 4 },
        android: 6,
      },
    });
  });

  it('defines explicit approved light and dark semantic/status colours', () => {
    expect(lightColors).toMatchObject({
      canvas: '#F8F8FC',
      surface: '#FFFFFF',
      textPrimary: '#15152D',
      primary: '#6D3CF3',
      verified: '#22A95B',
      late: '#E89A12',
      privateState: '#8A93A3',
      destructive: '#E5484D',
      external: '#4A7FE7',
    });
    expect(darkColors).toMatchObject({
      canvas: '#11111A',
      surface: '#191925',
      textPrimary: '#F7F5FF',
      primary: '#9B7AFF',
      verified: '#54CF83',
      late: '#FFC04D',
      privateState: '#A9B0BD',
      destructive: '#FF6B70',
      external: '#79A3FF',
    });
    expect(lightColors.verified).not.toBe(darkColors.verified);
    expect(lightColors.late).not.toBe(darkColors.late);
    expect(lightColors.privateState).not.toBe(darkColors.privateState);
    expect(lightColors.destructive).not.toBe(darkColors.destructive);
    expect(lightColors.external).not.toBe(darkColors.external);
  });
});

describe('MTS-008 contrast baselines', () => {
  it.each([
    ['light primary text', lightColors.textPrimary, lightColors.canvas],
    ['light secondary text', lightColors.textSecondary, lightColors.canvas],
    ['dark primary text', darkColors.textPrimary, darkColors.canvas],
    ['dark secondary text', darkColors.textSecondary, darkColors.canvas],
  ])('%s meets the 4.5:1 ordinary-text baseline', (_name, foreground, background) => {
    expect(contrastRatio(foreground, background)).toBeGreaterThanOrEqual(4.5);
  });

  it.each([
    ['light primary control', lightColors.primaryText, lightColors.primary],
    ['dark primary control', darkColors.primaryText, darkColors.primary],
  ])('%s meets the 3:1 control baseline', (_name, foreground, background) => {
    expect(contrastRatio(foreground, background)).toBeGreaterThanOrEqual(3);
  });
});
