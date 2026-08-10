import type { ReactNode } from "react";
import { Platform, Pressable, View } from "react-native";
import type { StyleProp, ViewStyle } from "react-native";
import { elevation, radius, space } from "@misyra/design-tokens";
import { minTouchTargetStyle, surfaceToken, type ThemeMode } from "./core";

export interface CardProps {
  readonly mode: ThemeMode;
  readonly children: ReactNode;
  readonly onPress?: () => void;
  readonly testID?: string;
}

/**
 * Card — the raised content container (§6.8). Surface is the approved
 * surfaceRaised token with a restrained card shadow; `onPress` makes the
 * whole card a touch target.
 */
export function Card({ mode, children, onPress, testID }: CardProps) {
  const style: StyleProp<ViewStyle> = [
    {
      backgroundColor: surfaceToken(mode, "surfaceRaised"),
      borderRadius: radius.lg,
      padding: space[4],
    },
    Platform.select<ViewStyle>({ ios: elevation.card.ios, android: elevation.card.android }),
  ];

  if (onPress) {
    return (
      <Pressable
        accessibilityRole="button"
        onPress={onPress}
        style={({ pressed }) => [style, minTouchTargetStyle(), pressed ? { opacity: 0.92 } : null]}
        {...(testID ? { testID } : {})}
      >
        {children}
      </Pressable>
    );
  }
  return (
    <View style={style} {...(testID ? { testID } : {})}>
      {children}
    </View>
  );
}
