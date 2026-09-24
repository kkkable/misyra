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
import { networkAvailabilityChannel } from '../src/sync/network-availability-runtime.js';
import { requireRegisteredDeviceId, rootSyncRuntime } from '../src/sync/root-sync-runtime.js';
import { storyConflictSettlementChannel } from '../src/sync/story-conflict-settlement-runtime.js';
import {
  createEmptyStoryComposition,
  validateStoryComposition,
  type StoryComposition,
} from '../src/story/story-composition.js';
import {
  createExpoStorySourceFiles,
  createExpoStoryVersionFiles,
  loadExpoStoryWorkingCopy,
} from '../src/story/expo-story-source-files.js';
import { StoryEditorScreen, type StoryEditorMessages } from '../src/story/story-editor-screen.js';
import type { StorySourceImage } from '../src/story/story-editor-state.js';
import { createStoryImageGenerationApi } from '../src/story/story-image-generation-api.js';
import { createStoryOfflineDraftStore } from '../src/story/story-offline-draft.js';
import { createStorySourceRuntime } from '../src/story/story-source-runtime.js';
import { createStoryStyleProfileApi } from '../src/story/story-style-profile-api.js';
import {
  activeStoryImageVersion,
  createStoryVersionState,
  deleteStoryGeneratedVersion,
  switchStoryImageVersion,
  updateActiveStoryComposition,
} from '../src/story/story-version-state.js';
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
  remainingGenerations: number | null;
  textSuggestions: StoryTextSuggestionsResult | null;
  aiOperationsAvailable: boolean;
}>;

type StoryRouteRuntime = Readonly<{
  store: ReturnType<typeof createStoryOfflineDraftStore>;
  source: ReturnType<typeof createStorySourceRuntime>;
  imageGeneration: ReturnType<typeof createStoryImageGenerationApi>;
  versionFiles: ReturnType<typeof createExpoStoryVersionFiles>;
  textSuggestions: ReturnType<typeof createStoryTextSuggestionsApi>;
  styleProfile: ReturnType<typeof createStoryStyleProfileApi>;
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
  return validateStoryComposition(
    activeStoryImageVersion(createStoryVersionState(state.payload, state.imageVersionId))
      .composition,
  );
}

function withComposition(state: StoryRouteState, composition: StoryComposition): StoryRouteState {
  const next = updateActiveStoryComposition(
    createStoryVersionState(state.payload, state.imageVersionId),
    composition,
  );
  return {
    ...state,
    payload: next.payload,
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
    remainingGenerations: catalog['story.editor.remainingGenerations'],
    versions: catalog['story.editor.versions'],
    versionSource: catalog['story.editor.versionSource'],
    versionGenerated: catalog['story.editor.versionGenerated'],
    generateVersion: catalog['story.editor.generateVersion'],
    deleteVersion: catalog['story.editor.deleteVersion'],
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
  const [editorSessionEpoch, setEditorSessionEpoch] = useState(0);
  const [conflictMessage, setConflictMessage] = useState<string | null>(null);

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
        .then(async () => {
          await runtime.store.save(occurrenceId, payload);
          void rootSyncRuntime.run().catch(() => undefined);
        });
      saveChainRef.current = next;
      return next;
    },
    [occurrenceId],
  );

  useEffect(() => {
    if (occurrenceId === null) return;

    return networkAvailabilityChannel.subscribe((availability) => {
      const runtime = runtimeRef.current;
      const current = editorStateRef.current;
      if (runtime === null || current === null) return;

      if (availability === 'unavailable') {
        if (current.aiOperationsAvailable) {
          commitEditorState({ ...current, aiOperationsAvailable: false });
        }
        return;
      }

      void runtime.imageGeneration
        .getBudget(current.payload.draftId)
        .then((budget) => {
          const latest = editorStateRef.current;
          if (latest === null || latest.payload.draftId !== current.payload.draftId) return;
          commitEditorState({
            ...latest,
            remainingGenerations: budget.remainingGenerations,
            aiOperationsAvailable: true,
          });
        })
        .catch(() => {
          const latest = editorStateRef.current;
          if (
            latest !== null &&
            latest.payload.draftId === current.payload.draftId &&
            latest.aiOperationsAvailable
          ) {
            commitEditorState({ ...latest, aiOperationsAvailable: false });
          }
        });
    });
  }, [commitEditorState, occurrenceId]);

  useEffect(() => {
    if (occurrenceId === null) return;

    return storyConflictSettlementChannel.subscribe((settlement) => {
      const runtime = runtimeRef.current;
      const current = editorStateRef.current;
      if (
        runtime === null ||
        current === null ||
        settlement.occurrenceId !== occurrenceId ||
        settlement.storyDraftId !== current.payload.draftId
      ) {
        return;
      }

      void (async () => {
        const authoritative = await runtime.store.load(occurrenceId);
        if (authoritative === null || authoritative.draftId !== settlement.storyDraftId) return;

        const activeVersion =
          authoritative.imageVersions.find((version) => version.id === current.imageVersionId) ??
          sourceVersion(authoritative);
        if (activeVersion === null) return;

        let sourceImage = current.sourceImage;
        if (sourceImage.id !== activeVersion.id) {
          sourceImage =
            activeVersion.kind === 'source'
              ? await runtime.versionFiles.load(activeVersion.id)
              : await runtime.versionFiles.materializeGenerated(
                  authoritative.draftId,
                  activeVersion.id,
                );
        }

        commitEditorState({
          ...current,
          payload: authoritative,
          imageVersionId: activeVersion.id,
          selectedAttemptId: activeVersion.kind === 'source' ? current.selectedAttemptId : '',
          sourceImage,
          textSuggestions: null,
        });
        setEditorSessionEpoch((value) => value + 1);
        setConflictMessage(catalog['sync.conflict.storyUpdated']);
      })().catch(() => undefined);
    });
  }, [catalog, commitEditorState, occurrenceId]);

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
        const imageGeneration = createStoryImageGenerationApi({
          baseUrl: getAuthApiBaseUrl(),
          accessToken: authState.session.accessToken,
        });
        const versionFiles = createExpoStoryVersionFiles({
          baseUrl: getAuthApiBaseUrl(),
          accessToken: authState.session.accessToken,
        });
        const textSuggestions = createStoryTextSuggestionsApi({
          baseUrl: getAuthApiBaseUrl(),
          accessToken: authState.session.accessToken,
        });
        const styleProfile = createStoryStyleProfileApi({
          baseUrl: getAuthApiBaseUrl(),
          accessToken: authState.session.accessToken,
        });
        runtimeRef.current = {
          store,
          source,
          imageGeneration,
          versionFiles,
          textSuggestions,
          styleProfile,
        };

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
            remainingGenerations: null,
            textSuggestions: null,
            aiOperationsAvailable: false,
          });

          void imageGeneration
            .getBudget(existing.draftId)
            .then((budget) => {
              if (lifecycle.cancelled) return;
              const current = editorStateRef.current;
              if (current !== null && current.payload.draftId === existing.draftId) {
                commitEditorState({
                  ...current,
                  remainingGenerations: budget.remainingGenerations,
                  aiOperationsAvailable: true,
                });
              }
            })
            .catch(() => undefined);

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

        const styleStatus = await styleProfile.getStatus();
        if (styleStatus.mode === 'unset') {
          if (!lifecycle.cancelled) {
            router.replace({ pathname: '/story-style-profile', params: { occurrenceId } });
          }
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
        await enqueueSave(payload);
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
          remainingGenerations: null,
          textSuggestions: null,
          aiOperationsAvailable: true,
        });

        void imageGeneration
          .getBudget(draftId)
          .then((budget) => {
            if (lifecycle.cancelled) return;
            const current = editorStateRef.current;
            if (current !== null && current.payload.draftId === draftId) {
              commitEditorState({
                ...current,
                remainingGenerations: budget.remainingGenerations,
              });
            }
          })
          .catch(() => undefined);

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
      aiOperationsAvailable={editorState.aiOperationsAvailable}
      colorScheme={colorScheme}
      editorSessionEpoch={editorSessionEpoch}
      composition={activeComposition(editorState)}
      conflictMessage={conflictMessage}
      imageVersions={editorState.payload.imageVersions.map(({ id, kind }) => ({ id, kind }))}
      messages={messages}
      remainingGenerations={editorState.remainingGenerations}
      selectedImageVersionId={editorState.imageVersionId}
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
      onSelectImageVersion={(versionId) => {
        const runtime = runtimeRef.current;
        if (runtime === null || versionId === editorState.imageVersionId) return;

        void (async () => {
          const switched = switchStoryImageVersion(
            createStoryVersionState(editorState.payload, editorState.imageVersionId),
            versionId,
          );
          const target = activeStoryImageVersion(switched);
          const sourceImage =
            target.kind === 'source'
              ? await runtime.versionFiles.load(target.id)
              : await runtime.versionFiles.materializeGenerated(
                  switched.payload.draftId,
                  target.id,
                );
          commitEditorState({
            ...editorState,
            payload: switched.payload,
            imageVersionId: switched.activeVersionId,
            selectedAttemptId: target.kind === 'source' ? editorState.selectedAttemptId : '',
            sourceImage,
          });
        })().catch(() => undefined);
      }}
      onGenerateVersion={() => {
        const runtime = runtimeRef.current;
        const source = sourceVersion(editorState.payload);
        if (
          runtime === null ||
          source === null ||
          !editorState.aiOperationsAvailable ||
          editorState.remainingGenerations === 0
        ) {
          return;
        }

        void (async () => {
          const generated = await runtime.imageGeneration.generate(
            editorState.payload.draftId,
            source.id,
          );
          const composition = createEmptyStoryComposition(new Date().toISOString());
          const payload = storyDraftSyncPayloadSchema.parse({
            ...editorState.payload,
            imageVersions: [
              ...editorState.payload.imageVersions,
              { ...generated.version, composition },
            ],
          });
          const sourceImage = await runtime.versionFiles.materializeGenerated(
            payload.draftId,
            generated.version.id,
          );
          const next: StoryRouteState = {
            ...editorState,
            payload,
            imageVersionId: generated.version.id,
            selectedAttemptId: '',
            sourceImage,
            remainingGenerations: generated.remainingGenerations,
          };
          commitEditorState(next);
          await enqueueSave(payload);
        })().catch(() => undefined);
      }}
      onDeleteImageVersion={(versionId) => {
        const runtime = runtimeRef.current;
        if (runtime === null) return;

        void (async () => {
          await runtime.imageGeneration.deleteVersion(editorState.payload.draftId, versionId);
          const deleted = deleteStoryGeneratedVersion(
            createStoryVersionState(editorState.payload, editorState.imageVersionId),
            versionId,
          );
          await runtime.versionFiles.delete(versionId);

          let sourceImage = editorState.sourceImage;
          let selectedAttemptId = editorState.selectedAttemptId;
          if (deleted.activeVersionId !== editorState.imageVersionId) {
            const target = activeStoryImageVersion(deleted);
            sourceImage =
              target.kind === 'source'
                ? await runtime.versionFiles.load(target.id)
                : await runtime.versionFiles.materializeGenerated(
                    deleted.payload.draftId,
                    target.id,
                  );
            if (target.kind === 'generated') selectedAttemptId = '';
          }

          const next: StoryRouteState = {
            ...editorState,
            payload: deleted.payload,
            imageVersionId: deleted.activeVersionId,
            selectedAttemptId,
            sourceImage,
          };
          commitEditorState(next);
          await enqueueSave(next.payload);
        })().catch(() => undefined);
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
            remainingGenerations: editorState.remainingGenerations,
            textSuggestions: editorState.textSuggestions,
            aiOperationsAvailable: editorState.aiOperationsAvailable,
          };
          commitEditorState(next);
          await enqueueSave(payload);
        })().catch(() => undefined);
      }}
    />
  );
}
