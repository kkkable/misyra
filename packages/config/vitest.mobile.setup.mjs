import { vi } from 'vitest';

vi.mock('react-native-gesture-handler', async () => {
  const { createElement } = await import('react');

  return {
    GestureDetector: ({ children }) => createElement('GestureDetector', null, children),
    GestureHandlerRootView: ({ children, ...props }) =>
      createElement('GestureHandlerRootView', props, children),
    usePanGesture: (config) => ({ config }),
  };
});

vi.mock('react-native-reanimated', async () => {
  const { createElement } = await import('react');

  return {
    default: {
      View: ({ children, ...props }) => createElement('AnimatedView', props, children),
    },
    useAnimatedStyle: (factory) => factory(),
    useSharedValue: (value) => ({ value }),
  };
});

vi.mock('react-native-worklets', () => ({
  scheduleOnRN: (callback, ...args) => callback(...args),
}));
