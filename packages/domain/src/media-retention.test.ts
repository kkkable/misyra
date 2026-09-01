import { describe, expect, it } from 'vitest';

type DomainModule = Record<string, unknown>;
type DomainFunction = (...args: unknown[]) => unknown;

function requireFunction(module: DomainModule, name: string): DomainFunction {
  const value = module[name];
  if (typeof value !== 'function') {
    throw new TypeError(`Missing required media-retention function: ${name}`);
  }
  return value as DomainFunction;
}

async function loadMediaRetentionFunctions() {
  const module = (await import('./index.js')) as DomainModule;
  return {
    classifyMediaPurpose: requireFunction(module, 'classifyMediaPurpose'),
    calculateMediaDeletionDeadline: requireFunction(module, 'calculateMediaDeletionDeadline'),
    isMediaDeletionDue: requireFunction(module, 'isMediaDeletionDue'),
    shouldGenerateMediaDeletionNotice: requireFunction(module, 'shouldGenerateMediaDeletionNotice'),
  };
}

describe('MTS-021 media-retention calculations contract', () => {
  it.each(['evidence-working', 'story-working', 'planner-working', 'style-references'])(
    'assigns the approved 30-day deadline to %s',
    async (purpose) => {
      const { calculateMediaDeletionDeadline } = await loadMediaRetentionFunctions();

      expect(calculateMediaDeletionDeadline('2026-08-01T12:00:00Z', purpose)).toBe(
        '2026-08-31T12:00:00.000Z',
      );
      expect(calculateMediaDeletionDeadline('2026-08-01T20:00:00+08:00', purpose)).toBe(
        '2026-08-31T12:00:00.000Z',
      );
    },
  );

  it('classifies feedback media outside product-media cleanup', async () => {
    const { calculateMediaDeletionDeadline, classifyMediaPurpose } =
      await loadMediaRetentionFunctions();

    expect(classifyMediaPurpose('evidence-working')).toBe('product_media_30_day');
    expect(classifyMediaPurpose('story-working')).toBe('product_media_30_day');
    expect(classifyMediaPurpose('planner-working')).toBe('product_media_30_day');
    expect(classifyMediaPurpose('style-references')).toBe('product_media_30_day');
    expect(classifyMediaPurpose('feedback-retained')).toBe('feedback_retained');
    expect(calculateMediaDeletionDeadline('2026-08-01T12:00:00Z', 'feedback-retained')).toBe(null);
  });

  it('makes deletion due exactly at the 30-day boundary and remains due afterward', async () => {
    const { isMediaDeletionDue } = await loadMediaRetentionFunctions();
    const base = {
      purpose: 'story-working',
      createdAt: '2026-08-01T12:00:00Z',
    };

    expect(isMediaDeletionDue({ ...base, now: '2026-08-31T11:59:59.999Z' })).toBe(false);
    expect(isMediaDeletionDue({ ...base, now: '2026-08-31T12:00:00Z' })).toBe(true);
    expect(isMediaDeletionDue({ ...base, now: '2026-09-01T12:00:00Z' })).toBe(true);
  });

  it('never makes retained feedback media due for product cleanup', async () => {
    const { isMediaDeletionDue } = await loadMediaRetentionFunctions();

    expect(
      isMediaDeletionDue({
        purpose: 'feedback-retained',
        createdAt: '2026-08-01T12:00:00Z',
        now: '2036-08-01T12:00:00Z',
      }),
    ).toBe(false);
  });

  it('generates the evidence deletion notice signal but never a Story deletion notice', async () => {
    const { shouldGenerateMediaDeletionNotice } = await loadMediaRetentionFunctions();

    expect(shouldGenerateMediaDeletionNotice('evidence-working')).toBe(true);
    expect(shouldGenerateMediaDeletionNotice('story-working')).toBe(false);
    expect(shouldGenerateMediaDeletionNotice('planner-working')).toBe(false);
    expect(shouldGenerateMediaDeletionNotice('style-references')).toBe(false);
    expect(shouldGenerateMediaDeletionNotice('feedback-retained')).toBe(false);
  });

  it('rejects unknown purposes and invalid absolute timestamps', async () => {
    const { calculateMediaDeletionDeadline, classifyMediaPurpose, isMediaDeletionDue } =
      await loadMediaRetentionFunctions();

    expect(() => classifyMediaPurpose('mystery-media')).toThrow();
    expect(() => calculateMediaDeletionDeadline('not-a-timestamp', 'story-working')).toThrow();
    expect(() =>
      isMediaDeletionDue({
        purpose: 'story-working',
        createdAt: '2026-08-01T12:00:00Z',
        now: 'not-a-timestamp',
      }),
    ).toThrow();
  });
});
