import { describe, expect, it, vi } from 'vitest';

import { createGoogleCalendarSyncService } from './google-calendar-sync.js';

const connectionId = '11111111-1111-4111-8111-111111111111';

function dependencies(direction: 'external_to_misyra' | 'misyra_to_external') {
  const listPendingCommands = vi.fn(() => Promise.resolve([]));
  const provider = {
    initialImport: vi.fn(() => Promise.resolve({ events: [], cursor: 'initial-cursor' })),
    pullChanges: vi.fn(() => Promise.resolve({ changes: [], cursor: 'incremental-cursor' })),
    applyCommands: vi.fn(() => Promise.resolve([])),
  };
  const store = {
    getConnection: vi.fn(() =>
      Promise.resolve({ id: connectionId, initialSyncDirection: direction, state: 'connected' as const }),
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
  it('requests future-only pending commands for Misyra-first initial migration', async () => {
    const { provider, store, listPendingCommands } = dependencies('misyra_to_external');
    const service = createGoogleCalendarSyncService({ provider, store });

    await service.initialSync(connectionId);

    expect(listPendingCommands).toHaveBeenCalledWith(connectionId, { initialMigration: true });
  });

  it('uses the normal pending-command window after incremental provider pulls', async () => {
    const { provider, store, listPendingCommands } = dependencies('external_to_misyra');
    const service = createGoogleCalendarSyncService({ provider, store });

    await service.incrementalSync(connectionId);

    expect(listPendingCommands).toHaveBeenCalledWith(connectionId, { initialMigration: false });
  });
});
