import { describe, expect, it } from 'vitest';

import { createProtectedMediaBlobStore } from './protected-media.js';

describe('MTS-078 protected media Blob runtime selection', () => {
  it('uses Azure managed identity when an Azure storage account is configured without NODE_ENV', async () => {
    const store = createProtectedMediaBlobStore({
      AZURE_STORAGE_ACCOUNT_NAME: 'misyrateststorage',
      AZURITE_BLOB_PORT: '1',
    });

    await expect(
      store.put('evidence-working', 'account/asset/original', Buffer.from('x'), 'image/jpeg'),
    ).rejects.toThrow('Missing required environment variable: IDENTITY_ENDPOINT');
  });
});
