import { describe, expect, it } from 'vitest';

type Schema = {
  safeParse(value: unknown): { success: boolean };
  parse(value: unknown): unknown;
};

type ContractModule = Record<string, unknown>;

async function load(relativePath: string): Promise<ContractModule> {
  return (await import(relativePath)) as ContractModule;
}

function schema(module: ContractModule, name: string): Schema {
  const value = module[name] as Partial<Schema> | undefined;
  if (typeof value?.safeParse !== 'function' || typeof value.parse !== 'function') {
    throw new TypeError(`Missing required Zod schema export: ${name}`);
  }
  return value as Schema;
}

const mission = {
  id: '11111111-1111-4111-8111-111111111111',
  seriesId: '22222222-2222-4222-8222-222222222222',
  title: 'Read contracts',
  schedule: {
    localStart: '2026-09-01T18:00:00',
    localFinish: '2026-09-01T18:30:00',
    startInstant: '2026-09-01T09:00:00.000Z',
    finishInstant: '2026-09-01T09:30:00.000Z',
    timeZone: 'Asia/Tokyo',
    timeBehavior: 'local_time',
    allDay: false,
    estimatedEffortMinutes: null,
  },
  scheduleState: 'scheduled',
  completionState: 'incomplete',
  evidenceState: 'not_submitted',
  rewardEligibility: 'eligible',
  rewardIssuance: 'not_issued',
  calendarSource: 'internal',
  fieldOwnership: 'app_owned',
  synchronizationState: 'synced',
  storyState: 'none',
  deletionState: 'active',
};

describe('MTS-023 explicit versioned entry points', () => {
  it('publishes stable v1 contract modules', async () => {
    for (const relativePath of ['./v1/index.js', './v1/api.js', './v1/events.js', './v1/sync.js']) {
      await expect(load(relativePath)).resolves.toBeDefined();
    }
  });
});

describe('MTS-023 schema parsing and strictness', () => {
  it('rejects unknown fields and invalid enums in mobile-facing payloads', async () => {
    const api = await load('./v1/api.js');
    const sync = await load('./v1/sync.js');

    expect(
      schema(api, 'apiRequestEnvelopeSchema').safeParse({
        version: 1,
        requestId: '33333333-3333-4333-8333-333333333333',
        payload: {},
        unexpected: true,
      }).success,
    ).toBe(false);

    expect(
      schema(sync, 'mobileMissionSchema').safeParse({
        ...mission,
        schedule: { ...mission.schedule, timeBehavior: 'floating_magic' },
      }).success,
    ).toBe(false);
  });

  it('defines versioned request, response, sync, command, error, and outbox schemas', async () => {
    const api = await load('./v1/api.js');
    const events = await load('./v1/events.js');
    const sync = await load('./v1/sync.js');

    for (const [module, name] of [
      [api, 'apiRequestEnvelopeSchema'],
      [api, 'apiResponseEnvelopeSchema'],
      [api, 'clientActionErrorSchema'],
      [sync, 'syncChangeSchema'],
      [events, 'commandEnvelopeSchema'],
      [events, 'outboxEventEnvelopeSchema'],
    ] as const) {
      expect(typeof schema(module, name).safeParse).toBe('function');
    }
  });
});

describe('MTS-023 stable client-action errors', () => {
  it('keeps the v1 error-code vocabulary snapshot stable', async () => {
    const api = await load('./v1/api.js');

    expect(api.clientActionErrorCodes).toMatchInlineSnapshot(`
      [
        "validation_failed",
        "unauthorized",
        "forbidden",
        "not_found",
        "conflict",
        "already_completed",
        "completion_window_expired",
        "evidence_attempt_limit",
        "temporarily_unavailable",
      ]
    `);
  });
});

describe('MTS-023 mobile privacy boundary', () => {
  it.each(['accessToken', 'refreshToken', 'providerRawPayload', 'providerEventEtag'])(
    'rejects provider-private mission field %s',
    async (field) => {
      const sync = await load('./v1/sync.js');
      expect(
        schema(sync, 'mobileMissionSchema').safeParse({ ...mission, [field]: 'private' }).success,
      ).toBe(false);
    },
  );

  it('rejects provider credentials and private cursor data from mobile calendar contracts', async () => {
    const sync = await load('./v1/sync.js');
    const connection = {
      id: '44444444-4444-4444-8444-444444444444',
      provider: 'google',
      syncDirection: 'two_way',
      connected: true,
    };

    expect(schema(sync, 'mobileCalendarConnectionSchema').safeParse(connection).success).toBe(true);
    expect(
      schema(sync, 'mobileCalendarConnectionSchema').safeParse({
        ...connection,
        accessToken: 'fixture',
        providerCursor: 'private-cursor',
      }).success,
    ).toBe(false);
  });
});

describe('MTS-023 calendar initial-direction contract', () => {
  it('stores only the initial migration direction and rejects persistent one-way/two-way modes', async () => {
    const sync = await load('./v1/sync.js');
    const contract = schema(sync, 'mobileCalendarConnectionSchema');
    const base = {
      id: '55555555-5555-4555-8555-555555555555',
      provider: 'google',
      connected: true,
    };

    expect(
      contract.safeParse({ ...base, initialSyncDirection: 'external_to_misyra' }).success,
    ).toBe(true);
    expect(
      contract.safeParse({ ...base, initialSyncDirection: 'misyra_to_external' }).success,
    ).toBe(true);
    expect(contract.safeParse({ ...base, syncDirection: 'one_way' }).success).toBe(false);
    expect(contract.safeParse({ ...base, syncDirection: 'two_way' }).success).toBe(false);
  });
});

describe('MTS-023 backward-compatible v1 shape snapshots', () => {
  it('snapshots the normalized mission shape rather than provider-private storage fields', async () => {
    const sync = await load('./v1/sync.js');
    expect(schema(sync, 'mobileMissionSchema').parse(mission)).toMatchInlineSnapshot(`
      {
        "calendarSource": "internal",
        "completionState": "incomplete",
        "deletionState": "active",
        "evidenceState": "not_submitted",
        "fieldOwnership": "app_owned",
        "id": "11111111-1111-4111-8111-111111111111",
        "rewardEligibility": "eligible",
        "rewardIssuance": "not_issued",
        "schedule": {
          "allDay": false,
          "estimatedEffortMinutes": null,
          "finishInstant": "2026-09-01T09:30:00.000Z",
          "localFinish": "2026-09-01T18:30:00",
          "localStart": "2026-09-01T18:00:00",
          "startInstant": "2026-09-01T09:00:00.000Z",
          "timeBehavior": "local_time",
          "timeZone": "Asia/Tokyo",
        },
        "scheduleState": "scheduled",
        "seriesId": "22222222-2222-4222-8222-222222222222",
        "storyState": "none",
        "synchronizationState": "synced",
        "title": "Read contracts",
      }
    `);
  });
});
