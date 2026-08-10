import { Platform, Text, View } from "react-native";
import type { ViewStyle } from "react-native";
import { elevation, radius, space, themes } from "@misyra/design-tokens";
import { surfaceToken, textToken, wrappableTextStyle, type ThemeMode } from "./core";

export interface ToastProps {
  readonly mode: ThemeMode;
  readonly message: string;
  readonly title?: string;
  readonly visible: boolean;
}

/**
 * Toast — transient floating notice (§6.8): positioned above the bottom
 * edge, announced politely to screen readers. All strings are
 * caller-supplied.
 */
export function Toast({ mode, message, title, visible }: ToastProps) {
  if (!visible) {
    return null;
  }
  return (
    <View
      accessibilityLiveRegion="polite"
      accessibilityRole="alert"
      style={[
        {
          backgroundColor: surfaceToken(mode, "surfaceRaised"),
          borderColor: themes[mode].border,
          borderRadius: radius.md,
          borderWidth: 1,
          bottom: space[8],
          left: space[4],
          padding: space[4],
          position: "absolute",
          right: space[4],
        },
        Platform.select<ViewStyle>({
          ios: elevation.floating.ios,
          android: elevation.floating.android,
        }),
      ]}
    >
      {title ? (
        <Text style={{ color: textToken(mode, "textPrimary"), fontSize: 16, fontWeight: "600" }}>
          {title}
        </Text>
      ) : null}
      <Text
        style={[{ color: textToken(mode, "textSecondary"), fontSize: 14 }, wrappableTextStyle()]}
      >
        {message}
      </Text>
    </View>
  );
}
