import type { ReactNode } from "react";
import { Pressable } from "react-native";
import { radius } from "@misyra/design-tokens";
import { rnAccessibilityState } from "./accessibility";
import {
  buttonInteractionState,
  iconButtonColors,
  interactionAccessibility,
  minTouchTargetStyle,
  primitiveA11yRole,
  type ButtonState,
  type ThemeMode,
} from "./core";

export interface IconButtonProps {
  readonly mode: ThemeMode;
  /** Screen-reader label for the icon control — supplied by the caller. */
  readonly label: string;
  readonly glyph: ReactNode;
  readonly state?: ButtonState;
  readonly onPress?: () => void;
  readonly testID?: string;
}

/**
 * IconButton — a circular, filled 44pt control hosting an icon glyph (§6.7).
 * The glyph and its label come from the caller; color resolution follows
 * iconButtonColors() and the touch target is always ≥ 44pt.
 */
export function IconButton({
  mode,
  label,
  glyph,
  state = "normal",
  onPress,
  testID,
}: IconButtonProps) {
  const colors = iconButtonColors(mode, state);
  const disabled = state === "disabled" || state === "loading";
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityState={rnAccessibilityState(
        interactionAccessibility(buttonInteractionState(state)),
      )}
      disabled={disabled}
      onPress={onPress}
      accessibilityRole={primitiveA11yRole("iconButton")}
      style={({ pressed }) => [
        {
          alignItems: "center",
          backgroundColor:
            state === "normal" && pressed
              ? iconButtonColors(mode, "pressed").background
              : colors.background,
          borderRadius: radius.pill,
          justifyContent: "center",
        },
        minTouchTargetStyle(),
      ]}
      {...(testID ? { testID } : {})}
    >
      {glyph}
    </Pressable>
  );
}
