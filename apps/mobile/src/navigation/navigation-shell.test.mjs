import { readdirSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';

import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('expo-router', async () => {
  const { createElement: createReactElement } = await import('react');

  const Tabs = ({ children, ...props }) => createReactElement('Tabs', props, children);
  Tabs.Screen = ({ name, options }) => createReactElement('TabsScreen', { name, options });

  const Stack = ({ children, ...props }) => createReactElement('Stack', props, children);
  Stack.Screen = ({ name, options }) => createReactElement('StackScreen', { name, options });

  const Redirect = (props) => createReactElement('Redirect', props);

  return { Redirect, Stack, Tabs };
});

import TabLayout from '../../app/(tabs)/_layout.tsx';
import * as RootLayoutModule from '../../app/_layout.tsx';

const RootLayout = RootLayoutModule.default;
const appDirectory = fileURLToPath(new URL('../../app/', import.meta.url));
const tabsDirectory = fileURLToPath(new URL('../../app/(tabs)/', import.meta.url));

const render = (element) => {
  let renderer;
  act(() => {
    renderer = create(element);
  });
  return renderer;
};

describe('MTS-010 route inventory', () => {
  it('keeps exactly four permanent tab routes and full-screen Evidence/Story routes outside the tab group', () => {
    expect(readdirSync(tabsDirectory).sort()).toEqual([
      '_layout.tsx',
      'ai-planner.tsx',
      'index.tsx',
      'progress.tsx',
      'settings.tsx',
    ]);

    expect(readdirSync(appDirectory)).toEqual(
      expect.arrayContaining([
        '(tabs)',
        '+not-found.tsx',
        '_layout.tsx',
        'evidence.tsx',
        'story.tsx',
      ]),
    );
  });
});

describe('MTS-010 tab-navigation shell', () => {
  it('renders only Calendar, AI Planner, Progress, and Settings with Calendar as the default root', () => {
    const renderer = render(createElement(TabLayout));
    const tabs = renderer.root.findByType('Tabs');
    const screens = renderer.root.findAllByType('TabsScreen');

    expect(screens.map((screen) => screen.props.name)).toEqual([
      'index',
      'ai-planner',
      'progress',
      'settings',
    ]);
    expect(screens.map((screen) => screen.props.options.title)).toEqual([
      'Calendar',
      'AI Planner',
      'Progress',
      'Settings',
    ]);
    expect(tabs.props.initialRouteName).toBe('index');
    expect(tabs.props.screenOptions.headerShown).toBe(false);
    expect(tabs.props.screenOptions.tabBarStyle.height).toBeUndefined();
    expect(tabs.props.screenOptions.tabBarStyle.minHeight).toBeGreaterThanOrEqual(44);
  });

  it('places Evidence and Story above the tab navigator as full-screen modal routes', () => {
    const renderer = render(createElement(RootLayout));
    const screens = renderer.root.findAllByType('StackScreen');

    expect(screens.map((screen) => screen.props.name)).toEqual(['(tabs)', 'evidence', 'story']);
    expect(screens[0].props.options).toMatchObject({ headerShown: false });
    expect(screens[1].props.options).toMatchObject({
      gestureEnabled: true,
      headerShown: false,
      presentation: 'fullScreenModal',
    });
    expect(screens[2].props.options).toMatchObject({
      gestureEnabled: true,
      headerShown: false,
      presentation: 'fullScreenModal',
    });
  });

  it('anchors cold-started modal routes to the tab navigator so Back returns to Calendar', () => {
    expect(RootLayoutModule.unstable_settings).toEqual({ anchor: '(tabs)' });
  });
});

describe('MTS-010 deep-link fallback', () => {
  it('redirects an invalid or deleted route safely to the Calendar root', async () => {
    const { default: NotFoundRoute } = await import('../../app/+not-found.tsx');
    const renderer = render(createElement(NotFoundRoute));
    const redirect = renderer.root.findByType('Redirect');

    expect(redirect.props.href).toBe('/(tabs)');
  });
});
