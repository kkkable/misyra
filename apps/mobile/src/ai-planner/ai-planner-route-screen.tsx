import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View, useColorScheme } from 'react-native';

import { space, typography } from '@misyra/design-tokens';
import { aiPlannerCatalogs } from '@misyra/localization';

import { getAuthApiBaseUrl, rootAuthController } from '../auth/auth-runtime.js';
import {
  ConfirmationDialog,
  PrimaryButton,
  Screen,
  SecondaryButton,
  TextArea,
  TopBar,
  themeColors,
  type ColorScheme,
} from '../design-system/index.js';
import { useAppTimeZone } from '../localization/app-time-zone-runtime.js';
import { useAppLanguage } from '../localization/use-app-language.js';
import { openMobileDatabase } from '../storage/database.js';
import type { MutationQueueDatabase } from '../storage/mutation-queue.js';
import { requireRegisteredDeviceId, rootSyncRuntime } from '../sync/root-sync-runtime.js';
import {
  MAX_PLANNER_IMAGES,
  MAX_PLANNER_TEXT_CHARACTERS,
  appendPlannerImageAssetIds,
  countPlannerCharacters,
  createAiPlannerDraftInput,
  type AiPlannerDraftInput,
} from './ai-planner-input.js';
import { createAiPlannerDraftPersistence } from './ai-planner-draft-persistence.js';
import {
  plannerConfirmationMessage,
  shouldConfirmPlannerDraftReplacement,
} from './ai-planner-confirmation.js';
import { AiPlannerCalendarPreview } from './ai-planner-calendar-preview.js';
import {
  createPlannerCalendarDraftStore,
  type PlannerCalendarDraftDocument,
} from './calendar-draft-preview.js';
import { createPlannerApi, type PlannerApi } from './planner-api.js';
import { createPlannerMediaApi } from './planner-media-api.js';
import { plannerSystemImagePicker } from './planner-system-image-picker-runtime.js';

const DRAFT_SYNC_DEBOUNCE_MS = 600;
const EMPTY_DRAFT: AiPlannerDraftInput = Object.freeze({
  text: '',
  imageAssetIds: Object.freeze([]),
});
const EMPTY_CALENDAR_DRAFT: PlannerCalendarDraftDocument = Object.freeze({
  text: '',
  imageAssetIds: Object.freeze([]),
  items: Object.freeze([]),
});
const UUID_HEX = '0123456789abcdef';
const UUID_VARIANTS = '89ab';

type DraftPersistence = ReturnType<typeof createAiPlannerDraftPersistence>;
type PlannerDraftStore = ReturnType<typeof createPlannerCalendarDraftStore>;
type PlannerMediaApi = ReturnType<typeof createPlannerMediaApi>;

function randomHex(length: number): string {
  return Array.from({ length }, () => UUID_HEX[Math.floor(Math.random() * UUID_HEX.length)]).join(
    '',
  );
}

function generateUuid(): string {
  const variant = UUID_VARIANTS.charAt(Math.floor(Math.random() * UUID_VARIANTS.length));
  return [
    randomHex(8),
    randomHex(4),
    `4${randomHex(3)}`,
    `${variant}${randomHex(3)}`,
    randomHex(12),
  ].join('-');
}

function message(template: string, values: Readonly<Record<string, string | number>>): string {
  return Object.entries(values).reduce(
    (current, [key, value]) => current.replace(`{${key}}`, String(value)),
    template,
  );
}

function resolvedColorScheme(value: ReturnType<typeof useColorScheme>): ColorScheme {
  return value === 'dark' ? 'dark' : 'light';
}

export function AiPlannerRouteScreen() {
  const language = useAppLanguage();
  const appTimeZone = useAppTimeZone();
  const router = useRouter();
  const colorScheme = resolvedColorScheme(useColorScheme());
  const colors = themeColors(colorScheme);
  const catalog = aiPlannerCatalogs[language];
  const [draft, setDraft] = useState<AiPlannerDraftInput>(EMPTY_DRAFT);
  const [calendarDraft, setCalendarDraft] =
    useState<PlannerCalendarDraftDocument>(EMPTY_CALENDAR_DRAFT);
  const [draftDatabase, setDraftDatabase] = useState<MutationQueueDatabase | null>(null);
  const [draftAccountId, setDraftAccountId] = useState<string | null>(null);
  const [plannerDraftStore, setPlannerDraftStore] = useState<PlannerDraftStore | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [replaceConfirmationVisible, setReplaceConfirmationVisible] = useState(false);
  const [scheduleConfirmationVisible, setScheduleConfirmationVisible] = useState(false);
  const [partialImportVisible, setPartialImportVisible] = useState(false);
  const [ready, setReady] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const persistenceRef = useRef<DraftPersistence | null>(null);
  const plannerDraftStoreRef = useRef<PlannerDraftStore | null>(null);
  const mediaApiRef = useRef<PlannerMediaApi | null>(null);
  const plannerApiRef = useRef<PlannerApi | null>(null);
  const confirmationKeyRef = useRef<string | null>(null);
  const draftRef = useRef<AiPlannerDraftInput>(EMPTY_DRAFT);
  const saveTailRef = useRef<Promise<void>>(Promise.resolve());
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setCurrentDraft = useCallback((next: AiPlannerDraftInput) => {
    draftRef.current = next;
    setDraft(next);
    setCalendarDraft((current) =>
      Object.freeze({
        text: next.text,
        imageAssetIds: next.imageAssetIds,
        items: current.items,
      }),
    );
  }, []);

  const setCurrentCalendarDraft = useCallback((next: PlannerCalendarDraftDocument) => {
    setCalendarDraft(next);
    draftRef.current = Object.freeze({
      text: next.text,
      imageAssetIds: next.imageAssetIds,
    });
    setDraft(draftRef.current);
  }, []);

  const scheduleSync = useCallback(() => {
    if (syncTimerRef.current !== null) clearTimeout(syncTimerRef.current);
    syncTimerRef.current = setTimeout(() => {
      syncTimerRef.current = null;
      void rootSyncRuntime.run().catch(() => undefined);
    }, DRAFT_SYNC_DEBOUNCE_MS);
  }, []);

  const persistDraft = useCallback(
    (next: AiPlannerDraftInput) => {
      const persistence = persistenceRef.current;
      setCurrentDraft(next);
      if (persistence === null) return;
      setErrorMessage(null);
      saveTailRef.current = saveTailRef.current
        .catch(() => undefined)
        .then(async () => {
          const saved = await persistence.save(next);
          setSavedAt(saved.updatedAt);
          scheduleSync();
        })
        .catch(() => {
          setErrorMessage(catalog.saveFailed);
        });
    },
    [catalog.saveFailed, scheduleSync, setCurrentDraft],
  );

  useFocusEffect(
    useCallback(() => {
      let active = true;
      const isActive = () => active;

      const load = async () => {
        const auth = await rootAuthController.restore();
        if (auth.status !== 'signed_in') return;
        const [database, deviceId] = await Promise.all([
          openMobileDatabase(),
          requireRegisteredDeviceId(auth.session.accountId),
        ]);
        if (!isActive()) return;
        const persistence = createAiPlannerDraftPersistence({
          database,
          accountId: auth.session.accountId,
          deviceId,
          generateMutationId: generateUuid,
          now: () => new Date(),
        });
        const calendarStore = createPlannerCalendarDraftStore({
          database,
          accountId: auth.session.accountId,
          deviceId,
          generateMutationId: generateUuid,
          generateItemId: generateUuid,
          now: () => new Date(),
        });
        persistenceRef.current = persistence;
        plannerDraftStoreRef.current = calendarStore;
        setDraftDatabase(database);
        setDraftAccountId(auth.session.accountId);
        setPlannerDraftStore(calendarStore);
        mediaApiRef.current = createPlannerMediaApi({
          baseUrl: getAuthApiBaseUrl(),
          accessToken: auth.session.accessToken,
        });
        plannerApiRef.current = createPlannerApi({
          baseUrl: getAuthApiBaseUrl(),
          accessToken: auth.session.accessToken,
        });
        const [localDraft, localCalendarDraft] = await Promise.all([
          persistence.load(),
          calendarStore.load(),
        ]);
        if (isActive() && localCalendarDraft !== null) {
          setCurrentCalendarDraft(localCalendarDraft);
          setSavedAt(localDraft?.updatedAt ?? null);
        } else if (isActive() && localDraft !== null) {
          setCurrentDraft(localDraft.input);
          setSavedAt(localDraft.updatedAt);
        }
        if (!isActive()) return;
        setReady(true);

        const draftBeforeSync = draftRef.current;
        await rootSyncRuntime.run().catch(() => undefined);
        const [synchronizedDraft, synchronizedCalendarDraft] = await Promise.all([
          persistence.load(),
          calendarStore.load(),
        ]);
        if (isActive() && draftRef.current === draftBeforeSync) {
          if (synchronizedCalendarDraft !== null) {
            setCurrentCalendarDraft(synchronizedCalendarDraft);
          } else if (synchronizedDraft !== null) {
            setCurrentDraft(synchronizedDraft.input);
          }
          setSavedAt(synchronizedDraft?.updatedAt ?? null);
        }
      };

      void load().catch(() => {
        if (isActive()) setErrorMessage(catalog.saveFailed);
      });

      return () => {
        active = false;
        setReady(false);
        persistenceRef.current = null;
        plannerDraftStoreRef.current = null;
        mediaApiRef.current = null;
        plannerApiRef.current = null;
        confirmationKeyRef.current = null;
        setDraftDatabase(null);
        setDraftAccountId(null);
        setPlannerDraftStore(null);
        if (syncTimerRef.current !== null) {
          clearTimeout(syncTimerRef.current);
          syncTimerRef.current = null;
        }
      };
    }, [catalog.saveFailed, setCurrentCalendarDraft, setCurrentDraft]),
  );

  useEffect(
    () => () => {
      if (syncTimerRef.current !== null) clearTimeout(syncTimerRef.current);
    },
    [],
  );

  const onTextChanged = useCallback(
    (text: string) => {
      if (countPlannerCharacters(text) > MAX_PLANNER_TEXT_CHARACTERS) return;
      persistDraft(
        createAiPlannerDraftInput({
          text,
          imageAssetIds: draftRef.current.imageAssetIds,
        }),
      );
    },
    [persistDraft],
  );

  const addImages = useCallback(async () => {
    const mediaApi = mediaApiRef.current;
    if (!ready || mediaApi === null || uploading) return;
    setErrorMessage(null);
    try {
      const picked = await plannerSystemImagePicker.pickImages();
      if (picked.length === 0) return;
      const current = draftRef.current;
      if (current.imageAssetIds.length + picked.length > MAX_PLANNER_IMAGES) {
        setErrorMessage(catalog.imageLimit);
        return;
      }

      setUploading(true);
      const uploadedIds: string[] = [];
      for (const image of picked) {
        const assetId = generateUuid();
        await mediaApi.uploadOriginal(assetId, image);
        uploadedIds.push(assetId);
      }
      persistDraft(
        createAiPlannerDraftInput({
          text: draftRef.current.text,
          imageAssetIds: appendPlannerImageAssetIds(draftRef.current.imageAssetIds, uploadedIds),
        }),
      );
    } catch {
      setErrorMessage(catalog.uploadFailed);
    } finally {
      setUploading(false);
    }
  }, [catalog.imageLimit, catalog.uploadFailed, persistDraft, ready, uploading]);

  const removeImage = useCallback(
    (assetId: string) => {
      persistDraft(
        createAiPlannerDraftInput({
          text: draftRef.current.text,
          imageAssetIds: draftRef.current.imageAssetIds.filter((id) => id !== assetId),
        }),
      );
    },
    [persistDraft],
  );

  const runExtraction = useCallback(async () => {
    const api = plannerApiRef.current;
    const store = plannerDraftStoreRef.current;
    const accountId = draftAccountId;
    if (!ready || api === null || store === null || accountId === null || extracting) return;

    setErrorMessage(null);
    setPartialImportVisible(false);
    setExtracting(true);
    try {
      await saveTailRef.current.catch(() => undefined);
      const current = draftRef.current;
      const result = await api.extract(accountId, {
        ...(current.text.trim().length === 0 ? {} : { text: current.text }),
        imageAssetIds: [...current.imageAssetIds],
        appTimeZone,
        locale: language,
      });
      const items = result.items.map((item) =>
        Object.freeze({
          id: generateUuid(),
          title: item.title,
          localDate: item.localDate,
          ...(item.startLocalTime === undefined ? {} : { startLocalTime: item.startLocalTime }),
          ...(item.endLocalTime === undefined ? {} : { endLocalTime: item.endLocalTime }),
          allDay: item.allDay,
          estimatedMinutes: item.estimatedMinutes,
          timeZone: appTimeZone,
          ...(item.location === undefined ? {} : { location: item.location }),
          ...(item.notes === undefined ? {} : { notes: item.notes }),
        }),
      );
      const next = await store.replaceItems(items);
      setCurrentCalendarDraft(next);
      setSavedAt(new Date().toISOString());
      setPartialImportVisible(result.omittedUncertainContent);
      scheduleSync();
    } catch {
      setErrorMessage(catalog.extractionFailed);
    } finally {
      setExtracting(false);
    }
  }, [
    appTimeZone,
    catalog.extractionFailed,
    draftAccountId,
    extracting,
    language,
    ready,
    scheduleSync,
    setCurrentCalendarDraft,
  ]);

  const requestExtraction = useCallback(() => {
    if (shouldConfirmPlannerDraftReplacement(calendarDraft)) {
      setReplaceConfirmationVisible(true);
      return;
    }
    void runExtraction();
  }, [calendarDraft, runExtraction]);

  const confirmSchedule = useCallback(async () => {
    const api = plannerApiRef.current;
    const store = plannerDraftStoreRef.current;
    const accountId = draftAccountId;
    if (
      !ready ||
      api === null ||
      store === null ||
      accountId === null ||
      confirming ||
      calendarDraft.items.length === 0
    ) {
      return;
    }

    setErrorMessage(null);
    setConfirming(true);
    const idempotencyKey = confirmationKeyRef.current ?? generateUuid();
    confirmationKeyRef.current = idempotencyKey;
    try {
      await saveTailRef.current.catch(() => undefined);
      await rootSyncRuntime.run();
      const result = await api.confirm(accountId, idempotencyKey);
      await store.clearAfterConfirmation();
      setCurrentCalendarDraft(EMPTY_CALENDAR_DRAFT);
      setSavedAt(null);
      setPartialImportVisible(false);
      await rootSyncRuntime.run().catch(() => undefined);
      confirmationKeyRef.current = null;
      setScheduleConfirmationVisible(false);
      router.replace({ pathname: '/', params: { date: result.calendarDate } });
    } catch {
      setErrorMessage(catalog.confirmationFailed);
    } finally {
      setConfirming(false);
    }
  }, [
    calendarDraft.items.length,
    catalog.confirmationFailed,
    confirming,
    draftAccountId,
    ready,
    router,
    setCurrentCalendarDraft,
  ]);

  const characterCount = countPlannerCharacters(draft.text);
  const hasExtractionInput = draft.text.trim().length > 0 || draft.imageAssetIds.length > 0;
  const confirmationCopy =
    language === 'en'
      ? plannerConfirmationMessage(calendarDraft.items.length)
      : message(catalog.confirmScheduleMessage, { count: calendarDraft.items.length });

  return (
    <Screen colorScheme={colorScheme} testID="ai-planner-route">
      <TopBar colorScheme={colorScheme} title={catalog.title} />
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        style={styles.inputScroll}
      >
        <TextArea
          accessibilityLabel={catalog.inputLabel}
          autoCorrect
          colorScheme={colorScheme}
          disabled={!ready}
          label={catalog.inputLabel}
          onChangeText={onTextChanged}
          placeholder={catalog.inputPlaceholder}
          testID="ai-planner-input"
          value={draft.text}
        />
        <Text
          accessibilityLiveRegion="polite"
          allowFontScaling
          style={[styles.secondaryText, { color: colors.textSecondary }]}
          testID="ai-planner-character-counter"
        >
          {message(catalog.characterCounter, {
            current: characterCount,
            maximum: MAX_PLANNER_TEXT_CHARACTERS,
          })}
        </Text>

        <View style={styles.imageSection}>
          <View style={styles.imageHeader}>
            <Text allowFontScaling style={[styles.sectionTitle, { color: colors.textPrimary }]}>
              {message(catalog.attachedImages, {
                current: draft.imageAssetIds.length,
                maximum: MAX_PLANNER_IMAGES,
              })}
            </Text>
            <SecondaryButton
              accessibilityLabel={catalog.attachImages}
              colorScheme={colorScheme}
              disabled={!ready || draft.imageAssetIds.length >= MAX_PLANNER_IMAGES}
              label={catalog.attachImages}
              loading={uploading}
              onPress={() => {
                void addImages();
              }}
              testID="ai-planner-add-images"
            />
          </View>

          {draft.imageAssetIds.map((assetId, index) => (
            <View key={assetId} style={[styles.imageRow, { borderColor: colors.border }]}>
              <Text
                allowFontScaling
                style={[styles.secondaryText, { color: colors.textSecondary }]}
              >
                {String(index + 1)}
              </Text>
              <Pressable
                accessibilityLabel={catalog.removeImage}
                accessibilityRole="button"
                onPress={() => {
                  removeImage(assetId);
                }}
                testID={`ai-planner-remove-image-${String(index)}`}
              >
                <Text allowFontScaling style={[styles.removeText, { color: colors.primary }]}>
                  {catalog.removeImage}
                </Text>
              </Pressable>
            </View>
          ))}
        </View>

        <View style={styles.actionRow}>
          <SecondaryButton
            accessibilityLabel={catalog.extractSchedule}
            colorScheme={colorScheme}
            disabled={!ready || !hasExtractionInput || extracting || confirming}
            label={extracting ? catalog.extracting : catalog.extractSchedule}
            loading={extracting}
            onPress={requestExtraction}
            testID="ai-planner-extract-schedule"
          />
          <PrimaryButton
            accessibilityLabel={catalog.confirmSchedule}
            colorScheme={colorScheme}
            disabled={!ready || calendarDraft.items.length === 0 || extracting || confirming}
            label={catalog.confirmSchedule}
            loading={confirming}
            onPress={() => {
              setScheduleConfirmationVisible(true);
            }}
            testID="ai-planner-confirm-schedule"
          />
        </View>
        {partialImportVisible ? (
          <Text
            accessibilityLiveRegion="polite"
            allowFontScaling
            style={[styles.secondaryText, { color: colors.textSecondary }]}
            testID="ai-planner-partial-import"
          >
            {catalog.partialImport}
          </Text>
        ) : null}

        {savedAt === null ? null : (
          <Text
            accessibilityLiveRegion="polite"
            allowFontScaling
            style={[styles.secondaryText, { color: colors.textSecondary }]}
            testID="ai-planner-saved-status"
          >
            {catalog.localSaved}
          </Text>
        )}
        {errorMessage === null ? null : (
          <Text
            accessibilityLiveRegion="assertive"
            accessibilityRole="alert"
            allowFontScaling
            style={[styles.secondaryText, { color: colors.destructive }]}
            testID="ai-planner-error"
          >
            {errorMessage}
          </Text>
        )}
      </ScrollView>
      {ready && draftDatabase !== null && draftAccountId !== null && plannerDraftStore !== null ? (
        <View style={styles.previewPane} testID="ai-planner-calendar-preview">
          <AiPlannerCalendarPreview
            accountId={draftAccountId}
            appTimeZone={appTimeZone}
            colorScheme={colorScheme}
            database={draftDatabase}
            document={calendarDraft}
            language={language}
            onDocumentChange={(next) => {
              setCurrentCalendarDraft(next);
              setSavedAt(new Date().toISOString());
              scheduleSync();
            }}
            store={plannerDraftStore}
          />
        </View>
      ) : null}
      <ConfirmationDialog
        accessibilityLabel={catalog.replaceDraftTitle}
        actions={
          <>
            <SecondaryButton
              accessibilityLabel={catalog.cancel}
              colorScheme={colorScheme}
              label={catalog.cancel}
              onPress={() => {
                setReplaceConfirmationVisible(false);
              }}
            />
            <PrimaryButton
              accessibilityLabel={catalog.replaceDraftAction}
              colorScheme={colorScheme}
              label={catalog.replaceDraftAction}
              onPress={() => {
                setReplaceConfirmationVisible(false);
                void runExtraction();
              }}
            />
          </>
        }
        colorScheme={colorScheme}
        message={catalog.replaceDraftMessage}
        onDismiss={() => {
          setReplaceConfirmationVisible(false);
        }}
        testID="ai-planner-replace-confirmation"
        title={catalog.replaceDraftTitle}
        visible={replaceConfirmationVisible}
      />
      <ConfirmationDialog
        accessibilityLabel={catalog.confirmScheduleTitle}
        actions={
          <>
            <SecondaryButton
              accessibilityLabel={catalog.cancel}
              colorScheme={colorScheme}
              disabled={confirming}
              label={catalog.cancel}
              onPress={() => {
                setScheduleConfirmationVisible(false);
              }}
            />
            <PrimaryButton
              accessibilityLabel={catalog.confirmSchedule}
              colorScheme={colorScheme}
              label={catalog.confirmSchedule}
              loading={confirming}
              onPress={() => {
                void confirmSchedule();
              }}
            />
          </>
        }
        colorScheme={colorScheme}
        message={confirmationCopy}
        onDismiss={() => {
          if (!confirming) setScheduleConfirmationVisible(false);
        }}
        testID="ai-planner-schedule-confirmation"
        title={catalog.confirmScheduleTitle}
        visible={scheduleConfirmationVisible}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: space[4],
    paddingBottom: space[4],
  },
  inputScroll: {
    flexGrow: 0,
    maxHeight: '42%',
  },
  previewPane: {
    flex: 1,
    minHeight: 0,
  },
  imageSection: {
    gap: space[3],
  },
  actionRow: {
    gap: space[3],
  },
  imageHeader: {
    gap: space[3],
  },
  sectionTitle: {
    fontSize: typography.body.fontSize,
    fontWeight: typography.body.mediumFontWeight,
  },
  secondaryText: {
    fontSize: typography.bodySmall.fontSize,
    fontWeight: typography.bodySmall.fontWeight,
  },
  imageRow: {
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: space[6],
    paddingVertical: space[2],
  },
  removeText: {
    fontSize: typography.body.fontSize,
    fontWeight: typography.body.mediumFontWeight,
  },
});
