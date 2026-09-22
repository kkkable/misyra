import { afterEach, describe, expect, it, vi } from 'vitest';

import { createPlannerApi } from './planner-api.js';

const draftId = '11111111-1111-4111-8111-111111111111';
const confirmationKey = '22222222-2222-4222-8222-222222222222';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('MTS-089 Planner API client', () => {
  it('sends authenticated extraction input and validates the structured result', async () => {
    const fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            ok: true,
            payload: {
              items: [
                {
                  title: 'Lunch',
                  localDate: '2026-09-23',
                  startLocalTime: '12:00',
                  endLocalTime: '12:30',
                  allDay: false,
                  estimatedMinutes: 30,
                  confidence: 0.95,
                },
              ],
              omittedUncertainContent: false,
            },
          }),
      }),
    );
    vi.stubGlobal('fetch', fetch);
    const api = createPlannerApi({
      baseUrl: 'https://api.example.test/',
      accessToken: 'fixture-access-token',
    });

    await expect(
      api.extract(draftId, {
        text: 'Lunch tomorrow',
        imageAssetIds: [],
        appTimeZone: 'Asia/Hong_Kong',
        locale: 'en',
      }),
    ).resolves.toMatchObject({
      items: [{ title: 'Lunch', estimatedMinutes: 30 }],
      omittedUncertainContent: false,
    });

    expect(fetch).toHaveBeenCalledWith(
      `https://api.example.test/v1/ai-planner/drafts/${draftId}/extract`,
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ authorization: 'Bearer fixture-access-token' }),
      }),
    );
  });

  it('uses an idempotency key for confirmation and returns the authoritative Calendar date', async () => {
    const fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            ok: true,
            payload: {
              missionCount: 2,
              calendarDate: '2026-09-23',
              occurrenceIds: [
                '33333333-3333-4333-8333-333333333333',
                '44444444-4444-4444-8444-444444444444',
              ],
            },
          }),
      }),
    );
    vi.stubGlobal('fetch', fetch);
    const api = createPlannerApi({
      baseUrl: 'https://api.example.test',
      accessToken: 'fixture-access-token',
    });

    await expect(api.confirm(draftId, confirmationKey)).resolves.toMatchObject({
      missionCount: 2,
      calendarDate: '2026-09-23',
    });
    expect(fetch).toHaveBeenCalledWith(
      `https://api.example.test/v1/ai-planner/drafts/${draftId}/confirm`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ idempotencyKey: confirmationKey }),
      }),
    );
  });
});
