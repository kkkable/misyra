# MTS-102 Bold Text manual verification

Run this script on the exact reviewed build after automated GREEN.

## Preconditions

- Use a physical iPhone or iOS Simulator with Accessibility settings available.
- Start from the same app build for both passes.
- Use English first, then repeat the critical-action checks in zh-HK.
- Do not enable Increase Contrast or Button Shapes; those adaptations are out of scope.

## Baseline pass

1. In iOS Settings, turn **Accessibility → Display & Text Size → Bold Text** off.
2. Set system text size to the default size and system appearance to Light.
3. Launch Misyra and inspect Calendar, AI Planner, Progress, Settings, Mission Details, and Story editor controls.
4. Confirm primary labels and actions are readable, no critical action is clipped, and Story canvas text retains its saved composition size/weight.
5. Switch system appearance to Dark while Misyra remains installed and repeat the same screens.

## Bold Text pass

1. Turn **Bold Text** on.
2. Return to Misyra without changing any in-app setting.
3. Confirm ordinary app interface text becomes visibly heavier after the system setting takes effect.
4. Navigate through Calendar, AI Planner, Progress, Settings, Mission Details, and Story editor controls; confirm critical actions still wrap/grow instead of clipping.
5. Confirm Story canvas/export typography does **not** change its saved font category, point size, coordinates, or 1080 × 1920 composition because of Bold Text.

## Large-text pass

1. Keep Bold Text on and increase iOS text size to the largest supported practical test size.
2. Repeat Calendar, AI Planner, Progress, and Settings in both Light and Dark appearance.
3. Confirm critical labels/actions remain reachable and readable; scrollable screens remain scrollable; buttons/rows grow vertically where needed.
4. Confirm Calendar timeline alignment remains usable and Mission Details remains the accessible alternative for actions that are difficult to perform directly on the timeline.

## Expected result

- App chrome follows system Light/Dark immediately on re-render/re-entry.
- App interface text follows Dynamic Type and Bold Text.
- No separate Misyra appearance/text/bold setting exists.
- Critical labels/actions do not clip at supported large text.
- Story canvas/export typography remains independent.
- No special Increase Contrast or Button Shapes adaptation is present.
