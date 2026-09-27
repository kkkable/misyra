import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const visualState = vi.hoisted(() => ({
  colorScheme: 'light',
  fontScale: 1,
}));

const routerState = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  setParams: vi.fn(),
}));

function flattenStyle(style) {
  if (style === undefined || style === null || style === false) return {};
  if (Array.isArray(style)) {
    return style.reduce((result, value) => ({ ...result, ...flattenStyle(value) }), {});
  }
  return typeof style === 'object' ? style : {};
}

vi.mock('react-native', async () => {
  const { createElement: createReactElement } = await import('react');

  const Text = ({ children, style, allowFontScaling, ...props }) => {
    const flattened = flattenStyle(style);
    const scaled =
      allowFontScaling !== false && typeof flattened.fontSize === 'number'
        ? { ...flattened, fontSize: flattened.fontSize * visualState.fontScale }
        : flattened;
    return createReactElement(
      'Text',
      { ...props, allowFontScaling, style: scaled },
      children,
    );
  };

  const Pressable = ({ children, style, ...props }) => {
    const state = { pressed: false };
    return createReactElement(
      'Pressable',
      {
        ...props,
        style: typeof style === 'function' ? style(state) : style,
      },
      typeof children === 'function' ? children(state) : children,
    );
  };

  const ScrollView = ({ children, ...props }) =>
    createReactElement('ScrollView', props, children);

  return {
    AccessibilityInfo: {
      setAccessibilityFocus: vi.fn(),
    },
    AppState: {
      addEventListener: () => ({ remove: vi.fn() }),
    },
    Modal: ({ children, ...props }) => createReactElement('Modal', props, children),
    Pressable,
    ScrollView,
    StyleSheet: {
      absoluteFill: {},
      create: (styles) => styles,
      flatten: flattenStyle,
      hairlineWidth: 1,
    },
    Switch: 'Switch',
    Text,
    TextInput: 'TextInput',
    View: 'View',
    findNodeHandle: () => 1,
    useColorScheme: () => visualState.colorScheme,
    useWindowDimensions: () => ({
      width: 360,
      height: 800,
      scale: 3,
      fontScale: visualState.fontScale,
    }),
  };
});

vi.mock('expo-router', () => ({
  router: routerState,
  useFocusEffect: vi.fn(),
  useLocalSearchParams: () => ({}),
  useRouter: () => routerState,
}));

vi.mock('expo-localization', () => ({
  getCalendars: () => [{ firstWeekday: 2, uses24hourClock: true }],
  getLocales: () => [{ languageTag: 'en-HK' }],
}));

vi.mock('../experience/native-haptics.js', () => ({
  haptics: { triggerNonBlocking: vi.fn() },
}));

vi.mock('../auth/auth-runtime.js', () => ({
  getAuthApiBaseUrl: () => 'https://example.invalid',
  rootAuthController: {
    restore: vi.fn(async () => ({ status: 'signed_out' })),
    signOut: vi.fn(async () => undefined),
  },
}));

vi.mock('../localization/app-time-zone-runtime.js', () => ({
  useAppTimeZone: () => 'Asia/Hong_Kong',
}));

vi.mock('../localization/use-app-language.js', () => ({
  useAppLanguage: () => 'en',
}));

vi.mock('../storage/database.js', () => ({
  openMobileDatabase: vi.fn(),
}));

vi.mock('../sync/root-sync-runtime.js', () => ({
  requireRegisteredDeviceId: vi.fn(),
  rootSyncRuntime: { run: vi.fn(async () => undefined) },
}));

vi.mock('../notifications/expo-notification-permission.js', () => ({
  createExpoNotificationPermissionService: () => ({
    getStatus: () => new Promise(() => undefined),
    openSettings: vi.fn(async () => undefined),
    request: vi.fn(async () => ({ status: 'enabled' })),
  }),
}));

vi.mock('../notifications/root-notification-rebuild-runtime.js', () => ({
  rootNotificationRebuildLifecycle: { onForeground: vi.fn(async () => undefined) },
}));

vi.mock('../sync/authenticated-sync-api.js', () => ({
  createAuthenticatedSyncApi: vi.fn(),
}));

vi.mock('../ai-planner/ai-planner-draft-persistence.js', () => ({
  createAiPlannerDraftPersistence: vi.fn(),
}));

vi.mock('../ai-planner/calendar-draft-preview.js', () => ({
  createPlannerCalendarDraftStore: vi.fn(),
}));

vi.mock('../ai-planner/planner-api.js', () => ({
  createPlannerApi: vi.fn(),
}));

vi.mock('../ai-planner/planner-media-api.js', () => ({
  createPlannerMediaApi: vi.fn(),
}));

vi.mock('../ai-planner/planner-system-image-picker-runtime.js', () => ({
  plannerSystemImagePicker: {},
}));

vi.mock('../ai-planner/ai-planner-calendar-preview.js', async () => {
  const { createElement: createReactElement } = await import('react');
  return {
    AiPlannerCalendarPreview: (props) =>
      createReactElement('AiPlannerCalendarPreview', props),
  };
});

import { darkColors, lightColors } from '@misyra/design-tokens';

import { BoldTextPreferenceProvider } from './bold-text-preference.js';
import { AiPlannerRouteScreen } from '../ai-planner/ai-planner-route-screen.js';
import { CalendarDayScreen } from '../calendar/calendar-day-screen.js';
import { ProgressScreen } from '../progress/progress-screen.js';
import { SettingsRouteScreen } from '../settings/settings-route.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const progressSnapshot = {
  totalXp: 340,
  totalCompleted: 12,
  currentStreak: 3,
  longestStreak: 5,
  updatedAt: '2026-09-27T00:00:00.000Z',
};

const recent = [
  {
    occurrenceId: '11111111-1111-4111-8111-111111111111',
    title: 'Rendered mission',
    completedAt: '2026-09-27T00:00:00.000Z',
    awardedXp: 50,
  },
];

const surfaces = [
  {
    name: 'calendar',
    testID: 'calendar-day-screen',
    element: () => createElement(CalendarDayScreen, { now: new Date(2026, 8, 27, 9, 0) }),
  },
  {
    name: 'ai-planner',
    testID: 'ai-planner-route',
    element: () => createElement(AiPlannerRouteScreen),
  },
  {
    name: 'progress',
    testID: 'progress-screen',
    element: (theme) =>
      createElement(ProgressScreen, {
        colorScheme: theme,
        language: 'en',
        numberLocale: 'en-HK',
        snapshot: progressSnapshot,
        recent,
      }),
  },
  {
    name: 'settings',
    testID: 'settings-route',
    element: () => createElement(SettingsRouteScreen),
  },
];

function renderSurface(surface, { theme, fontScale = 1, bold = false }) {
  visualState.colorScheme = theme;
  visualState.fontScale = fontScale;

  let renderer;
  act(() => {
    renderer = create(
      createElement(
        BoldTextPreferenceProvider,
        { enabled: bold },
        surface.element(theme),
      ),
    );
  });
  return renderer;
}

function textMetrics(renderer) {
  return renderer.root
    .findAllByType('Text')
    .map((node) => flattenStyle(node.props.style))
    .filter((style) => typeof style.fontSize === 'number');
}

function rootBackground(renderer, testID) {
  return flattenStyle(renderer.root.findByProps({ testID }).props.style).backgroundColor;
}

beforeEach(() => {
  visualState.colorScheme = 'light';
  visualState.fontScale = 1;
  routerState.push.mockReset();
  routerState.replace.mockReset();
  routerState.setParams.mockReset();
});

describe('MTS-102 rendered primary-surface theme and large-text evidence', () => {
  it.each(surfaces)('$name renders distinct light/dark trees using system theme colors', (surface) => {
    const light = renderSurface(surface, { theme: 'light' });
    const dark = renderSurface(surface, { theme: 'dark' });

    expect(rootBackground(light, surface.testID)).toBe(lightColors.canvas);
    expect(rootBackground(dark, surface.testID)).toBe(darkColors.canvas);
    expect(light.toJSON()).not.toEqual(dark.toJSON());

    light.unmount();
    dark.unmount();
  });

  it.each(surfaces)('$name renders larger scaled interface text without replacing the screen tree', (surface) => {
    const normal = renderSurface(surface, { theme: 'light', fontScale: 1 });
    const large = renderSurface(surface, { theme: 'light', fontScale: 2 });

    const normalSizes = textMetrics(normal).map((style) => style.fontSize);
    const largeSizes = textMetrics(large).map((style) => style.fontSize);

    expect(normalSizes.length).toBeGreaterThan(0);
    expect(largeSizes.length).toBe(normalSizes.length);
    expect(Math.max(...largeSizes)).toBeGreaterThan(Math.max(...normalSizes));
    expect(normal.toJSON()).not.toEqual(large.toJSON());
    expect(large.root.findByProps({ testID: surface.testID })).toBeDefined();

    normal.unmount();
    large.unmount();
  });

  it.each(surfaces)('$name renders heavier interface text when Bold Text is enabled', (surface) => {
    const normal = renderSurface(surface, { theme: 'light', bold: false });
    const bold = renderSurface(surface, { theme: 'light', bold: true });

    const normalWeights = textMetrics(normal).map((style) => style.fontWeight).filter(Boolean);
    const boldWeights = textMetrics(bold).map((style) => style.fontWeight).filter(Boolean);

    expect(normalWeights.length).toBeGreaterThan(0);
    expect(boldWeights).not.toEqual(normalWeights);

    normal.unmount();
    bold.unmount();
  });
});
