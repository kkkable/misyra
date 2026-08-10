/**
 * MTS-009 — Foundational UI primitives: framework-free core contracts.
 *
 * This module is the single source of truth for primitive *behavior*:
 * touch targets, interaction states, accessibility roles, color resolution
 * for every component state, contrast guarantees, and layout constants.
 * It contains NO user-visible strings and NO raw color literals — every
 * value is derived from the approved @misyra/design-tokens package.
 *
 * Design references:
 * - §6.1 Touch targets          — 44pt minimum touch target
 * - §6.2 Interaction states     — default/pressed/focused/disabled/loading/selected/error
 * - §6.3 Accessibility          — role mapping per primitive kind
 * - §6.6 Semantic colors        — every color here is an approved token value
 * - §6.9 Content framing        — SCREEN_HORIZONTAL_PADDING = space 16, LARGE_SECTION_SPACING = space 24
 */
import { space, themes, wcagContrastRatio } from "@misyra/design-tokens";

/** §6.1 — Minimum touch target (pt). */
export const MIN_TOUCH_TARGET = 44;

/** Intrinsic shape of a control before the minimum touch target is applied. */
export interface TouchTargetShape {
  readonly width?: number;
  readonly height?: number;
}

/** Minimum-size style guaranteeing a tappable surface of at least 44pt. */
export interface TouchTargetStyle {
  readonly minWidth: number;
  readonly minHeight: number;
}

/**
 * Returns the style that enlarges a control to the minimum touch target.
 * Narrower/smaller shapes are raised to 44pt; larger shapes are kept.
 */
export function minTouchTargetStyle(shape: TouchTargetShape = {}): TouchTargetStyle {
  return {
    minWidth: Math.max(MIN_TOUCH_TARGET, shape.width ?? 0),
    minHeight: Math.max(MIN_TOUCH_TARGET, shape.height ?? 0),
  };
}

/** §6.2 — Supported theme modes. */
export type ThemeMode = "light" | "dark";

/** §6.2 — Interaction states every interactive primitive can be in. */
export type InteractionState =
  "default" | "pressed" | "focused" | "disabled" | "loading" | "selected" | "error";

/** Screen-reader state payload derived from an {@link InteractionState}. */
export interface AccessibilityStatePayload {
  readonly disabled?: boolean;
  readonly busy?: boolean;
  readonly selected?: boolean;
  readonly pressed?: boolean;
  readonly error?: boolean;
}

/**
 * §6.3 — Maps an interaction state to the accessibility state the platform
 * should announce for a screen reader.
 */
export function interactionAccessibility(state: InteractionState): AccessibilityStatePayload {
  switch (state) {
    case "disabled":
      return { disabled: true };
    case "loading":
      return { busy: true, disabled: true };
    case "selected":
      return { selected: true };
    case "pressed":
      return { pressed: true };
    case "error":
      return { error: true };
    case "focused":
    case "default":
      return {};
  }
}

/** §6.3 — Every primitive kind shipped by MTS-009. */
export type PrimitiveKind =
  | "button"
  | "iconButton"
  | "textField"
  | "textArea"
  | "header"
  | "emptyState"
  | "toast"
  | "progressbar"
  | "dialog";

/** §6.3 — Accessible roles the primitives map to. */
export type PrimitiveRole = "button" | "header" | "summary" | "alert" | "text" | "progressbar";

/**
 * §6.3 — Maps a primitive kind to its accessible role.
 * Notes: text fields/areas announce as text inputs; toast and dialog both
 * announce as alerts so their content is read on arrival.
 */
export function primitiveA11yRole(kind: PrimitiveKind): PrimitiveRole {
  switch (kind) {
    case "button":
    case "iconButton":
      return "button";
    case "header":
      return "header";
    case "emptyState":
      return "summary";
    case "toast":
      return "alert";
    case "dialog":
      return "alert";
    case "progressbar":
      return "progressbar";
    case "textField":
    case "textArea":
      return "text";
  }
}

/** §6.2 — Button variants. */
export type ButtonVariant = "primary" | "secondary" | "destructive";

/** §6.2 — Button interaction states (visual). */
export type ButtonState = "normal" | "pressed" | "disabled" | "loading";

/** §6.2 — Resolved background/foreground colors for a button state. */
export interface ButtonColors {
  readonly background: string;
  readonly foreground: string;
}

/** Maps a button visual state to the underlying interaction state (§6.2). */
export function buttonInteractionState(state: ButtonState): InteractionState {
  switch (state) {
    case "normal":
      return "default";
    case "pressed":
      return "pressed";
    case "disabled":
      return "disabled";
    case "loading":
      return "loading";
  }
}

/**
 * §6.6 — Resolves a button variant/state to approved token colors.
 * Disabled controls always drop to surfaceMuted/textTertiary; loading keeps
 * the strong variant affordance so the action stays recognizable.
 */
export function buttonColors(
  mode: ThemeMode,
  variant: ButtonVariant,
  state: ButtonState,
): ButtonColors {
  const t = themes[mode];
  switch (variant) {
    case "primary":
      if (state === "disabled") {
        return { background: t.surfaceMuted, foreground: t.textTertiary };
      }
      return {
        background: state === "pressed" ? t.primaryPressed : t.primary,
        foreground: t.primaryText,
      };
    case "secondary":
      if (state === "disabled") {
        return { background: t.surfaceMuted, foreground: t.textTertiary };
      }
      return {
        background: state === "pressed" ? t.surfaceMuted : t.surface,
        foreground: t.textPrimary,
      };
    case "destructive":
      if (state === "disabled") {
        return { background: t.surfaceMuted, foreground: t.textTertiary };
      }
      return { background: t.destructiveSoft, foreground: t.destructive };
  }
}

/** Resolved background/foreground colors for an icon button state. */
export interface IconButtonColors {
  readonly background: string;
  readonly foreground: string;
}

/** §6.6 — Icon buttons keep a filled 44pt surface in every state. */
export function iconButtonColors(mode: ThemeMode, state: ButtonState): IconButtonColors {
  const t = themes[mode];
  if (state === "disabled") {
    return { background: t.surfaceMuted, foreground: t.textTertiary };
  }
  if (state === "pressed") {
    return { background: t.surfaceMuted, foreground: t.textPrimary };
  }
  return { background: t.surface, foreground: t.textPrimary };
}

/** §6.2 — Field visual kinds (only "filled" today; extensible). */
export type FieldKind = "filled";

/** §6.2 — Field interaction states. */
export type FieldState = "normal" | "focused" | "disabled" | "error";

/** Resolved colors for a field's fill, border, text and placeholder. */
export interface FieldColors {
  readonly background: string;
  readonly border: string;
  readonly foreground: string;
  readonly placeholder: string;
}

/**
 * §6.6 — Resolves a filled field's per-state colors from approved tokens.
 * Focus draws the primary border; error draws the destructive border; the
 * disabled field drops to surfaceMuted fill and tertiary text.
 */
export function fieldColors(mode: ThemeMode, kind: FieldKind, state: FieldState): FieldColors {
  if (kind !== "filled") {
    throw new Error(`Unsupported field kind: ${kind}`);
  }
  const t = themes[mode];
  switch (state) {
    case "focused":
      return {
        background: t.surface,
        border: t.primary,
        foreground: t.textPrimary,
        placeholder: t.textTertiary,
      };
    case "error":
      return {
        background: t.surface,
        border: t.destructive,
        foreground: t.textPrimary,
        placeholder: t.textTertiary,
      };
    case "disabled":
      return {
        background: t.surfaceMuted,
        border: t.border,
        foreground: t.textTertiary,
        placeholder: t.textTertiary,
      };
    case "normal":
      return {
        background: t.surface,
        border: t.border,
        foreground: t.textPrimary,
        placeholder: t.textTertiary,
      };
  }
}

/** §6.6 — Surface kinds a primitive can fill with. */
export type SurfaceKind = "canvas" | "surface" | "surfaceRaised" | "surfaceMuted";

/** Resolves a surface kind to its approved token value in a theme. */
export function surfaceToken(mode: ThemeMode, kind: SurfaceKind): string {
  return themes[mode][kind];
}

/** §6.6 — Foreground text roles. */
export type TextForeground = "textPrimary" | "textSecondary" | "textTertiary";

/** Resolves a text role to its approved token value in a theme. */
export function textToken(mode: ThemeMode, kind: TextForeground): string {
  return themes[mode][kind];
}

/**
 * §6.3 — Large labels stay wrappable: action labels must never be clipped
 * nor force their container wider than the screen.
 */
export interface WrappableTextStyle {
  readonly flexShrink: 1;
  readonly flexWrap: "wrap";
}

export function wrappableTextStyle(): WrappableTextStyle {
  return { flexShrink: 1, flexWrap: "wrap" };
}

/** §6.6 — Contrast of the primary button label against its fill (≥ 4.5:1). */
export function primaryLabelContrast(mode: ThemeMode): number {
  return wcagContrastRatio(themes[mode].primaryText, themes[mode].primary);
}

/** §6.9 — Screen edge padding (space 16). */
export const SCREEN_HORIZONTAL_PADDING = space[4];

/** §6.9 — Spacing between large content sections (space 24). */
export const LARGE_SECTION_SPACING = space[6];
