import { useState, type ReactNode } from 'react';
import {
  Modal,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Switch,
  Text,
  TextInput as NativeTextInput,
  View,
  type TextInputProps,
  type ViewProps,
} from 'react-native';

import { layout, radius, space, typography } from '@misyra/design-tokens';

import {
  buttonContract,
  fieldContract,
  overlayContract,
  rowContract,
  surfaceContract,
  themeColors,
  type ButtonVariant,
  type ColorScheme,
} from './contracts.js';

interface ThemedProps {
  readonly colorScheme: ColorScheme;
}

interface ContainerProps extends ThemedProps, Pick<ViewProps, 'testID'> {
  readonly children: ReactNode;
  readonly accessibilityLabel?: string;
}

export function Screen({ children, colorScheme, accessibilityLabel, testID }: ContainerProps) {
  const colors = themeColors(colorScheme);
  return (
    <View
      accessibilityLabel={accessibilityLabel}
      style={[
        styles.screen,
        {
          backgroundColor: colors.canvas,
          paddingHorizontal: layout.screenHorizontalPadding,
        },
      ]}
      testID={testID}
    >
      {children}
    </View>
  );
}

export function SafeAreaScreen({
  children,
  colorScheme,
  accessibilityLabel,
  testID,
}: ContainerProps) {
  const colors = themeColors(colorScheme);
  return (
    <SafeAreaView
      accessibilityLabel={accessibilityLabel}
      style={[
        styles.screen,
        {
          backgroundColor: colors.canvas,
          paddingHorizontal: layout.screenHorizontalPadding,
        },
      ]}
      testID={testID}
    >
      {children}
    </SafeAreaView>
  );
}

export interface TopBarProps extends ThemedProps {
  readonly title: string;
  readonly accessibilityLabel?: string;
  readonly leading?: ReactNode;
  readonly trailing?: ReactNode;
  readonly testID?: string;
}

export function TopBar({
  title,
  colorScheme,
  accessibilityLabel,
  leading,
  trailing,
  testID,
}: TopBarProps) {
  const colors = themeColors(colorScheme);
  return (
    <View
      accessibilityLabel={accessibilityLabel}
      style={[styles.topBar, { backgroundColor: colors.canvas }]}
      testID={testID}
    >
      <View style={styles.topBarSide}>{leading}</View>
      <Text
        accessibilityRole="header"
        allowFontScaling
        style={[
          styles.topBarTitle,
          {
            color: colors.textPrimary,
            fontSize: typography.title3.fontSize,
            fontWeight: typography.title3.fontWeight,
          },
        ]}
      >
        {title}
      </Text>
      <View style={styles.topBarSide}>{trailing}</View>
    </View>
  );
}

interface ActionButtonProps extends ThemedProps {
  readonly label: string;
  readonly accessibilityLabel: string;
  readonly onPress: () => void;
  readonly disabled?: boolean;
  readonly loading?: boolean;
  readonly testID?: string;
}

interface ButtonBaseProps extends ActionButtonProps {
  readonly variant: ButtonVariant;
}

function ButtonBase({
  label,
  accessibilityLabel,
  onPress,
  colorScheme,
  variant,
  disabled = false,
  loading = false,
  testID,
}: ButtonBaseProps) {
  const unavailable = disabled || loading;
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ busy: loading, disabled: unavailable }}
      disabled={unavailable}
      onPress={onPress}
      style={({ pressed }) => {
        const contract = buttonContract(variant, colorScheme, {
          pressed,
          disabled,
          loading,
        });
        return [
          styles.button,
          {
            backgroundColor: contract.backgroundColor,
            borderColor: contract.borderColor,
            minHeight: contract.minimumTouchTarget,
            minWidth: contract.minimumTouchTarget,
          },
        ];
      }}
      testID={testID}
    >
      {({ pressed }) => {
        const contract = buttonContract(variant, colorScheme, {
          pressed,
          disabled,
          loading,
        });
        return (
          <Text
            allowFontScaling
            style={[
              styles.buttonLabel,
              {
                color: contract.foregroundColor,
                fontSize: typography.body.fontSize,
                fontWeight: typography.body.mediumFontWeight,
              },
            ]}
          >
            {label}
          </Text>
        );
      }}
    </Pressable>
  );
}

export function PrimaryButton(props: ActionButtonProps) {
  return <ButtonBase {...props} variant="primary" />;
}

export function SecondaryButton(props: ActionButtonProps) {
  return <ButtonBase {...props} variant="secondary" />;
}

export function DestructiveButton(props: ActionButtonProps) {
  return <ButtonBase {...props} variant="destructive" />;
}

export interface IconButtonProps extends ThemedProps {
  readonly accessibilityLabel: string;
  readonly onPress: () => void;
  readonly icon: ReactNode;
  readonly disabled?: boolean;
  readonly testID?: string;
}

export function IconButton({
  accessibilityLabel,
  onPress,
  icon,
  colorScheme,
  disabled = false,
  testID,
}: IconButtonProps) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => {
        const contract = buttonContract('icon', colorScheme, { pressed, disabled });
        return [
          styles.iconButton,
          {
            backgroundColor: contract.backgroundColor,
            borderColor: contract.borderColor,
            minHeight: contract.minimumTouchTarget,
            minWidth: contract.minimumTouchTarget,
          },
        ];
      }}
      testID={testID}
    >
      {icon}
    </Pressable>
  );
}

type NativeFieldProps = Omit<
  TextInputProps,
  | 'accessibilityLabel'
  | 'editable'
  | 'multiline'
  | 'placeholderTextColor'
  | 'style'
  | 'testID'
>;

interface FieldBaseProps extends NativeFieldProps, ThemedProps {
  readonly label: string;
  readonly accessibilityLabel: string;
  readonly errorMessage?: string;
  readonly disabled?: boolean;
  readonly multiline: boolean;
  readonly testID?: string;
}

function FieldBase({
  label,
  accessibilityLabel,
  errorMessage,
  disabled = false,
  multiline,
  colorScheme,
  testID,
  onFocus,
  onBlur,
  ...inputProps
}: FieldBaseProps) {
  const [focused, setFocused] = useState(false);
  const contract = fieldContract(colorScheme, {
    focused,
    error: errorMessage !== undefined,
    disabled,
    multiline,
  });

  return (
    <View style={styles.fieldGroup}>
      <Text
        allowFontScaling
        style={[
          styles.fieldLabel,
          {
            color: contract.foregroundColor,
            fontSize: typography.bodySmall.fontSize,
            fontWeight: typography.bodySmall.mediumFontWeight,
          },
        ]}
      >
        {label}
      </Text>
      <NativeTextInput
        {...inputProps}
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="text"
        accessibilityState={{ disabled }}
        allowFontScaling
        editable={!disabled}
        multiline={multiline}
        onBlur={(event) => {
          setFocused(false);
          onBlur?.(event);
        }}
        onFocus={(event) => {
          setFocused(true);
          onFocus?.(event);
        }}
        placeholderTextColor={contract.placeholderColor}
        style={[
          styles.field,
          multiline ? styles.textArea : undefined,
          {
            backgroundColor: contract.backgroundColor,
            borderColor: contract.borderColor,
            color: contract.foregroundColor,
            fontSize: typography.body.fontSize,
            minHeight: multiline
              ? contract.minimumTouchTarget * contract.minimumRows
              : contract.minimumTouchTarget,
          },
        ]}
        testID={testID}
      />
      {errorMessage === undefined ? null : (
        <Text
          accessibilityLiveRegion="polite"
          accessibilityRole="alert"
          allowFontScaling
          style={[
            styles.fieldError,
            {
              color: themeColors(colorScheme).destructive,
              fontSize: typography.caption1.fontSize,
              fontWeight: typography.caption1.fontWeight,
            },
          ]}
        >
          {errorMessage}
        </Text>
      )}
    </View>
  );
}

export type TextFieldProps = Omit<FieldBaseProps, 'multiline'>;

export function TextField(props: TextFieldProps) {
  return <FieldBase {...props} multiline={false} />;
}

export type TextAreaProps = Omit<FieldBaseProps, 'multiline'>;

export function TextArea(props: TextAreaProps) {
  return <FieldBase {...props} multiline />;
}

interface RowTextProps extends ThemedProps {
  readonly label: string;
  readonly detail?: string;
  readonly disabled?: boolean;
}

function RowText({ label, detail, colorScheme, disabled = false }: RowTextProps) {
  const contract = rowContract(colorScheme, { disabled });
  return (
    <View style={styles.rowText}>
      <Text
        allowFontScaling
        style={{
          color: contract.foregroundColor,
          fontSize: typography.body.fontSize,
          fontWeight: typography.body.fontWeight,
        }}
      >
        {label}
      </Text>
      {detail === undefined ? null : (
        <Text
          allowFontScaling
          style={{
            color: contract.secondaryColor,
            fontSize: typography.bodySmall.fontSize,
            fontWeight: typography.bodySmall.fontWeight,
          }}
        >
          {detail}
        </Text>
      )}
    </View>
  );
}

export interface ToggleRowProps extends ThemedProps {
  readonly label: string;
  readonly detail?: string;
  readonly accessibilityLabel: string;
  readonly value: boolean;
  readonly onValueChange: (value: boolean) => void;
  readonly disabled?: boolean;
  readonly testID?: string;
}

export function ToggleRow({
  label,
  detail,
  accessibilityLabel,
  value,
  onValueChange,
  colorScheme,
  disabled = false,
  testID,
}: ToggleRowProps) {
  const colors = themeColors(colorScheme);
  const contract = rowContract(colorScheme, { selected: value, disabled });
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      disabled={disabled}
      onPress={() => onValueChange(!value)}
      style={[
        styles.row,
        {
          backgroundColor: contract.backgroundColor,
          minHeight: contract.minimumTouchTarget,
        },
      ]}
      testID={testID}
    >
      <RowText colorScheme={colorScheme} detail={detail} disabled={disabled} label={label} />
      <Switch
        accessibilityElementsHidden
        accessible={false}
        disabled={disabled}
        importantForAccessibility="no-hide-descendants"
        pointerEvents="none"
        thumbColor={value ? colors.primary : colors.textTertiary}
        trackColor={{ false: colors.border, true: colors.primarySoft }}
        value={value}
      />
    </Pressable>
  );
}

export interface SettingsRowProps extends ThemedProps {
  readonly label: string;
  readonly detail?: string;
  readonly value?: string;
  readonly accessibilityLabel: string;
  readonly onPress: () => void;
  readonly selected?: boolean;
  readonly disabled?: boolean;
  readonly testID?: string;
}

export function SettingsRow({
  label,
  detail,
  value,
  accessibilityLabel,
  onPress,
  selected = false,
  colorScheme,
  disabled = false,
  testID,
}: SettingsRowProps) {
  const contract = rowContract(colorScheme, { selected, disabled });
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ disabled, selected }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: pressed && !disabled
            ? themeColors(colorScheme).primarySoft
            : contract.backgroundColor,
          minHeight: contract.minimumTouchTarget,
        },
      ]}
      testID={testID}
    >
      <RowText colorScheme={colorScheme} detail={detail} disabled={disabled} label={label} />
      {value === undefined ? null : (
        <Text
          allowFontScaling
          style={[
            styles.rowValue,
            {
              color: contract.secondaryColor,
              fontSize: typography.bodySmall.fontSize,
              fontWeight: typography.bodySmall.fontWeight,
            },
          ]}
        >
          {value}
        </Text>
      )}
    </Pressable>
  );
}

export interface SectionHeaderProps extends ThemedProps {
  readonly title: string;
  readonly testID?: string;
}

export function SectionHeader({ title, colorScheme, testID }: SectionHeaderProps) {
  const colors = themeColors(colorScheme);
  return (
    <Text
      accessibilityRole="header"
      allowFontScaling
      style={[
        styles.sectionHeader,
        {
          color: colors.textPrimary,
          fontSize: typography.headline.fontSize,
          fontWeight: typography.headline.fontWeight,
        },
      ]}
      testID={testID}
    >
      {title}
    </Text>
  );
}

export interface CardProps extends ContainerProps {
  readonly selected?: boolean;
}

export function Card({
  children,
  colorScheme,
  selected = false,
  accessibilityLabel,
  testID,
}: CardProps) {
  const contract = surfaceContract('card', colorScheme, { selected });
  return (
    <View
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected }}
      style={[
        styles.card,
        {
          backgroundColor: contract.backgroundColor,
          borderColor: contract.borderColor,
          borderRadius: contract.radius,
        },
      ]}
      testID={testID}
    >
      {children}
    </View>
  );
}

export interface BottomSheetProps extends ThemedProps {
  readonly visible: boolean;
  readonly accessibilityLabel: string;
  readonly dismissAccessibilityLabel: string;
  readonly onDismiss: () => void;
  readonly children: ReactNode;
  readonly testID?: string;
}

export function BottomSheet({
  visible,
  accessibilityLabel,
  dismissAccessibilityLabel,
  onDismiss,
  colorScheme,
  children,
  testID,
}: BottomSheetProps) {
  const overlay = overlayContract(colorScheme);
  const surface = surfaceContract('sheet', colorScheme);
  return (
    <Modal animationType="none" onRequestClose={onDismiss} transparent visible={visible}>
      <View style={styles.modalRoot}>
        <Pressable
          accessibilityLabel={dismissAccessibilityLabel}
          accessibilityRole="button"
          onPress={onDismiss}
          style={[styles.modalBackdrop, { backgroundColor: overlay.backdropColor }]}
        />
        <View
          accessibilityLabel={accessibilityLabel}
          accessibilityViewIsModal
          style={[
            styles.sheet,
            {
              backgroundColor: surface.backgroundColor,
              borderColor: surface.borderColor,
              borderTopLeftRadius: surface.radius,
              borderTopRightRadius: surface.radius,
            },
          ]}
          testID={testID}
        >
          {children}
        </View>
      </View>
    </Modal>
  );
}

export interface ConfirmationDialogProps extends ThemedProps {
  readonly visible: boolean;
  readonly accessibilityLabel: string;
  readonly onDismiss: () => void;
  readonly title: string;
  readonly message: string;
  readonly actions: ReactNode;
  readonly testID?: string;
}

export function ConfirmationDialog({
  visible,
  accessibilityLabel,
  onDismiss,
  title,
  message,
  actions,
  colorScheme,
  testID,
}: ConfirmationDialogProps) {
  const colors = themeColors(colorScheme);
  const overlay = overlayContract(colorScheme);
  const surface = surfaceContract('dialog', colorScheme);
  return (
    <Modal animationType="none" onRequestClose={onDismiss} transparent visible={visible}>
      <View style={[styles.dialogBackdrop, { backgroundColor: overlay.backdropColor }]}>
        <View
          accessibilityLabel={accessibilityLabel}
          accessibilityRole="alert"
          accessibilityViewIsModal
          style={[
            styles.dialog,
            {
              backgroundColor: surface.backgroundColor,
              borderColor: surface.borderColor,
              borderRadius: surface.radius,
            },
          ]}
          testID={testID}
        >
          <Text
            accessibilityRole="header"
            allowFontScaling
            style={{
              color: colors.textPrimary,
              fontSize: typography.headline.fontSize,
              fontWeight: typography.headline.fontWeight,
            }}
          >
            {title}
          </Text>
          <Text
            allowFontScaling
            style={{
              color: colors.textSecondary,
              fontSize: typography.body.fontSize,
              fontWeight: typography.body.fontWeight,
            }}
          >
            {message}
          </Text>
          <View style={styles.dialogActions}>{actions}</View>
        </View>
      </View>
    </Modal>
  );
}

export interface ToastProps extends ThemedProps {
  readonly visible: boolean;
  readonly message: string;
  readonly accessibilityLabel?: string;
  readonly testID?: string;
}

export function Toast({
  visible,
  message,
  accessibilityLabel,
  colorScheme,
  testID,
}: ToastProps) {
  if (!visible) {
    return null;
  }
  const colors = themeColors(colorScheme);
  const surface = surfaceContract('toast', colorScheme);
  return (
    <View
      accessibilityLabel={accessibilityLabel ?? message}
      accessibilityLiveRegion="polite"
      accessibilityRole="alert"
      style={[
        styles.toast,
        {
          backgroundColor: surface.backgroundColor,
          borderColor: surface.borderColor,
          borderRadius: surface.radius,
        },
      ]}
      testID={testID}
    >
      <Text
        allowFontScaling
        style={{
          color: colors.textPrimary,
          fontSize: typography.bodySmall.fontSize,
          fontWeight: typography.bodySmall.mediumFontWeight,
        }}
      >
        {message}
      </Text>
    </View>
  );
}

export interface InlineMessageProps extends ThemedProps {
  readonly message: string;
  readonly accessibilityLabel?: string;
  readonly tone?: 'neutral' | 'error';
  readonly testID?: string;
}

export function InlineMessage({
  message,
  accessibilityLabel,
  tone = 'neutral',
  colorScheme,
  testID,
}: InlineMessageProps) {
  const colors = themeColors(colorScheme);
  const isError = tone === 'error';
  return (
    <View
      accessibilityLabel={accessibilityLabel ?? message}
      accessibilityLiveRegion="polite"
      accessibilityRole="alert"
      style={[
        styles.inlineMessage,
        {
          backgroundColor: isError ? colors.destructiveSoft : colors.surfaceMuted,
          borderColor: isError ? colors.destructive : colors.border,
        },
      ]}
      testID={testID}
    >
      <Text
        allowFontScaling
        style={{
          color: isError ? colors.destructive : colors.textSecondary,
          fontSize: typography.bodySmall.fontSize,
          fontWeight: typography.bodySmall.fontWeight,
        }}
      >
        {message}
      </Text>
    </View>
  );
}

export interface EmptyStateProps extends ThemedProps {
  readonly title: string;
  readonly message?: string;
  readonly action?: ReactNode;
  readonly accessibilityLabel?: string;
  readonly testID?: string;
}

export function EmptyState({
  title,
  message,
  action,
  accessibilityLabel,
  colorScheme,
  testID,
}: EmptyStateProps) {
  const colors = themeColors(colorScheme);
  return (
    <View accessibilityLabel={accessibilityLabel} style={styles.emptyState} testID={testID}>
      <Text
        accessibilityRole="header"
        allowFontScaling
        style={{
          color: colors.textPrimary,
          fontSize: typography.headline.fontSize,
          fontWeight: typography.headline.fontWeight,
        }}
      >
        {title}
      </Text>
      {message === undefined ? null : (
        <Text
          allowFontScaling
          style={{
            color: colors.textSecondary,
            fontSize: typography.body.fontSize,
            fontWeight: typography.body.fontWeight,
          }}
        >
          {message}
        </Text>
      )}
      {action}
    </View>
  );
}

export interface LoadingSkeletonProps extends ThemedProps {
  readonly accessibilityLabel: string;
  readonly testID?: string;
}

export function LoadingSkeleton({
  accessibilityLabel,
  colorScheme,
  testID,
}: LoadingSkeletonProps) {
  const colors = themeColors(colorScheme);
  return (
    <View
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="progressbar"
      accessibilityState={{ busy: true }}
      style={[
        styles.skeleton,
        {
          backgroundColor: colors.surfaceMuted,
          borderRadius: radius.sm,
          minHeight: layout.minimumTouchTarget,
        },
      ]}
      testID={testID}
    />
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  topBar: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: space[2],
    minHeight: layout.minimumTouchTarget,
    paddingVertical: space[2],
  },
  topBarSide: {
    alignItems: 'center',
    minHeight: layout.minimumTouchTarget,
    minWidth: layout.minimumTouchTarget,
    justifyContent: 'center',
  },
  topBarTitle: {
    flex: 1,
    flexShrink: 1,
    textAlign: 'center',
  },
  button: {
    alignItems: 'center',
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
    paddingHorizontal: space[4],
    paddingVertical: space[3],
  },
  buttonLabel: {
    flexShrink: 1,
    textAlign: 'center',
  },
  iconButton: {
    alignItems: 'center',
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
    padding: space[2],
  },
  fieldGroup: {
    gap: space[1],
  },
  fieldLabel: {
    flexShrink: 1,
  },
  field: {
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: space[3],
    paddingVertical: space[2],
  },
  textArea: {
    textAlignVertical: 'top',
  },
  fieldError: {
    flexShrink: 1,
  },
  row: {
    alignItems: 'center',
    borderRadius: radius.sm,
    flexDirection: 'row',
    gap: space[3],
    paddingHorizontal: space[3],
    paddingVertical: space[2],
  },
  rowText: {
    flex: 1,
    flexShrink: 1,
    gap: space[1],
  },
  rowValue: {
    flexShrink: 1,
    textAlign: 'right',
  },
  sectionHeader: {
    flexShrink: 1,
    paddingVertical: space[2],
  },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    padding: space[4],
  },
  modalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  sheet: {
    borderWidth: StyleSheet.hairlineWidth,
    maxHeight: '90%',
    padding: space[4],
  },
  dialogBackdrop: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    padding: space[6],
  },
  dialog: {
    borderWidth: StyleSheet.hairlineWidth,
    gap: space[3],
    maxWidth: layout.maximumPhoneWidth,
    padding: space[4],
    width: '100%',
  },
  dialogActions: {
    gap: space[2],
  },
  toast: {
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: space[4],
    paddingVertical: space[3],
  },
  inlineMessage: {
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    padding: space[3],
  },
  emptyState: {
    alignItems: 'center',
    gap: space[3],
    padding: space[6],
  },
  skeleton: {
    width: '100%',
  },
});
