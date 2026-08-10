import { Text } from "react-native";
import { typography } from "@misyra/design-tokens";
import { primitiveA11yRole, textToken, type ThemeMode } from "./core";

export interface SectionHeadingProps {
  readonly mode: ThemeMode;
  readonly title: string;
}

/**
 * SectionHeading — section-level title inside scrollable content (§6.9).
 * Callers supply the localized string; the primitive only styles it.
 */
export function SectionHeading({ mode, title }: SectionHeadingProps) {
  return (
    <Text
      accessibilityRole={primitiveA11yRole("header")}
      style={{
        color: textToken(mode, "textPrimary"),
        fontSize: typography.title3.size,
        fontWeight: "700",
      }}
    >
      {title}
    </Text>
  );
}
