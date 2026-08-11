# MTS-012 — Visual Regression & Device-Size Harness

Deterministic, reviewable layout contracts for the approved phone matrix
(technical specification §6.2). The harness proves the interface stays
responsive at 360/393/412 pt widths, portrait-only, safe-area-aware, and
44 pt touch-target compliant — for every appearance, locale, and text scale.

## Approved matrix

- Platforms: `ios`, `android` (canonical per-platform safe-area insets)
- Devices: `360x800`, `390x844`, `393x852`, `412x915` (portrait phones only)
- Appearances: `light`, `dark`
- Locales: `en`, `zh-HK`
- Text scales: `1` (normal), `2` (large text)
- 2 surfaces × 4 × 4 × 2 × 2 × 2 = **128 manifest combinations**, all
  deterministic (identical across renders)

## How it works

`harness/manifest.mjs` builds a declarative layout manifest per combination.
Every number is derived from **real application code**:

- `harness/runtime.mjs` — compiles `apps/mobile/src/primitives/core.ts` with
  the workspace TypeScript compiler and loads the built `design-tokens` and
  `localization` packages (same build scripts CI uses). Output goes to
  `apps/mobile/node_modules/.mts012-harness` (git-ignored).
- `harness/sources.mjs` — reads the real app sources (tab layout, placeholder
  screen metrics, primitive mechanisms, portrait config) and **throws if a
  modeled mechanism drifts** from its source.
- `harness/text.mjs` — deterministic advance-width model (latin 0.5 em,
  CJK/full-width 1 em, space 0.25 em) with greedy word wrapping. Conservative:
  anything that fits under this model leaves margin in reality.

The shell surface models safe areas, the gesture area, the bottom tab bar
(selected/unselected states), the current tab screen, and the full-screen
modals. The primitives surface models the MTS-009 inventory: touch targets,
typography, and representative wrapped-label cases.

## Baselines

`baselines/*.json` are the accepted layouts for the full matrix. The
visual-regression gate (`visual-regression-contracts.test.mjs`) asserts a
fresh render deep-equals the accepted baseline, reports exact diff paths,
and **never writes** baselines.

Updating baselines is an explicit, reviewed workflow only:

```bash
pnpm visual:update-baselines
```

Then inspect the git diff and commit deliberately. Normal test runs
(`pnpm test`) never touch baseline files.

## Documented model assumptions

- Tab bar: 49 pt base height, 10 pt labels (standard built-in navigator
  defaults), labels wrap within tab width.
- Safe-area insets are canonical per platform: iOS top 59 / bottom 34,
  Android top 24 / bottom 24 (deterministic fixtures, not device-exact).
- Line height = fontSize × 1.4; no kerning or compression (conservative).
- The tab bar is the navigator's built-in bar; its vertical overflow under
  large text follows the navigator's standard behavior, so the harness
  asserts horizontal label fit (wrap) rather than bar-height fit.
