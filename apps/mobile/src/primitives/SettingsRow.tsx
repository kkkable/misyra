import { Text, View } from "react-native";
import { space } from "@misyra/design-tokens";
import { textToken, type ThemeMode } from "./core";
import { Row } from "./Row";

export interface SettingsRowProps {
  readonly mode: ThemeMode;
  readonly label: string;
  readonly value?: string;
  readonly onPress?: () => void;
}

/**
 * SettingsRow — label/value pair with a chevron, built on Row (§6.9).
 * Value text is caller-supplied.
 */
export function SettingsRow({ mode, label, value, onPress }: SettingsRowProps) {
  return (
    <Row
      mode={mode}
      title={label}
      {...(onPress ? { onPress } : {})}
      right={
        <View style={{ alignItems: "center", flexDirection: "row", gap: space[2] }}>
          {value ? (
            <Text style={{ color: textToken(mode, "textSecondary"), fontSize: 14 }}>{value}</Text>
          ) : null}
          <Text style={{ color: textToken(mode, "textTertiary"), fontSize: 20, fontWeight: "600" }}>
            ›
          </Text>
        </View>
      }
    />
  );
}
