import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { layout, radius, space, typography } from '@misyra/design-tokens';
import type {
  CalendarSource,
  CompletionState,
  EvidenceState,
  FieldOwnership,
  RewardEligibility,
} from '@misyra/domain';
import { localizationCatalogs, type LocalizationLocale } from '@misyra/localization';

import { fieldContract, themeColors, type ColorScheme } from '../design-system/index.js';

export type MissionDetailsLifecycle = 'future' | 'active' | 'completed' | 'expired' | 'cancelled';
export type MissionCancellationAttribution = 'organizer' | 'event' | null;
export type MissionZeroXpReason = 'created_or_moved_into_past' | 'edited_after_start' | null;
export type MissionDetailsEditableField =
  | 'title'
  | 'date'
  | 'start'
  | 'end'
  | 'timeZone'
  | 'location'
  | 'notes'
  | 'personalNote';

export type MissionDetailsStructuredSchedule = Readonly<{
  date: string;
  start: string;
  end: string;
  timeZone: string;
  allDay: boolean;
}>;

export interface MissionDetailsProjection {
  readonly id: string;
  readonly title: string;
  readonly scheduleText: string;
  readonly structuredSchedule?: MissionDetailsStructuredSchedule | undefined;
  readonly recurring?: boolean | undefined;
  readonly location: string | null;
  readonly providerDescription: string | null;
  readonly notes: string | null;
  readonly personalNote: string | null;
  readonly fieldOwnership: FieldOwnership;
  readonly calendarSource: CalendarSource;
  readonly lifecycle: MissionDetailsLifecycle;
  readonly completionState: CompletionState;
  readonly evidenceState: EvidenceState;
  readonly rewardEligibility: RewardEligibility;
  readonly xpSummary: string;
  readonly zeroXpReason: MissionZeroXpReason;
  readonly cancellationAttribution: MissionCancellationAttribution;
}

export interface MissionDetailsScreenProps {
  readonly colorScheme: ColorScheme;
  readonly details: MissionDetailsProjection;
  readonly language: LocalizationLocale;
  readonly onFieldChange?:
    ((field: MissionDetailsEditableField, value: string) => void) | undefined;
  readonly onSave?: (() => void | Promise<void>) | undefined;
  readonly onDuplicate?: ((missionId: string) => void | Promise<void>) | undefined;
  readonly onDelete?: ((missionId: string) => void | Promise<void>) | undefined;
}

type Catalog = (typeof localizationCatalogs)[LocalizationLocale];

type FieldProps = {
  readonly testID: string;
  readonly label: string;
  readonly value: string;
  readonly editable: boolean;
  readonly multiline?: boolean;
  readonly placeholder?: string | undefined;
  readonly onChangeText?: ((value: string) => void) | undefined;
  readonly colorScheme: ColorScheme;
};

function DetailsField({
  colorScheme,
  editable,
  label,
  multiline = false,
  onChangeText,
  placeholder,
  testID,
  value,
}: FieldProps) {
  const contract = fieldContract(colorScheme, { disabled: !editable, multiline });

  return (
    <View style={styles.fieldGroup}>
      <Text
        allowFontScaling
        style={[styles.fieldLabel, { color: themeColors(colorScheme).textSecondary }]}
      >
        {label}
      </Text>
      <TextInput
        accessibilityLabel={label}
        accessibilityState={{ disabled: !editable }}
        allowFontScaling
        editable={editable}
        multiline={multiline}
        {...(onChangeText === undefined ? {} : { onChangeText })}
        {...(placeholder === undefined ? {} : { placeholder })}
        style={[
          styles.field,
          multiline ? styles.multilineField : null,
          {
            backgroundColor: contract.backgroundColor,
            borderColor: contract.borderColor,
            color: contract.foregroundColor,
            minHeight: contract.minimumTouchTarget,
          },
        ]}
        testID={testID}
        value={value}
      />
    </View>
  );
}

function isHistorical(lifecycle: MissionDetailsLifecycle): boolean {
  return lifecycle === 'completed' || lifecycle === 'expired' || lifecycle === 'cancelled';
}

function statusText(details: MissionDetailsProjection, catalog: Catalog): string {
  if (details.lifecycle === 'expired') return catalog['calendar.details.status.expired'];
  if (details.lifecycle === 'cancelled') {
    return details.cancellationAttribution === 'organizer'
      ? catalog['calendar.details.status.cancelledOrganizer']
      : catalog['calendar.details.status.cancelled'];
  }
  if (details.lifecycle === 'completed' || details.completionState === 'completed') {
    return catalog['calendar.details.status.completed'];
  }
  if (details.lifecycle === 'active') return catalog['calendar.details.status.active'];
  return catalog['calendar.details.status.future'];
}

function evidenceText(state: EvidenceState, catalog: Catalog): string {
  switch (state) {
    case 'pending':
      return catalog['calendar.details.evidence.pending'];
    case 'accepted':
      return catalog['calendar.details.evidence.accepted'];
    case 'rejected':
      return catalog['calendar.details.evidence.rejected'];
    case 'not_required':
      return catalog['calendar.details.evidence.notRequired'];
    default:
      return catalog['calendar.details.evidence.notSubmitted'];
  }
}

function zeroXpReasonText(reason: MissionZeroXpReason, catalog: Catalog): string | null {
  const compatibilityReason = reason as string | null;
  switch (compatibilityReason) {
    case 'created_or_moved_into_past':
    case 'Created or moved into the past':
      return catalog['calendar.details.zeroXp.past'];
    case 'edited_after_start':
    case 'Edited after the start time':
      return catalog['calendar.details.zeroXp.editedAfterStart'];
    default:
      return null;
  }
}

function fieldChangeHandler(
  onFieldChange: MissionDetailsScreenProps['onFieldChange'],
  field: MissionDetailsEditableField,
): ((value: string) => void) | undefined {
  if (onFieldChange === undefined) return undefined;
  return (value) => {
    onFieldChange(field, value);
  };
}

export function MissionDetailsScreen({
  colorScheme,
  details,
  language,
  onFieldChange,
  onSave,
  onDuplicate,
  onDelete,
}: MissionDetailsScreenProps) {
  const catalog = localizationCatalogs[language];
  const colors = themeColors(colorScheme);
  const historical = isHistorical(details.lifecycle) || details.completionState === 'completed';
  const appOwnedEditable = !historical && details.fieldOwnership === 'app_owned';
  const structuredEditable =
    appOwnedEditable && details.structuredSchedule !== undefined && details.recurring !== true;
  const personalNoteEditable = !historical && details.fieldOwnership === 'organizer_controlled';
  const writtenStatus = statusText(details, catalog);
  const writtenEvidence = evidenceText(details.evidenceState, catalog);
  const zeroReason =
    details.rewardEligibility === 'ineligible'
      ? zeroXpReasonText(details.zeroXpReason, catalog)
      : null;

  return (
    <ScrollView
      contentContainerStyle={[styles.content, { backgroundColor: colors.canvas }]}
      testID="mission-details-screen"
    >
      <View accessibilityLabel={details.title} accessibilityRole="header">
        <DetailsField
          colorScheme={colorScheme}
          editable={appOwnedEditable && details.recurring !== true}
          label={catalog['calendar.details.title']}
          onChangeText={fieldChangeHandler(onFieldChange, 'title')}
          testID="mission-details-title"
          value={details.title}
        />
      </View>

      <DetailsField
        colorScheme={colorScheme}
        editable={false}
        label={catalog['calendar.details.schedule']}
        testID="mission-details-schedule"
        value={details.scheduleText}
      />

      {structuredEditable ? (
        <View style={styles.scheduleGrid} testID="mission-details-structured-schedule">
          <DetailsField
            colorScheme={colorScheme}
            editable
            label={catalog['calendar.create.date']}
            onChangeText={fieldChangeHandler(onFieldChange, 'date')}
            placeholder={catalog['calendar.recurrence.localDateInputHint']}
            testID="mission-details-date"
            value={details.structuredSchedule?.date ?? ''}
          />
          {details.structuredSchedule?.allDay === true ? null : (
            <View style={styles.scheduleRow}>
              <View style={styles.flexField}>
                <DetailsField
                  colorScheme={colorScheme}
                  editable
                  label={catalog['calendar.create.start']}
                  onChangeText={fieldChangeHandler(onFieldChange, 'start')}
                  placeholder={catalog['calendar.create.timeInputHint']}
                  testID="mission-details-start"
                  value={details.structuredSchedule?.start ?? ''}
                />
              </View>
              <View style={styles.flexField}>
                <DetailsField
                  colorScheme={colorScheme}
                  editable
                  label={catalog['calendar.create.end']}
                  onChangeText={fieldChangeHandler(onFieldChange, 'end')}
                  placeholder={catalog['calendar.create.timeInputHint']}
                  testID="mission-details-end"
                  value={details.structuredSchedule?.end ?? ''}
                />
              </View>
            </View>
          )}
          <DetailsField
            colorScheme={colorScheme}
            editable
            label={catalog['calendar.create.timeZone']}
            onChangeText={fieldChangeHandler(onFieldChange, 'timeZone')}
            testID="mission-details-time-zone"
            value={details.structuredSchedule?.timeZone ?? ''}
          />
        </View>
      ) : null}

      {details.recurring === true && appOwnedEditable ? (
        <Text
          allowFontScaling
          style={[styles.supportingText, { color: colors.textSecondary }]}
          testID="mission-details-recurring-scope-pending"
        >
          {catalog['calendar.details.recurringEditPending']}
        </Text>
      ) : null}

      {details.fieldOwnership === 'organizer_controlled' ? (
        <Text
          accessibilityRole="text"
          allowFontScaling
          style={[styles.supportingText, { color: colors.textSecondary }]}
        >
          {catalog['calendar.details.organizerControlled']}
        </Text>
      ) : null}

      <DetailsField
        colorScheme={colorScheme}
        editable={appOwnedEditable && details.recurring !== true}
        label={catalog['calendar.details.location']}
        onChangeText={fieldChangeHandler(onFieldChange, 'location')}
        testID="mission-details-location"
        value={details.location ?? ''}
      />

      {details.fieldOwnership === 'organizer_controlled' ? (
        <DetailsField
          colorScheme={colorScheme}
          editable={false}
          label={catalog['calendar.details.providerDescription']}
          multiline
          testID="mission-details-provider-description"
          value={details.providerDescription ?? ''}
        />
      ) : (
        <DetailsField
          colorScheme={colorScheme}
          editable={appOwnedEditable && details.recurring !== true}
          label={catalog['calendar.details.notes']}
          multiline
          onChangeText={fieldChangeHandler(onFieldChange, 'notes')}
          testID="mission-details-notes"
          value={details.notes ?? ''}
        />
      )}

      {structuredEditable && onSave !== undefined ? (
        <Pressable
          accessibilityLabel={catalog['calendar.create.save']}
          accessibilityRole="button"
          onPress={() => {
            void Promise.resolve(onSave()).catch(() => undefined);
          }}
          style={[styles.primaryAction, { backgroundColor: colors.primary }]}
          testID="mission-details-save"
        >
          <Text allowFontScaling style={[styles.actionText, { color: colors.primaryText }]}
          >
            {catalog['calendar.create.save']}
          </Text>
        </Pressable>
      ) : null}

      <View style={styles.section}>
        <Text
          accessibilityLabel={writtenStatus}
          accessibilityRole="text"
          allowFontScaling
          style={[styles.statusText, { color: colors.textPrimary }]}
          testID="mission-details-status"
        >
          {writtenStatus}
        </Text>
        <Text
          accessibilityLabel={writtenEvidence}
          accessibilityRole="text"
          allowFontScaling
          style={[styles.supportingText, { color: colors.textSecondary }]}
          testID="mission-details-evidence-state"
        >
          {writtenEvidence}
        </Text>
      </View>

      {details.fieldOwnership === 'organizer_controlled' ? (
        <DetailsField
          colorScheme={colorScheme}
          editable={personalNoteEditable}
          label={catalog['calendar.details.personalNote']}
          multiline
          onChangeText={fieldChangeHandler(onFieldChange, 'personalNote')}
          testID="mission-details-personal-note"
          value={details.personalNote ?? ''}
        />
      ) : null}

      <View style={styles.section}>
        <Text
          accessibilityLabel={details.xpSummary}
          accessibilityRole="text"
          allowFontScaling
          style={[styles.xpText, { color: colors.textPrimary }]}
          testID="mission-details-xp-summary"
        >
          {details.xpSummary}
        </Text>
        {zeroReason === null ? null : (
          <Text
            accessibilityRole="text"
            allowFontScaling
            style={[styles.supportingText, { color: colors.textSecondary }]}
            testID="mission-details-zero-xp-reason"
          >
            {zeroReason}
          </Text>
        )}
      </View>

      {onDuplicate === undefined && onDelete === undefined ? null : (
        <View style={styles.actions} testID="mission-details-actions">
          {onDuplicate === undefined ? null : (
            <Pressable
              accessibilityLabel={catalog['calendar.details.duplicate']}
              accessibilityRole="button"
              onPress={() => {
                void Promise.resolve(onDuplicate(details.id)).catch(() => undefined);
              }}
              style={[styles.action, { borderColor: colors.border }]}
              testID="mission-details-duplicate"
            >
              <Text allowFontScaling style={[styles.actionText, { color: colors.primary }]}
              >
                {catalog['calendar.details.duplicate']}
              </Text>
            </Pressable>
          )}
          {onDelete === undefined ? null : (
            <Pressable
              accessibilityLabel={catalog['calendar.details.delete']}
              accessibilityRole="button"
              onPress={() => {
                void Promise.resolve(onDelete(details.id)).catch(() => undefined);
              }}
              style={[styles.action, { borderColor: colors.late }]}
              testID="mission-details-delete"
            >
              <Text allowFontScaling style={[styles.actionText, { color: colors.late }]}
              >
                {catalog['calendar.details.delete']}
              </Text>
            </Pressable>
          )}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: space[4],
    paddingBottom: space[8],
    paddingHorizontal: layout.screenHorizontalPadding,
    paddingTop: space[4],
  },
  section: { gap: space[2] },
  fieldGroup: { gap: space[1] },
  fieldLabel: {
    fontSize: typography.caption1.fontSize,
    fontWeight: typography.caption1.fontWeight,
  },
  field: {
    borderRadius: radius.md,
    borderWidth: 1,
    fontSize: typography.body.fontSize,
    paddingHorizontal: space[3],
    paddingVertical: space[2],
  },
  multilineField: { minHeight: layout.minimumTouchTarget * 2, textAlignVertical: 'top' },
  scheduleGrid: { gap: space[3] },
  scheduleRow: { flexDirection: 'row', gap: space[2] },
  flexField: { flex: 1 },
  statusText: { fontSize: typography.body.fontSize, fontWeight: typography.body.mediumFontWeight },
  supportingText: { fontSize: typography.bodySmall.fontSize, fontWeight: typography.bodySmall.fontWeight },
  xpText: { fontSize: typography.headline.fontSize, fontWeight: typography.headline.fontWeight },
  actions: { flexDirection: 'row', gap: space[3] },
  action: {
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: layout.minimumTouchTarget,
    paddingHorizontal: space[3],
  },
  primaryAction: {
    alignItems: 'center',
    borderRadius: radius.md,
    justifyContent: 'center',
    minHeight: layout.minimumTouchTarget,
    paddingHorizontal: space[3],
  },
  actionText: { fontSize: typography.body.fontSize, fontWeight: typography.body.mediumFontWeight },
});
