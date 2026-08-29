import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import {
  buttonContract,
  fieldContract,
  overlayContract,
  primitiveAccessibilityRoles,
  primitiveInventory,
  primitiveSnapshot,
  rowContract,
  surfaceContract,
} from './contracts.js';

const loadSnapshot = async (name: string): Promise<unknown> =>
  JSON.parse(
    await readFile(new URL(`./__snapshots__/${name}.json`, import.meta.url), 'utf8'),
  ) as unknown;

describe('MTS-009 foundational primitive inventory', () => {
  it('covers the approved foundational component boundary without later-ticket navigation or feature widgets', () => {
    expect(primitiveInventory).toEqual([
      'Screen',
      'SafeAreaScreen',
      'TopBar',
      'PrimaryButton',
      'SecondaryButton',
      'DestructiveButton',
      'IconButton',
      'TextField',
      'TextArea',
      'ToggleRow',
      'SettingsRow',
      'SectionHeader',
      'Card',
      'BottomSheet',
      'ConfirmationDialog',
      'Toast',
      'InlineMessage',
      'EmptyState',
      'LoadingSkeleton',
    ]);
  });
});

describe('MTS-009 interaction-state contracts', () => {
  it('keeps button actions at the minimum touch target and exposes pressed, disabled, and loading states', () => {
    expect(buttonContract('primary', 'light', { pressed: true })).toMatchObject({
      backgroundColor: '#5728D5',
      foregroundColor: '#FFFFFF',
      minimumTouchTarget: 44,
      disabled: false,
      busy: false,
    });

    expect(buttonContract('primary', 'light', { loading: true })).toMatchObject({
      minimumTouchTarget: 44,
      disabled: true,
      busy: true,
    });

    expect(buttonContract('secondary', 'dark', { disabled: true })).toMatchObject({
      backgroundColor: '#242434',
      foregroundColor: '#8E899F',
      minimumTouchTarget: 44,
      disabled: true,
    });
  });

  it('gives fields explicit focus, error, disabled, and multiline contracts', () => {
    expect(fieldContract('dark', { focused: true })).toMatchObject({
      borderColor: '#B29CFF',
      backgroundColor: '#191925',
      minimumTouchTarget: 44,
      invalid: false,
      disabled: false,
    });

    expect(fieldContract('light', { error: true })).toMatchObject({
      borderColor: '#E5484D',
      invalid: true,
    });

    expect(fieldContract('light', { disabled: true, multiline: true })).toMatchObject({
      backgroundColor: '#F3F2F8',
      foregroundColor: '#98A2B3',
      disabled: true,
      multiline: true,
      minimumRows: 3,
    });
  });

  it('defines selected/disabled row and card states without adding feature-specific variants', () => {
    expect(rowContract('light', { selected: true })).toMatchObject({
      backgroundColor: '#F0EAFF',
      minimumTouchTarget: 44,
      selected: true,
      disabled: false,
    });

    expect(rowContract('dark', { disabled: true })).toMatchObject({
      backgroundColor: '#242434',
      foregroundColor: '#8E899F',
      minimumTouchTarget: 44,
      disabled: true,
    });

    expect(surfaceContract('card', 'light', { selected: true })).toMatchObject({
      backgroundColor: '#FFFFFF',
      borderColor: '#8A63FF',
      selected: true,
    });
  });

  it('uses explicit theme overlays for sheets and dialogs', () => {
    expect(overlayContract('light')).toEqual({
      backdropColor: 'rgba(18, 18, 32, 0.38)',
      surfaceColor: '#FFFFFF',
    });
    expect(overlayContract('dark')).toEqual({
      backdropColor: 'rgba(0, 0, 0, 0.62)',
      surfaceColor: '#222231',
    });
  });
});

describe('MTS-009 accessibility contracts', () => {
  it('defines VoiceOver/TalkBack roles for interactive and status primitives', () => {
    expect(primitiveAccessibilityRoles).toEqual({
      PrimaryButton: 'button',
      SecondaryButton: 'button',
      DestructiveButton: 'button',
      IconButton: 'button',
      TextField: 'text',
      TextArea: 'text',
      ToggleRow: 'switch',
      SettingsRow: 'button',
      SectionHeader: 'header',
      ConfirmationDialog: 'alert',
      Toast: 'alert',
      InlineMessage: 'alert',
    });
  });
});

describe('MTS-009 deterministic visual and large-text snapshots', () => {
  it('matches the approved light-mode baseline', async () => {
    expect(primitiveSnapshot('light', 1)).toEqual(await loadSnapshot('light'));
  });

  it('keeps critical actions wrapping and non-clipping at a large text scale in dark mode', async () => {
    expect(primitiveSnapshot('dark', 2)).toEqual(await loadSnapshot('dark-large-text'));
  });
});
