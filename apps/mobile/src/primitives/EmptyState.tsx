import type { ReactNode } from "react";
import { Text, View } from "react-native";
import { space } from "@misyra/design-tokens";
import { textToken, wrappableTextStyle, type ThemeMode } from "./core";

export interface EmptyStateProps {
  readonly mode: ThemeMode;
  readonly title: string;
  readonly message?: string;
  readonly glyph?: ReactNode;
  readonly action?: ReactNode;
}

/**
 * EmptyState — centered placeholder for empty content (§6.9): optional
 * glyph, title (summary role), message and an optional action control. All
 * strings are caller-supplied.
 */
export function EmptyState({ mode, title, message, glyph, action }: EmptyStateProps) {
  return (
    <View
      accessibilityRole="summary"
      style={{
        alignItems: "center",
        gap: space[2],
        paddingHorizontal: space[6],
        paddingVertical: space[10],
      }}
    >
      {glyph ?? null}
      <Text
        style={[
          {
            color: textToken(mode, "textPrimary"),
            fontSize: 18,
            fontWeight: "600",
            textAlign: "center",
          },
          wrappableTextStyle(),
        ]}
      >
        {title}
      </Text>
      {message ? (
        <Text
          style={[
            { color: textToken(mode, "textSecondary"), fontSize: 14, textAlign: "center" },
            wrappableTextStyle(),
          ]}
        >
          {message}
        </Text>
      ) : null}
      {action ?? null}
    </View>
  );
}
