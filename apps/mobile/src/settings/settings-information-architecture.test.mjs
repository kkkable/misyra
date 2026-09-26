import { readFile } from 'node:fs/promises';
import { fileURLToPath, URL } from 'node:url';

import { describe, expect, it } from 'vitest';

import visualSnapshot from './__snapshots__/settings-information-architecture.json';

const routePath = fileURLToPath(new URL('./settings-route.tsx', import.meta.url));

async function routeSource() {
  return readFile(routePath, 'utf8');
}

function elementContaining(source, testId) {
  const marker = `testID="${testId}"`;
  const markerIndex = source.indexOf(marker);
  if (markerIndex < 0) return null;
  const openIndex = source.lastIndexOf('<', markerIndex);
  const closeIndex = source.indexOf('/>', markerIndex);
  if (openIndex < 0 || closeIndex < 0) return null;
  return source.slice(openIndex, closeIndex + 2);
}

function snapshotFromSource(source) {
  const ids = [...source.matchAll(/testID="settings-(section|row|action)-([^"]+)"/g)].map(
    (match) => ({ kind: match[1], id: match[2] }),
  );
  const sections = [];
  let current = null;
  for (const item of ids) {
    if (item.kind === 'section') {
      current = { id: item.id, rows: [], destructive: [] };
      sections.push(current);
      continue;
    }
    if (current === null) continue;
    if (item.kind === 'row') current.rows.push(item.id);
    if (item.kind === 'action') current.destructive.push(item.id);
  }
  return { sections };
}

describe('MTS-100 Settings information architecture', () => {
  it('renders every approved grouped setting without later-ticket appearance/format/haptic controls', async () => {
    const source = await routeSource();
    const required = [
      'settings-section-account-preferences',
      'settings-row-trust-mode',
      'settings-row-connected-calendar',
      'settings-row-language',
      'settings-section-privacy',
      'settings-row-diagnostics',
      'settings-row-media-retention',
      'settings-row-privacy-policy',
      'settings-row-terms-of-service',
      'settings-action-delete-account',
      'settings-section-calendar-missions',
      'settings-row-hidden-calendar-events',
      'settings-row-notification-status',
      'settings-section-story',
      'settings-row-story-style-profile',
      'settings-section-help',
      'settings-row-faq',
      'settings-row-send-feedback',
      'settings-row-report-problem',
      'settings-row-about',
      'settings-action-sign-out',
    ];

    for (const testId of required) expect(source).toContain(`testID="${testId}"`);

    for (const forbidden of [
      'settings-row-appearance',
      'settings-row-week-start',
      'settings-row-time-format',
      'settings-row-date-format',
      'settings-row-number-format',
      'settings-row-haptics',
      'settings-row-support-email',
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });

  it('keeps ordinary rows interactive while separating sign-out and account deletion as destructive actions', async () => {
    const source = await routeSource();

    for (const testId of [
      'settings-row-connected-calendar',
      'settings-row-language',
      'settings-row-diagnostics',
      'settings-row-media-retention',
      'settings-row-privacy-policy',
      'settings-row-terms-of-service',
      'settings-row-hidden-calendar-events',
      'settings-row-notification-status',
      'settings-row-story-style-profile',
      'settings-row-faq',
      'settings-row-send-feedback',
      'settings-row-report-problem',
      'settings-row-about',
    ]) {
      const element = elementContaining(source, testId);
      expect(element, testId).not.toBeNull();
      expect(element).toContain('onPress=');
    }

    const trustMode = elementContaining(source, 'settings-row-trust-mode');
    expect(trustMode).not.toBeNull();
    expect(trustMode).toContain('<ToggleRow');
    expect(trustMode).toContain('onValueChange=');

    for (const testId of ['settings-action-delete-account', 'settings-action-sign-out']) {
      const element = elementContaining(source, testId);
      expect(element, testId).not.toBeNull();
      expect(element).toContain('<DestructiveButton');
      expect(element).toContain('onPress=');
    }
  });

  it('keeps provider outage state inside Settings → Connected Calendar and preserves the permanent Settings tab', async () => {
    const [source, calendarSource, tabsSource] = await Promise.all([
      routeSource(),
      readFile(new URL('../calendar/calendar-route-screen.tsx', import.meta.url), 'utf8'),
      readFile(new URL('../../app/(tabs)/_layout.tsx', import.meta.url), 'utf8'),
    ]);

    expect(source).toContain('provider_unavailable');
    expect(source).toContain('permission_revoked');
    expect(source).toContain('settings-row-connected-calendar');
    expect(calendarSource).not.toContain('provider_unavailable');
    expect(calendarSource).not.toContain('permission_revoked');
    expect(tabsSource).toContain('name="settings"');
  });

  it('matches the approved deterministic Settings layout snapshot', async () => {
    expect(snapshotFromSource(await routeSource())).toEqual(visualSnapshot);
  });
});
