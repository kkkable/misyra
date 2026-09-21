import type { Pool } from 'pg';

export type ProductMediaCleanupBlobStore = Readonly<{
  delete(container: string, storageKey: string): Promise<void>;
}>;

type ProductMediaCleanupServiceOptions = Readonly<{
  pool: Pool;
  blobStore: ProductMediaCleanupBlobStore;
  now?: () => Date;
  batchSize?: number;
}>;

export type ProductMediaCleanupResult = Readonly<{
  scanned: number;
  deleted: number;
  retryPending: number;
}>;

export function createProductMediaCleanupService(_options: ProductMediaCleanupServiceOptions) {
  return {
    async runOnce(): Promise<ProductMediaCleanupResult> {
      throw new Error('MTS-085 product-media cleanup is not implemented');
    },
  };
}
