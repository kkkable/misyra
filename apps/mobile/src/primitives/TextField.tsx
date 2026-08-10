import { Text, TextInput, View } from "react-native";
import { radius, space } from "@misyra/design-tokens";
import {
  fieldColors,
  semanticTypographyStyle,
  textToken,
  type FieldState,
  type ThemeMode,
} from "./core";

export interface TextFieldProps {
  readonly mode: ThemeMode;
  readonly label: string;
  readonly value?: string;
  readonly placeholder?: string;
  readonly state?: FieldState;
  readonly onChangeText?: (value: string) => void;
  readonly testID?: string;
}

/**
 * TextField — filled single-line input (§6.7). Border/fill/placeholder
 * colors resolve from fieldColors(); focus and error visuals are driven by
 * the `state` prop. The label is caller-supplied.
 */
export function TextField({
  mode,
  label,
  value,
  placeholder,
  state = "normal",
  onChangeText,
  testID,
}: TextFieldProps) {
  const colors = fieldColors(mode, "filled", state);
  return (
    <View style={{ gap: space[1] }}>
      <Text
        style={{
          color: textToken(mode, "textPrimary"),
          ...semanticTypographyStyle("bodySmall", 500),
        }}
      >
        {label}
      </Text>
      <TextInput
        accessibilityLabel={label}
        editable={state !== "disabled"}
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
          paddingHorizontal: space[3],
          paddingVertical: space[3],
          ...semanticTypographyStyle("body", 400),
        }}
        value={value}
        {...(testID ? { testID } : {})}
      />
    </View>
  );
}
