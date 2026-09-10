import { createElement } from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('react-native', async () => {
  const { createElement: createReactElement } = await import('react');
  return {
    StyleSheet: { create: (styles) => styles },
    Text: ({ children, ...props }) => createReactElement('Text', props, children),
    View: ({ children, ...props }) => createReactElement('View', props, children),
  };
});

let AppTimeZoneNotice;

beforeAll(async () => {
  ({ AppTimeZoneNotice } = await import('./app-time-zone-notice.js'));
});

describe('MTS-053 device-zone change notice', () => {
  it.each([
    ['en', 'Time zone updated to Europe/London.'],
    ['zh-HK', '時區已更新為 Europe/London。'],
  ])('renders a small localized non-blocking notice in %s', (language, expected) => {
    let renderer;
    act(() => {
      renderer = TestRenderer.create(
        createElement(AppTimeZoneNotice, {
          colorScheme: 'light',
          language,
          timeZone: 'Europe/London',
        }),
      );
    });

    const notice = renderer.root.findByProps({ testID: 'app-time-zone-change-notice' });
    expect(notice.props.accessibilityLiveRegion).toBe('polite');
    expect(renderer.root.findByType('Text').children.join('')).toBe(expected);
  });
});
