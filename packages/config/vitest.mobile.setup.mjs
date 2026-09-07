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
