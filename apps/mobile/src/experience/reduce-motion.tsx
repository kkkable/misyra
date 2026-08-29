import { createContext, useContext } from 'react';
import type { PropsWithChildren } from 'react';

export type MotionTransition = 'directional' | 'fade';

export type MotionPreference = Readonly<{
  confetti: boolean;
  directionalMovement: boolean;
  directDrag: true;
  essentialLoading: true;
  movingOutlines: boolean;
  staticSuccess: true;
  transition: MotionTransition;
}>;

const standardMotionPreference: MotionPreference = {
  confetti: true,
  directionalMovement: true,
  directDrag: true,
  essentialLoading: true,
  movingOutlines: true,
  staticSuccess: true,
  transition: 'directional',
};

const reducedMotionPreference: MotionPreference = {
  confetti: false,
  directionalMovement: false,
  directDrag: true,
  essentialLoading: true,
  movingOutlines: false,
  staticSuccess: true,
  transition: 'fade',
};

export function createMotionPreference(reduceMotion: boolean): MotionPreference {
  return reduceMotion ? reducedMotionPreference : standardMotionPreference;
}

const MotionPreferenceContext = createContext<MotionPreference>(standardMotionPreference);

type MotionPreferenceProviderProps = PropsWithChildren<{
  reduceMotion: boolean;
}>;

export function MotionPreferenceProvider({
  children,
  reduceMotion,
}: MotionPreferenceProviderProps) {
  return (
    <MotionPreferenceContext.Provider value={createMotionPreference(reduceMotion)}>
      {children}
    </MotionPreferenceContext.Provider>
  );
}

export function useMotionPreference(): MotionPreference {
  return useContext(MotionPreferenceContext);
}
