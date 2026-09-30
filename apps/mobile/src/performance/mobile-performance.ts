export const MOBILE_PERFORMANCE_BUDGETS = Object.freeze({
  warmCalendarInteractiveMs: 2_000,
  cachedDayQueryMs: 50,
  screenTransitionMs: 300,
  storyExportMs: 5_000,
});

export type MobilePerformanceMetric =
  'warmCalendarInteractive' | 'cachedDayQuery' | 'screenTransition' | 'storyExport';

export type MobilePerformanceSamples = Readonly<Record<MobilePerformanceMetric, readonly number[]>>;

export type MobilePerformanceSummary = Readonly<{
  count: number;
  minMs: number;
  medianMs: number;
  p95Ms: number;
  maxMs: number;
}>;

export type MobilePerformanceDevice = Readonly<{
  platform: 'ios' | 'android';
  model: string;
  osVersion: string;
  appBuild: string;
}>;

const METRIC_BUDGET_MS: Readonly<Record<MobilePerformanceMetric, number>> = Object.freeze({
  warmCalendarInteractive: MOBILE_PERFORMANCE_BUDGETS.warmCalendarInteractiveMs,
  cachedDayQuery: MOBILE_PERFORMANCE_BUDGETS.cachedDayQueryMs,
  screenTransition: MOBILE_PERFORMANCE_BUDGETS.screenTransitionMs,
  storyExport: MOBILE_PERFORMANCE_BUDGETS.storyExportMs,
});

function assertSample(value: number): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new TypeError('performance_sample_invalid');
  }
  return value;
}

function nearestRank(sorted: readonly number[], percentile: number): number {
  const index = Math.max(0, Math.ceil(sorted.length * percentile) - 1);
  return sorted[index] ?? sorted[sorted.length - 1] ?? 0;
}

export function summarizePerformanceSamples(samples: readonly number[]): MobilePerformanceSummary {
  if (samples.length === 0) throw new Error('performance_samples_empty');
  const sorted = samples.map(assertSample).sort((left, right) => left - right);
  return Object.freeze({
    count: sorted.length,
    minMs: sorted[0] ?? 0,
    medianMs: nearestRank(sorted, 0.5),
    p95Ms: nearestRank(sorted, 0.95),
    maxMs: sorted[sorted.length - 1] ?? 0,
  });
}

function emptySamples(): Record<MobilePerformanceMetric, number[]> {
  return {
    warmCalendarInteractive: [],
    cachedDayQuery: [],
    screenTransition: [],
    storyExport: [],
  };
}

function defaultMonotonicNow(): number {
  if (typeof globalThis.performance?.now === 'function') {
    return globalThis.performance.now();
  }
  return Date.now();
}

export function createMobilePerformanceRecorder(
  options: Readonly<{
    now?: () => number;
    maxSamplesPerMetric?: number;
  }> = {},
) {
  const now = options.now ?? defaultMonotonicNow;
  const maxSamplesPerMetric = options.maxSamplesPerMetric ?? 100;
  if (!Number.isSafeInteger(maxSamplesPerMetric) || maxSamplesPerMetric < 1) {
    throw new RangeError('performance_sample_capacity_invalid');
  }

  const samples = emptySamples();

  const record = (metric: MobilePerformanceMetric, durationMs: number) => {
    const values = samples[metric];
    values.push(assertSample(durationMs));
    if (values.length > maxSamplesPerMetric) {
      values.splice(0, values.length - maxSamplesPerMetric);
    }
    return durationMs;
  };

  return Object.freeze({
    record,
    start(metric: MobilePerformanceMetric) {
      const startedAt = assertSample(now());
      let finished = false;
      return Object.freeze({
        finish() {
          if (finished) throw new Error('performance_span_already_finished');
          finished = true;
          const endedAt = assertSample(now());
          if (endedAt < startedAt) throw new Error('performance_clock_not_monotonic');
          return record(metric, endedAt - startedAt);
        },
      });
    },
    snapshot(): MobilePerformanceSamples {
      return Object.freeze({
        warmCalendarInteractive: Object.freeze([...samples.warmCalendarInteractive]),
        cachedDayQuery: Object.freeze([...samples.cachedDayQuery]),
        screenTransition: Object.freeze([...samples.screenTransition]),
        storyExport: Object.freeze([...samples.storyExport]),
      });
    },
    reset() {
      for (const metric of Object.keys(samples) as MobilePerformanceMetric[]) {
        samples[metric].splice(0);
      }
    },
  });
}

function assertMetadata(value: string, field: string): string {
  if (value.trim().length === 0) throw new Error(`performance_device_${field}_missing`);
  return value;
}

export function createMobilePerformanceProfile(
  input: Readonly<{
    device: MobilePerformanceDevice;
    recordedAt: string;
    samples: MobilePerformanceSamples;
  }>,
) {
  const recordedAtMs = Date.parse(input.recordedAt);
  if (!Number.isFinite(recordedAtMs)) throw new Error('performance_recorded_at_invalid');
  const device = Object.freeze({
    platform: input.device.platform,
    model: assertMetadata(input.device.model, 'model'),
    osVersion: assertMetadata(input.device.osVersion, 'os_version'),
    appBuild: assertMetadata(input.device.appBuild, 'app_build'),
  });

  const metrics = Object.fromEntries(
    (Object.keys(METRIC_BUDGET_MS) as MobilePerformanceMetric[]).map((metric) => {
      const summary = summarizePerformanceSamples(input.samples[metric]);
      const budgetMs = METRIC_BUDGET_MS[metric];
      return [
        metric,
        Object.freeze({
          ...summary,
          budgetMs,
          passesBudget: summary.p95Ms <= budgetMs,
        }),
      ];
    }),
  ) as Readonly<
    Record<
      MobilePerformanceMetric,
      MobilePerformanceSummary & Readonly<{ budgetMs: number; passesBudget: boolean }>
    >
  >;

  return Object.freeze({
    schemaVersion: 1 as const,
    device,
    recordedAt: new Date(recordedAtMs).toISOString(),
    metrics: Object.freeze(metrics),
    allBudgetsPass: Object.values(metrics).every((metric) => metric.passesBudget),
  });
}

export const rootMobilePerformanceRecorder = createMobilePerformanceRecorder();
