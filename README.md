# Misyra

Monorepo for the Misyra mobile application.

This repository currently contains **only the toolchain bootstrap from ticket MTS-001**:
workspace declarations, package-manager and Node pins, root command contracts, and
infrastructure validation. No product features are implemented yet.

## Requirements

- Node.js **24 LTS** (declared in `engines`)
- Corepack enabled, which resolves the pinned package manager
  (`packageManager` field in [`package.json`](package.json)): **pnpm 10.34.5**

```powershell
corepack enable
pnpm install --frozen-lockfile
```

## Layout

| Path                       | Purpose                                                                    |
| -------------------------- | -------------------------------------------------------------------------- |
| `packages/*`               | pnpm workspace packages (currently a single non-product toolchain fixture) |
| `tests/toolchain/`         | Node test-runner contract tests for the toolchain and workspace rules      |
| `.github/workflows/ci.yml` | CI running the full contract suite on Linux and Windows                    |

## Root commands

| Command               | Contract                                           |
| --------------------- | -------------------------------------------------- |
| `pnpm format`         | Normalize formatting with Prettier (write mode)    |
| `pnpm format:check`   | Verify formatting without writing                  |
| `pnpm lint`           | Lint with ESLint                                   |
| `pnpm typecheck`      | TypeScript `--noEmit` check over toolchain sources |
| `pnpm test`           | Run all Node test-runner suites                    |
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
