export const designTokensWorkspace = '@misyra/design-tokens';

export const space = {
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
} as const;

export const radius = {
  xs: 8,
  sm: 10,
  md: 14,
  lg: 18,
  xl: 24,
  pill: 999,
} as const;

export const layout = {
  referencePhoneWidth: 393,
  minimumPhoneWidth: 360,
  maximumPhoneWidth: 412,
  screenHorizontalPadding: 16,
  minimumTouchTarget: 44,
} as const;

export const typography = {
  caption2: { fontSize: 11, fontWeight: '500' },
  caption1: { fontSize: 12, fontWeight: '500' },
  bodySmall: {
    fontSize: 14,
    fontWeight: '400',
    mediumFontWeight: '500',
  },
  body: {
    fontSize: 16,
    fontWeight: '400',
    mediumFontWeight: '500',
  },
  headline: { fontSize: 18, fontWeight: '600' },
  title3: { fontSize: 22, fontWeight: '700' },
  title2: { fontSize: 28, fontWeight: '700' },
  title1: { fontSize: 34, fontWeight: '700' },
} as const;

export const lightColors = {
  canvas: '#F8F8FC',
  surface: '#FFFFFF',
  surfaceRaised: '#FFFFFF',
  surfaceMuted: '#F3F2F8',
  textPrimary: '#15152D',
  textSecondary: '#667085',
  textTertiary: '#98A2B3',
  border: '#E7E5EF',
  divider: '#EEEAF4',

  primary: '#6D3CF3',
  primaryPressed: '#5728D5',
  primarySoft: '#F0EAFF',
  primaryText: '#FFFFFF',

  verified: '#22A95B',
  verifiedSoft: '#EAF8EF',
  late: '#E89A12',
  lateSoft: '#FFF4D8',
  privateState: '#8A93A3',
  privateSoft: '#F0F2F5',
  destructive: '#E5484D',
  destructiveSoft: '#FDECEC',
  external: '#4A7FE7',
  externalSoft: '#EAF1FF',

  overlay: 'rgba(18, 18, 32, 0.38)',
  focusRing: '#8A63FF',
} as const;

export type LightColorTokenName = keyof typeof lightColors;

export const darkColors = {
  canvas: '#11111A',
  surface: '#191925',
  surfaceRaised: '#222231',
  surfaceMuted: '#242434',
  textPrimary: '#F7F5FF',
  textSecondary: '#B9B5C8',
  textTertiary: '#8E899F',
  border: '#343247',
  divider: '#2A2939',

  primary: '#9B7AFF',
  primaryPressed: '#8461F4',
  primarySoft: '#2A214A',
  primaryText: '#FFFFFF',

  verified: '#54CF83',
  verifiedSoft: '#173325',
  late: '#FFC04D',
  lateSoft: '#3C2E13',
  privateState: '#A9B0BD',
  privateSoft: '#292D35',
  destructive: '#FF6B70',
  destructiveSoft: '#3D1F24',
  external: '#79A3FF',
  externalSoft: '#1E2D4D',

  overlay: 'rgba(0, 0, 0, 0.62)',
  focusRing: '#B29CFF',
} as const satisfies Record<LightColorTokenName, string>;

export type ColorTokenName = LightColorTokenName;
export type ThemeColors = typeof lightColors | typeof darkColors;

export const elevation = {
  card: {
    ios: {
      shadowOpacity: 0.08,
      shadowRadius: 3,
      shadowOffsetY: 1,
    },
    android: 2,
  },
  sheet: {
    ios: {
      shadowOpacity: 0.14,
      shadowRadius: 12,
      shadowOffsetY: -2,
    },
    android: 8,
  },
  floating: {
    ios: {
      shadowOpacity: 0.16,
      shadowRadius: 10,
      shadowOffsetY: 4,
    },
    android: 6,
  },
} as const;

export const duration = {
  instant: 80,
  fast: 140,
  standard: 220,
  sheet: 280,
  emphasis: 420,
  celebrationMin: 600,
  celebrationMax: 900,
} as const;

export const easing = {
  standard: [0.2, 0, 0, 1],
  enter: [0, 0, 0.2, 1],
  exit: [0.4, 0, 1, 1],
} as const;

export const spring = {
  damping: 22,
  stiffness: 260,
  mass: 0.8,
} as const;
