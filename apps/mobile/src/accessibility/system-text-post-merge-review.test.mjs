import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function flattenStyle(style) {
  if (!Array.isArray(style)) return style ?? {};
  return Object.assign({}, ...style.filter(Boolean).map(flattenStyle));
}

vi.mock('react-native', async () => {
  const { createElement: h } = await import('react');
  return {
    StyleSheet: {
      flatten: flattenStyle,
    },
    Text: ({ children, ...props }) => h('Text', props, children),
  };
});

import { BoldTextPreferenceProvider } from './bold-text-preference.js';
import { SystemText } from './system-text.js';

function renderText(enabled, props = {}) {
  let renderer;
  act(() => {
    renderer = create(
      createElement(
        BoldTextPreferenceProvider,
        { enabled },
        createElement(SystemText, { testID: 'system-text', ...props }, 'Interface copy'),
      ),
    );
  });
  return renderer;
}

describe('MTS-102 post-merge Bold Text correction', () => {
  it('makes default-weight interface text visibly heavier when Bold Text is enabled', () => {
    const normal = renderText(false);
    const bold = renderText(true);

    const normalText = normal.root.findByType('Text');
    const boldText = bold.root.findByType('Text');

    expect(flattenStyle(normalText.props.style).fontWeight).toBeUndefined();
    expect(flattenStyle(boldText.props.style).fontWeight).toBe('600');

    normal.unmount();
    bold.unmount();
  });

  it('continues to map explicit regular and medium weights upward only when enabled', () => {
    const regular = renderText(true, { style: { fontWeight: '400' } });
    const medium = renderText(true, { style: { fontWeight: '500' } });
    const disabled = renderText(false, { style: { fontWeight: '500' } });

    expect(flattenStyle(regular.root.findByType('Text').props.style).fontWeight).toBe('600');
    expect(flattenStyle(medium.root.findByType('Text').props.style).fontWeight).toBe('700');
    expect(flattenStyle(disabled.root.findByType('Text').props.style).fontWeight).toBe('500');

    regular.unmount();
    medium.unmount();
    disabled.unmount();
  });
});
