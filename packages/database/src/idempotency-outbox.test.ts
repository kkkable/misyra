import { describe, expect, it } from 'vitest';

type ContractModule = Record<string, unknown>;

async function loadContract(): Promise<ContractModule> {
  return (await import('./index.js')) as ContractModule;
}

describe('MTS-025 idempotency/outbox exports', () => {
  it('exposes idempotent command and outbox worker primitives', async () => {
    const module = await loadContract();

    expect(typeof module.executeIdempotentCommand).toBe('function');
    expect(typeof module.claimOutboxEvents).toBe('function');
    expect(typeof module.completeOutboxEvent).toBe('function');
    expect(typeof module.failOutboxEvent).toBe('function');
  });
});
