# MTS-103 VoiceOver manual verification

Run this script on the exact reviewed iOS build after automated GREEN.

## Preconditions

- Use a physical iPhone or iOS Simulator with VoiceOver available.
- Use the same reviewed commit as the automated accessibility-tree tests.
- Start in English, then repeat critical spoken-label checks in zh-HK.
- Prepare an unfinished timed mission, completed mission, recurring mission, organizer-controlled imported mission, Evidence result, and Story draft.

## Calendar mission cards

1. Enable VoiceOver in iOS Accessibility settings.
2. Open Calendar and move focus through timed mission cards in visual top-to-bottom order.
3. Confirm each timed mission speaks title, formatted start/end time, written completion/evidence status, and recurrence when applicable.
4. Confirm an organizer-controlled imported mission speaks its organizer-controlled/read-only state.
5. Confirm all-day missions speak completion/evidence status in words rather than relying on colour.
6. Select an unfinished timed mission and confirm the visual resize handle is not a separate unusable VoiceOver control.
7. Open Mission Details and confirm date/start/end fields are the accessible alternative to drag/resize.

## Sheets and focus

1. Focus the Calendar help trigger and open the help sheet.
2. Confirm VoiceOver focus remains in the sheet until dismissal.
3. Close it and confirm focus returns to the help trigger.
4. Trigger the recurring-scope chooser from a recurring mission Save or Delete action.
5. Confirm background controls are not reachable while the chooser is open and every scope choice is clearly announced.

## Evidence

1. Traverse capture/review/result controls and confirm usable spoken names.
2. Confirm retry, self-confirm, retained-media actions, and close are reachable when present.
3. When an Evidence result appears or changes, confirm its result heading is announced and receives focus.
4. Confirm accepted/rejected/expired states are spoken in words, not only colour.
5. Trigger a validation/error state where practical and confirm the state change is announced.

## Story

1. Open Story editor and swipe from the top.
2. Confirm Close and Save come first, followed by source/version controls and editor controls in a stable order.
3. Confirm source/version controls announce labels and selected state.
4. Confirm Undo/Redo, zoom, contrast, move, text fields, text editing, font/size/colour, remove text, save/share, and Instagram handoff controls are reachable and meaningful.
5. Confirm disabled controls announce disabled/unavailable state.

## zh-HK pass

1. Switch Misyra to zh-HK.
2. Repeat one timed mission, one all-day mission, Evidence result, recurrence chooser, and Story primary controls.
3. Confirm app-provided spoken copy is Hong Kong Traditional Chinese and user-entered content remains unchanged.

## Expected result

- No Calendar state is colour-only to VoiceOver.
- Timed mission cards speak title, time, recurrence when relevant, written status, and organizer-controlled state when relevant.
- Mission Details is a usable alternative to drag/resize and there is no dead screen-reader resize control.
- Evidence result changes announce and focus the result heading.
- Sheet/modal focus stays in the active surface; Calendar Help returns focus to its trigger.
- Evidence and Story controls are reachable, labeled, and ordered predictably.
- English and zh-HK are both usable.