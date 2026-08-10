import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { radius, space } from "@misyra/design-tokens";
import {
  MIN_TOUCH_TARGET,
  semanticTypographyStyle,
  surfaceToken,
  textToken,
  wrappableTextStyle,
  type ThemeMode,
} from "./core";

export interface RowProps {
  readonly mode: ThemeMode;
  readonly title: string;
  readonly detail?: string;
  readonly right?: ReactNode;
  readonly onPress?: () => void;
  readonly testID?: string;
}

/**
 * Row — a tappable (or static) list row: title, optional detail line and an
 * optional trailing control (§6.9). Colors come from tokens; interaction is
 * opt-in via onPress.
 */
export function Row({ mode, title, detail, right, onPress, testID }: RowProps) {
  const content = (
    <>
      <View style={{ flex: 1, gap: space[1] }}>
        <Text
          style={[
            { color: textToken(mode, "textPrimary"), ...semanticTypographyStyle("body", 500) },
            wrappableTextStyle(),
          ]}
        >
          {title}
        </Text>
        {detail ? (
          <Text
            style={[
              {
                color: textToken(mode, "textSecondary"),
                ...semanticTypographyStyle("bodySmall", 400),
              },
              wrappableTextStyle(),
            ]}
          >
            {detail}
          </Text>
        ) : null}
      </View>
      {right ?? null}
    </>
  );

  const layout = {
    alignItems: "center",
    flexDirection: "row",
    gap: space[3],
    minHeight: MIN_TOUCH_TARGET,
    paddingVertical: space[2],
  } as const;

  if (onPress) {
    return (
      <Pressable
        accessibilityLabel={title}
        accessibilityRole="button"
        onPress={onPress}
        style={({ pressed }) => [
          layout,
          {
            backgroundColor: pressed
              ? surfaceToken(mode, "surfaceMuted")
              : surfaceToken(mode, "surface"),
            borderRadius: radius.sm,
          },
        ]}
        {...(testID ? { testID } : {})}
      >
        {content}
      </Pressable>
    );
  }
  return (
    <View style={layout} {...(testID ? { testID } : {})}>
      {content}
    </View>
  );
}
