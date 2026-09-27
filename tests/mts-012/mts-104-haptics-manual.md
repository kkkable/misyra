# MTS-104 manual haptic acceptance

Run this checklist on the exact reviewed iOS and Android development builds after automated GREEN.

## Preconditions

- Use one supported iPhone/iOS build and one supported Android build.
- Use the same Git commit as the canonical CI run.
- Confirm system haptics/vibration are enabled first, then repeat the availability/no-op check with them disabled where the platform exposes that control.
- Do not enable any in-app haptic preference; Misyra must not provide one.

## Time-slot selection

1. Open Calendar.
2. Tap an empty time slot once.
3. Confirm one subtle selection haptic occurs.
4. Tap the same slot again to open mission creation.
5. Confirm selection feedback is not repeated continuously while the screen is idle.

## Drag and resize

1. Select an unfinished timed mission.
2. Long-press and drag it across several intermediate positions before releasing.
3. Confirm direct finger tracking remains continuous.
4. Confirm no repeated haptic fires for every movement frame.
5. On the committed snapped release, confirm one subtle snap haptic.
6. Repeat with the resize handle and confirm one snap haptic on the committed release.

## Save and completion

1. Create or edit a mission and save successfully.
2. Confirm one light save haptic.
3. Complete one mission on the completing device.
4. Confirm one light completion haptic and no repeated pulse while the confirmation stays visible.
5. Confirm a secondary device receiving the synchronized completion does not play the completion haptic.

## Story

1. Open Story editor from a completed mission.
2. Make an edit and press Save.
3. Confirm one light Story-save haptic after the save succeeds.
4. Repeated edits without pressing Save must not emit repeated save haptics.

## Failure/destructive boundaries

1. Trigger a validation failure where an approved validation haptic exists and confirm feedback is subtle and singular.
2. Trigger an approved destructive confirmation where available and confirm warning feedback occurs only for the confirmation event.
3. Cancel the action and confirm no extra pulse loops.

## System setting and sound checks

1. Disable system haptics/vibration where the OS exposes a supported control.
2. Repeat selection/save/completion checks and confirm Misyra remains usable and does not crash if haptic delivery is suppressed by the platform.
3. Confirm there is no in-app haptic toggle.
4. Traverse Calendar, mission editing, Evidence, completion confirmation, and Story editing and confirm Misyra plays no interface sounds.

## Reduce Motion cross-check

1. Enable the OS Reduce Motion setting.
2. Repeat mission drag/resize and confirm direct finger tracking still works.
3. Complete a level-up mission and confirm the confirmation is static with no confetti or moving outline.
4. Switch Story source/version and confirm there is no directional movement; only a fade or immediate change is allowed.
5. Confirm haptic behavior remains subtle and event-bounded.

## Expected result

- Haptics are subtle and occur only at approved semantic events.
- Drag/resize never emits a haptic on every movement frame; one snap feedback occurs on a successful committed release.
- Completion and Story save do not double-fire.
- Platform-unavailable/suppressed haptics fail safely.
- No interface sounds exist.
- Reduce Motion changes decorative motion without disabling direct drag.
