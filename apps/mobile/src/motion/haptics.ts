/**
 * MTS-011 — semantic haptic adapter + deterministic fake.
 *
 * Framework-free core. It defines the semantic, subtle feedback operations
 * the approved product uses (technical specification §7.5: time-slot
 * selection, snapping during drag/resize, successful save, completion,
 * Story save, destructive confirmation, validation failure) behind a narrow
 * `HapticsAdapter` interface, so feature code never leaks provider-specific
 * calls. The facade no-ops deterministically when the platform/system cannot
 * provide haptics instead of crashing.
 *
 * No interface-sound API exists anywhere in MTS-011: the foundation never
 * touches audio playback or sound-effect providers (product specification
 * §24 forbids an interface-sound path).
 */
/** Semantic haptic intents (technical specification §7.5). */
export type HapticIntent =
  | "selection"
  | "snap"
  | "save"
  | "completion"
  | "story-save"
  | "destructive"
  | "validation-failure";

/** The narrow platform boundary haptic providers implement. */
export interface HapticsAdapter {
  /**
   * True when this adapter can invoke the platform haptic API. This is a
   * synchronous platform-capability claim, not proof that the system will
   * currently produce haptics: system settings are honored by the platform,
   * and executions the system suppresses are silent no-ops.
   */
  readonly supported: boolean;
  /** Fire one semantic haptic intent. Must never throw. */
  trigger(intent: HapticIntent): void;
}

/**
 * Deterministic fake adapter for automated tests. Records every triggered
 * intent so tests can assert exact call sequences without physical haptic
 * hardware. `supported` is configurable to exercise unavailable paths.
 */
export class FakeHapticsAdapter implements HapticsAdapter {
  readonly supported: boolean;
  readonly triggered: HapticIntent[] = [];

  constructor(supported = true) {
    this.supported = supported;
  }

  trigger(intent: HapticIntent): void {
    this.triggered.push(intent);
  }
}

/**
 * Deterministic no-op adapter for platforms where haptics are unavailable.
 * `supported` is always false and triggers are silently dropped.
 */
export const noopHapticsAdapter: HapticsAdapter = {
  supported: false,
  trigger(_intent: HapticIntent): void {
    /* no-op: haptics unavailable */
  },
};

/**
 * Semantic haptic facade. Feature code calls the named operations; the
 * facade forwards to the underlying adapter only when haptics are supported,
 * so an unavailable platform is a deterministic no-op rather than a crash.
 */
export class Haptics {
  constructor(private readonly adapter: HapticsAdapter) {}

  /**
   * True when the underlying adapter can invoke the platform haptic API
   * (platform capability, not runtime availability; system settings are
   * honored by the platform and suppressed executions are silent no-ops).
   */
  get supported(): boolean {
    return this.adapter.supported;
  }

  /** Subtle feedback for a selection (e.g. time-slot selection). */
  selection(): void {
    this.fire("selection");
  }

  /** Subtle feedback for snapping during drag/resize. */
  snap(): void {
    this.fire("snap");
  }

  /** Subtle feedback for a successful save. */
  save(): void {
    this.fire("save");
  }

  /** Subtle feedback for a completion. */
  completion(): void {
    this.fire("completion");
  }

  /** Subtle feedback for a Story save. */
  storySave(): void {
    this.fire("story-save");
  }

  /** Subtle feedback for a destructive confirmation. */
  destructive(): void {
    this.fire("destructive");
  }

  /** Subtle feedback for a validation failure where useful. */
  validationFailure(): void {
    this.fire("validation-failure");
  }

  private fire(intent: HapticIntent): void {
    if (this.adapter.supported) {
      this.adapter.trigger(intent);
    }
  }
}

/** Constructs the semantic facade over any adapter. */
export function createHaptics(adapter: HapticsAdapter): Haptics {
  return new Haptics(adapter);
}
