import { readFile } from 'node:fs/promises';
import { URL } from 'node:url';

import { describe, expect, it } from 'vitest';

const moduleRoot = new URL('../../modules/apple-calendar/', import.meta.url);
const mobileRoot = new URL('../../', import.meta.url);

async function source(path) {
  return readFile(new URL(path, moduleRoot), 'utf8');
}

async function mobileSource(path) {
  return readFile(new URL(path, mobileRoot), 'utf8');
}

async function json(path) {
  return JSON.parse(await source(path));
}

describe('MTS-076 Apple Calendar native module boundary', () => {
  it('is an Apple-only Expo local module and remains cleanly unavailable on Android', async () => {
    const [config, barrel] = await Promise.all([
      json('expo-module.config.json'),
      source('index.ts'),
    ]);

    expect(config.platforms).toEqual(['apple']);
    expect(config.apple?.modules).toEqual(['AppleCalendarModule']);
    expect(config.android).toBeUndefined();
    expect(barrel).toContain(
      "requireOptionalNativeModule<AppleCalendarNativeModule>('AppleCalendar')",
    );
    expect(barrel).toContain('isAppleCalendarNativeModuleAvailable');
  });

  it('gates full-access permission behind an explicit Apple Calendar choice', async () => {
    const swift = await source('ios/AppleCalendarModule.swift');

    expect(swift).toContain('userSelectedAppleCalendar');
    expect(swift).toContain('apple_calendar_choice_required');
    expect(swift).toContain('requestFullAccessToEvents');
    expect(swift).toContain('#available(iOS 17.0, *)');
  });

  it('declares both legacy and full-access iOS calendar permission metadata without inventing GATE-B copy', async () => {
    const appConfig = await mobileSource('app.config.ts');

    expect(appConfig).toContain('NSCalendarsUsageDescription');
    expect(appConfig).toContain('NSCalendarsFullAccessUsageDescription');
    expect(appConfig).toContain('MISYRA_EVENTKIT_PERMISSION_COPY');
  });

  it('exposes calendar selection/creation, event CRUD, identifiers, and store-change notifications', async () => {
    const swift = await source('ios/AppleCalendarModule.swift');

    for (const functionName of [
      'getAuthorizationStatus',
      'requestFullAccess',
      'listCalendars',
      'createDedicatedCalendar',
      'fetchEvents',
      'createEvent',
      'updateEvent',
      'deleteEvent',
    ]) {
      expect(swift).toContain(`"${functionName}"`);
    }

    expect(swift).toContain('Events("onStoreChanged")');
    expect(swift).toContain('EKEventStoreChanged');
    expect(swift).toContain('eventIdentifier');
    expect(swift).toContain('calendarIdentifier');
  });

  it('preserves EventKit time-zone identity in native event readback', async () => {
    const [barrel, swift] = await Promise.all([
      source('index.ts'),
      source('ios/AppleCalendarModule.swift'),
    ]);

    expect(barrel).toContain('timeZone: string | null;');
    expect(swift).toContain('"timeZone": event.timeZone?.identifier');
  });

  it('exposes a typed TypeScript store-change event surface', async () => {
    const barrel = await source('index.ts');

    expect(barrel).toContain('AppleCalendarStoreChangedEvent');
    expect(barrel).toContain('AppleCalendarNativeModuleEvents');
    expect(barrel).toContain('onStoreChanged(event: AppleCalendarStoreChangedEvent): void');
    expect(barrel).toContain('NativeModule<AppleCalendarNativeModuleEvents>');
  });

  it('maps provider recurrence through canonical mapping fixtures', async () => {
    const [mapper, fixtures] = await Promise.all([
      source('ios/AppleCalendarRecurrenceMapper.swift'),
      json('fixtures/canonical-recurrence.json'),
    ]);

    expect(fixtures.map((fixture) => fixture.canonical.pattern.type).sort()).toEqual([
      'daily',
      'monthly-date',
      'monthly-ordinal',
      'weekly',
      'yearly-date',
      'yearly-ordinal',
    ]);

    for (const token of [
      'daily',
      'weekly',
      'monthly-date',
      'monthly-ordinal',
      'yearly-date',
      'yearly-ordinal',
    ]) {
      expect(mapper).toContain(token);
    }
  });

  it('preserves canonical weekly phase semantics instead of silently dropping weekStartsOn', async () => {
    const [mapper, harness] = await Promise.all([
      source('ios/AppleCalendarRecurrenceMapper.swift'),
      source('ios/Tests/AppleCalendarNativeTests.swift'),
    ]);

    expect(mapper).toContain('defaultWeekStartsOn');
    expect(mapper).toContain('unsupported_week_start');
    expect(mapper).toContain('interval > 1');
    expect(harness).toContain('testUnsetProviderWeekStartUsesPhoneRegionFallback');
    expect(harness).toContain('testRejectsLossyWeeklyWeekStartMapping');
  });

  it('keeps app-only mission state out of EventKit write payloads', async () => {
    const payload = await source('ios/AppleCalendarEventPayload.swift');

    for (const allowed of ['title', 'schedule', 'recurrence', 'location', 'providerNotes']) {
      expect(payload).toContain(allowed);
    }

    for (const forbidden of [
      'completion',
      'evidence',
      'xp',
      'streak',
      'privacy',
      'personalNote',
      'story',
      'internalMissionType',
    ]) {
      expect(payload).not.toContain(forbidden);
    }
  });

  it('includes Swift harness and simulator permission regression coverage', async () => {
    const [harness, simulator] = await Promise.all([
      source('ios/Tests/AppleCalendarNativeTests.swift'),
      source('ios/Tests/AppleCalendarPermissionSimulatorTests.swift'),
    ]);

    expect(harness).toContain('XCTestCase');
    expect(harness).toContain('testRecurrenceFixturesMapToCanonicalRules');
    expect(harness).toContain('testWritePayloadContainsProviderOwnedFieldsOnly');
    expect(simulator).toContain('XCTestCase');
    expect(simulator).toContain('testPermissionRequestRequiresAppleCalendarChoice');
    expect(simulator).toContain('testFullAccessRequestUsesEventStore');
  });
});
