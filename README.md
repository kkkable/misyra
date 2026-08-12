# Misyra

Monorepo for the Misyra mobile application.

This repository currently contains **only the toolchain bootstrap (MTS-001) and the shared
development configuration (MTS-002)**: workspace declarations, package-manager and Node pins,
root command contracts, shared strict TypeScript / ESLint / Prettier / test configuration
packages, and infrastructure validation. No product features are implemented yet.

## Requirements

- Node.js **24 LTS** (declared in `engines` as the approved `>=24 <25` range)
- Corepack enabled, which resolves the pinned package manager
  (`packageManager` field in [`package.json`](package.json)): **pnpm 10.34.5**

```powershell
corepack enable
pnpm install --frozen-lockfile
```

## Layout

| Path                         | Purpose                                                                             |
| ---------------------------- | ----------------------------------------------------------------------------------- |
| `apps/*`                     | Workspace root reserved for application packages (none exist yet)                   |
| `packages/typescript-config` | Shared strict TypeScript base configuration (`@misyra/typescript-config`)           |
| `packages/eslint-config`     | Shared Node/MJS and type-aware TypeScript ESLint configs (`@misyra/eslint-config`)  |
| `packages/prettier-config`   | Centralized Prettier formatting policy (`@misyra/prettier-config`)                  |
| `packages/test-config`       | Node built-in test runner configuration and fixture helpers (`@misyra/test-config`) |
| `packages/toolchain-fixture` | Non-product TypeScript fixture consuming every shared configuration                 |
| `tests/toolchain/`           | Node test-runner contract tests for the toolchain and workspace rules               |
| `tests/config/`              | Node test-runner contract tests for the shared configuration packages               |
| `tests/fixtures/mts-002/`    | Expected-failure fixtures with asserted exact diagnostics                           |
| `.github/workflows/ci.yml`   | CI running the full contract suite on Linux and Windows                             |

## Root commands

| Command                              | Contract                                                               |
| ------------------------------------ | ---------------------------------------------------------------------- |
| `pnpm format`                        | Normalize formatting with Prettier (write mode)                        |
| `pnpm format:check`                  | Verify formatting without writing                                      |
| `pnpm lint`                          | Lint with ESLint                                                       |
| `pnpm typecheck`                     | TypeScript `--noEmit` check over toolchain sources                     |
| `pnpm test`                          | Run all Node test-runner suites                                        |
| `pnpm test:config`                   | Run the shared configuration contract suite                            |
| `pnpm build`                         | Run `build` across workspaces via Turborepo                            |
| `pnpm audit`                         | Fail on high-severity dependency vulnerabilities                       |
| `pnpm infra:validate`                | Validate the MTS-001 toolchain contracts                               |
| `pnpm visual:update-image-baselines` | Regenerate the MTS-012 screenshot baselines (explicit-update workflow) |

All root scripts are single portable commands: they work from Windows PowerShell
and in Linux CI without shell-specific syntax.

## Rules enforced by `pnpm infra:validate`

- Exactly one lockfile: `pnpm-lock.yaml` at the root (no npm/Yarn/Bun lockfiles).
- Every workspace lives under a `pnpm-workspace.yaml` glob, uses the `@misyra`
  scope, is private, and declares internal dependencies with `workspace:` ranges.
- The resolved `pnpm` binary matches the `packageManager` pin.
- No generated output, secrets, environment files, IDE metadata, or OS junk is tracked.

## Rules enforced by `pnpm test:config`

- Every TypeScript workspace extends `@misyra/typescript-config/strict-base.json`
  and never disables required strict options locally.
- Type-aware ESLint executes with real type information (asserted through an
  expected-failure fixture for `@typescript-eslint/no-floating-promises`).
- Package boundaries reject `@misyra/<package>/src` deep imports and
  cross-workspace relative traversal.
- Formatting resolves to the centralized `@misyra/prettier-config` policy.
- Every direct dependency is exactly pinned; internal ranges use `workspace:*`.

## MTS-012 screenshot layer

`screenshot-generation-contracts.test.mjs` renders the REAL MTS-009
primitive inventory and the REAL MTS-010 shell-screen Calendar root
(`PlaceholderScreen`) on two renderer paths, captures pixel artifacts, and
compares them to committed baselines under `tests/mts-012/image-baselines/`:

- **android — the authoritative mobile renderer.** The real surfaces are
  bundled (Metro) into a harness release APK (`native-entry.tsx`, a
  separate entry that never replaces the product expo-router entry) and
  screenshotted from the actual Android framebuffer of a deterministic
  emulator: `wm size`/`wm density 160` pin the logical size at 1x, the
  system `font_scale` drives text scale, the device locale drives the real
  device-catalog path, system bars are immersive, animations are off, and
  the host captures only after the in-app ready signal over `adb reverse`
  (fixed loopback port 58321). Emulator CI and local runs set
  `MISYRA_ANDROID_DEVICE=1` to enable the device-gated contracts.
- **web — optional supplemental deterministic coverage.** Headless Chromium
  (Playwright, esbuild bundle; `react-native` resolves to
  `react-native-web` through the harness shims), byte-deterministic PNGs.

Required matrix at minimum: 360×800 and 412×915; light and dark (the
`primitives` surface renders both; the real `PlaceholderScreen` is
appearance-independent, so `shell-screen` baselines cover light); English
and zh-HK (real catalogs, all copy comes from them); default and large text
(1x/2x, native fontScale semantics).

- Baselines are platform-separated (`image-baselines/<platform>/`, each
  with a `manifest.json` declaring platform identity, renderer, and 1x
  density) and never compared across platforms.
- The authoritative gate: fresh android captures must conform to the
  committed `image-baselines/android/` baselines within 2% pixel tolerance
  whenever an emulator is present (Linux CI emulator job + deliberate local
  emulator runs). The web layer remains supplemental and is never presented
  as the mobile screenshot gate.
- Normal CI NEVER invokes baseline writers (enforced by contract): an
  intentional visual change is adopted explicitly via
  `pnpm visual:update-image-baselines` (`tests/mts-012/update-image-baselines.mjs`,
  the only file allowed to write into `image-baselines/`) — or, on Linux
  CI, the manual `Update image baselines` workflow (workflow_dispatch,
  uploads regenerated baselines as an artifact) — and reviewed as a diff.
- Image-layer sources never contain credentials, device identity, network
  access, or MTS-013+ vocabulary (enforced by the suite itself, the same
  audit contract as the manifest layer).

Android capture prerequisites (local development):

```bash
# one-time: JDK 17, Android SDK (platform-tools, emulator, system image
# android-35 google_apis x86_64), an AVD, and ANDROID_HOME exported.
# Build the harness APK:
cd apps/mobile
MISYRA_HARNESS_BUILD=1 pnpm exec expo prebuild --platform android --no-install
node scripts/prepare-harness-android.mjs        # point the release bundle at native-entry.tsx
cd android && ./gradlew :app:assembleRelease --no-daemon
# Boot an emulator, install the APK, then regenerate/verify:
MISYRA_ANDROID_DEVICE=1 pnpm visual:update-image-baselines   # deliberate update (web + android)
MISYRA_ANDROID_DEVICE=1 node --test tests/mts-012/           # read-only conformance
```
