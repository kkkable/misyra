import { readFile } from 'node:fs/promises';
import { fileURLToPath, URL } from 'node:url';

import { describe, expect, it } from 'vitest';

const layoutPath = fileURLToPath(new URL('../../app/_layout.tsx', import.meta.url));
const rootSyncRuntimePath = fileURLToPath(new URL('../sync/root-sync-runtime.ts', import.meta.url));
const mutationQueuePath = fileURLToPath(new URL('../storage/mutation-queue.ts', import.meta.url));

describe('MTS-065 notification rebuild wiring', () => {
  it('mounts lifecycle wiring, observes local mutations, and runs after authenticated sync', async () => {
    const [layout, rootSyncRuntime, mutationQueue] = await Promise.all([
      readFile(layoutPath, 'utf8'),
      readFile(rootSyncRuntimePath, 'utf8'),
      readFile(mutationQueuePath, 'utf8'),
    ]);

    expect(layout).toContain('NotificationRebuildBridge');
    expect(rootSyncRuntime).toContain('afterSynchronization');
    expect(mutationQueue).toContain('subscribeLocalMutationApplied');
  });
});
