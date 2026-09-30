import { describe, expect, it } from 'vitest';

import {
  MOBILE_PERFORMANCE_BUDGETS,
  createMobilePerformanceRecorder,
  createMobilePerformanceProfile,
  summarizePerformanceSamples,
} from './mobile-performance.js';

describe('MTS-112 mobile performance budget contracts', () => {
  it('keeps the approved numeric budgets explicit and machine-readable', () => {
    expect(MOBILE_PERFORMANCE_BUDGETS).toEqual({
      warmCalendarInteractiveMs: 2_000,
      cachedDayQueryMs: 50,
      screenTransitionMs: 300,
      storyExportMs: 5_000,
    });
  });

  it('summarizes repeated measurements with stable percentile semantics', () => {
    expect(summarizePerformanceSamples([10, 20, 30, 40, 50])).toEqual({
      count: 5,
      minMs: 10,
      medianMs: 30,
      p95Ms: 50,
      maxMs: 50,
    });
    expect(() => summarizePerformanceSamples([])).toThrow('performance_samples_empty');
    expect(() => summarizePerformanceSamples([1, Number.NaN])).toThrow(
      'performance_sample_invalid',
    );
  });

  it('records named durations from an injected monotonic clock without wall-clock coupling', () => {
    const readings = [100, 125, 200, 260];
    const recorder = createMobilePerformanceRecorder({
      now: () => readings.shift() ?? 260,
    });

    const calendar = recorder.start('warmCalendarInteractive');
    calendar.finish();
    const story = recorder.start('storyExport');
    story.finish();

    expect(recorder.snapshot()).toEqual({
      warmCalendarInteractive: [25],
      cachedDayQuery: [],
      screenTransition: [],
      storyExport: [60],
    });
  });

  it('requires concrete supported-device metadata and evaluates measurements against budgets', () => {
    const profile = createMobilePerformanceProfile({
      device: {
        platform: 'android',
        model: 'mid-range-fixture',
        osVersion: 'fixture-os',
        appBuild: 'fixture-build',
      },
      recordedAt: '2026-09-30T12:38:18.000Z',
      samples: {
        warmCalendarInteractive: [1_850, 1_900, 1_920],
        cachedDayQuery: [22, 25, 28, 32, 35],
        screenTransition: [180, 210, 230],
        storyExport: [4_100, 4_350, 4_600],
      },
    });

    expect(profile.metrics.warmCalendarInteractive.passesBudget).toBe(true);
    expect(profile.metrics.cachedDayQuery.passesBudget).toBe(true);
    expect(profile.metrics.screenTransition.passesBudget).toBe(true);
    expect(profile.metrics.storyExport.passesBudget).toBe(true);
    expect(profile.device.model).toBe('mid-range-fixture');
  });
});
