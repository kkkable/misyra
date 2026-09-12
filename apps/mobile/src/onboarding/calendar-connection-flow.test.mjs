import { describe, expect, it, vi } from 'vitest';

import {
  calendarConnectionMessagesForLocale,
  createCalendarConnectionFlowController,
} from './calendar-connection-flow.js';

function createHarness({ activeConnection: initiallyActive = false } = {}) {
  let activeConnection = initiallyActive;
  const confirmed = [];
  const gateway = {
    hasActiveConnection: vi.fn(async () => activeConnection),
    onConfirmed: vi.fn(async (intent) => {
      confirmed.push(intent);
    }),
  };

  return {
    confirmed,
    controller: createCalendarConnectionFlowController({ gateway }),
    gateway,
    setActiveConnection(value) {
      activeConnection = value;
    },
  };
}

describe('MTS-068 calendar connection direction flow', () => {
  it('requires two confirmations and emits a future-only external-source intent', async () => {
    const harness = createHarness();

    expect(await harness.controller.start('google')).toEqual({
      step: 'direction',
      provider: 'google',
    });
    expect(harness.controller.chooseDirection('external_to_misyra')).toEqual({
      step: 'confirm_initial',
      provider: 'google',
      initialSyncDirection: 'external_to_misyra',
    });
    expect(await harness.controller.confirm()).toEqual({
      step: 'confirm_final',
      provider: 'google',
      initialSyncDirection: 'external_to_misyra',
    });

    expect(harness.gateway.onConfirmed).not.toHaveBeenCalled();

    expect(await harness.controller.confirm()).toEqual({ step: 'complete' });
    expect(harness.confirmed).toEqual([
      {
        provider: 'google',
        initialSyncDirection: 'external_to_misyra',
        initialMigrationWindow: 'future_only',
        pastDataPolicy: 'unchanged',
      },
    ]);
  });

  it('uses the same double-confirmation path for Misyra as initial source', async () => {
    const harness = createHarness();

    await harness.controller.start('apple');
    expect(harness.controller.chooseDirection('misyra_to_external')).toMatchObject({
      step: 'confirm_initial',
      provider: 'apple',
      initialSyncDirection: 'misyra_to_external',
    });
    await harness.controller.confirm();
    await harness.controller.confirm();

    expect(harness.confirmed).toEqual([
      {
        provider: 'apple',
        initialSyncDirection: 'misyra_to_external',
        initialMigrationWindow: 'future_only',
        pastDataPolicy: 'unchanged',
      },
    ]);
  });

  it('blocks a second connection before direction selection', async () => {
    const harness = createHarness({ activeConnection: true });

    expect(await harness.controller.start('google')).toEqual({
      step: 'blocked',
      reason: 'connection_exists',
    });
    expect(harness.gateway.hasActiveConnection).toHaveBeenCalledOnce();
    expect(() => harness.controller.chooseDirection('external_to_misyra')).toThrow(
      /direction cannot be chosen/i,
    );
    expect(harness.gateway.onConfirmed).not.toHaveBeenCalled();
  });

  it('rechecks uniqueness at final confirmation so a concurrent connection wins safely', async () => {
    const harness = createHarness();

    await harness.controller.start('google');
    harness.controller.chooseDirection('external_to_misyra');
    await harness.controller.confirm();
    harness.setActiveConnection(true);

    expect(await harness.controller.confirm()).toEqual({
      step: 'blocked',
      reason: 'connection_exists',
    });
    expect(harness.gateway.hasActiveConnection).toHaveBeenCalledTimes(2);
    expect(harness.gateway.onConfirmed).not.toHaveBeenCalled();
  });

  it('coalesces rapid final confirmations so the provider handoff runs once', async () => {
    let releaseHandoff;
    const handoff = new Promise((resolve) => {
      releaseHandoff = resolve;
    });
    const gateway = {
      hasActiveConnection: vi.fn(async () => false),
      onConfirmed: vi.fn(async () => handoff),
    };
    const controller = createCalendarConnectionFlowController({ gateway });

    await controller.start('google');
    controller.chooseDirection('external_to_misyra');
    await controller.confirm();

    const firstConfirmation = controller.confirm();
    const secondConfirmation = controller.confirm();
    await Promise.resolve();
    await Promise.resolve();

    expect(gateway.onConfirmed).toHaveBeenCalledOnce();
    releaseHandoff();
    await expect(Promise.all([firstConfirmation, secondConfirmation])).resolves.toEqual([
      { step: 'complete' },
      { step: 'complete' },
    ]);
  });

  it('returns to provider choice from direction or blocked state and steps backward through confirmations', async () => {
    const harness = createHarness();

    await harness.controller.start('apple');
    expect(harness.controller.back()).toEqual({ step: 'idle' });

    await harness.controller.start('apple');
    harness.controller.chooseDirection('misyra_to_external');
    await harness.controller.confirm();
    expect(harness.controller.back()).toMatchObject({ step: 'confirm_initial' });
    expect(harness.controller.back()).toEqual({ step: 'direction', provider: 'apple' });
    expect(harness.controller.back()).toEqual({ step: 'idle' });

    harness.setActiveConnection(true);
    await harness.controller.start('google');
    expect(harness.controller.back()).toEqual({ step: 'idle' });
  });

  it('keeps final confirmation retryable when the provider-neutral handoff fails', async () => {
    const gateway = {
      hasActiveConnection: vi.fn(async () => false),
      onConfirmed: vi.fn(async () => {
        throw new Error('temporary handoff failure');
      }),
    };
    const controller = createCalendarConnectionFlowController({ gateway });

    await controller.start('google');
    controller.chooseDirection('external_to_misyra');
    await controller.confirm();

    await expect(controller.confirm()).rejects.toThrow('temporary handoff failure');
    expect(controller.getState()).toMatchObject({
      step: 'confirm_final',
      provider: 'google',
      initialSyncDirection: 'external_to_misyra',
    });
  });

  it('provides confirmation copy that states future impact, unchanged past data, and later bidirectional sync', () => {
    expect(calendarConnectionMessagesForLocale('en')).toMatchObject({
      directionTitle: 'Choose initial sync',
      externalDirection: 'Sync with external calendar',
      misyraDirection: 'Sync with Misyra',
      initialConfirmation:
        'This can migrate or replace future schedule data. Past data will not be changed.',
      finalConfirmation:
        'Confirm this initial direction. After the initial migration, eligible changes sync both ways.',
    });
    expect(calendarConnectionMessagesForLocale('zh-HK')).toMatchObject({
      directionTitle: '選擇初始同步方向',
      externalDirection: '與外部日曆同步',
      misyraDirection: '與 Misyra 同步',
      initialConfirmation: '這可能會遷移或取代未來的行程資料。過去的資料不會更改。',
      finalConfirmation: '確認這個初始方向。初始遷移完成後，符合條件的變更會雙向同步。',
    });
  });
});
