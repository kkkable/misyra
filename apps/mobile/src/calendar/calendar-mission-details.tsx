import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

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
  | 'schedule'
  | 'location'
  | 'notes'
  | 'personalNote';

export interface MissionDetailsProjection {
  readonly id: string;
  readonly title: string;
  readonly scheduleText: string;
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
    | ((field: MissionDetailsEditableField, value: string) => void)
    | undefined;
}

type Catalog = (typeof localizationCatalogs)[LocalizationLocale];

type FieldProps = {
  readonly testID: string;
  readonly label: string;
  readonly value: string;
  readonly editable: boolean;
  readonly multiline?: boolean;
  readonly onChangeText?: ((value: string) => void) | undefined;
  readonly colorScheme: ColorScheme;
};

function DetailsField({
  colorScheme,
  editable,
  label,
  multiline = false,
  onChangeText,
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
        defaultValue={value}
        editable={editable}
        multiline={multiline}
        {...(onChangeText === undefined ? {} : { onChangeText })}
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
      />
    </View>
  );
}

function isHistorical(lifecycle: MissionDetailsLifecycle): boolean {
  return lifecycle === 'completed' || lifecycle === 'expired' || lifecycle === 'cancelled';
}

function statusText(details: MissionDetailsProjection, catalog: Catalog): string {
  if (details.lifecycle === 'expired') {
    return catalog['calendar.details.status.expired'];
  }
  if (details.lifecycle === 'cancelled') {
    return details.cancellationAttribution === 'organizer'
      ? catalog['calendar.details.status.cancelledOrganizer']
      : catalog['calendar.details.status.cancelled'];
  }
  if (details.lifecycle === 'completed' || details.completionState === 'completed') {
    return catalog['calendar.details.status.completed'];
  }
  if (details.lifecycle === 'active') {
    return catalog['calendar.details.status.active'];
  }
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
  if (onFieldChange === undefined) {
    return undefined;
  }
  return (value) => {
    onFieldChange(field, value);
  };
}

export function MissionDetailsScreen({
  colorScheme,
  details,
  language,
  onFieldChange,
}: MissionDetailsScreenProps) {
  const catalog = localizationCatalogs[language];
  const colors = themeColors(colorScheme);
  const historical = isHistorical(details.lifecycle);
  const appOwnedEditable = !historical && details.fieldOwnership === 'app_owned';
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
          editable={appOwnedEditable}
          label={catalog['calendar.details.title']}
          onChangeText={fieldChangeHandler(onFieldChange, 'title')}
          testID="mission-details-title"
          value={details.title}
        />
      </View>

      <DetailsField
        colorScheme={colorScheme}
        editable={appOwnedEditable}
        label={catalog['calendar.details.schedule']}
        onChangeText={fieldChangeHandler(onFieldChange, 'schedule')}
        testID="mission-details-schedule"
        value={details.scheduleText}
      />

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
        editable={appOwnedEditable}
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
          editable={appOwnedEditable}
          label={catalog['calendar.details.notes']}
          multiline
          onChangeText={fieldChangeHandler(onFieldChange, 'notes')}
          testID="mission-details-notes"
          value={details.notes ?? ''}
        />
      )}

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
  section: {
    gap: space[2],
  },
  fieldGroup: {
    gap: space[1],
  },
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
  multilineField: {
    minHeight: layout.minimumTouchTarget * 2,
    textAlignVertical: 'top',
  },
  statusText: {
    fontSize: typography.body.fontSize,
    fontWeight: typography.body.mediumFontWeight,
  },
  supportingText: {
    fontSize: typography.bodySmall.fontSize,
    fontWeight: typography.bodySmall.fontWeight,
  },
  xpText: {
    fontSize: typography.headline.fontSize,
    fontWeight: typography.headline.fontWeight,
  },
});
