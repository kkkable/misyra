import { ActivityIndicator, Pressable, Text } from "react-native";
import { radius, space } from "@misyra/design-tokens";
import { rnAccessibilityState } from "./accessibility";
import {
  buttonColors,
  buttonInteractionState,
  interactionAccessibility,
  minTouchTargetStyle,
  primitiveA11yRole,
  wrappableTextStyle,
  type ButtonState,
  type ButtonVariant,
  type ThemeMode,
} from "./core";

export interface ButtonProps {
  readonly mode: ThemeMode;
  readonly label: string;
  readonly variant?: ButtonVariant;
  readonly state?: ButtonState;
  readonly onPress?: () => void;
  readonly testID?: string;
}

/**
 * Button — the primary/secondary/destructive action control (§6.7).
 * Colors come from buttonColors(); the label is caller-supplied and always
 * wrappable; the touch target is always ≥ 44pt.
 */
export function Button({
  mode,
  label,
  variant = "primary",
  state = "normal",
  onPress,
  testID,
}: ButtonProps) {
  const colors = buttonColors(mode, variant, state);
  const disabled = state === "disabled" || state === "loading";
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityState={rnAccessibilityState(
        interactionAccessibility(buttonInteractionState(state)),
      )}
      disabled={disabled}
      onPress={onPress}
      accessibilityRole={primitiveA11yRole("button")}
      style={({ pressed }) => [
        {
          alignItems: "center",
          backgroundColor: colors.background,
          borderRadius: radius.sm,
          flexDirection: "row",
          gap: space[2],
          justifyContent: "center",
          paddingHorizontal: space[4],
          opacity: pressed && state === "normal" ? 0.92 : 1,
        },
        minTouchTargetStyle(),
      ]}
      {...(testID ? { testID } : {})}
    >
      {state === "loading" ? <ActivityIndicator size="small" color={colors.foreground} /> : null}
      <Text
        style={[
          { color: colors.foreground, fontWeight: "600", textAlign: "center" },
          wrappableTextStyle(),
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}
