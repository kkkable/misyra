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

| Command               | Contract                                           |
| --------------------- | -------------------------------------------------- |
| `pnpm format`         | Normalize formatting with Prettier (write mode)    |
| `pnpm format:check`   | Verify formatting without writing                  |
| `pnpm lint`           | Lint with ESLint                                   |
| `pnpm typecheck`      | TypeScript `--noEmit` check over toolchain sources |
| `pnpm test`           | Run all Node test-runner suites                    |
| `pnpm test:config`    | Run the shared configuration contract suite        |
| `pnpm build`          | Run `build` across workspaces via Turborepo        |
| `pnpm audit`          | Fail on high-severity dependency vulnerabilities   |
| `pnpm infra:validate` | Validate the MTS-001 toolchain contracts           |

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
