import { Modal, Text, View } from "react-native";
import { radius, space, themes } from "@misyra/design-tokens";
import { surfaceToken, textToken, type ThemeMode } from "./core";
import { Button } from "./Button";

export interface DialogProps {
  readonly mode: ThemeMode;
  readonly visible: boolean;
  readonly title: string;
  readonly message: string;
  readonly confirmLabel: string;
  readonly cancelLabel?: string;
  readonly destructive?: boolean;
  readonly onConfirm: () => void;
  readonly onCancel?: () => void;
}

/**
 * Dialog — decision modal (§6.8): overlay dim, raised card, message and a
 * confirm (primary, or destructive when the action is irreversible) plus an
 * optional cancel. All strings are caller-supplied.
 */
export function Dialog({
  mode,
  visible,
  title,
  message,
  confirmLabel,
  cancelLabel,
  destructive = false,
  onConfirm,
  onCancel,
}: DialogProps) {
  return (
    <Modal animationType="fade" onRequestClose={onCancel} transparent visible={visible}>
      <View
        style={{
          alignItems: "center",
          backgroundColor: themes[mode].overlay,
          flex: 1,
          justifyContent: "center",
          padding: space[4],
        }}
      >
        <View
          accessibilityViewIsModal
          style={{
            backgroundColor: surfaceToken(mode, "surfaceRaised"),
            borderRadius: radius.xl,
            maxWidth: 420,
            padding: space[5],
            width: "100%",
          }}
        >
          <Text
            accessibilityRole="header"
            style={{ color: textToken(mode, "textPrimary"), fontSize: 18, fontWeight: "600" }}
          >
            {title}
          </Text>
          <Text
            style={{
              color: textToken(mode, "textSecondary"),
              fontSize: 16,
              lineHeight: 22,
              marginTop: space[2],
            }}
          >
            {message}
          </Text>
          <View
            style={{
              alignSelf: "flex-end",
              flexDirection: "row",
              gap: space[2],
              marginTop: space[5],
            }}
          >
            {cancelLabel && onCancel ? (
              <Button mode={mode} label={cancelLabel} variant="secondary" onPress={onCancel} />
            ) : null}
            <Button
              mode={mode}
              label={confirmLabel}
              variant={destructive ? "destructive" : "primary"}
              onPress={onConfirm}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}
