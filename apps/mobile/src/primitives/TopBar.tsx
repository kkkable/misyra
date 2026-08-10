import type { ReactNode } from "react";
import { Text, View } from "react-native";
import { space } from "@misyra/design-tokens";
import {
  MIN_TOUCH_TARGET,
  primitiveA11yRole,
  semanticTypographyStyle,
  textToken,
  wrappableTextStyle,
  type ThemeMode,
} from "./core";
import { IconButton } from "./IconButton";

export interface TopBarProps {
  readonly mode: ThemeMode;
  readonly title: string;
  readonly onBack?: () => void;
  readonly right?: ReactNode;
}

/**
 * TopBar — the app header bar per §6.9. Contains only the back control
 * (an IconButton, always labeled by its caller), a wrappable headline
 * title, and caller-supplied trailing controls. No strings, no raw colors.
 */
export function TopBar({ mode, title, onBack, right }: TopBarProps) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: space[2],
        minHeight: MIN_TOUCH_TARGET + space[2],
        paddingTop: space[1],
        paddingBottom: space[2],
      }}
    >
      {onBack ? (
        <IconButton
          mode={mode}
          label={`Back: ${title}`}
          glyph={
            <Text
              style={{
                color: textToken(mode, "textPrimary"),
                ...semanticTypographyStyle("title3"),
              }}
            >
              ‹
            </Text>
          }
          onPress={onBack}
        />
      ) : null}
      <Text
        numberOfLines={2}
        accessibilityRole={primitiveA11yRole("header")}
        style={[
          {
            flex: 1,
            color: textToken(mode, "textPrimary"),
            ...semanticTypographyStyle("headline"),
          },
          wrappableTextStyle(),
        ]}
      >
        {title}
      </Text>
      {right ?? null}
    </View>
  );
}
