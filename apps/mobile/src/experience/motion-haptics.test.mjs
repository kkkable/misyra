import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import { describe, expect, it } from 'vitest';

import { duration, easing, spring } from '@misyra/design-tokens';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const render = (element) => {
  let renderer;
  act(() => {
    renderer = create(element);
  });
  return renderer;
};

describe('MTS-011 centralized motion helpers', () => {
  it('builds timing and spring configs exclusively from shared motion tokens', async () => {
    const { createTimingConfig, sharedSpringConfig } = await import('./motion.js');

    expect(createTimingConfig('instant')).toEqual({
      duration: duration.instant,
      easing: easing.standard,
    });
    expect(createTimingConfig('sheet', 'enter')).toEqual({
      duration: duration.sheet,
      easing: easing.enter,
    });
    expect(sharedSpringConfig).toEqual(spring);
  });
});

describe('MTS-011 Reduce Motion component mapping', () => {
  it('removes nonessential movement/confetti while preserving essential feedback and direct drag', async () => {
    const { MotionPreferenceProvider, useMotionPreference } = await import('./reduce-motion.js');

    const Probe = () => {
      const preference = useMotionPreference();
      return createElement('MotionPolicyProbe', preference);
    };

    const reduced = render(
      createElement(MotionPreferenceProvider, { reduceMotion: true }, createElement(Probe)),
    );
    expect(reduced.root.findByType('MotionPolicyProbe').props).toMatchObject({
      confetti: false,
      directionalMovement: false,
      directDrag: true,
      essentialLoading: true,
      movingOutlines: false,
      transition: 'fade',
    });

    const standard = render(
      createElement(MotionPreferenceProvider, { reduceMotion: false }, createElement(Probe)),
    );
    expect(standard.root.findByType('MotionPolicyProbe').props).toMatchObject({
      confetti: true,
      directionalMovement: true,
      directDrag: true,
      essentialLoading: true,
      movingOutlines: true,
      transition: 'directional',
    });
  });
});

describe('MTS-011 haptic adapter', () => {
  it('maps approved feedback to subtle haptics and becomes a safe no-op when unavailable', async () => {
    const { createFakeHapticDriver, createHapticAdapter } = await import('./haptics.js');

    const available = createFakeHapticDriver({ available: true });
    const haptics = createHapticAdapter(available.driver);

    await expect(haptics.trigger('timeSlotSelection')).resolves.toBe(true);
    await expect(haptics.trigger('snap')).resolves.toBe(true);
    await expect(haptics.trigger('save')).resolves.toBe(true);
    await expect(haptics.trigger('completion')).resolves.toBe(true);
    await expect(haptics.trigger('storySave')).resolves.toBe(true);
    await expect(haptics.trigger('destructiveConfirmation')).resolves.toBe(true);
    await expect(haptics.trigger('validationFailure')).resolves.toBe(true);

    expect(available.events).toEqual([
      'selection',
      'selection',
      'impact:light',
      'impact:light',
      'impact:light',
      'notification:warning',
      'notification:error',
    ]);

    const unavailable = createFakeHapticDriver({ available: false });
    const unavailableHaptics = createHapticAdapter(unavailable.driver);
    await expect(unavailableHaptics.trigger('completion')).resolves.toBe(false);
    expect(unavailable.events).toEqual([]);
  });
});
