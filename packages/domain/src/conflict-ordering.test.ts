import { describe, expect, it } from 'vitest';

type DomainModule = Record<string, unknown>;
type DomainFunction = (...args: unknown[]) => unknown;

function requireFunction(module: DomainModule, name: string): DomainFunction {
  const value = module[name];
  if (typeof value !== 'function') {
    throw new TypeError(`Missing required conflict-ordering function: ${name}`);
  }
  return value as DomainFunction;
}

async function loadConflictFunctions() {
  const module = (await import('./index.js')) as DomainModule;
  return {
    resolveMissionEditConflict: requireFunction(module, 'resolveMissionEditConflict'),
    resolveCompletionConflict: requireFunction(module, 'resolveCompletionConflict'),
    resolveStorySaveConflict: requireFunction(module, 'resolveStorySaveConflict'),
  };
}

function save(
  mutationId: string,
  title: string,
  clientTime: string,
  serverReceiptTime: string,
  validationResult: 'valid' | 'invalid' = 'valid',
) {
  return {
    mutationId,
    value: Object.freeze({ title, notes: `${title}-notes` }),
    clientTime,
    serverReceiptTime,
    validationResult,
  };
}

describe('MTS-020 mission edit conflict permutations', () => {
  it.each([
    ['older first', false],
    ['newer first', true],
  ])(
    'selects the whole latest valid save regardless of argument order: %s',
    async (_label, swap) => {
      const { resolveMissionEditConflict } = await loadConflictFunctions();
      const older = save(
        'edit-older',
        'older',
        '2026-08-31T10:00:00.000Z',
        '2026-08-31T10:00:01.000Z',
      );
      const newer = save(
        'edit-newer',
        'newer',
        '2026-08-31T10:01:00.000Z',
        '2026-08-31T10:01:01.000Z',
      );
      const first = swap ? newer : older;
      const second = swap ? older : newer;

      expect(
        resolveMissionEditConflict({
          first,
          second,
          tombstoned: false,
        }),
      ).toEqual({
        winnerMutationId: 'edit-newer',
        value: newer.value,
        reasonCode: 'latest_valid_save',
      });
    },
  );

  it('never field-merges competing mission saves', async () => {
    const { resolveMissionEditConflict } = await loadConflictFunctions();
    const older = {
      ...save('edit-a', 'old title', '2026-08-31T10:00:00.000Z', '2026-08-31T10:00:01.000Z'),
      value: Object.freeze({ title: 'old title', location: 'old location' }),
    };
    const newer = {
      ...save('edit-b', 'new title', '2026-08-31T10:05:00.000Z', '2026-08-31T10:05:01.000Z'),
      value: Object.freeze({ title: 'new title' }),
    };

    const result = resolveMissionEditConflict({ first: older, second: newer, tombstoned: false });

    expect(result).toEqual({
      winnerMutationId: 'edit-b',
      value: newer.value,
      reasonCode: 'latest_valid_save',
    });
    expect((result as { value: Record<string, unknown> }).value).not.toHaveProperty('location');
  });
});

describe('MTS-020 clock fallback conflicts', () => {
  it('uses server receipt time when a client clock is invalid', async () => {
    const { resolveMissionEditConflict } = await loadConflictFunctions();
    const valid = save(
      'valid-clock',
      'valid clock',
      '2026-08-31T10:10:00.000Z',
      '2026-08-31T10:10:01.000Z',
      'valid',
    );
    const invalid = save(
      'invalid-clock',
      'invalid clock',
      '2099-01-01T00:00:00.000Z',
      '2026-08-31T10:09:00.000Z',
      'invalid',
    );

    expect(
      resolveMissionEditConflict({ first: valid, second: invalid, tombstoned: false }),
    ).toEqual({
      winnerMutationId: 'valid-clock',
      value: valid.value,
      reasonCode: 'latest_valid_save',
    });
  });

  it('lets an invalid-clock save win when its server receipt fallback is later', async () => {
    const { resolveMissionEditConflict } = await loadConflictFunctions();
    const valid = save(
      'valid-clock',
      'valid clock',
      '2026-08-31T10:10:00.000Z',
      '2026-08-31T10:10:01.000Z',
      'valid',
    );
    const invalid = save(
      'invalid-clock',
      'fallback winner',
      '2000-01-01T00:00:00.000Z',
      '2026-08-31T10:11:00.000Z',
      'invalid',
    );

    expect(
      resolveMissionEditConflict({ first: valid, second: invalid, tombstoned: false }),
    ).toEqual({
      winnerMutationId: 'invalid-clock',
      value: invalid.value,
      reasonCode: 'latest_valid_save',
    });
  });
});

describe('MTS-020 deletion tombstone properties', () => {
  it.each([
    ['2020-01-01T00:00:00.000Z', '2026-08-31T12:00:00.000Z'],
    ['2026-08-31T12:00:00.000Z', '2020-01-01T00:00:00.000Z'],
    ['2099-01-01T00:00:00.000Z', '2026-08-31T12:00:00.000Z'],
  ])(
    'a tombstone wins over every delayed edit timestamp permutation',
    async (clientTime, receipt) => {
      const { resolveMissionEditConflict } = await loadConflictFunctions();
      const delayedEdit = save('delayed-edit', 'should never return', clientTime, receipt, 'valid');
      const otherEdit = save(
        'other-edit',
        'also discarded',
        '2026-08-31T11:00:00.000Z',
        '2026-08-31T11:00:01.000Z',
      );

      expect(
        resolveMissionEditConflict({
          first: delayedEdit,
          second: otherEdit,
          tombstoned: true,
        }),
      ).toEqual({
        winnerMutationId: null,
        value: null,
        reasonCode: 'mission_deleted',
      });
    },
  );
});

describe('MTS-020 completion ordering', () => {
  it('keeps the first server-accepted completion authoritative', async () => {
    const { resolveCompletionConflict } = await loadConflictFunctions();

    expect(
      resolveCompletionConflict({
        acceptedCompletionId: 'completion-first',
        candidateCompletionId: 'completion-later',
      }),
    ).toEqual({
      acceptedCompletionId: 'completion-first',
      candidateAccepted: false,
      reasonCode: 'already_completed',
    });
  });

  it('accepts the candidate only when no completion has been accepted yet', async () => {
    const { resolveCompletionConflict } = await loadConflictFunctions();

    expect(
      resolveCompletionConflict({
        acceptedCompletionId: null,
        candidateCompletionId: 'completion-first',
      }),
    ).toEqual({
      acceptedCompletionId: 'completion-first',
      candidateAccepted: true,
      reasonCode: 'completion_accepted',
    });
  });
});

describe('MTS-020 Story latest-save application boundary', () => {
  it('selects the latest whole Story draft and clears local Undo/Redo when local loses', async () => {
    const { resolveStorySaveConflict } = await loadConflictFunctions();
    const local = save(
      'story-local',
      'local draft',
      '2026-08-31T10:00:00.000Z',
      '2026-08-31T10:00:01.000Z',
    );
    const remote = save(
      'story-remote',
      'remote draft',
      '2026-08-31T10:05:00.000Z',
      '2026-08-31T10:05:01.000Z',
    );

    expect(resolveStorySaveConflict({ local, remote })).toEqual({
      winnerMutationId: 'story-remote',
      value: remote.value,
      reasonCode: 'story_updated',
      clearLocalUndoHistory: true,
    });
  });

  it('does not clear local Undo/Redo when the local Story draft remains authoritative', async () => {
    const { resolveStorySaveConflict } = await loadConflictFunctions();
    const local = save(
      'story-local',
      'local winner',
      '2026-08-31T10:06:00.000Z',
      '2026-08-31T10:06:01.000Z',
    );
    const remote = save(
      'story-remote',
      'remote older',
      '2026-08-31T10:05:00.000Z',
      '2026-08-31T10:05:01.000Z',
    );

    expect(resolveStorySaveConflict({ local, remote })).toEqual({
      winnerMutationId: 'story-local',
      value: local.value,
      reasonCode: 'latest_valid_save',
      clearLocalUndoHistory: false,
    });
  });
});
