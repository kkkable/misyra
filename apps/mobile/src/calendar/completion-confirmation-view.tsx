import { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';

import { easing, layout, radius, space, typography } from '@misyra/design-tokens';
import {
  completionConfirmationCatalogs,
  type LocalizationLocale,
} from '@misyra/localization';

import {
  PrimaryButton,
  SecondaryButton,
  themeColors,
  type ColorScheme,
} from '../design-system/index.js';
import { haptics } from '../experience/native-haptics.js';
import { useMotionPreference } from '../experience/reduce-motion.js';
import {
  createCompletionConfirmationModel,
  type CompletionConfirmationModel,
} from './completion-confirmation.js';
import type { ForegroundCompletionConfirmationEvent } from './completion-confirmation-runtime.js';

export type CompletionConfirmationProps = Readonly<{
  colorScheme: ColorScheme;
  language: LocalizationLocale;
  numberLocale?: string;
  event: ForegroundCompletionConfirmationEvent;
  onDone: () => void;
  onCreateStory: () => void;
  onCompletionHaptic?: () => void;
}>;

const triggerCompletionHaptic = () => haptics.triggerNonBlocking('completion');

function confettiDots(model: CompletionConfirmationModel, colorScheme: ColorScheme) {
  if (!model.motion.showConfetti) return null;
  const colors = themeColors(colorScheme);
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={styles.confetti}
      testID="completion-confirmation-confetti"
    >
      <View style={[styles.confettiDot, { backgroundColor: colors.primary }]} />
      <View style={[styles.confettiDot, { backgroundColor: colors.verified }]} />
      <View style={[styles.confettiDot, { backgroundColor: colors.late }]} />
      <View style={[styles.confettiDot, { backgroundColor: colors.primary }]} />
      <View style={[styles.confettiDot, { backgroundColor: colors.verified }]} />
    </View>
  );
}

export function CompletionConfirmation({
  colorScheme,
  language,
  numberLocale,
  event,
  onDone,
  onCreateStory,
  onCompletionHaptic = triggerCompletionHaptic,
}: CompletionConfirmationProps) {
  const motionPreference = useMotionPreference();
  const reduceMotion = motionPreference.transition === 'fade';
  const model = useMemo(
    () =>
      createCompletionConfirmationModel({
        awardedXp: event.awardedXp,
        totalXp: event.totalXp,
        language,
        reduceMotion,
        numberLocale,
      }),
    [event.awardedXp, event.totalXp, language, numberLocale, reduceMotion],
  );
  const progress = useRef(new Animated.Value(model.motion.durationMs === 0 ? 1 : 0)).current;
  const colors = themeColors(colorScheme);
  const catalog = completionConfirmationCatalogs[language];

  useEffect(() => {
    onCompletionHaptic();
  }, [event.awardedXp, event.occurrenceId, event.totalXp, onCompletionHaptic]);

  useEffect(() => {
    if (model.motion.durationMs === 0) {
      progress.setValue(1);
      return;
    }

    progress.setValue(0);
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: model.motion.durationMs,
      easing: Easing.bezier(...easing.enter),
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [model.motion.durationMs, progress]);

  const translateY =
    model.motion.transition === 'directional'
      ? progress.interpolate({ inputRange: [0, 1], outputRange: [space[4], 0] })
      : 0;
  const scale = model.motion.scaleLevel
    ? progress.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] })
    : 1;

  return (
    <View pointerEvents="box-none" style={styles.overlay} testID="completion-confirmation">
      <Animated.View
        accessibilityLiveRegion="polite"
        accessibilityRole="alert"
        style={[
          styles.card,
          {
            backgroundColor: colors.surfaceRaised,
            borderColor: colors.border,
            opacity: progress,
            transform: [{ translateY }, { scale }],
          },
        ]}
      >
        {confettiDots(model, colorScheme)}
        <Text
          allowFontScaling
          style={[
            styles.message,
            {
              color: colors.textPrimary,
              fontSize: typography.headline.fontSize,
              fontWeight: typography.headline.fontWeight,
            },
          ]}
          testID="completion-confirmation-message"
        >
          {model.message}
        </Text>
        <View style={styles.actions}>
          <SecondaryButton
            accessibilityLabel={catalog.createStory}
            colorScheme={colorScheme}
            label={catalog.createStory}
            onPress={onCreateStory}
            testID="completion-confirmation-create-story"
          />
          <PrimaryButton
            accessibilityLabel={catalog.done}
            colorScheme={colorScheme}
            label={catalog.done}
            onPress={onDone}
            testID="completion-confirmation-done"
          />
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    left: layout.screenHorizontalPadding,
    right: layout.screenHorizontalPadding,
    bottom: space[6],
    zIndex: 20,
  },
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: space[4],
    gap: space[3],
  },
  message: {
    textAlign: 'center',
  },
  actions: {
    flexDirection: 'row',
    gap: space[2],
  },
  confetti: {
    minHeight: space[3],
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    alignItems: 'center',
  },
  confettiDot: {
    width: space[2],
    height: space[2],
    borderRadius: radius.pill,
  },
});
