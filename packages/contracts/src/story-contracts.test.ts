import { describe, expect, it } from 'vitest';

type Schema = {
  safeParse(value: unknown): { success: boolean };
  parse(value: unknown): unknown;
};

function schema(module: Record<string, unknown>, name: string): Schema {
  const value = module[name];
  if (
    typeof value !== 'object' ||
    value === null ||
    !('safeParse' in value) ||
    typeof value.safeParse !== 'function' ||
    !('parse' in value) ||
    typeof value.parse !== 'function'
  ) {
    throw new TypeError(`Missing required Zod schema export: ${name}`);
  }
  return value as Schema;
}

async function loadSync() {
  return (await import('./v1/sync.js')) as Record<string, unknown>;
}

function composition(label: string, revision: number, savedAt: string) {
  return {
    canvas: { width: 1080, height: 1920 },
    background: {
      scale: 1,
      translateX: revision * 10,
      translateY: revision * -5,
      rotation: 0,
    },
    headline: { text: label, x: 120, y: 240 },
    supportingText: null,
    effects: [{ kind: 'grain', amount: revision / 10 }],
    revision,
    savedAt,
  };
}

describe('MTS-090 Story synchronization contracts', () => {
  it('serializes one independent composition per image version', async () => {
    const sync = await loadSync();
    const draft = {
      draftId: '11111111-1111-4111-8111-111111111111',
      notes: {
        musicMood: 'quiet',
        mention: null,
        location: null,
        poll: null,
      },
      imageVersions: [
        {
          id: '22222222-2222-4222-8222-222222222222',
          kind: 'source',
          storageKey: 'story/source/22222222-2222-4222-8222-222222222222',
          composition: composition('source', 1, '2026-09-23T09:32:00.000Z'),
        },
        {
          id: '33333333-3333-4333-8333-333333333333',
          kind: 'generated',
          storageKey: 'story/generated/33333333-3333-4333-8333-333333333333',
          composition: composition('generated', 2, '2026-09-23T09:32:00.000Z'),
        },
      ],
    };

    expect(schema(sync, 'storyDraftSyncPayloadSchema').parse(draft)).toEqual(draft);
    expect(
      schema(sync, 'storyDraftSyncPayloadSchema').safeParse({
        ...draft,
        imageVersions: draft.imageVersions.map(\n          ({ composition: _composition, ...version }) => version,\n        ),
      }).success,
    ).toBe(false);
  });

  it('locks the fixed Story canvas and revision/save-time fields into the contract', async () => {
    const sync = await loadSync();
    const valid = composition('headline', 4, '2026-09-23T09:32:00.000Z');

    expect(schema(sync, 'storyCompositionSchema').safeParse(valid).success).toBe(true);
    expect(
      schema(sync, 'storyCompositionSchema').safeParse({
        ...valid,
        canvas: { width: 720, height: 1280 },
      }).success,
    ).toBe(false);
    expect(
      schema(sync, 'storyCompositionSchema').safeParse({
        ...valid,
        revision: -1,
      }).success,
    ).toBe(false);
  });

  it('publishes Story upserts as typed sync changes rather than opaque generic changes', async () => {
    const sync = await loadSync();
    const payload = {
      draftId: '11111111-1111-4111-8111-111111111111',
      notes: { musicMood: null, mention: null, location: null, poll: null },
      imageVersions: [
        {
          id: '22222222-2222-4222-8222-222222222222',
          kind: 'source',
          storageKey: 'story/source/22222222-2222-4222-8222-222222222222',
          composition: composition('source', 1, '2026-09-23T09:32:00.000Z'),
        },
      ],
    };

    expect(
      schema(sync, 'syncChangeSchema').safeParse({
        version: 1,
        sequence: 9,
        entityType: 'story',
        entityId: '44444444-4444-4444-8444-444444444444',
        operation: 'upsert',
        payload,
      }).success,
    ).toBe(true);
  });
});
