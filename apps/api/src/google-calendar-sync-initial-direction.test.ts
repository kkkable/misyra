import { describe, expect, it, vi } from 'vitest';

import type { CalendarCommand } from '@misyra/contracts';

import { createGoogleCalendarSyncService } from './google-calendar-sync.js';

const connectionId = '11111111-1111-4111-8111-111111111111';
const now = new Date('2026-09-13T03:00:00.000Z');

function createCommand(
  commandId: string,
  title: string,
  startInstant: string,
  finishInstant: string,
): CalendarCommand {
  return {
    commandId,
    connectionId,
    operation: 'create',
    event: {
      title,
      schedule: {
        type: 'timed',
        startInstant,
        finishInstant,
        timeZone: 'Asia/Hong_Kong',
        timeBehavior: 'fixed_instant',
      },
      recurrence: null,
      location: null,
      providerNotes: null,
    },
  };
}

const pastCommand = createCommand(
  '22222222-2222-4222-8222-222222222222',
  'Past local mission',
  '2026-09-12T01:00:00.000Z',
  '2026-09-12T02:00:00.000Z',
);
const futureCommand = createCommand(
  '33333333-3333-4333-8333-333333333333',
  'Future local mission',
  '2026-09-15T01:00:00.000Z',
  '2026-09-15T02:00:00.000Z',
);

function dependencies(direction: 'external_to_misyra' | 'misyra_to_external') {
  const listPendingCommands = vi.fn(() =>
    Promise.resolve([
      { occurrenceId: '44444444-4444-4444-8444-444444444444', command: pastCommand },
      { occurrenceId: '55555555-5555-4555-8555-555555555555', command: futureCommand },
    ]),
  );
  const provider = {
    initialImport: vi.fn(() => Promise.resolve({ events: [], cursor: 'initial-cursor' })),
    pullChanges: vi.fn(() => Promise.resolve({ changes: [], cursor: 'incremental-cursor' })),
    applyCommands: vi.fn((commands: readonly CalendarCommand[]) =>
      Promise.resolve(
        commands.map((command) => ({
          commandId: command.commandId,
          status: 'applied' as const,
          providerEventId: `provider-${command.commandId}`,
        })),
      ),
    ),
  };
  const store = {
    getConnection: vi.fn(() =>
      Promise.resolve({
        id: connectionId,
        initialSyncDirection: direction,
        state: 'connected' as const,
      }),
    ),
    reconcileFullImport: vi.fn(() => Promise.resolve()),
    applyProviderChanges: vi.fn(() => Promise.resolve()),
    listPendingCommands,
    applyCommandResults: vi.fn(() => Promise.resolve()),
    clearCursor: vi.fn(() => Promise.resolve()),
  };
  return { provider, store, listPendingCommands };
}

describe('MTS-070 initial migration command window', () => {
  it('exports only future pending missions for Misyra-first initial migration', async () => {
    const { provider, store, listPendingCommands } = dependencies('misyra_to_external');
    const service = createGoogleCalendarSyncService({ provider, store, now: () => now });

    await service.initialSync(connectionId);

    expect(listPendingCommands).toHaveBeenCalledWith(connectionId);
    expect(provider.applyCommands).toHaveBeenCalledWith([futureCommand]);
    expect(store.applyCommandResults).toHaveBeenCalledWith(
      connectionId,
      [{ occurrenceId: '55555555-5555-4555-8555-555555555555', command: futureCommand }],
      [
        {
          commandId: futureCommand.commandId,
          status: 'applied',
          providerEventId: `provider-${futureCommand.commandId}`,
        },
      ],
    );
  });

  it('uses the normal pending-command window after incremental provider pulls', async () => {
    const { provider, store, listPendingCommands } = dependencies('external_to_misyra');
    const service = createGoogleCalendarSyncService({ provider, store, now: () => now });

    await service.incrementalSync(connectionId);

    expect(listPendingCommands).toHaveBeenCalledWith(connectionId);
    expect(provider.applyCommands).toHaveBeenCalledWith([pastCommand, futureCommand]);
  });
});
