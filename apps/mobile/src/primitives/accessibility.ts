/**
 * Internal helper — RN does not surface an `accessibilityState` key for
 * `error`; error is conveyed to screen readers via labels/announcements, so
 * only the supported keys pass through here. Not part of the public
 * primitive surface.
 */
export function rnAccessibilityState(state: {
  readonly disabled?: boolean;
  readonly busy?: boolean;
  readonly selected?: boolean;
  readonly pressed?: boolean;
}) {
  const { disabled, busy, selected, pressed } = state;
  const result: { disabled?: boolean; busy?: boolean; selected?: boolean; pressed?: boolean } = {};
  if (disabled) {
    result.disabled = true;
  }
  if (busy) {
    result.busy = true;
  }
  if (selected) {
    result.selected = true;
  }
  if (pressed) {
    result.pressed = true;
  }
  return result;
}
