import type { Pool } from 'pg';
import { describe, expect, it, vi } from 'vitest';

import { createApiServer } from './index.js';
import { createPlannerRoutes } from './planner-confirmation-routes.js';

const accountId = '11111111-1111-4111-8111-111111111111';

describe('MTS-089 Planner authenticated routes', () => {
  it('mounts provider-neutral extraction behind the authenticated draft boundary', async () => {
    const extract = vi.fn(() =>
      Promise.resolve({
        items: [
          {
            title: 'Lunch',
            localDate: '2026-09-23',
            startLocalTime: '12:00',
            endLocalTime: '12:30',
            allDay: false,
            estimatedMinutes: 30,
            confidence: 0.9,
          },
        ],
        omittedUncertainContent: false,
      }),
    );
    const server = createApiServer({
      authenticate: () => ({ accountId }),
      routes: createPlannerRoutes({} as Pool, { extract }),
    });

    const response = await server.inject({
      method: 'POST',
      url: `/v1/ai-planner/drafts/${accountId}/extract`,
      payload: {
        text: 'Lunch tomorrow',
        imageAssetIds: [],
        appTimeZone: 'Asia/Hong_Kong',
        locale: 'en',
      },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      ok: true,
      payload: {
        items: [{ title: 'Lunch', estimatedMinutes: 30 }],
        omittedUncertainContent: false,
      },
    });
    expect(extract).toHaveBeenCalledTimes(1);

    const wrongDraft = await server.inject({
      method: 'POST',
      url: '/v1/ai-planner/drafts/22222222-2222-4222-8222-222222222222/extract',
      payload: {
        text: 'Lunch tomorrow',
        imageAssetIds: [],
        appTimeZone: 'Asia/Hong_Kong',
        locale: 'en',
      },
    });
    expect(wrongDraft.statusCode).toBe(404);
    await server.close();
  });

  it('fails closed when no Planner extraction provider is configured', async () => {
    const server = createApiServer({
      authenticate: () => ({ accountId }),
      routes: createPlannerRoutes({} as Pool),
    });
    const response = await server.inject({
      method: 'POST',
      url: `/v1/ai-planner/drafts/${accountId}/extract`,
      payload: {
        text: 'Lunch tomorrow',
        imageAssetIds: [],
        appTimeZone: 'Asia/Hong_Kong',
        locale: 'en',
      },
    });
    expect(response.statusCode).toBe(503);
    await server.close();
  });
});
