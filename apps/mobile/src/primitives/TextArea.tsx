import { Text, TextInput, View } from "react-native";
import { radius, space } from "@misyra/design-tokens";
import { fieldColors, textToken, type FieldState, type ThemeMode } from "./core";

export interface TextAreaProps {
  readonly mode: ThemeMode;
  readonly label: string;
  readonly value?: string;
  readonly placeholder?: string;
  readonly state?: FieldState;
  readonly onChangeText?: (value: string) => void;
  readonly testID?: string;
}

/**
 * TextArea — filled multi-line input (§6.7). Same state-driven color
 * contract as TextField; the label is caller-supplied.
 */
export function TextArea({
  mode,
  label,
  value,
  placeholder,
  state = "normal",
  onChangeText,
  testID,
}: TextAreaProps) {
  const colors = fieldColors(mode, "filled", state);
  return (
    <View style={{ gap: space[1] }}>
      <Text style={{ color: textToken(mode, "textPrimary"), fontSize: 14, fontWeight: "500" }}>
        {label}
      </Text>
      <TextInput
        accessibilityLabel={label}
        editable={state !== "disabled"}
        multiline
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.placeholder}
        selectionColor={colors.border}
        style={{
          backgroundColor: colors.background,
          borderColor: colors.border,
          borderRadius: radius.sm,
          borderWidth: 1,
          color: colors.foreground,
          minHeight: 120,
          paddingHorizontal: space[3],
          paddingVertical: space[3],
          textAlignVertical: "top",
        }}
        value={value}
        {...(testID ? { testID } : {})}
      />
    </View>
  );
}
