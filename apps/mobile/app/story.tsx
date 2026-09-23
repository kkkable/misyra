import { useCallback, useEffect, useRef, useState } from 'react';

import { storyDraftSyncPayloadSchema, type StoryTextSuggestionsResult } from '@misyra/contracts';
import { localizationCatalogs } from '@misyra/localization';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useColorScheme } from 'react-native';

import { getAuthApiBaseUrl, rootAuthController } from '../src/auth/auth-runtime.js';
import type { ColorScheme } from '../src/design-system/index.js';
import {
  createEvidenceApi,
  type EvidenceStorySourceAttempt,
} from '../src/evidence/evidence-api.js';
import { haptics } from '../src/experience/native-haptics.js';
import { useAppLanguage } from '../src/localization/use-app-language.js';
import { openMobileDatabase } from '../src/storage/database.js';
import { requireRegisteredDeviceId } from '../src/sync/root-sync-runtime.js';
import {
  createEmptyStoryComposition,
  validateStoryComposition,
  type StoryComposition,
} from '../src/story/story-composition.js';
import {
  createExpoStorySourceFiles,
  loadExpoStoryWorkingCopy,
} from '../src/story/expo-story-source-files.js';
import { StoryEditorScreen, type StoryEditorMessages } from '../src/story/story-editor-screen.js';
import type { StorySourceImage } from '../src/story/story-editor-state.js';
import { createStoryOfflineDraftStore } from '../src/story/story-offline-draft.js';
import { createStorySourceRuntime } from '../src/story/story-source-runtime.js';
import { createStoryTextSuggestionsApi } from '../src/story/story-text-suggestions-api.js';
import type { StoryTextSuggestionsPanelMessages } from '../src/story/story-text-suggestions-panel.js';

const UUID_HEX = '0123456789abcdef';
const UUID_VARIANTS = '89ab';

type StoryDraftPayload = ReturnType<typeof storyDraftSyncPayloadSchema.parse>;

type StoryRouteState = Readonly<{
  payload: StoryDraftPayload;
  imageVersionId: string;
  selectedAttemptId: string;
  sourceAttempts: readonly EvidenceStorySourceAttempt[];
  sourceImage: StorySourceImage;
  textSuggestions: StoryTextSuggestionsResult | null;
}>;

type StoryRouteRuntime = Readonly<{
  store: ReturnType<typeof createStoryOfflineDraftStore>;
  source: ReturnType<typeof createStorySourceRuntime>;
  textSuggestions: ReturnType<typeof createStoryTextSuggestionsApi>;
}>;

function randomHex(length: number): string {
  return Array.from({ length }, () => UUID_HEX[Math.floor(Math.random() * UUID_HEX.length)]).join(
    '',
  );
}

function generateUuid(): string {
  const variant = UUID_VARIANTS.charAt(Math.floor(Math.random() * UUID_VARIANTS.length));
  return `${randomHex(8)}-${randomHex(4)}-4${randomHex(3)}-${variant}${randomHex(3)}-${randomHex(12)}`;
}

function routeOccurrenceId(value: string | string[] | undefined): string | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  return typeof candidate === 'string' && candidate.length > 0 ? candidate : null;
}

function sourceVersion(payload: StoryDraftPayload) {
  return payload.imageVersions.find((version) => version.kind === 'source') ?? null;
}

function activeComposition(state: StoryRouteState): StoryComposition {
  const version = state.payload.imageVersions.find(
    (candidate) => candidate.id === state.imageVersionId,
  );
  if (version === undefined) throw new Error('story_active_image_version_missing');
  return validateStoryComposition(version.composition);
}

function withComposition(state: StoryRouteState, composition: StoryComposition): StoryRouteState {
  const imageVersions = state.payload.imageVersions.map((version) =>
    version.id === state.imageVersionId ? { ...version, composition } : version,
  );
  return {
    ...state,
    payload: storyDraftSyncPayloadSchema.parse({
      ...state.payload,
      imageVersions,
    }),
  };
}

function suggestionMessages(
  catalog: (typeof localizationCatalogs)[keyof typeof localizationCatalogs],
): StoryTextSuggestionsPanelMessages {
  return {
    title: catalog['story.suggestions.title'],
    useHeadline: catalog['story.suggestions.useHeadline'],
    useSupportingText: catalog['story.suggestions.useSupportingText'],
    useBoth: catalog['story.suggestions.useBoth'],
    photoOnly: catalog['story.suggestions.photoOnly'],
    sharingNotes: catalog['story.suggestions.sharingNotes'],
    musicMood: catalog['story.suggestions.musicMood'],
    mention: catalog['story.suggestions.mention'],
    location: catalog['story.suggestions.location'],
    poll: catalog['story.suggestions.poll'],
  };
}

function editorMessages(
  catalog: (typeof localizationCatalogs)[keyof typeof localizationCatalogs],
): StoryEditorMessages {
  return {
    title: catalog['story.editor.title'],
    close: catalog['story.editor.close'],
    save: catalog['story.editor.save'],
    source: catalog['story.editor.source'],
    sourcePhoto: catalog['story.editor.sourcePhoto'],
    undo: catalog['story.editor.undo'],
    redo: catalog['story.editor.redo'],
    zoomIn: catalog['story.editor.zoomIn'],
    zoomOut: catalog['story.editor.zoomOut'],
    moveLeft: catalog['story.editor.moveLeft'],
    moveRight: catalog['story.editor.moveRight'],
    moveUp: catalog['story.editor.moveUp'],
    moveDown: catalog['story.editor.moveDown'],
    headline: catalog['story.editor.headline'],
    supportingText: catalog['story.editor.supportingText'],
    editHeadline: catalog['story.editor.editHeadline'],
    editSupportingText: catalog['story.editor.editSupportingText'],
    textSmaller: catalog['story.editor.textSmaller'],
    textLarger: catalog['story.editor.textLarger'],
    textColor: catalog['story.editor.textColor'],
    font: catalog['story.editor.font'],
    removeText: catalog['story.editor.removeText'],
    contrast: catalog['story.editor.contrast'],
  };
}

export default function StoryRoute() {
  const params = useLocalSearchParams<{ occurrenceId?: string | string[] }>();
  const occurrenceId = routeOccurrenceId(params.occurrenceId);
  const router = useRouter();
  const language = useAppLanguage();
  const catalog = localizationCatalogs[language];
  const messages = editorMessages(catalog);
  const textSuggestionMessages = suggestionMessages(catalog);
  const nativeColorScheme = useColorScheme();
  const colorScheme: ColorScheme = nativeColorScheme === 'dark' ? 'dark' : 'light';
  const [editorState, setEditorState] = useState<StoryRouteState | null>(null);
  const editorStateRef = useRef<StoryRouteState | null>(null);
  const runtimeRef = useRef<StoryRouteRuntime | null>(null);
  const saveChainRef = useRef<Promise<void>>(Promise.resolve());

  const commitEditorState = useCallback((next: StoryRouteState) => {
    editorStateRef.current = next;
    setEditorState(next);
  }, []);

  const enqueueSave = useCallback(
    (payload: StoryDraftPayload): Promise<void> => {
      const runtime = runtimeRef.current;
      if (runtime === null || occurrenceId === null) return Promise.resolve();
      const next = saveChainRef.current
        .catch(() => undefined)
        .then(() => runtime.store.save(occurrenceId, payload));
      saveChainRef.current = next;
      return next;
    },
    [occurrenceId],
  );

  useEffect(() => {
    if (occurrenceId === null) {
      router.back();
      return;
    }

    const lifecycle = { cancelled: false };

    const restore = async () => {
      try {
        const authState = await rootAuthController.restore();
        if (authState.status !== 'signed_in') throw new Error('story_requires_sign_in');

        const [database, deviceId] = await Promise.all([
          openMobileDatabase(),
          requireRegisteredDeviceId(authState.session.accountId),
        ]);
        const store = createStoryOfflineDraftStore({
          database,
          accountId: authState.session.accountId,
          deviceId,
          generateMutationId: generateUuid,
        });
        const source = createStorySourceRuntime({
          api: createEvidenceApi({
            baseUrl: getAuthApiBaseUrl(),
            accessToken: authState.session.accessToken,
          }),
          files: createExpoStorySourceFiles({
            baseUrl: getAuthApiBaseUrl(),
            accessToken: authState.session.accessToken,
          }),
        });
        const textSuggestions = createStoryTextSuggestionsApi({
          baseUrl: getAuthApiBaseUrl(),
          accessToken: authState.session.accessToken,
        });
        runtimeRef.current = { store, source, textSuggestions };

        const existing = await store.load(occurrenceId);
        if (existing !== null) {
          const version = sourceVersion(existing);
          if (version === null) throw new Error('story_source_version_missing');
          const sourceImage = await loadExpoStoryWorkingCopy(version.id);
          if (lifecycle.cancelled) return;

          commitEditorState({
            payload: existing,
            imageVersionId: version.id,
            selectedAttemptId: '',
            sourceAttempts: [],
            sourceImage,
            textSuggestions: null,
          });

          void source
            .list(occurrenceId)
            .then((attempts) => {
              if (lifecycle.cancelled) return;
              const current = editorStateRef.current;
              if (current !== null) {
                commitEditorState({ ...current, sourceAttempts: attempts });
              }
            })
            .catch(() => undefined);
          return;
        }

        const attempts = await source.list(occurrenceId);
        const selected = attempts.at(-1);
        if (selected === undefined) throw new Error('story_source_photo_unavailable');

        const draftId = generateUuid();
        const imageVersionId = generateUuid();
        const materialized = await source.materialize(selected, imageVersionId);
        const composition = createEmptyStoryComposition(new Date().toISOString());
        const payload = storyDraftSyncPayloadSchema.parse({
          draftId,
          notes: {
            musicMood: null,
            mention: null,
            location: null,
            poll: null,
          },
          imageVersions: [
            {
              id: imageVersionId,
              kind: 'source',
              storageKey: `story/source/${imageVersionId}`,
              composition,
            },
          ],
        });
        await store.save(occurrenceId, payload);
        if (lifecycle.cancelled) return;

        commitEditorState({
          payload,
          imageVersionId,
          selectedAttemptId: selected.attemptId,
          sourceAttempts: attempts,
          sourceImage: {
            id: materialized.imageVersionId,
            uri: materialized.uri,
            width: materialized.width,
            height: materialized.height,
          },
          textSuggestions: null,
        });

        void textSuggestions
          .suggest(occurrenceId)
          .then(async (suggestions) => {
            if (lifecycle.cancelled) return;
            const current = editorStateRef.current;
            if (current === null || current.payload.draftId !== draftId) return;
            const next: StoryRouteState = {
              ...current,
              payload: storyDraftSyncPayloadSchema.parse({
                ...current.payload,
                notes: suggestions.sharingNotes,
              }),
              textSuggestions: suggestions,
            };
            commitEditorState(next);
            await enqueueSave(next.payload);
          })
          .catch(() => undefined);
      } catch {
        if (!lifecycle.cancelled) router.back();
      }
    };

    void restore();
    return () => {
      lifecycle.cancelled = true;
    };
  }, [commitEditorState, enqueueSave, occurrenceId, router]);

  if (occurrenceId === null || editorState === null) return null;

  return (
    <StoryEditorScreen
      colorScheme={colorScheme}
      composition={activeComposition(editorState)}
      messages={messages}
      selectedAttemptId={editorState.selectedAttemptId}
      sourceAttempts={editorState.sourceAttempts}
      sourceImage={editorState.sourceImage}
      textSuggestionMessages={textSuggestionMessages}
      textSuggestions={editorState.textSuggestions}
      onTextSuggestionsResolved={() => {
        commitEditorState({ ...editorState, textSuggestions: null });
      }}
      onClose={() => {
        void enqueueSave(editorState.payload)
          .catch(() => undefined)
          .finally(() => {
            router.back();
          });
      }}
      onCompositionChange={(composition) => {
        const next = withComposition(editorState, composition);
        commitEditorState(next);
        void enqueueSave(next.payload).catch(() => undefined);
      }}
      onSave={(composition) => {
        const next = withComposition(editorState, composition);
        commitEditorState(next);
        void enqueueSave(next.payload)
          .then(() => {
            haptics.triggerNonBlocking('storySave');
          })
          .catch(() => undefined);
      }}
      onSelectSource={(selected) => {
        const runtime = runtimeRef.current;
        if (runtime === null) return;

        void (async () => {
          const imageVersionId = generateUuid();
          const materialized = await runtime.source.materialize(selected, imageVersionId);
          const composition = createEmptyStoryComposition(new Date().toISOString());
          const payload = storyDraftSyncPayloadSchema.parse({
            ...editorState.payload,
            imageVersions: [
              {
                id: imageVersionId,
                kind: 'source',
                storageKey: `story/source/${imageVersionId}`,
                composition,
              },
              ...editorState.payload.imageVersions.filter((version) => version.kind !== 'source'),
            ],
          });
          const next: StoryRouteState = {
            payload,
            imageVersionId,
            selectedAttemptId: selected.attemptId,
            sourceAttempts: editorState.sourceAttempts,
            sourceImage: {
              id: materialized.imageVersionId,
              uri: materialized.uri,
              width: materialized.width,
              height: materialized.height,
            },
            textSuggestions: editorState.textSuggestions,
          };
          commitEditorState(next);
          await enqueueSave(payload);
        })().catch(() => undefined);
      }}
    />
  );
}
