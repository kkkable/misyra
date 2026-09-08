import { useCallback, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { layout, radius, space, typography } from '@misyra/design-tokens';
import { localizationCatalogs, type LocalizationLocale } from '@misyra/localization';

import { fieldContract, themeColors, type ColorScheme } from '../design-system/index.js';
import type { OfflineSearchResult } from './offline-search.js';

export interface CalendarSearchResult extends OfflineSearchResult {
  readonly localDate: string | null;
}

export interface CalendarSearchScreenProps {
  readonly colorScheme: ColorScheme;
  readonly language: LocalizationLocale;
  readonly search: (query: string) => Promise<readonly CalendarSearchResult[]>;
  readonly onClose: () => void;
  readonly onOpenResult: (result: CalendarSearchResult) => Promise<boolean>;
}

function dateForFormatting(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match === null) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12));
  return Number.isNaN(date.getTime()) ? null : date;
}

function resultDateLabel(value: string | null, language: LocalizationLocale): string | null {
  if (value === null) return null;
  const date = dateForFormatting(value);
  if (date === null) return value;
  return new Intl.DateTimeFormat(language === 'zh-HK' ? 'zh-HK' : 'en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

export function CalendarSearchScreen({
  colorScheme,
  language,
  search,
  onClose,
  onOpenResult,
}: CalendarSearchScreenProps) {
  const colors = themeColors(colorScheme);
  const catalog = localizationCatalogs[language];
  const inputContract = fieldContract(colorScheme, { disabled: false, multiline: false });
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<readonly CalendarSearchResult[]>([]);
  const [unavailable, setUnavailable] = useState(false);
  const [searching, setSearching] = useState(false);
  const generation = useRef(0);

  const clearAndClose = useCallback(() => {
    generation.current += 1;
    setQuery('');
    setResults([]);
    setUnavailable(false);
    setSearching(false);
    onClose();
  }, [onClose]);

  const runSearch = useCallback(
    async (value: string) => {
      setQuery(value);
      setUnavailable(false);
      const request = ++generation.current;
      if (value.trim().length === 0) {
        setResults([]);
        setSearching(false);
        return;
      }
      setSearching(true);
      try {
        const nextResults = await search(value);
        if (request === generation.current) setResults(nextResults);
      } finally {
        if (request === generation.current) setSearching(false);
      }
    },
    [search],
  );

  const openResult = useCallback(
    async (result: CalendarSearchResult) => {
      setUnavailable(false);
      const opened = await onOpenResult(result);
      if (!opened) {
        setUnavailable(true);
        return;
      }
      clearAndClose();
    },
    [clearAndClose, onOpenResult],
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.canvas }]} testID="calendar-search-screen">
      <View style={styles.header}>
        <Text accessibilityRole="header" allowFontScaling style={[styles.title, { color: colors.textPrimary }]}>
          {catalog['calendar.search.title']}
        </Text>
        <Pressable
          accessibilityLabel={catalog['calendar.shell.close']}
          accessibilityRole="button"
          onPress={clearAndClose}
          style={styles.closeButton}
          testID="calendar-search-close"
        >
          <Text allowFontScaling style={[styles.closeText, { color: colors.primary }]}>
            {catalog['calendar.shell.close']}
          </Text>
        </Pressable>
      </View>

      <TextInput
        accessibilityLabel={catalog['calendar.search.placeholder']}
        allowFontScaling
        autoCapitalize="none"
        autoCorrect={false}
        onChangeText={(value) => {
          void runSearch(value);
        }}
        placeholder={catalog['calendar.search.placeholder']}
        placeholderTextColor={colors.textTertiary}
        style={[
          styles.input,
          {
            backgroundColor: inputContract.backgroundColor,
            borderColor: inputContract.borderColor,
            color: inputContract.foregroundColor,
            minHeight: inputContract.minimumTouchTarget,
          },
        ]}
        testID="calendar-search-input"
        value={query}
      />

      {unavailable ? (
        <Text
          accessibilityRole="alert"
          allowFontScaling
          style={[styles.message, { color: colors.textSecondary }]}
          testID="calendar-search-unavailable"
        >
          {catalog['calendar.search.unavailable']}
        </Text>
      ) : null}

      <ScrollView contentContainerStyle={styles.results} keyboardShouldPersistTaps="handled">
        {results.map((result) => {
          const dateLabel = resultDateLabel(result.localDate, language);
          return (
            <Pressable
              accessibilityLabel={result.title}
              accessibilityRole="button"
              key={result.documentId}
              onPress={() => openResult(result)}
              style={({ pressed }) => [
                styles.result,
                {
                  backgroundColor: pressed ? colors.primarySoft : colors.surface,
                  borderColor: colors.border,
                },
              ]}
              testID={`calendar-search-result-${result.documentId}`}
            >
              <Text allowFontScaling style={[styles.resultTitle, { color: colors.textPrimary }]}>
                {result.title}
              </Text>
              {dateLabel === null ? null : (
                <Text allowFontScaling style={[styles.meta, { color: colors.textSecondary }]}>
                  {dateLabel}
                </Text>
              )}
              {result.location === null ? null : (
                <Text allowFontScaling style={[styles.meta, { color: colors.textSecondary }]}>
                  {result.location}
                </Text>
              )}
              {result.providerText === null ? null : (
                <Text allowFontScaling numberOfLines={2} style={[styles.meta, { color: colors.textSecondary }]}>
                  {result.providerText}
                </Text>
              )}
              {result.personalNoteExcerpt === null ? null : (
                <Text
                  allowFontScaling
                  numberOfLines={2}
                  style={[styles.noteExcerpt, { color: colors.textSecondary }]}
                  testID={`calendar-search-personal-note-${result.documentId}`}
                >
                  {result.personalNoteExcerpt}
                </Text>
              )}
            </Pressable>
          );
        })}
        {query.trim().length > 0 && !searching && results.length === 0 ? (
          <Text allowFontScaling style={[styles.message, { color: colors.textSecondary }]}>
            {catalog['calendar.search.noResults']}
          </Text>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    gap: space[3],
    paddingBottom: space[4],
    paddingHorizontal: layout.screenHorizontalPadding,
    paddingTop: space[4],
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: typography.title3.fontSize,
    fontWeight: typography.title3.fontWeight,
  },
  closeButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: layout.minimumTouchTarget,
    minWidth: layout.minimumTouchTarget,
  },
  closeText: {
    fontSize: typography.body.fontSize,
    fontWeight: typography.body.mediumFontWeight,
  },
  input: {
    borderRadius: radius.md,
    borderWidth: 1,
    fontSize: typography.body.fontSize,
    paddingHorizontal: space[3],
  },
  results: {
    gap: space[2],
    paddingBottom: space[6],
  },
  result: {
    borderRadius: radius.md,
    borderWidth: 1,
    gap: space[1],
    minHeight: layout.minimumTouchTarget,
    paddingHorizontal: space[3],
    paddingVertical: space[3],
  },
  resultTitle: {
    fontSize: typography.body.fontSize,
    fontWeight: typography.body.mediumFontWeight,
  },
  meta: {
    fontSize: typography.bodySmall.fontSize,
    fontWeight: typography.bodySmall.fontWeight,
  },
  noteExcerpt: {
    fontSize: typography.bodySmall.fontSize,
    fontWeight: typography.bodySmall.fontWeight,
  },
  message: {
    fontSize: typography.bodySmall.fontSize,
    fontWeight: typography.bodySmall.fontWeight,
  },
});
