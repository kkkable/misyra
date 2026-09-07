import { createElement } from 'react';

export function GestureDetector({ children }) {
  return createElement('GestureDetector', null, children);
}

export function GestureHandlerRootView({ children, ...props }) {
  return createElement('GestureHandlerRootView', props, children);
}

export function usePanGesture(config) {
  return { config };
}

const Animated = {
  View: ({ children, ...props }) => createElement('AnimatedView', props, children),
};

export default Animated;

export function useAnimatedStyle(factory) {
  return factory();
}

export function useSharedValue(value) {
  return { value };
}

export function scheduleOnRN(callback, ...args) {
  return callback(...args);
}
