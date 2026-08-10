import type { DimensionValue } from "react-native";
import { View } from "react-native";
import { radius, space } from "@misyra/design-tokens";
import { surfaceToken, type ThemeMode } from "./core";

export interface SkeletonProps {
  readonly mode: ThemeMode;
  readonly lines?: number;
  readonly widthPct?: number;
  /** Screen-reader name for the loading region — caller-supplied. */
  readonly accessibilityLabel?: string;
  readonly testID?: string;
}

/**
 * Skeleton — indeterminate loading placeholder (§6.8): quiet surfaceMuted
 * bars that communicate progress to screen readers via the progressbar
 * role + busy state.
 */
export function Skeleton({
  mode,
  lines = 3,
  widthPct = 100,
  accessibilityLabel,
  testID,
}: SkeletonProps) {
  return (
    <View
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="progressbar"
      accessibilityState={{ busy: true }}
      style={{ gap: space[2] }}
      {...(testID ? { testID } : {})}
    >
      {Array.from({ length: lines }, (_, index) => {
        const isLast = index === lines - 1;
        const width: DimensionValue = isLast ? "60%" : `${widthPct}%`;
        return (
          <View
            key={isLast ? "last" : `bar-${index}`}
            style={{
              backgroundColor: surfaceToken(mode, "surfaceMuted"),
              borderRadius: radius.xs,
              height: 12,
              width,
            }}
          />
        );
      })}
    </View>
  );
}
