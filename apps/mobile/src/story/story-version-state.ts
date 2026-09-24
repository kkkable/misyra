import { storyDraftSyncPayloadSchema } from '@misyra/contracts';

import { validateStoryComposition, type StoryComposition } from './story-composition.js';

export type StoryDraftPayload = ReturnType<typeof storyDraftSyncPayloadSchema.parse>;

export type StoryVersionState = Readonly<{
  payload: StoryDraftPayload;
  activeVersionId: string;
}>;

function imageVersion(payload: StoryDraftPayload, versionId: string) {
  const version = payload.imageVersions.find((candidate) => candidate.id === versionId);
  if (version === undefined) throw new Error('story_image_version_missing');
  return version;
}

export function createStoryVersionState(
  value: unknown,
  activeVersionId: string,
): StoryVersionState {
  const payload = storyDraftSyncPayloadSchema.parse(value);
  imageVersion(payload, activeVersionId);
  return Object.freeze({ payload, activeVersionId });
}

export function activeStoryImageVersion(state: StoryVersionState) {
  return imageVersion(state.payload, state.activeVersionId);
}

export function switchStoryImageVersion(
  state: StoryVersionState,
  versionId: string,
): StoryVersionState {
  imageVersion(state.payload, versionId);
  return Object.freeze({
    payload: state.payload,
    activeVersionId: versionId,
  });
}

export function updateActiveStoryComposition(
  state: StoryVersionState,
  composition: StoryComposition,
): StoryVersionState {
  const validated = validateStoryComposition(composition);
  const imageVersions = state.payload.imageVersions.map((version) =>
    version.id === state.activeVersionId ? { ...version, composition: validated } : version,
  );
  return Object.freeze({
    payload: storyDraftSyncPayloadSchema.parse({
      ...state.payload,
      imageVersions,
    }),
    activeVersionId: state.activeVersionId,
  });
}

export function deleteStoryGeneratedVersion(
  state: StoryVersionState,
  versionId: string,
): StoryVersionState {
  const target = imageVersion(state.payload, versionId);
  if (target.kind === 'source') {
    throw new Error('story_source_version_cannot_be_deleted');
  }
  const source = state.payload.imageVersions.find((version) => version.kind === 'source');
  if (source === undefined) throw new Error('story_source_version_missing');

  const payload = storyDraftSyncPayloadSchema.parse({
    ...state.payload,
    imageVersions: state.payload.imageVersions.filter((version) => version.id !== versionId),
  });

  return Object.freeze({
    payload,
    activeVersionId: state.activeVersionId === versionId ? source.id : state.activeVersionId,
  });
}
