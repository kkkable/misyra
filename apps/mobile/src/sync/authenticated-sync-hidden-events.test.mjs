import assert from 'node:assert/strict';
import test from 'node:test';

import { createAuthenticatedSyncApi } from './authenticated-sync-api.js';

const hiddenEventId = '00000000-0000-4000-8000-000000000273';
const occurrenceId = '00000000-0000-4000-8000-000000000373';

test('MTS-073 authenticated API lists and individually restores hidden calendar events', async () => {
  const calls = [];
  const fetcher = async (url, init) => {
    calls.push({ url, init });
    if (url.endsWith('/v1/calendars/hidden-events')) {
      return {
        ok: true,
        async json() {
          return {
            ok: true,
            payload: [
              {
                id: hiddenEventId,
                connectionId: '00000000-0000-4000-8000-000000000173',
                providerEventId: 'provider-event-1',
                recurrenceScope: 'this_occurrence',
                title: 'Current provider title',
                schedule: {
                  type: 'timed',
                  startInstant: '2026-09-20T01:00:00.000Z',
                  finishInstant: '2026-09-20T02:00:00.000Z',
                  timeZone: 'Asia/Hong_Kong',
                  timeBehavior: 'fixed_instant',
                },
                isRecurring: true,
              },
            ],
          };
        },
      };
    }
    return {
      ok: true,
      async json() {
        return { ok: true, payload: { occurrenceId } };
      },
    };
  };
  const api = createAuthenticatedSyncApi({
    baseUrl: 'https://api.example.test',
    accessToken: 'fixture-access-token',
    fetcher,
  });

  const hidden = await api.listHiddenCalendarEvents();
  const restored = await api.restoreHiddenCalendarEvent(hiddenEventId, {
    recurrenceScope: 'this_and_future',
  });

  assert.equal(hidden.length, 1);
  assert.equal(hidden[0].id, hiddenEventId);
  assert.deepEqual(restored, { occurrenceId });
  assert.deepEqual(
    calls.map(({ url, init }) => [url, init.method, init.body ?? null]),
    [
      ['https://api.example.test/v1/calendars/hidden-events', 'GET', null],
      [
        `https://api.example.test/v1/calendars/hidden-events/${hiddenEventId}/restore`,
        'POST',
        JSON.stringify({ recurrenceScope: 'this_and_future' }),
      ],
    ],
  );
});
