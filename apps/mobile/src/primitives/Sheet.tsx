import type { ReactNode } from "react";
import { Modal, Platform, Text, View } from "react-native";
import type { ViewStyle } from "react-native";
import { elevation, radius, space, themes } from "@misyra/design-tokens";
import { surfaceToken, textToken, type ThemeMode } from "./core";

export interface SheetProps {
  readonly mode: ThemeMode;
  readonly visible: boolean;
  readonly title: string;
  readonly onDismiss?: () => void;
  readonly children: ReactNode;
}

/**
 * Sheet — bottom sheet modal (§6.8): approved overlay dim, raised sheet
 * surface with the sheet elevation, rounded top corners. Title text is
 * caller-supplied.
 */
export function Sheet({ mode, visible, title, onDismiss, children }: SheetProps) {
  return (
    <Modal animationType="slide" onRequestClose={onDismiss} transparent visible={visible}>
      <View style={{ backgroundColor: themes[mode].overlay, flex: 1, justifyContent: "flex-end" }}>
        <View
          style={[
            {
              backgroundColor: surfaceToken(mode, "surfaceRaised"),
              borderTopLeftRadius: radius.xl,
              borderTopRightRadius: radius.xl,
              padding: space[5],
              paddingBottom: space[10],
            },
            Platform.select<ViewStyle>({
              ios: elevation.sheet.ios,
              android: elevation.sheet.android,
            }),
          ]}
        >
          <Text
            accessibilityRole="header"
            style={{
              color: textToken(mode, "textPrimary"),
              fontSize: 18,
              fontWeight: "600",
              marginBottom: space[3],
            }}
          >
            {title}
          </Text>
          {children}
        </View>
      </View>
    </Modal>
  );
}
