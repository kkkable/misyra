import {
  darkColors,
  layout,
  lightColors,
  radius,
  typography,
  type ThemeColors,
} from '@misyra/design-tokens';

export type ColorScheme = 'light' | 'dark';
export type ButtonVariant = 'primary' | 'secondary' | 'destructive' | 'icon';
export type SurfaceKind = 'card' | 'sheet' | 'dialog' | 'toast';

export interface ButtonState {
  readonly pressed?: boolean;
  readonly disabled?: boolean;
  readonly loading?: boolean;
}

export interface FieldState {
  readonly focused?: boolean;
  readonly error?: boolean;
  readonly disabled?: boolean;
  readonly multiline?: boolean;
}

export interface SelectableState {
  readonly selected?: boolean;
  readonly disabled?: boolean;
}

export const primitiveInventory = [
  'Screen',
  'SafeAreaScreen',
  'TopBar',
  'PrimaryButton',
  'SecondaryButton',
  'DestructiveButton',
  'IconButton',
  'TextField',
  'TextArea',
  'ToggleRow',
  'SettingsRow',
  'SectionHeader',
  'Card',
  'BottomSheet',
  'ConfirmationDialog',
  'Toast',
  'InlineMessage',
  'EmptyState',
  'LoadingSkeleton',
] as const;

export const primitiveAccessibilityRoles = {
  PrimaryButton: 'button',
  SecondaryButton: 'button',
  DestructiveButton: 'button',
  IconButton: 'button',
  TextField: 'text',
  TextArea: 'text',
  ToggleRow: 'switch',
  SettingsRow: 'button',
  SectionHeader: 'header',
  ConfirmationDialog: 'alert',
  Toast: 'alert',
  InlineMessage: 'alert',
} as const;

export const themeColors = (colorScheme: ColorScheme): ThemeColors =>
  colorScheme === 'dark' ? darkColors : lightColors;

export const buttonContract = (
  variant: ButtonVariant,
  colorScheme: ColorScheme,
  state: ButtonState = {},
) => {
  const colors = themeColors(colorScheme);
  const disabled = state.disabled === true || state.loading === true;

  if (disabled) {
    return {
      backgroundColor: colors.surfaceMuted,
      foregroundColor: colors.textTertiary,
      borderColor: colors.border,
      minimumTouchTarget: layout.minimumTouchTarget,
      disabled: true,
      busy: state.loading === true,
    } as const;
  }

  if (variant === 'primary') {
    return {
      backgroundColor: state.pressed === true ? colors.primaryPressed : colors.primary,
      foregroundColor: colors.primaryText,
      borderColor: state.pressed === true ? colors.primaryPressed : colors.primary,
      minimumTouchTarget: layout.minimumTouchTarget,
      disabled: false,
      busy: false,
    } as const;
  }

  if (variant === 'destructive') {
    return {
      backgroundColor: state.pressed === true ? colors.destructiveSoft : colors.destructive,
      foregroundColor: state.pressed === true ? colors.destructive : colors.primaryText,
      borderColor: colors.destructive,
      minimumTouchTarget: layout.minimumTouchTarget,
      disabled: false,
      busy: false,
    } as const;
  }

  if (variant === 'icon') {
    return {
      backgroundColor: state.pressed === true ? colors.primarySoft : colors.surface,
      foregroundColor: colors.textPrimary,
      borderColor: colors.border,
      minimumTouchTarget: layout.minimumTouchTarget,
      disabled: false,
      busy: false,
    } as const;
  }

  return {
    backgroundColor: state.pressed === true ? colors.primarySoft : colors.surfaceMuted,
    foregroundColor: colors.primary,
    borderColor: colors.border,
    minimumTouchTarget: layout.minimumTouchTarget,
    disabled: false,
    busy: false,
  } as const;
};

export const fieldContract = (colorScheme: ColorScheme, state: FieldState = {}) => {
  const colors = themeColors(colorScheme);
  const disabled = state.disabled === true;
  const multiline = state.multiline === true;

  return {
    backgroundColor: disabled ? colors.surfaceMuted : colors.surface,
    foregroundColor: disabled ? colors.textTertiary : colors.textPrimary,
    placeholderColor: colors.textTertiary,
    borderColor:
      state.error === true
        ? colors.destructive
        : state.focused === true
          ? colors.focusRing
          : colors.border,
    minimumTouchTarget: layout.minimumTouchTarget,
    minimumRows: multiline ? 3 : 1,
    disabled,
    invalid: state.error === true,
    multiline,
  } as const;
};

export const rowContract = (colorScheme: ColorScheme, state: SelectableState = {}) => {
  const colors = themeColors(colorScheme);
  const disabled = state.disabled === true;
  const selected = state.selected === true;

  return {
    backgroundColor: disabled
      ? colors.surfaceMuted
      : selected
        ? colors.primarySoft
        : colors.surface,
    foregroundColor: disabled ? colors.textTertiary : colors.textPrimary,
    secondaryColor: disabled ? colors.textTertiary : colors.textSecondary,
    minimumTouchTarget: layout.minimumTouchTarget,
    selected,
    disabled,
  } as const;
};

export const surfaceContract = (
  kind: SurfaceKind,
  colorScheme: ColorScheme,
  state: Pick<SelectableState, 'selected'> = {},
) => {
  const colors = themeColors(colorScheme);
  const selected = state.selected === true;

  return {
    backgroundColor: colors.surfaceRaised,
    borderColor: selected ? colors.focusRing : colors.border,
    radius: kind === 'sheet' || kind === 'dialog' ? radius.lg : radius.md,
    selected,
  } as const;
};

export const overlayContract = (colorScheme: ColorScheme) => {
  const colors = themeColors(colorScheme);
  return {
    backdropColor: colors.overlay,
    surfaceColor: colors.surfaceRaised,
  } as const;
};

export const primitiveSnapshot = (colorScheme: ColorScheme, textScale: number) => {
  const colors = themeColors(colorScheme);

  return {
    theme: colorScheme,
    textScale,
    screen: {
      backgroundColor: colors.canvas,
      horizontalPadding: layout.screenHorizontalPadding,
    },
    topBar: {
      backgroundColor: colors.canvas,
      titleColor: colors.textPrimary,
      titleFontSize: typography.title3.fontSize,
      minimumTouchTarget: layout.minimumTouchTarget,
    },
    button: {
      minimumTouchTarget: layout.minimumTouchTarget,
      fontSize: typography.body.fontSize,
      allowsFontScaling: true,
      wraps: true,
      fixedHeight: false,
    },
    field: {
      minimumTouchTarget: layout.minimumTouchTarget,
      fontSize: typography.body.fontSize,
      allowsFontScaling: true,
      focusedBorderColor: colors.focusRing,
      errorBorderColor: colors.destructive,
    },
    card: {
      backgroundColor: colors.surfaceRaised,
      radius: radius.md,
    },
    sheet: {
      backgroundColor: colors.surfaceRaised,
      radius: radius.lg,
      overlayColor: colors.overlay,
    },
    dialog: {
      backgroundColor: colors.surfaceRaised,
      radius: radius.lg,
      overlayColor: colors.overlay,
    },
    toast: {
      backgroundColor: colors.surfaceRaised,
      radius: radius.md,
    },
    skeleton: {
      backgroundColor: colors.surfaceMuted,
      animated: false,
    },
    accessibility: {
      criticalActionsClip: false,
      supportsSystemTextScaling: true,
      supportsBoldText: true,
    },
  } as const;
};
