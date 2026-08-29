import { duration, easing, spring } from '@misyra/design-tokens';

export type MotionDurationName = keyof typeof duration;
export type MotionEasingName = keyof typeof easing;

export type MotionTimingConfig = Readonly<{
  duration: (typeof duration)[MotionDurationName];
  easing: (typeof easing)[MotionEasingName];
}>;

export function createTimingConfig(
  durationName: MotionDurationName,
  easingName: MotionEasingName = 'standard',
): MotionTimingConfig {
  return {
    duration: duration[durationName],
    easing: easing[easingName],
  };
}

export const sharedSpringConfig = spring;
