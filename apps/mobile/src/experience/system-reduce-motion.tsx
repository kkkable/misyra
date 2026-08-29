import type { PropsWithChildren } from 'react';
import { useReducedMotion } from 'react-native-reanimated';

import { MotionPreferenceProvider } from './reduce-motion.js';

export function SystemMotionPreferenceProvider({ children }: PropsWithChildren) {
  const reduceMotion = useReducedMotion();

  return (
    <MotionPreferenceProvider reduceMotion={reduceMotion}>{children}</MotionPreferenceProvider>
  );
}
