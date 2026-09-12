import { describe, expect, it } from 'vitest';

import {
  calendarCommandSchema,
  calendarConnectionSchema,
  externalCalendarErrorCodeSchema,
  externalCalendarOwnershipMatrix,
  normalizedProviderEventSchema,
} from './external-calendar.js';

const connectionId = '11111111-1111-4111-8111-111111111111';
const commandId = '22222222-2222-4222-8222-222222222222';

const normalizedEvent = {
  providerCalendarId: 'calendar-1',
  providerEventId: 'event-1',
  title: 'Team sync',
  schedule: {
    type: 'timed',
    startInstant: '2026-09-15T01:00:00.000Z',
    finishInstant: '2026-09-15T02:00:00.000Z',
    timeZone: 'Asia/Hong_Kong',
    timeBehavior: 'fixed_instant',
  },
  recurrence: null,
  location: 'Office',
  providerNotes: 'Bring the draft',
  status: 'confirmed',
  ownership: 'app_owned',
};

describe('MTS-067 shared external-calendar adapter contract', () => {
  it('uses one normalized event model for Google and Apple adapter outputs', () => {
    const googleOutput = normalizedProviderEventSchema.parse(normalizedEvent);
    const appleOutput = normalizedProviderEventSchema.parse({ ...normalizedEvent });

    expect(googleOutput).toEqual(appleOutput);
    expect(Object.keys(googleOutput)).not.toContain('provider');
  });

  it('keeps organizer-controlled provider fields explicitly read-only', () => {
    expect(externalCalendarOwnershipMatrix.app_owned).toEqual({
      canEditTitle: true,
      canEditSchedule: true,
      canEditRecurrence: true,
      canEditLocation: true,
      canEditProviderNotes: true,
      deleteBehavior: 'delete_provider_event',
    });
    expect(externalCalendarOwnershipMatrix.organizer_controlled).toEqual({
      canEditTitle: false,
      canEditSchedule: false,
      canEditRecurrence: false,
      canEditLocation: false,
      canEditProviderNotes: false,
      deleteBehavior: 'dismiss_import',
    });
  });

  it.each([
    'completionState',
    'evidenceState',
    'rewardEligibility',
    'awardedXp',
    'streakState',
    'privacyState',
    'verificationState',
    'storyState',
    'personalNote',
  ])('rejects app-only field %s from provider commands', (field) => {
    const result = calendarCommandSchema.safeParse({
      commandId,
      connectionId,
      operation: 'create',
      event: {
        title: 'Team sync',
        schedule: normalizedEvent.schedule,
        recurrence: null,
        location: null,
        providerNotes: null,
        [field]: 'must-not-leak',
      },
    });

    expect(result.success).toBe(false);
  });

  it('normalizes recurrence, connection state, and provider failures without provider payloads', () => {
    const recurringEvent = normalizedProviderEventSchema.parse({
      ...normalizedEvent,
      recurrence: {
        pattern: { type: 'weekly', interval: 2, weekdays: [1, 3], weekStartsOn: 1 },
        end: { type: 'count', occurrenceCount: 8 },
      },
    });
    const connection = calendarConnectionSchema.parse({
      id: connectionId,
      provider: 'google',
      providerCalendarId: 'calendar-1',
      state: 'provider_unavailable',
    });

    expect(recurringEvent.recurrence?.pattern.type).toBe('weekly');
    expect(connection.state).toBe('provider_unavailable');
    expect(externalCalendarErrorCodeSchema.options).toEqual([
      'authentication_required',
      'permission_denied',
      'rate_limited',
      'provider_unavailable',
      'invalid_sync_cursor',
      'not_found',
      'conflict',
      'unsupported',
      'unknown',
    ]);
  });
});
