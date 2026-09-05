import { describe, expect, it, vi } from 'vitest';

import { createOnboardingController } from './onboarding-flow.js';

function createHarness(initialState = null) {
  let savedState = initialState;
  const calls = [];
  const store = {
    load: vi.fn(async () => savedState),
    save: vi.fn(async (state) => {
      savedState = state;
    }),
  };
  const permissions = {
    requestNotifications: vi.fn(async () => {
      calls.push('notifications');
      return 'denied';
    }),
    requestCalendar: vi.fn(async (provider) => {
      calls.push(`calendar:${provider}`);
      return 'denied';
    }),
    requestCamera: vi.fn(async () => calls.push('camera')),
    requestPhotoSave: vi.fn(async () => calls.push('photo-save')),
    showDiagnosticsNotice: vi.fn(async () => calls.push('diagnostics')),
  };
  const openCalendar = vi.fn(() => calls.push('open-calendar'));
  const resolveLanguage = vi.fn(() => 'zh-HK');

  return {
    calls,
    controller: createOnboardingController({
      openCalendar,
      permissions,
      resolveLanguage,
      store,
    }),
    openCalendar,
    permissions,
    resolveLanguage,
    store,
  };
}

describe('MTS-038 onboarding permission timing', () => {
  it('starts after authentication by resolving device language and explaining notifications without prompting early permissions', async () => {
    const harness = createHarness();

    const state = await harness.controller.restore();

    expect(state).toEqual({ language: 'zh-HK', step: 'notifications' });
    expect(harness.resolveLanguage).toHaveBeenCalledOnce();
    expect(harness.calls).toEqual([]);
  });

  it('requests notifications only after Enable notifications, then advances to optional calendar connection', async () => {
    const harness = createHarness();
    await harness.controller.restore();

    const state = await harness.controller.chooseNotifications('enable');

    expect(state).toEqual({ language: 'zh-HK', step: 'calendar' });
    expect(harness.permissions.requestNotifications).toHaveBeenCalledOnce();
    expect(harness.permissions.requestCalendar).not.toHaveBeenCalled();
    expect(harness.permissions.requestCamera).not.toHaveBeenCalled();
    expect(harness.permissions.requestPhotoSave).not.toHaveBeenCalled();
    expect(harness.permissions.showDiagnosticsNotice).not.toHaveBeenCalled();
  });

  it('supports Not now without a notification prompt or repeated nag and resumes at calendar choice', async () => {
    const harness = createHarness();
    await harness.controller.restore();
    await harness.controller.chooseNotifications('not_now');

    const resumed = createHarness({ language: 'zh-HK', step: 'calendar' });
    const state = await resumed.controller.restore();

    expect(harness.permissions.requestNotifications).not.toHaveBeenCalled();
    expect(state).toEqual({ language: 'zh-HK', step: 'calendar' });
    expect(resumed.permissions.requestNotifications).not.toHaveBeenCalled();
    expect(resumed.resolveLanguage).not.toHaveBeenCalled();
  });

  it('requests calendar access only after a provider is chosen and denial still opens the internal Calendar', async () => {
    const harness = createHarness({ language: 'en', step: 'calendar' });
    await harness.controller.restore();

    const state = await harness.controller.chooseCalendarProvider('google');

    expect(harness.permissions.requestCalendar).toHaveBeenCalledWith('google');
    expect(state).toEqual({ language: 'en', step: 'complete' });
    expect(harness.openCalendar).toHaveBeenCalledOnce();
    expect(harness.calls).toEqual(['calendar:google', 'open-calendar']);
    expect(harness.permissions.requestCamera).not.toHaveBeenCalled();
    expect(harness.permissions.requestPhotoSave).not.toHaveBeenCalled();
    expect(harness.permissions.showDiagnosticsNotice).not.toHaveBeenCalled();
  });

  it('allows skipping external calendar connection and opens Calendar without requesting calendar access', async () => {
    const harness = createHarness({ language: 'en', step: 'calendar' });
    await harness.controller.restore();

    const state = await harness.controller.chooseCalendarProvider(null);

    expect(harness.permissions.requestCalendar).not.toHaveBeenCalled();
    expect(state).toEqual({ language: 'en', step: 'complete' });
    expect(harness.openCalendar).toHaveBeenCalledOnce();
  });

  it('resumes completed onboarding directly into Calendar without replaying permission prompts', async () => {
    const harness = createHarness({ language: 'en', step: 'complete' });

    const state = await harness.controller.restore();

    expect(state).toEqual({ language: 'en', step: 'complete' });
    expect(harness.openCalendar).toHaveBeenCalledOnce();
    expect(harness.permissions.requestNotifications).not.toHaveBeenCalled();
    expect(harness.permissions.requestCalendar).not.toHaveBeenCalled();
  });
});
