import { describe, expect, it } from 'vitest';

type DomainModule = Record<string, unknown>;
type DomainFunction = (...args: unknown[]) => unknown;

function requireFunction(module: DomainModule, name: string): DomainFunction {
  const value = module[name];
  if (typeof value !== 'function') {
    throw new TypeError(`Missing required streak function: ${name}`);
  }
  return value as DomainFunction;
}

async function loadStreakFunctions() {
  const module = (await import('./index.js')) as DomainModule;
  return {
    evaluateStreakDay: requireFunction(module, 'evaluateStreakDay'),
    finalizeStreakDay: requireFunction(module, 'finalizeStreakDay'),
    resolvePendingStreakDay: requireFunction(module, 'resolvePendingStreakDay'),
  };
}

const eligibleCompletionTypes = [
  'verified_on_time',
  'verified_late',
  'self_confirmed',
  'private',
  'trust_mode',
] as const;

describe('MTS-019 streak day-state matrix', () => {
  it('pauses a day with no scheduled missions', async () => {
    const { evaluateStreakDay } = await loadStreakFunctions();

    expect(
      evaluateStreakDay({
        scheduledMissionCount: 0,
        completionTypes: [],
        pendingEvidenceCount: 0,
      }),
    ).toBe('paused');
  });

  it.each(eligibleCompletionTypes)(
    '%s preserves a scheduled day streak',
    async (completionType) => {
      const { evaluateStreakDay } = await loadStreakFunctions();

      expect(
        evaluateStreakDay({
          scheduledMissionCount: 2,
          completionTypes: [completionType],
          pendingEvidenceCount: 0,
        }),
      ).toBe('continued');
    },
  );

  it('breaks a scheduled day only when there is no completion or pending evidence', async () => {
    const { evaluateStreakDay } = await loadStreakFunctions();

    expect(
      evaluateStreakDay({
        scheduledMissionCount: 3,
        completionTypes: [],
        pendingEvidenceCount: 0,
      }),
    ).toBe('broken');
  });

  it('uses a temporary pending state when offline evidence is unresolved', async () => {
    const { evaluateStreakDay } = await loadStreakFunctions();

    expect(
      evaluateStreakDay({
        scheduledMissionCount: 1,
        completionTypes: [],
        pendingEvidenceCount: 1,
      }),
    ).toBe('pending');
  });
});

describe('MTS-019 local-day finalization', () => {
  it('uses the current app time zone to decide whether a local day has ended', async () => {
    const { finalizeStreakDay } = await loadStreakFunctions();
    const common = {
      record: {
        localDate: '2026-01-01',
        state: 'broken',
        finalized: false,
      },
      scheduledMissionCount: 1,
      completionTypes: [],
      pendingEvidenceCount: 0,
      now: '2026-01-02T00:30:00.000Z',
    };

    expect(finalizeStreakDay({ ...common, currentTimeZone: 'America/Los_Angeles' })).toEqual({
      localDate: '2026-01-01',
      state: 'broken',
      finalized: false,
    });

    expect(finalizeStreakDay({ ...common, currentTimeZone: 'Asia/Tokyo' })).toEqual({
      localDate: '2026-01-01',
      state: 'broken',
      finalized: true,
    });
  });

  it('requires an IANA app time zone and an absolute current instant', async () => {
    const { finalizeStreakDay } = await loadStreakFunctions();
    const common = {
      record: {
        localDate: '2026-01-01',
        state: 'broken',
        finalized: false,
      },
      scheduledMissionCount: 1,
      completionTypes: [],
      pendingEvidenceCount: 0,
    };
    const fixedOffsetTimeZone = () =>
      finalizeStreakDay({
        ...common,
        now: '2026-01-02T00:30:00.000Z',
        currentTimeZone: '+08:00',
      });
    const dateOnlyInstant = () =>
      finalizeStreakDay({
        ...common,
        now: '2026-01-02',
        currentTimeZone: 'Asia/Hong_Kong',
      });

    expect(fixedOffsetTimeZone).toThrow();
    expect(dateOnlyInstant).toThrow();
  });

  it('never repairs or rewrites a finalized past day', async () => {
    const { finalizeStreakDay } = await loadStreakFunctions();
    const finalized = Object.freeze({
      localDate: '2026-01-01',
      state: 'broken',
      finalized: true,
    });

    expect(
      finalizeStreakDay({
        record: finalized,
        scheduledMissionCount: 1,
        completionTypes: ['verified_on_time'],
        pendingEvidenceCount: 0,
        now: '2026-01-05T12:00:00.000Z',
        currentTimeZone: 'Asia/Hong_Kong',
      }),
    ).toBe(finalized);
  });

  it('does not finalize an ended day while offline evidence is still pending', async () => {
    const { finalizeStreakDay } = await loadStreakFunctions();

    expect(
      finalizeStreakDay({
        record: {
          localDate: '2026-01-01',
          state: 'pending',
          finalized: false,
        },
        scheduledMissionCount: 1,
        completionTypes: [],
        pendingEvidenceCount: 1,
        now: '2026-01-03T12:00:00.000Z',
        currentTimeZone: 'Asia/Hong_Kong',
      }),
    ).toEqual({
      localDate: '2026-01-01',
      state: 'pending',
      finalized: false,
    });
  });
});

describe('MTS-019 offline pending resolution', () => {
  it('keeps a resolved current local day open until end-of-day finalization', async () => {
    const { resolvePendingStreakDay } = await loadStreakFunctions();

    expect(
      resolvePendingStreakDay(
        {
          localDate: '2026-01-01',
          state: 'pending',
          finalized: false,
        },
        'accepted',
        '2026-01-01T12:00:00.000Z',
        'Asia/Hong_Kong',
      ),
    ).toEqual({
      localDate: '2026-01-01',
      state: 'continued',
      finalized: false,
    });
  });

  it.each(['accepted', 'self_confirmed'])(
    '%s resolution finalizes a historical pending day as continued',
    async (resolution) => {
      const { resolvePendingStreakDay } = await loadStreakFunctions();

      expect(
        resolvePendingStreakDay(
          {
            localDate: '2026-01-01',
            state: 'pending',
            finalized: false,
          },
          resolution,
          '2026-01-03T12:00:00.000Z',
          'Asia/Hong_Kong',
        ),
      ).toEqual({
        localDate: '2026-01-01',
        state: 'continued',
        finalized: true,
      });
    },
  );

  it('rejected evidence removes pending protection and finalizes a historical break', async () => {
    const { resolvePendingStreakDay } = await loadStreakFunctions();

    expect(
      resolvePendingStreakDay(
        {
          localDate: '2026-01-01',
          state: 'pending',
          finalized: false,
        },
        'rejected',
        '2026-01-03T12:00:00.000Z',
        'Asia/Hong_Kong',
      ),
    ).toEqual({
      localDate: '2026-01-01',
      state: 'broken',
      finalized: true,
    });
  });

  it('cannot alter an already finalized day through a late pending-resolution call', async () => {
    const { resolvePendingStreakDay } = await loadStreakFunctions();
    const finalized = Object.freeze({
      localDate: '2026-01-01',
      state: 'broken',
      finalized: true,
    });

    expect(
      resolvePendingStreakDay(
        finalized,
        'accepted',
        '2026-01-05T12:00:00.000Z',
        'Asia/Hong_Kong',
      ),
    ).toBe(finalized);
  });
});
