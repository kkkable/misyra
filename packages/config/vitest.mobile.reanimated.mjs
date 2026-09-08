import { createElement } from 'react';

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
