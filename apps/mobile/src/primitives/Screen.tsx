import type { ReactNode } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { SCREEN_HORIZONTAL_PADDING, surfaceToken, type ThemeMode } from "./core";

export interface ScreenProps {
  readonly mode: ThemeMode;
  readonly children: ReactNode;
  readonly horizontalPadding?: number;
  readonly testID?: string;
}

/**
 * Screen — the outermost primitive: fills the safe area with the approved
 * surface color, keeps approved horizontal padding and lets children flow
 * vertically. Contains no strings and no raw colors.
 */
export function Screen({
  mode,
  children,
  horizontalPadding = SCREEN_HORIZONTAL_PADDING,
  testID,
}: ScreenProps) {
  return (
    <SafeAreaView
      edges={["top", "left", "right", "bottom"]}
      style={{
        flex: 1,
        backgroundColor: surfaceToken(mode, "surface"),
        paddingHorizontal: horizontalPadding,
      }}
      {...(testID ? { testID } : {})}
    >
      {children}
    </SafeAreaView>
  );
}
