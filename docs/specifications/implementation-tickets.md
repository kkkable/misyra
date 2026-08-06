# Mission-to-Story Implementation Tickets

**Status:** Review draft  
**Generated from:** Approved Mission-to-Story Technical Specification  
**Date:** 2026-08-06  
**Ticket count:** 119  
**Epic count:** 16  
**Implementation status:** Not started

---

## 1. Conversion Rules

This backlog converts the approved technical specification into dependency-ordered, independently reviewable implementation tickets.

Global rules:

1. The approved product specification and technical specification are authoritative.
2. No ticket may introduce an excluded first-release feature.
3. Every implementation ticket uses test-driven development:
   - create a failing test;
   - implement the minimum behavior;
   - refactor while green;
   - run focused and affected-package verification.
4. Every ticket requires a code-review gate before closure.
5. Provider credentials, cloud deployment, store submission, and public activation require separate explicit approval.
6. Normal automated tests use deterministic fakes. Live-provider tests occur only in staging tickets.
7. Commits should remain focused. Do not combine unrelated tickets because they share files.
8. A ticket may refine filenames after inspecting the actual repository, but it may not weaken its behavioral acceptance criteria.
9. When a ticket exposes a contradiction in the approved specifications, stop and return to specification review rather than silently choosing new behavior.
10. “Done” means tests and evidence exist; code existence alone is insufficient.

---

## 2. Definition of Ready

A ticket is ready when:

- every dependency is closed;
- its required external configuration is available or explicitly faked;
- its acceptance criteria are understood;
- its expected package/file boundaries are known;
- no unresolved product decision blocks it.

## 3. Definition of Done

A ticket is done only when:

- all acceptance criteria pass;
- required tests were written first and are green;
- formatting, lint, and type checking pass for affected workspaces;
- relevant integration/build checks pass;
- privacy and localization checks pass where applicable;
- code review returns no unresolved Important or Critical finding;
- verification evidence names the exact Git SHA;
- no unrelated scope appears in the diff.

---

## 4. External Gates

These gates are not implementation tickets and must not be inferred as approved:

- **GATE-A — Product identifiers:** final display name, bundle ID, Android application ID.
- **GATE-B — Apple configuration:** Developer Team, Sign in with Apple identifiers, EventKit permission copy.
- **GATE-C — Google configuration:** OAuth clients, consent screen, calendar test account, verification needs.
- **GATE-D — Azure configuration:** subscription, resource naming, budget, approved deployment.
- **GATE-E — AI processing:** production model choice, retention review, data-processing approval.
- **GATE-F — Legal:** Privacy Policy and Terms URLs/content approval.
- **GATE-G — Store policies:** exact-alarm declaration, account deletion, data safety/privacy labels.
- **GATE-H — Production activation:** explicit deployment and public-release approval.

---

## 5. Epic Dependency Order

| Order | Epic | Outcome |
|---:|---|---|

| 1 | E00 — Foundation and Delivery Toolchain | Create the greenfield monorepo, shared tooling, local services, CI, infrastructure skeleton, and health boundaries without implementing product features. |
| 2 | E01 — Design System and Mobile Shell | Implement the approved clean mobile visual language, responsive portrait shell, motion foundation, and reusable primitives before feature screens. |
| 3 | E02 — Pure Domain Kernel | Implement deterministic mission, recurrence, time, eligibility, reward, streak, conflict, and retention rules as framework-free TypeScript. |
| 4 | E03 — Database, Contracts, and Server State | Create authoritative persistence, transactions, outbox, idempotency, change log, and API error contracts. |
| 5 | E04 — Mobile Local-First Storage and Sync | Make SQLite the mobile read model and implement optimistic mutations, incremental sync, offline search, and conflict application. |
| 6 | E05 — Authentication, Onboarding, and Account Lifecycle | Implement immutable Apple/Google identity binding, automatic sign-in, per-device sessions, onboarding permissions, sign-out, and account deletion. |
| 7 | E06 — Internal Calendar and Mission UX | Build the primary Calendar experience, manual mission flows, Mission Details, search, help, overlap handling, and historical rules. |
| 8 | E07 — Recurrence, Time Zones, and Historical State | Expose recurrence and time behavior in UI and persistence while enforcing split scopes, travel behavior, and historical windows. |
| 9 | E08 — Difficulty, Completion, Rewards, and Progress | Connect AI classification to deterministic rewards, implement authoritative completion, Trust/Private modes, Progress, and completion motion. |
| 10 | E09 — Mission Notifications | Implement per-device local notification permission, scheduling, combination, deep links, rebuilds, and Android release gate. |
| 11 | E10 — External Calendar Integration | Implement the single-calendar connection model, Google server adapter, iOS EventKit adapter, field ownership, hidden events, outages, disconnect, reconnect, and cancellation history. |
| 12 | E11 — Evidence, Verification, and Product Media Retention | Implement camera-only evidence, attempt lifecycle, offline upload, AI verification, self-confirmation, working media, explicit save, and hard deletion. |
| 13 | E12 — AI Planner | Implement one persistent draft, text/image input, extraction, Calendar preview editing, replacement, and atomic confirmation. |
| 14 | E13 — Story Creation and Sharing | Implement source/AI versions, style profile, suggestions, independent compositions, offline editing, conflicts, local rendering, save, and sharing. |
| 15 | E14 — Settings, Localization, Accessibility, Feedback, and Diagnostics | Complete the remaining app surface and cross-cutting user controls without expanding the first-release feature set. |
| 16 | E15 — Security, Performance, Release Hardening, and Acceptance | Prove the app meets privacy, security, performance, accessibility, provider, store, and full-flow release criteria. |

---

## 6. Ticket Index

| Ticket | Epic | Title | Depends on |
|---|---|---|---|
| `MTS-001` | `E00` | Bootstrap pnpm/Turborepo monorepo | — |
| `MTS-002` | `E00` | Create shared TypeScript, lint, format, and test configuration | `MTS-001` |
| `MTS-003` | `E00` | Scaffold mobile, API, worker, and shared packages | `MTS-001`, `MTS-002` |
| `MTS-004` | `E00` | Add local PostgreSQL and Azurite development services | `MTS-001` |
| `MTS-005` | `E00` | Implement API and worker health/readiness endpoints | `MTS-003`, `MTS-004` |
| `MTS-006` | `E00` | Create Bicep infrastructure skeleton | `MTS-001` |
| `MTS-007` | `E00` | Establish CI quality gates | `MTS-002`, `MTS-003`, `MTS-004`, `MTS-006` |
| `MTS-008` | `E01` | Implement typed light/dark design tokens | `MTS-003` |
| `MTS-009` | `E01` | Build foundational UI primitives | `MTS-008` |
| `MTS-010` | `E01` | Implement four-tab navigation shell | `MTS-009` |
| `MTS-011` | `E01` | Implement shared motion and haptic services | `MTS-008`, `MTS-009` |
| `MTS-012` | `E01` | Create visual regression and device-size harness | `MTS-009`, `MTS-010` |
| `MTS-013` | `E02` | Define mission series and occurrence types | `MTS-003` |
| `MTS-014` | `E02` | Implement recurrence expansion | `MTS-013` |
| `MTS-015` | `E02` | Implement recurring-series scope operations | `MTS-014` |
| `MTS-016` | `E02` | Implement time-zone and travel rules | `MTS-013` |
| `MTS-017` | `E02` | Implement mission completion eligibility | `MTS-013`, `MTS-016` |
| `MTS-018` | `E02` | Implement XP, proof bonus, and levels | `MTS-013` |
| `MTS-019` | `E02` | Implement streak rules | `MTS-013`, `MTS-016` |
| `MTS-020` | `E02` | Implement domain conflict ordering | `MTS-016` |
| `MTS-021` | `E02` | Implement media-retention calculations | `MTS-016` |
| `MTS-022` | `E03` | Create core PostgreSQL schema and migrations | `MTS-013`, `MTS-014`, `MTS-018`, `MTS-019`, `MTS-021`, `MTS-004` |
| `MTS-023` | `E03` | Define shared API and event contracts | `MTS-003`, `MTS-013` |
| `MTS-024` | `E03` | Implement repositories and transaction runner | `MTS-022`, `MTS-023` |
| `MTS-025` | `E03` | Implement idempotency and transactional outbox | `MTS-022`, `MTS-024` |
| `MTS-026` | `E03` | Implement per-account change log and cursors | `MTS-022`, `MTS-024` |
| `MTS-027` | `E03` | Implement API bootstrap and error mapping | `MTS-005`, `MTS-023`, `MTS-025`, `MTS-026` |
| `MTS-028` | `E04` | Create mobile SQLite schema and migrations | `MTS-013`, `MTS-023` |
| `MTS-029` | `E04` | Implement local repositories and reactive queries | `MTS-028` |
| `MTS-030` | `E04` | Implement optimistic mutation queue | `MTS-020`, `MTS-028`, `MTS-029` |
| `MTS-031` | `E04` | Implement server push/pull synchronization | `MTS-026`, `MTS-027`, `MTS-030` |
| `MTS-032` | `E04` | Implement conflict application and active-work messages | `MTS-020`, `MTS-031`, `MTS-011` |
| `MTS-033` | `E04` | Implement offline Calendar search index | `MTS-028`, `MTS-029` |
| `MTS-034` | `E05` | Implement server provider-token exchange | `MTS-022`, `MTS-023`, `MTS-027` |
| `MTS-035` | `E05` | Implement mobile Apple and Google sign-in | `MTS-010`, `MTS-034` |
| `MTS-036` | `E05` | Implement device session refresh and current-device sign-out | `MTS-028`, `MTS-031`, `MTS-035` |
| `MTS-037` | `E05` | Implement account deletion with recent reauthentication | `MTS-024`, `MTS-025`, `MTS-034`, `MTS-036` |
| `MTS-038` | `E05` | Implement onboarding and permission timing | `MTS-035`, `MTS-009` |
| `MTS-039` | `E05` | Implement device registration and account settings sync | `MTS-031`, `MTS-035` |
| `MTS-040` | `E06` | Build Calendar day shell and seven-day strip | `MTS-009`, `MTS-010`, `MTS-029` |
| `MTS-041` | `E06` | Build timed timeline and current-time ruler | `MTS-040` |
| `MTS-042` | `E06` | Build all-day mission cards and expansion | `MTS-040` |
| `MTS-043` | `E06` | Implement mission-card and overlap layouts | `MTS-041`, `MTS-008` |
| `MTS-044` | `E06` | Implement two-tap slot selection and mission creation | `MTS-041`, `MTS-011` |
| `MTS-045` | `E06` | Implement mission form and validation | `MTS-017`, `MTS-044` |
| `MTS-046` | `E06` | Implement Mission Details state matrix | `MTS-029`, `MTS-045` |
| `MTS-047` | `E06` | Implement drag, resize, snap, save, and Undo | `MTS-041`, `MTS-043`, `MTS-045`, `MTS-011` |
| `MTS-048` | `E06` | Implement mission deletion and duplication | `MTS-045`, `MTS-046`, `MTS-030` |
| `MTS-049` | `E06` | Implement Calendar search UI | `MTS-033`, `MTS-046` |
| `MTS-050` | `E06` | Implement Calendar help bottom sheet | `MTS-009`, `MTS-043` |
| `MTS-051` | `E07` | Build recurrence editor UI | `MTS-014`, `MTS-009`, `MTS-045` |
| `MTS-052` | `E07` | Implement recurring edit/delete/restore scope flows | `MTS-015`, `MTS-051`, `MTS-048` |
| `MTS-053` | `E07` | Implement app time-zone and travel settings behavior | `MTS-016`, `MTS-039`, `MTS-045` |
| `MTS-054` | `E07` | Implement 30-day historical state transitions | `MTS-017`, `MTS-029`, `MTS-046` |
| `MTS-055` | `E07` | Implement imported all-day effort estimation contract | `MTS-017`, `MTS-023` |
| `MTS-056` | `E08` | Implement AI difficulty classification gateway | `MTS-023`, `MTS-018`, `MTS-025` |
| `MTS-057` | `E08` | Implement reward locking and recalculation | `MTS-017`, `MTS-018`, `MTS-024`, `MTS-056` |
| `MTS-058` | `E08` | Implement authoritative completion transaction | `MTS-019`, `MTS-020`, `MTS-024`, `MTS-025`, `MTS-057` |
| `MTS-059` | `E08` | Implement Private and Trust Mode completion | `MTS-039`, `MTS-058`, `MTS-046` |
| `MTS-060` | `E08` | Build Progress screen | `MTS-018`, `MTS-019`, `MTS-029`, `MTS-009` |
| `MTS-061` | `E08` | Implement completion and level-up confirmation motion | `MTS-011`, `MTS-058`, `MTS-060` |
| `MTS-062` | `E09` | Implement notification permission and status UI | `MTS-038`, `MTS-009` |
| `MTS-063` | `E09` | Implement local notification registry and rolling horizon | `MTS-028`, `MTS-029`, `MTS-062` |
| `MTS-064` | `E09` | Implement same-time combined notifications | `MTS-063` |
| `MTS-065` | `E09` | Implement notification rebuild triggers | `MTS-031`, `MTS-053`, `MTS-063` |
| `MTS-066` | `E09` | Validate Android exact-notification path | `MTS-063`, `MTS-065` |
| `MTS-067` | `E10` | Implement shared external-calendar adapter contract | `MTS-023`, `MTS-024` |
| `MTS-068` | `E10` | Build calendar connection direction flow | `MTS-038`, `MTS-067`, `MTS-009` |
| `MTS-069` | `E10` | Implement Google OAuth and connection storage | `MTS-034`, `MTS-067`, `MTS-068` |
| `MTS-070` | `E10` | Implement Google initial and incremental synchronization | `MTS-026`, `MTS-069` |
| `MTS-071` | `E10` | Implement Google watch channels and renewal | `MTS-025`, `MTS-070` |
| `MTS-072` | `E10` | Implement organizer ownership and imported read-only behavior | `MTS-046`, `MTS-067`, `MTS-070` |
| `MTS-073` | `E10` | Implement hidden external events and restoration | `MTS-052`, `MTS-067`, `MTS-070` |
| `MTS-074` | `E10` | Implement external cancellation and completed freeze behavior | `MTS-070`, `MTS-072` |
| `MTS-075` | `E10` | Implement disconnect, permission loss, outage, and reconnect | `MTS-030`, `MTS-068`, `MTS-070` |
| `MTS-076` | `E10` | Implement iOS EventKit native module | `MTS-067`, `MTS-068` |
| `MTS-077` | `E10` | Integrate EventKit changes with mobile sync | `MTS-031`, `MTS-075`, `MTS-076` |
| `MTS-078` | `E11` | Implement protected media upload service | `MTS-025`, `MTS-027`, `MTS-021` |
| `MTS-079` | `E11` | Build camera-only evidence capture and review | `MTS-009`, `MTS-010`, `MTS-078` |
| `MTS-080` | `E11` | Implement evidence-attempt creation and upload | `MTS-017`, `MTS-024`, `MTS-058`, `MTS-078`, `MTS-079` |
| `MTS-081` | `E11` | Implement AI evidence verification and reason codes | `MTS-056`, `MTS-080` |
| `MTS-082` | `E11` | Build evidence result, retry, and self-confirm flows | `MTS-059`, `MTS-080`, `MTS-081` |
| `MTS-083` | `E11` | Implement offline evidence queue and duplicate-completion cleanup | `MTS-030`, `MTS-032`, `MTS-080` |
| `MTS-084` | `E11` | Implement explicit evidence save and early deletion | `MTS-078`, `MTS-082` |
| `MTS-085` | `E11` | Implement product-media cleanup and reconciliation | `MTS-021`, `MTS-025`, `MTS-078` |
| `MTS-086` | `E12` | Build AI Planner input and draft persistence | `MTS-009`, `MTS-028`, `MTS-078` |
| `MTS-087` | `E12` | Implement schedule extraction gateway | `MTS-056`, `MTS-086` |
| `MTS-088` | `E12` | Build Calendar draft preview and editing | `MTS-040`, `MTS-043`, `MTS-045`, `MTS-086`, `MTS-087` |
| `MTS-089` | `E12` | Implement draft replacement and atomic confirmation | `MTS-025`, `MTS-031`, `MTS-088` |
| `MTS-090` | `E13` | Create Story schema and synchronization contracts | `MTS-022`, `MTS-023`, `MTS-031` |
| `MTS-091` | `E13` | Build source-image Story editor | `MTS-009`, `MTS-011`, `MTS-090` |
| `MTS-092` | `E13` | Implement Story text suggestions | `MTS-056`, `MTS-090`, `MTS-091` |
| `MTS-093` | `E13` | Implement Story style-profile setup and management | `MTS-078`, `MTS-092` |
| `MTS-094` | `E13` | Implement AI Story image generation budget and versions | `MTS-025`, `MTS-078`, `MTS-090`, `MTS-093` |
| `MTS-095` | `E13` | Implement independent per-version composition switching | `MTS-091`, `MTS-094` |
| `MTS-096` | `E13` | Implement Story offline saves and multi-device conflicts | `MTS-032`, `MTS-090`, `MTS-095` |
| `MTS-097` | `E13` | Implement Story export, save, and system share | `MTS-091`, `MTS-095` |
| `MTS-098` | `E13` | Implement Instagram Sharing Notes and open flow | `MTS-092`, `MTS-097` |
| `MTS-099` | `E13` | Apply Story and style media retention | `MTS-085`, `MTS-090`, `MTS-093`, `MTS-094` |
| `MTS-100` | `E14` | Build Settings information architecture | `MTS-009`, `MTS-010`, `MTS-039` |
| `MTS-101` | `E14` | Implement English and zh-HK localization | `MTS-023`, `MTS-008` |
| `MTS-102` | `E14` | Implement system appearance, text size, and bold text | `MTS-008`, `MTS-009` |
| `MTS-103` | `E14` | Implement VoiceOver and TalkBack semantics | `MTS-040`, `MTS-046`, `MTS-079`, `MTS-091`, `MTS-100` |
| `MTS-104` | `E14` | Implement Reduce Motion and haptic acceptance | `MTS-011`, `MTS-061`, `MTS-091` |
| `MTS-105` | `E14` | Implement minimal diagnostics with opt-out | `MTS-027`, `MTS-100` |
| `MTS-106` | `E14` | Build feedback and problem-report form | `MTS-078`, `MTS-100`, `MTS-105` |
| `MTS-107` | `E14` | Implement offline feedback draft lifecycle | `MTS-028`, `MTS-036`, `MTS-106` |
| `MTS-108` | `E14` | Implement retained feedback storage and account unlinking | `MTS-024`, `MTS-078`, `MTS-037`, `MTS-106` |
| `MTS-109` | `E14` | Implement Help, short FAQ, privacy/legal, and About screens | `MTS-050`, `MTS-100`, `MTS-101` |
| `MTS-110` | `E15` | Create security threat model and abuse controls | `MTS-027`, `MTS-034`, `MTS-078`, `MTS-105` |
| `MTS-111` | `E15` | Implement API and media security hardening | `MTS-110` |
| `MTS-112` | `E15` | Profile and enforce mobile performance budgets | `MTS-043`, `MTS-047`, `MTS-091`, `MTS-097` |
| `MTS-113` | `E15` | Build full multi-device and offline acceptance suite | `MTS-032`, `MTS-058`, `MTS-083`, `MTS-096` |
| `MTS-114` | `E15` | Verify media and account deletion end to end | `MTS-037`, `MTS-085`, `MTS-099`, `MTS-108` |
| `MTS-115` | `E15` | Complete localization and accessibility acceptance | `MTS-101`, `MTS-102`, `MTS-103`, `MTS-104` |
| `MTS-116` | `E15` | Complete external provider staging verification | `MTS-071`, `MTS-075`, `MTS-077`, `MTS-081`, `MTS-087`, `MTS-094` |
| `MTS-117` | `E15` | Create operational runbooks and observability dashboards | `MTS-025`, `MTS-085`, `MTS-105`, `MTS-116` |
| `MTS-118` | `E15` | Run release-candidate end-to-end suite | `MTS-110`, `MTS-111`, `MTS-112`, `MTS-113`, `MTS-114`, `MTS-115`, `MTS-116`, `MTS-117` |
| `MTS-119` | `E15` | Prepare store, privacy, and production go/no-go packet | `MTS-118` |

---

## 7. Detailed Tickets


# E00 — Foundation and Delivery Toolchain

**Epic outcome:** Create the greenfield monorepo, shared tooling, local services, CI, infrastructure skeleton, and health boundaries without implementing product features.


## MTS-001 — Bootstrap pnpm/Turborepo monorepo

**Depends on:** None  
**Execution mode:** TDD implementation ticket  
**Review gate:** Specification compliance, then code quality

### Goal

Create the repository root, workspace declarations, package boundaries, Node/pnpm pins, Git hygiene, and root scripts.

### Acceptance criteria

- [ ] A clean checkout installs with the pinned pnpm version.
- [ ] Workspace packages are discoverable without npm or Yarn lockfiles.
- [ ] Root format, lint, typecheck, test, build, audit, and infrastructure-validation scripts exist.
- [ ] No product feature code is introduced.

### Required TDD evidence

- [ ] Toolchain smoke test from an empty checkout.
- [ ] Workspace-discovery test.
- [ ] Root script contract test.

### Code-review focus

- Repository topology, version pins, absence of duplicate toolchains.

### Explicitly out of scope

- Any feature or infrastructure side effect not required by this ticket.
- Live production credentials, deployment, store submission, or public activation unless this ticket explicitly states a separately approved staging action.
- Refactoring unrelated modules merely to standardize style.

### Closure evidence

- [ ] Failing test or test fixture recorded before implementation.
- [ ] Focused tests pass.
- [ ] Affected-workspace format, lint, typecheck, and build checks pass.
- [ ] Code-review findings are resolved.
- [ ] Exact Git SHA and verification commands are recorded.


## MTS-002 — Create shared TypeScript, lint, format, and test configuration

**Depends on:** `MTS-001`  
**Execution mode:** TDD implementation ticket  
**Review gate:** Specification compliance, then code quality

### Goal

Create strict shared configuration packages and prohibit cross-package deep imports.

### Acceptance criteria

- [ ] TypeScript strict mode is active in every workspace.
- [ ] ESLint resolves type-aware rules for TypeScript packages.
- [ ] Prettier check is deterministic.
- [ ] Package exports are explicit and deep imports fail lint or tests.

### Required TDD evidence

- [ ] Intentional type-error fixture fails.
- [ ] Package-boundary lint fixture fails.
- [ ] Configuration package unit smoke test.

### Code-review focus

- Strictness, package isolation, Windows/Linux command parity.

### Explicitly out of scope

- Any feature or infrastructure side effect not required by this ticket.
- Live production credentials, deployment, store submission, or public activation unless this ticket explicitly states a separately approved staging action.
- Refactoring unrelated modules merely to standardize style.

### Closure evidence

- [ ] Failing test or test fixture recorded before implementation.
- [ ] Focused tests pass.
- [ ] Affected-workspace format, lint, typecheck, and build checks pass.
- [ ] Code-review findings are resolved.
- [ ] Exact Git SHA and verification commands are recorded.


## MTS-003 — Scaffold mobile, API, worker, and shared packages

**Depends on:** `MTS-001`, `MTS-002`  
**Execution mode:** TDD implementation ticket  
**Review gate:** Specification compliance, then code quality

### Goal

Create buildable shells for Expo mobile, Fastify API, worker, domain, contracts, database, localization, testing, config, and design tokens.

### Acceptance criteria

- [ ] All workspaces build and typecheck.
- [ ] Mobile exposes only the four approved root tabs as placeholders.
- [ ] API and worker start without provider credentials.
- [ ] Domain package has no framework or provider imports.

### Required TDD evidence

- [ ] Workspace build smoke tests.
- [ ] Forbidden-import architecture test.
- [ ] Four-tab route inventory test.

### Code-review focus

- Boundary integrity and no premature feature implementation.

### Explicitly out of scope

- Any feature or infrastructure side effect not required by this ticket.
- Live production credentials, deployment, store submission, or public activation unless this ticket explicitly states a separately approved staging action.
- Refactoring unrelated modules merely to standardize style.

### Closure evidence

- [ ] Failing test or test fixture recorded before implementation.
- [ ] Focused tests pass.
- [ ] Affected-workspace format, lint, typecheck, and build checks pass.
- [ ] Code-review findings are resolved.
- [ ] Exact Git SHA and verification commands are recorded.


## MTS-004 — Add local PostgreSQL and Azurite development services

**Depends on:** `MTS-001`  
**Execution mode:** TDD implementation ticket  
**Review gate:** Specification compliance, then code quality

### Goal

Provide Docker Compose services, environment templates, startup scripts, and deterministic health checks.

### Acceptance criteria

- [ ] PostgreSQL 18 and Azurite start locally.
- [ ] Health scripts fail clearly when a dependency is unavailable.
- [ ] No production credentials are required.
- [ ] Local state can be reset intentionally.

### Required TDD evidence

- [ ] Compose health-check test.
- [ ] Database connectivity integration test.
- [ ] Azurite container test.

### Code-review focus

- Safe defaults, data-reset boundaries, no hidden cloud dependency.

### Explicitly out of scope

- Any feature or infrastructure side effect not required by this ticket.
- Live production credentials, deployment, store submission, or public activation unless this ticket explicitly states a separately approved staging action.
- Refactoring unrelated modules merely to standardize style.

### Closure evidence

- [ ] Failing test or test fixture recorded before implementation.
- [ ] Focused tests pass.
- [ ] Affected-workspace format, lint, typecheck, and build checks pass.
- [ ] Code-review findings are resolved.
- [ ] Exact Git SHA and verification commands are recorded.


## MTS-005 — Implement API and worker health/readiness endpoints

**Depends on:** `MTS-003`, `MTS-004`  
**Execution mode:** TDD implementation ticket  
**Review gate:** Specification compliance, then code quality

### Goal

Add content-free liveness and dependency-aware readiness endpoints.

### Acceptance criteria

- [ ] Liveness does not require database or queue access.
- [ ] Readiness reports stable status codes for required local dependencies.
- [ ] Responses contain no secrets or user content.
- [ ] Worker health is independently observable.

### Required TDD evidence

- [ ] Fastify route tests.
- [ ] Dependency-down readiness tests.
- [ ] Response redaction snapshot.

### Code-review focus

- Correct liveness/readiness semantics and content-free output.

### Explicitly out of scope

- Any feature or infrastructure side effect not required by this ticket.
- Live production credentials, deployment, store submission, or public activation unless this ticket explicitly states a separately approved staging action.
- Refactoring unrelated modules merely to standardize style.

### Closure evidence

- [ ] Failing test or test fixture recorded before implementation.
- [ ] Focused tests pass.
- [ ] Affected-workspace format, lint, typecheck, and build checks pass.
- [ ] Code-review findings are resolved.
- [ ] Exact Git SHA and verification commands are recorded.


## MTS-006 — Create Bicep infrastructure skeleton

**Depends on:** `MTS-001`  
**Execution mode:** TDD implementation ticket  
**Review gate:** Specification compliance, then code quality

### Goal

Define non-deploying Bicep modules and parameter files for the approved Azure topology.

### Acceptance criteria

- [ ] Bicep compiles for development, staging, and production parameter shapes.
- [ ] No deployment is executed.
- [ ] Production network and secret boundaries are represented.
- [ ] Resource names are parameterized.

### Required TDD evidence

- [ ] Bicep build validation.
- [ ] Parameter-shape tests.
- [ ] Static secret scan.

### Code-review focus

- No side effects, least-privilege shape, environment isolation.

### Explicitly out of scope

- Any feature or infrastructure side effect not required by this ticket.
- Live production credentials, deployment, store submission, or public activation unless this ticket explicitly states a separately approved staging action.
- Refactoring unrelated modules merely to standardize style.

### Closure evidence

- [ ] Failing test or test fixture recorded before implementation.
- [ ] Focused tests pass.
- [ ] Affected-workspace format, lint, typecheck, and build checks pass.
- [ ] Code-review findings are resolved.
- [ ] Exact Git SHA and verification commands are recorded.


## MTS-007 — Establish CI quality gates

**Depends on:** `MTS-002`, `MTS-003`, `MTS-004`, `MTS-006`  
**Execution mode:** TDD implementation ticket  
**Review gate:** Specification compliance, then code quality

### Goal

Create GitHub Actions workflows for installation, formatting, lint, typecheck, tests, builds, audit, localization, secret scan, and Bicep compilation.

### Acceptance criteria

- [ ] CI runs from a clean checkout.
- [ ] High/critical dependency findings fail the workflow.
- [ ] No live provider tests run in normal CI.
- [ ] Artifacts and logs exclude secrets.

### Required TDD evidence

- [ ] Workflow syntax validation.
- [ ] Deliberate failing-fixture checks for key gates.
- [ ] Clean-checkout CI rehearsal.

### Code-review focus

- Gate completeness, deterministic caching, no accidental deployments.

### Explicitly out of scope

- Any feature or infrastructure side effect not required by this ticket.
- Live production credentials, deployment, store submission, or public activation unless this ticket explicitly states a separately approved staging action.
- Refactoring unrelated modules merely to standardize style.

### Closure evidence

- [ ] Failing test or test fixture recorded before implementation.
- [ ] Focused tests pass.
- [ ] Affected-workspace format, lint, typecheck, and build checks pass.
- [ ] Code-review findings are resolved.
- [ ] Exact Git SHA and verification commands are recorded.


# E01 — Design System and Mobile Shell

**Epic outcome:** Implement the approved clean mobile visual language, responsive portrait shell, motion foundation, and reusable primitives before feature screens.


## MTS-008 — Implement typed light/dark design tokens

**Depends on:** `MTS-003`  
**Execution mode:** TDD implementation ticket  
**Review gate:** Specification compliance, then code quality

### Goal

Create centralized colour, spacing, radius, typography, elevation, duration, easing, and spring tokens.

### Acceptance criteria

- [ ] Light and dark tokens match the approved visual direction.
- [ ] No screen contains hard-coded visual constants outside approved exceptions.
- [ ] Status colours have explicit light/dark values.
- [ ] Tokens support 360–412 point phone widths.

### Required TDD evidence

- [ ] Token schema tests.
- [ ] Forbidden hard-coded colour lint/test.
- [ ] Contrast baseline checks for ordinary text and controls.

### Code-review focus

- Token consistency, semantic naming, no feature-specific leakage.

### Explicitly out of scope

- Any feature or infrastructure side effect not required by this ticket.
- Live production credentials, deployment, store submission, or public activation unless this ticket explicitly states a separately approved staging action.
- Refactoring unrelated modules merely to standardize style.

### Closure evidence

- [ ] Failing test or test fixture recorded before implementation.
- [ ] Focused tests pass.
- [ ] Affected-workspace format, lint, typecheck, and build checks pass.
- [ ] Code-review findings are resolved.
- [ ] Exact Git SHA and verification commands are recorded.


## MTS-009 — Build foundational UI primitives

**Depends on:** `MTS-008`  
**Execution mode:** TDD implementation ticket  
**Review gate:** Specification compliance, then code quality

### Goal

Implement screen, top bar, buttons, fields, rows, cards, sheets, dialogs, toasts, empty states, and loading skeletons.

### Acceptance criteria

- [ ] Each primitive supports required interaction states.
- [ ] Minimum touch targets are respected.
- [ ] Dynamic Type does not clip critical actions.
- [ ] VoiceOver/TalkBack roles and labels are defined.

### Required TDD evidence

- [ ] Component tests for states.
- [ ] Accessibility-role tests.
- [ ] Large-text snapshots.
- [ ] Light/dark visual snapshots.

### Code-review focus

- API consistency, accessibility, no excessive visual variants.

### Explicitly out of scope

- Any feature or infrastructure side effect not required by this ticket.
- Live production credentials, deployment, store submission, or public activation unless this ticket explicitly states a separately approved staging action.
- Refactoring unrelated modules merely to standardize style.

### Closure evidence

- [ ] Failing test or test fixture recorded before implementation.
- [ ] Focused tests pass.
- [ ] Affected-workspace format, lint, typecheck, and build checks pass.
- [ ] Code-review findings are resolved.
- [ ] Exact Git SHA and verification commands are recorded.


## MTS-010 — Implement four-tab navigation shell

**Depends on:** `MTS-009`  
**Execution mode:** TDD implementation ticket  
**Review gate:** Specification compliance, then code quality

### Goal

Create Calendar, AI Planner, Progress, and Settings tabs with full-screen modal routes for Evidence and Story.

### Acceptance criteria

- [ ] Only four permanent tabs exist.
- [ ] Calendar is the default root.
- [ ] Safe areas and gesture insets are respected.
- [ ] Deleted or invalid deep links fall back safely.

### Required TDD evidence

- [ ] Route inventory test.
- [ ] Tab-navigation component tests.
- [ ] Deep-link fallback test.

### Code-review focus

- No Missions/Stories tab, route simplicity, back-stack correctness.

### Explicitly out of scope

- Any feature or infrastructure side effect not required by this ticket.
- Live production credentials, deployment, store submission, or public activation unless this ticket explicitly states a separately approved staging action.
- Refactoring unrelated modules merely to standardize style.

### Closure evidence

- [ ] Failing test or test fixture recorded before implementation.
- [ ] Focused tests pass.
- [ ] Affected-workspace format, lint, typecheck, and build checks pass.
- [ ] Code-review findings are resolved.
- [ ] Exact Git SHA and verification commands are recorded.


## MTS-011 — Implement shared motion and haptic services

**Depends on:** `MTS-008`, `MTS-009`  
**Execution mode:** TDD implementation ticket  
**Review gate:** Specification compliance, then code quality

### Goal

Create centralized animation helpers, haptic adapter, Reduce Motion mapping, and test fakes.

### Acceptance criteria

- [ ] Animations use centralized timing/easing tokens.
- [ ] Reduce Motion replaces nonessential movement and confetti.
- [ ] No interface sounds are introduced.
- [ ] Haptics respect platform availability.

### Required TDD evidence

- [ ] Motion token tests.
- [ ] Reduce Motion component tests.
- [ ] Haptic adapter unit tests.

### Code-review focus

- No blocking animations, no uncontrolled per-screen timings.

### Explicitly out of scope

- Any feature or infrastructure side effect not required by this ticket.
- Live production credentials, deployment, store submission, or public activation unless this ticket explicitly states a separately approved staging action.
- Refactoring unrelated modules merely to standardize style.

### Closure evidence

- [ ] Failing test or test fixture recorded before implementation.
- [ ] Focused tests pass.
- [ ] Affected-workspace format, lint, typecheck, and build checks pass.
- [ ] Code-review findings are resolved.
- [ ] Exact Git SHA and verification commands are recorded.


## MTS-012 — Create visual regression and device-size harness

**Depends on:** `MTS-009`, `MTS-010`  
**Execution mode:** TDD implementation ticket  
**Review gate:** Specification compliance, then code quality

### Goal

Add screenshot fixtures for approved screens, widths, languages, themes, and text sizes.

### Acceptance criteria

- [ ] Fixtures cover 360×800 and 412×915.
- [ ] Light/dark and English/zh-HK are represented.
- [ ] Large text is included.
- [ ] Platform-specific rendering is compared within platform, not pixel-matched cross-platform.

### Required TDD evidence

- [ ] Automated screenshot generation smoke test.
- [ ] Fixture inventory test.
- [ ] Baseline-update guard.

### Code-review focus

- Stable baselines, intentional-diff process, no brittle cross-platform assertions.

### Explicitly out of scope

- Any feature or infrastructure side effect not required by this ticket.
- Live production credentials, deployment, store submission, or public activation unless this ticket explicitly states a separately approved staging action.
- Refactoring unrelated modules merely to standardize style.

### Closure evidence

- [ ] Failing test or test fixture recorded before implementation.
- [ ] Focused tests pass.
- [ ] Affected-workspace format, lint, typecheck, and build checks pass.
- [ ] Code-review findings are resolved.
- [ ] Exact Git SHA and verification commands are recorded.


# E02 — Pure Domain Kernel

**Epic outcome:** Implement deterministic mission, recurrence, time, eligibility, reward, streak, conflict, and retention rules as framework-free TypeScript.


## MTS-013 — Define mission series and occurrence types

**Depends on:** `MTS-003`  
**Execution mode:** TDD implementation ticket  
**Review gate:** Specification compliance, then code quality

### Goal

Create canonical domain types, state dimensions, invariants, and value-object validation.

### Acceptance criteria

- [ ] Series and occurrence are separate.
- [ ] Completion/evidence/reward/Story are occurrence-specific.
- [ ] One-time missions use a nonrecurring series.
- [ ] No overloaded single status enum exists.

### Required TDD evidence

- [ ] Type-level contract tests.
- [ ] Invariant validation tests.
- [ ] Invalid-state construction tests.

### Code-review focus

- No provider/database concerns in domain types.

### Explicitly out of scope

- Any feature or infrastructure side effect not required by this ticket.
- Live production credentials, deployment, store submission, or public activation unless this ticket explicitly states a separately approved staging action.
- Refactoring unrelated modules merely to standardize style.

### Closure evidence

- [ ] Failing test or test fixture recorded before implementation.
- [ ] Focused tests pass.
- [ ] Affected-workspace format, lint, typecheck, and build checks pass.
- [ ] Code-review findings are resolved.
- [ ] Exact Git SHA and verification commands are recorded.


## MTS-014 — Implement recurrence expansion

**Depends on:** `MTS-013`  
**Execution mode:** TDD implementation ticket  
**Review gate:** Specification compliance, then code quality

### Goal

Expand daily, weekly, monthly-date, monthly-ordinal, yearly-date, and yearly-ordinal rules in bounded windows.

### Acceptance criteria

- [ ] Intervals and selected weekdays work.
- [ ] Invalid 29/30/31 and Feb 29 dates are skipped.
- [ ] Skipped dates do not count toward count endings.
- [ ] Date endings are inclusive.

### Required TDD evidence

- [ ] Comprehensive recurrence corpus.
- [ ] DST-adjacent recurrence tests.
- [ ] Count-ending property tests.

### Code-review focus

- Determinism, bounded generation, no advanced exception dates.

### Explicitly out of scope

- Any feature or infrastructure side effect not required by this ticket.
- Live production credentials, deployment, store submission, or public activation unless this ticket explicitly states a separately approved staging action.
- Refactoring unrelated modules merely to standardize style.

### Closure evidence

- [ ] Failing test or test fixture recorded before implementation.
- [ ] Focused tests pass.
- [ ] Affected-workspace format, lint, typecheck, and build checks pass.
- [ ] Code-review findings are resolved.
- [ ] Exact Git SHA and verification commands are recorded.


## MTS-015 — Implement recurring-series scope operations

**Depends on:** `MTS-014`  
**Execution mode:** TDD implementation ticket  
**Review gate:** Specification compliance, then code quality

### Goal

Implement this occurrence, this-and-future, and entire-series edit/delete split semantics.

### Acceptance criteria

- [ ] Past completed occurrences remain unchanged.
- [ ] This-and-future creates a valid split boundary.
- [ ] Deleted occurrence identifiers remain retired.
- [ ] Evidence/completion never propagates across occurrences.

### Required TDD evidence

- [ ] Scope matrix tests.
- [ ] Completed-history preservation tests.
- [ ] Split-boundary recurrence tests.

### Code-review focus

- No history rewrite, stable identifiers.

### Explicitly out of scope

- Any feature or infrastructure side effect not required by this ticket.
- Live production credentials, deployment, store submission, or public activation unless this ticket explicitly states a separately approved staging action.
- Refactoring unrelated modules merely to standardize style.

### Closure evidence

- [ ] Failing test or test fixture recorded before implementation.
- [ ] Focused tests pass.
- [ ] Affected-workspace format, lint, typecheck, and build checks pass.
- [ ] Code-review findings are resolved.
- [ ] Exact Git SHA and verification commands are recorded.


## MTS-016 — Implement time-zone and travel rules

**Depends on:** `MTS-013`  
**Execution mode:** TDD implementation ticket  
**Review gate:** Specification compliance, then code quality

### Goal

Model IANA zones, UTC instants, local-time vs fixed-instant behavior, all-day boundaries, and silent clock validation.

### Acceptance criteria

- [ ] Lateness compares absolute timestamps.
- [ ] Local-time missions keep wall-clock time during travel.
- [ ] Fixed-instant events keep their instant.
- [ ] Invalid device time silently falls back to server receipt time.

### Required TDD evidence

- [ ] IANA/DST corpus.
- [ ] Travel behavior tests.
- [ ] Clock validation tests.
- [ ] All-day end-boundary tests.

### Code-review focus

- No country-only time zones, no prior streak recalculation.

### Explicitly out of scope

- Any feature or infrastructure side effect not required by this ticket.
- Live production credentials, deployment, store submission, or public activation unless this ticket explicitly states a separately approved staging action.
- Refactoring unrelated modules merely to standardize style.

### Closure evidence

- [ ] Failing test or test fixture recorded before implementation.
- [ ] Focused tests pass.
- [ ] Affected-workspace format, lint, typecheck, and build checks pass.
- [ ] Code-review findings are resolved.
- [ ] Exact Git SHA and verification commands are recorded.


## MTS-017 — Implement mission completion eligibility

**Depends on:** `MTS-013`, `MTS-016`  
**Execution mode:** TDD implementation ticket  
**Review gate:** Specification compliance, then code quality

### Goal

Implement future blocking, start-time availability, exact 30-day expiry, historical creation/move rules, and permanent XP ineligibility.

### Acceptance criteria

- [ ] Completion opens at scheduled start.
- [ ] Expiry is exact finish plus 30 days.
- [ ] Past creation/move is allowed only within the window and yields permanent 0 XP.
- [ ] After expiry the mission is read-only but deletable/duplicable.

### Required TDD evidence

- [ ] Boundary tests at exact timestamps.
- [ ] All-day eligibility tests.
- [ ] Permanent XP-ineligibility tests.

### Code-review focus

- Exact inequalities and no hidden grace periods.

### Explicitly out of scope

- Any feature or infrastructure side effect not required by this ticket.
- Live production credentials, deployment, store submission, or public activation unless this ticket explicitly states a separately approved staging action.
- Refactoring unrelated modules merely to standardize style.

### Closure evidence

- [ ] Failing test or test fixture recorded before implementation.
- [ ] Focused tests pass.
- [ ] Affected-workspace format, lint, typecheck, and build checks pass.
- [ ] Code-review findings are resolved.
- [ ] Exact Git SHA and verification commands are recorded.


## MTS-018 — Implement XP, proof bonus, and levels

**Depends on:** `MTS-013`  
**Execution mode:** TDD implementation ticket  
**Review gate:** Specification compliance, then code quality

### Goal

Implement approved XP formula, rounding, caps, proof bonus, and unlimited level thresholds.

### Acceptance criteria

- [ ] Easy/Normal/Hard multipliers are exact.
- [ ] XP rounds to nearest five and caps at 250 base.
- [ ] Accepted late evidence still earns 15% bonus.
- [ ] Final level calculation handles multi-level gains.

### Required TDD evidence

- [ ] Formula table tests.
- [ ] Rounding/cap edge tests.
- [ ] Multi-level progression tests.

### Code-review focus

- No spendable currency or alternate reward path.

### Explicitly out of scope

- Any feature or infrastructure side effect not required by this ticket.
- Live production credentials, deployment, store submission, or public activation unless this ticket explicitly states a separately approved staging action.
- Refactoring unrelated modules merely to standardize style.

### Closure evidence

- [ ] Failing test or test fixture recorded before implementation.
- [ ] Focused tests pass.
- [ ] Affected-workspace format, lint, typecheck, and build checks pass.
- [ ] Code-review findings are resolved.
- [ ] Exact Git SHA and verification commands are recorded.


## MTS-019 — Implement streak rules

**Depends on:** `MTS-013`, `MTS-016`  
**Execution mode:** TDD implementation ticket  
**Review gate:** Specification compliance, then code quality

### Goal

Implement scheduled-day continuation, unscheduled-day pause, day finalization, and pending offline evidence protection.

### Acceptance criteria

- [ ] At least one valid completion continues a scheduled day.
- [ ] No scheduled missions pauses.
- [ ] A finalized past day cannot be repaired.
- [ ] Pending evidence is temporary, not permanent credit.

### Required TDD evidence

- [ ] Day-state matrix.
- [ ] Time-zone change tests.
- [ ] Offline pending/failure tests.

### Code-review focus

- No retroactive streak rewrite.

### Explicitly out of scope

- Any feature or infrastructure side effect not required by this ticket.
- Live production credentials, deployment, store submission, or public activation unless this ticket explicitly states a separately approved staging action.
- Refactoring unrelated modules merely to standardize style.

### Closure evidence

- [ ] Failing test or test fixture recorded before implementation.
- [ ] Focused tests pass.
- [ ] Affected-workspace format, lint, typecheck, and build checks pass.
- [ ] Code-review findings are resolved.
- [ ] Exact Git SHA and verification commands are recorded.


## MTS-020 — Implement domain conflict ordering

**Depends on:** `MTS-016`  
**Execution mode:** TDD implementation ticket  
**Review gate:** Specification compliance, then code quality

### Goal

Implement latest-valid-save, deletion-wins, first-completion-wins, and Story latest-save rules.

### Acceptance criteria

- [ ] No field merge occurs.
- [ ] Deletion wins regardless of earlier offline edit time.
- [ ] First server-accepted completion is authoritative.
- [ ] Story conflict clears local undo history at the application boundary.

### Required TDD evidence

- [ ] Conflict permutation tests.
- [ ] Clock-fallback conflict tests.
- [ ] Tombstone property tests.

### Code-review focus

- Deterministic ordering and stable reason codes.

### Explicitly out of scope

- Any feature or infrastructure side effect not required by this ticket.
- Live production credentials, deployment, store submission, or public activation unless this ticket explicitly states a separately approved staging action.
- Refactoring unrelated modules merely to standardize style.

### Closure evidence

- [ ] Failing test or test fixture recorded before implementation.
- [ ] Focused tests pass.
- [ ] Affected-workspace format, lint, typecheck, and build checks pass.
- [ ] Code-review findings are resolved.
- [ ] Exact Git SHA and verification commands are recorded.


## MTS-021 — Implement media-retention calculations

**Depends on:** `MTS-016`  
**Execution mode:** TDD implementation ticket  
**Review gate:** Specification compliance, then code quality

### Goal

Create pure functions for product-media deletion deadlines and feedback-retention classification.

### Acceptance criteria

- [ ] Product media receives the approved 30-day deadline.
- [ ] Feedback media is classified outside product-media cleanup.
- [ ] Deletion due-state is deterministic.
- [ ] No Story deletion notice is generated.

### Required TDD evidence

- [ ] Deadline tests.
- [ ] Purpose-classification tests.
- [ ] Time-travel tests.

### Code-review focus

- No storage-provider code in domain package.

### Explicitly out of scope

- Any feature or infrastructure side effect not required by this ticket.
- Live production credentials, deployment, store submission, or public activation unless this ticket explicitly states a separately approved staging action.
- Refactoring unrelated modules merely to standardize style.

### Closure evidence

- [ ] Failing test or test fixture recorded before implementation.
- [ ] Focused tests pass.
- [ ] Affected-workspace format, lint, typecheck, and build checks pass.
- [ ] Code-review findings are resolved.
- [ ] Exact Git SHA and verification commands are recorded.


# E03 — Database, Contracts, and Server State

**Epic outcome:** Create authoritative persistence, transactions, outbox, idempotency, change log, and API error contracts.


## MTS-022 — Create core PostgreSQL schema and migrations

**Depends on:** `MTS-013`, `MTS-014`, `MTS-018`, `MTS-019`, `MTS-021`, `MTS-004`  
**Execution mode:** TDD implementation ticket  
**Review gate:** Specification compliance, then code quality

### Goal

Create the principal tables, indexes, foreign keys, uniqueness constraints, and migration test harness.

### Acceptance criteria

- [ ] Schema covers every table named in the technical specification.
- [ ] Unique completion, reward, Story draft, and account/provider constraints exist.
- [ ] Tombstones cannot be silently removed by ordinary repositories.
- [ ] Migrations apply from empty database.

### Required TDD evidence

- [ ] Migration integration test.
- [ ] Constraint tests.
- [ ] Schema drift check.

### Code-review focus

- Constraint correctness, deletion behavior, no content in indexed diagnostics.

### Explicitly out of scope

- Any feature or infrastructure side effect not required by this ticket.
- Live production credentials, deployment, store submission, or public activation unless this ticket explicitly states a separately approved staging action.
- Refactoring unrelated modules merely to standardize style.

### Closure evidence

- [ ] Failing test or test fixture recorded before implementation.
- [ ] Focused tests pass.
- [ ] Affected-workspace format, lint, typecheck, and build checks pass.
- [ ] Code-review findings are resolved.
- [ ] Exact Git SHA and verification commands are recorded.


## MTS-023 — Define shared API and event contracts

**Depends on:** `MTS-003`, `MTS-013`  
**Execution mode:** TDD implementation ticket  
**Review gate:** Specification compliance, then code quality

### Goal

Create versioned Zod schemas for requests, responses, sync changes, commands, errors, and outbox events.

### Acceptance criteria

- [ ] Contracts are exported through explicit entry points.
- [ ] Unknown fields and invalid enums are rejected as intended.
- [ ] Stable client-action error codes exist.
- [ ] Provider-private fields do not leak into mobile contracts.

### Required TDD evidence

- [ ] Schema parse tests.
- [ ] Backward-compatibility snapshots.
- [ ] Sensitive-field exclusion tests.

### Code-review focus

- Versioning, privacy, mobile-safe payloads.

### Explicitly out of scope

- Any feature or infrastructure side effect not required by this ticket.
- Live production credentials, deployment, store submission, or public activation unless this ticket explicitly states a separately approved staging action.
- Refactoring unrelated modules merely to standardize style.

### Closure evidence

- [ ] Failing test or test fixture recorded before implementation.
- [ ] Focused tests pass.
- [ ] Affected-workspace format, lint, typecheck, and build checks pass.
- [ ] Code-review findings are resolved.
- [ ] Exact Git SHA and verification commands are recorded.


## MTS-024 — Implement repositories and transaction runner

**Depends on:** `MTS-022`, `MTS-023`  
**Execution mode:** TDD implementation ticket  
**Review gate:** Specification compliance, then code quality

### Goal

Create repositories for accounts, missions, notes, completions, rewards, streaks, Stories, planner drafts, media, feedback, and external links.

### Acceptance criteria

- [ ] Repositories require an explicit transaction where invariants span tables.
- [ ] Completed occurrence mutation is blocked.
- [ ] Tombstone checks are centralized.
- [ ] Queries are account-scoped.

### Required TDD evidence

- [ ] Repository integration tests.
- [ ] Cross-account isolation tests.
- [ ] Completed-immutability tests.

### Code-review focus

- No business rules duplicated in SQL callers.

### Explicitly out of scope

- Any feature or infrastructure side effect not required by this ticket.
- Live production credentials, deployment, store submission, or public activation unless this ticket explicitly states a separately approved staging action.
- Refactoring unrelated modules merely to standardize style.

### Closure evidence

- [ ] Failing test or test fixture recorded before implementation.
- [ ] Focused tests pass.
- [ ] Affected-workspace format, lint, typecheck, and build checks pass.
- [ ] Code-review findings are resolved.
- [ ] Exact Git SHA and verification commands are recorded.


## MTS-025 — Implement idempotency and transactional outbox

**Depends on:** `MTS-022`, `MTS-024`  
**Execution mode:** TDD implementation ticket  
**Review gate:** Specification compliance, then code quality

### Goal

Add idempotency-key handling, outbox writes in domain transactions, dispatch claims, retries, and dead-letter classification.

### Acceptance criteria

- [ ] Replayed commands return the original stable result.
- [ ] Committed state cannot lose required asynchronous work.
- [ ] Consumers may safely retry.
- [ ] Outbox payloads exclude raw user content unless the specific worker requires a protected reference.

### Required TDD evidence

- [ ] Concurrent idempotency tests.
- [ ] Crash-between-commit-and-publish test.
- [ ] Consumer replay tests.

### Code-review focus

- Atomicity, bounded retries, content minimization.

### Explicitly out of scope

- Any feature or infrastructure side effect not required by this ticket.
- Live production credentials, deployment, store submission, or public activation unless this ticket explicitly states a separately approved staging action.
- Refactoring unrelated modules merely to standardize style.

### Closure evidence

- [ ] Failing test or test fixture recorded before implementation.
- [ ] Focused tests pass.
- [ ] Affected-workspace format, lint, typecheck, and build checks pass.
- [ ] Code-review findings are resolved.
- [ ] Exact Git SHA and verification commands are recorded.


## MTS-026 — Implement per-account change log and cursors

**Depends on:** `MTS-022`, `MTS-024`  
**Execution mode:** TDD implementation ticket  
**Review gate:** Specification compliance, then code quality

### Goal

Create monotonic account change sequencing, tombstone changes, cursor pull, snapshot fallback, and cursor expiry policy.

### Acceptance criteria

- [ ] Changes are ordered and account-isolated.
- [ ] Tombstones are delivered.
- [ ] Initial snapshot and incremental pull converge.
- [ ] Expired cursor returns a controlled snapshot-required response.

### Required TDD evidence

- [ ] Sequence concurrency tests.
- [ ] Cursor replay tests.
- [ ] Snapshot convergence test.

### Code-review focus

- Ordering, pagination, no unbounded response.

### Explicitly out of scope

- Any feature or infrastructure side effect not required by this ticket.
- Live production credentials, deployment, store submission, or public activation unless this ticket explicitly states a separately approved staging action.
- Refactoring unrelated modules merely to standardize style.

### Closure evidence

- [ ] Failing test or test fixture recorded before implementation.
- [ ] Focused tests pass.
- [ ] Affected-workspace format, lint, typecheck, and build checks pass.
- [ ] Code-review findings are resolved.
- [ ] Exact Git SHA and verification commands are recorded.


## MTS-027 — Implement API bootstrap and error mapping

**Depends on:** `MTS-005`, `MTS-023`, `MTS-025`, `MTS-026`  
**Execution mode:** TDD implementation ticket  
**Review gate:** Specification compliance, then code quality

### Goal

Add versioned Fastify routing, authentication hooks, request correlation, validation, stable error mapping, and content-free logging.

### Acceptance criteria

- [ ] All routes are under `/v1`.
- [ ] Validation failures use stable codes.
- [ ] Authorization occurs before disclosing resource existence.
- [ ] Content-bearing bodies are not logged.

### Required TDD evidence

- [ ] Route registration tests.
- [ ] Error snapshot tests.
- [ ] Unauthorized enumeration tests.
- [ ] Logging redaction tests.

### Code-review focus

- Fail-closed defaults and no raw stack/provider leakage.

### Explicitly out of scope

- Any feature or infrastructure side effect not required by this ticket.
- Live production credentials, deployment, store submission, or public activation unless this ticket explicitly states a separately approved staging action.
- Refactoring unrelated modules merely to standardize style.

### Closure evidence

- [ ] Failing test or test fixture recorded before implementation.
- [ ] Focused tests pass.
- [ ] Affected-workspace format, lint, typecheck, and build checks pass.
- [ ] Code-review findings are resolved.
- [ ] Exact Git SHA and verification commands are recorded.


# E04 — Mobile Local-First Storage and Sync

**Epic outcome:** Make SQLite the mobile read model and implement optimistic mutations, incremental sync, offline search, and conflict application.


## MTS-028 — Create mobile SQLite schema and migrations

**Depends on:** `MTS-013`, `MTS-023`  
**Execution mode:** TDD implementation ticket  
**Review gate:** Specification compliance, then code quality

### Goal

Create local tables for cached entities, drafts, search, cursors, mutation queue, and notification registry.

### Acceptance criteria

- [ ] Migrations are versioned and transactional.
- [ ] Account-specific data can be wiped on sign-out.
- [ ] Searchable content is isolated per account.
- [ ] Schema supports one active Planner draft and one Story draft per occurrence.

### Required TDD evidence

- [ ] Migration tests.
- [ ] Sign-out wipe test.
- [ ] Schema constraint tests.

### Code-review focus

- No secrets in ordinary SQLite; secure material stays in SecureStore.

### Explicitly out of scope

- Any feature or infrastructure side effect not required by this ticket.
- Live production credentials, deployment, store submission, or public activation unless this ticket explicitly states a separately approved staging action.
- Refactoring unrelated modules merely to standardize style.

### Closure evidence

- [ ] Failing test or test fixture recorded before implementation.
- [ ] Focused tests pass.
- [ ] Affected-workspace format, lint, typecheck, and build checks pass.
- [ ] Code-review findings are resolved.
- [ ] Exact Git SHA and verification commands are recorded.


## MTS-029 — Implement local repositories and reactive queries

**Depends on:** `MTS-028`  
**Execution mode:** TDD implementation ticket  
**Review gate:** Specification compliance, then code quality

### Goal

Create SQLite repositories and observable query hooks for Calendar, Mission Details, Progress, Settings, drafts, and search.

### Acceptance criteria

- [ ] Screens render from SQLite without waiting for network.
- [ ] Repositories expose typed models, not raw rows.
- [ ] Queries are date-window bounded.
- [ ] Deleted/tombstoned rows disappear or show history according to policy.

### Required TDD evidence

- [ ] Repository integration tests.
- [ ] Reactive update tests.
- [ ] Date-window query tests.

### Code-review focus

- No domain logic embedded in UI hooks.

### Explicitly out of scope

- Any feature or infrastructure side effect not required by this ticket.
- Live production credentials, deployment, store submission, or public activation unless this ticket explicitly states a separately approved staging action.
- Refactoring unrelated modules merely to standardize style.

### Closure evidence

- [ ] Failing test or test fixture recorded before implementation.
- [ ] Focused tests pass.
- [ ] Affected-workspace format, lint, typecheck, and build checks pass.
- [ ] Code-review findings are resolved.
- [ ] Exact Git SHA and verification commands are recorded.


## MTS-030 — Implement optimistic mutation queue

**Depends on:** `MTS-020`, `MTS-028`, `MTS-029`  
**Execution mode:** TDD implementation ticket  
**Review gate:** Specification compliance, then code quality

### Goal

Insert local state and mutation envelopes in one SQLite transaction and provide ordered retry processing.

### Acceptance criteria

- [ ] Offline create/edit/delete works.
- [ ] Mutation IDs are stable across retries.
- [ ] Queue survives app restart.
- [ ] Provider-disconnect can discard queued external commands without deleting internal state.

### Required TDD evidence

- [ ] Crash/restart tests.
- [ ] Ordering tests.
- [ ] Disconnect discard tests.

### Code-review focus

- Atomic local writes and bounded retry behavior.

### Explicitly out of scope

- Any feature or infrastructure side effect not required by this ticket.
- Live production credentials, deployment, store submission, or public activation unless this ticket explicitly states a separately approved staging action.
- Refactoring unrelated modules merely to standardize style.

### Closure evidence

- [ ] Failing test or test fixture recorded before implementation.
- [ ] Focused tests pass.
- [ ] Affected-workspace format, lint, typecheck, and build checks pass.
- [ ] Code-review findings are resolved.
- [ ] Exact Git SHA and verification commands are recorded.


## MTS-031 — Implement server push/pull synchronization

**Depends on:** `MTS-026`, `MTS-027`, `MTS-030`  
**Execution mode:** TDD implementation ticket  
**Review gate:** Specification compliance, then code quality

### Goal

Implement authenticated sync push, pull, snapshot recovery, cursor storage, and batching.

### Acceptance criteria

- [ ] Accepted mutations settle locally.
- [ ] Authoritative changes apply in order.
- [ ] Cursor advances only after successful local transaction.
- [ ] Snapshot recovery preserves unsent mutations safely.

### Required TDD evidence

- [ ] Offline-to-online integration test.
- [ ] Cursor crash recovery.
- [ ] Batch pagination tests.

### Code-review focus

- No lost mutations, no cursor leap.

### Explicitly out of scope

- Any feature or infrastructure side effect not required by this ticket.
- Live production credentials, deployment, store submission, or public activation unless this ticket explicitly states a separately approved staging action.
- Refactoring unrelated modules merely to standardize style.

### Closure evidence

- [ ] Failing test or test fixture recorded before implementation.
- [ ] Focused tests pass.
- [ ] Affected-workspace format, lint, typecheck, and build checks pass.
- [ ] Code-review findings are resolved.
- [ ] Exact Git SHA and verification commands are recorded.


## MTS-032 — Implement conflict application and active-work messages

**Depends on:** `MTS-020`, `MTS-031`, `MTS-011`  
**Execution mode:** TDD implementation ticket  
**Review gate:** Specification compliance, then code quality

### Goal

Apply server conflict results and show messages only when active user work is changed, deleted, or superseded.

### Acceptance criteria

- [ ] Mission, deletion, completion, and Story messages match approved copy.
- [ ] Silent background progress updates remain silent.
- [ ] Losing Story undo history clears.
- [ ] Duplicate evidence working files are deleted.

### Required TDD evidence

- [ ] Conflict UI tests.
- [ ] Silent-sync tests.
- [ ] Temporary-file cleanup tests.

### Code-review focus

- No generic conflict screen or automatic field merge.

### Explicitly out of scope

- Any feature or infrastructure side effect not required by this ticket.
- Live production credentials, deployment, store submission, or public activation unless this ticket explicitly states a separately approved staging action.
- Refactoring unrelated modules merely to standardize style.

### Closure evidence

- [ ] Failing test or test fixture recorded before implementation.
- [ ] Focused tests pass.
- [ ] Affected-workspace format, lint, typecheck, and build checks pass.
- [ ] Code-review findings are resolved.
- [ ] Exact Git SHA and verification commands are recorded.


## MTS-033 — Implement offline Calendar search index

**Depends on:** `MTS-028`, `MTS-029`  
**Execution mode:** TDD implementation ticket  
**Review gate:** Specification compliance, then code quality

### Goal

Create SQLite FTS indexing for titles, locations, allowed provider text, and personal notes.

### Acceptance criteria

- [ ] Search works offline.
- [ ] Personal-note excerpts appear only in results.
- [ ] Closing search clears query/results.
- [ ] No recent-search history is stored.

### Required TDD evidence

- [ ] FTS matching tests.
- [ ] Privacy display tests.
- [ ] Offline/online refresh tests.

### Code-review focus

- No main-Calendar note leakage.

### Explicitly out of scope

- Any feature or infrastructure side effect not required by this ticket.
- Live production credentials, deployment, store submission, or public activation unless this ticket explicitly states a separately approved staging action.
- Refactoring unrelated modules merely to standardize style.

### Closure evidence

- [ ] Failing test or test fixture recorded before implementation.
- [ ] Focused tests pass.
- [ ] Affected-workspace format, lint, typecheck, and build checks pass.
- [ ] Code-review findings are resolved.
- [ ] Exact Git SHA and verification commands are recorded.


# E05 — Authentication, Onboarding, and Account Lifecycle

**Epic outcome:** Implement immutable Apple/Google identity binding, automatic sign-in, per-device sessions, onboarding permissions, sign-out, and account deletion.


## MTS-034 — Implement server provider-token exchange

**Depends on:** `MTS-022`, `MTS-023`, `MTS-027`  
**Execution mode:** TDD implementation ticket  
**Review gate:** Specification compliance, then code quality

### Goal

Validate Apple and Google proofs and issue app access/rotating refresh tokens bound to provider subject.

### Acceptance criteria

- [ ] Provider email is not the identity key.
- [ ] Issuer, audience, nonce, signature, and freshness are validated.
- [ ] Refresh tokens are stored hashed and rotated.
- [ ] Rotated-token reuse revokes the session family.

### Required TDD evidence

- [ ] Provider fake tests.
- [ ] Nonce/replay tests.
- [ ] Refresh rotation concurrency tests.

### Code-review focus

- Account takeover resistance and no manual merge path.

### Explicitly out of scope

- Any feature or infrastructure side effect not required by this ticket.
- Live production credentials, deployment, store submission, or public activation unless this ticket explicitly states a separately approved staging action.
- Refactoring unrelated modules merely to standardize style.

### Closure evidence

- [ ] Failing test or test fixture recorded before implementation.
- [ ] Focused tests pass.
- [ ] Affected-workspace format, lint, typecheck, and build checks pass.
- [ ] Code-review findings are resolved.
- [ ] Exact Git SHA and verification commands are recorded.


## MTS-035 — Implement mobile Apple and Google sign-in

**Depends on:** `MTS-010`, `MTS-034`  
**Execution mode:** TDD implementation ticket  
**Review gate:** Specification compliance, then code quality

### Goal

Add provider sign-in UI, exchange, SecureStore session persistence, and automatic sign-in.

### Acceptance criteria

- [ ] No guest path exists.
- [ ] One account is active per device.
- [ ] Session restores silently when valid.
- [ ] Provider errors are localized and nontechnical.

### Required TDD evidence

- [ ] Component tests.
- [ ] Session restoration test.
- [ ] Provider cancellation test.

### Code-review focus

- No account switcher or provider relinking.

### Explicitly out of scope

- Any feature or infrastructure side effect not required by this ticket.
- Live production credentials, deployment, store submission, or public activation unless this ticket explicitly states a separately approved staging action.
- Refactoring unrelated modules merely to standardize style.

### Closure evidence

- [ ] Failing test or test fixture recorded before implementation.
- [ ] Focused tests pass.
- [ ] Affected-workspace format, lint, typecheck, and build checks pass.
- [ ] Code-review findings are resolved.
- [ ] Exact Git SHA and verification commands are recorded.


## MTS-036 — Implement device session refresh and current-device sign-out

**Depends on:** `MTS-028`, `MTS-031`, `MTS-035`  
**Execution mode:** TDD implementation ticket  
**Review gate:** Specification compliance, then code quality

### Goal

Implement rotating refresh, session expiry, current-device revocation, local wipe, notification cancellation hook, and external-link preservation.

### Acceptance criteria

- [ ] Sign-out affects only the current device.
- [ ] All account-specific local data and unsent feedback draft are removed.
- [ ] Server account data and calendar connection remain.
- [ ] Future notifications are cancelled.

### Required TDD evidence

- [ ] Refresh race tests.
- [ ] Sign-out wipe integration test.
- [ ] Other-device session survival test.

### Code-review focus

- Secure deletion order and no leftover private files.

### Explicitly out of scope

- Any feature or infrastructure side effect not required by this ticket.
- Live production credentials, deployment, store submission, or public activation unless this ticket explicitly states a separately approved staging action.
- Refactoring unrelated modules merely to standardize style.

### Closure evidence

- [ ] Failing test or test fixture recorded before implementation.
- [ ] Focused tests pass.
- [ ] Affected-workspace format, lint, typecheck, and build checks pass.
- [ ] Code-review findings are resolved.
- [ ] Exact Git SHA and verification commands are recorded.


## MTS-037 — Implement account deletion with recent reauthentication

**Depends on:** `MTS-024`, `MTS-025`, `MTS-034`, `MTS-036`  
**Execution mode:** TDD implementation ticket  
**Review gate:** Specification compliance, then code quality

### Goal

Implement five-minute reauthentication proof, all-session revocation, product-data deletion, provider disconnect command, and feedback unlinking.

### Acceptance criteria

- [ ] Deletion is immediate and irreversible.
- [ ] External events remain unchanged.
- [ ] Product media and app data are scheduled/deleted according to policy.
- [ ] Retained feedback has no account identifier afterward.

### Required TDD evidence

- [ ] Account-deletion transaction test.
- [ ] All-session invalidation test.
- [ ] Feedback-retention unlink test.
- [ ] External-event preservation test.

### Code-review focus

- Privacy exception correctness and failure recovery.

### Explicitly out of scope

- Any feature or infrastructure side effect not required by this ticket.
- Live production credentials, deployment, store submission, or public activation unless this ticket explicitly states a separately approved staging action.
- Refactoring unrelated modules merely to standardize style.

### Closure evidence

- [ ] Failing test or test fixture recorded before implementation.
- [ ] Focused tests pass.
- [ ] Affected-workspace format, lint, typecheck, and build checks pass.
- [ ] Code-review findings are resolved.
- [ ] Exact Git SHA and verification commands are recorded.


## MTS-038 — Implement onboarding and permission timing

**Depends on:** `MTS-035`, `MTS-009`  
**Execution mode:** TDD implementation ticket  
**Review gate:** Specification compliance, then code quality

### Goal

Build authentication-following onboarding, notification choice, optional calendar connection entry, and permission deferral.

### Acceptance criteria

- [ ] Camera is not requested.
- [ ] Photo save permission is not requested.
- [ ] Calendar access is requested only after provider choice.
- [ ] Diagnostics notice is not shown.
- [ ] Calendar opens after completion.

### Required TDD evidence

- [ ] Permission timing tests.
- [ ] Denied/not-now paths.
- [ ] Onboarding resume test.

### Code-review focus

- No permission bundling or coercive copy.

### Explicitly out of scope

- Any feature or infrastructure side effect not required by this ticket.
- Live production credentials, deployment, store submission, or public activation unless this ticket explicitly states a separately approved staging action.
- Refactoring unrelated modules merely to standardize style.

### Closure evidence

- [ ] Failing test or test fixture recorded before implementation.
- [ ] Focused tests pass.
- [ ] Affected-workspace format, lint, typecheck, and build checks pass.
- [ ] Code-review findings are resolved.
- [ ] Exact Git SHA and verification commands are recorded.


## MTS-039 — Implement device registration and account settings sync

**Depends on:** `MTS-031`, `MTS-035`  
**Execution mode:** TDD implementation ticket  
**Review gate:** Specification compliance, then code quality

### Goal

Register device identity, platform/app metadata, notification capability, and synchronize account-level settings.

### Acceptance criteria

- [ ] Device IDs are stable per installation/account session as designed.
- [ ] Trust Mode and app-language settings sync.
- [ ] Device-local permissions remain device-local.
- [ ] No precise location is collected.

### Required TDD evidence

- [ ] Device registration tests.
- [ ] Multi-device settings tests.
- [ ] Privacy payload snapshot.

### Code-review focus

- Correct split between account and device state.

### Explicitly out of scope

- Any feature or infrastructure side effect not required by this ticket.
- Live production credentials, deployment, store submission, or public activation unless this ticket explicitly states a separately approved staging action.
- Refactoring unrelated modules merely to standardize style.

### Closure evidence

- [ ] Failing test or test fixture recorded before implementation.
- [ ] Focused tests pass.
- [ ] Affected-workspace format, lint, typecheck, and build checks pass.
- [ ] Code-review findings are resolved.
- [ ] Exact Git SHA and verification commands are recorded.


# E06 — Internal Calendar and Mission UX

**Epic outcome:** Build the primary Calendar experience, manual mission flows, Mission Details, search, help, overlap handling, and historical rules.


## MTS-040 — Build Calendar day shell and seven-day strip

**Depends on:** `MTS-009`, `MTS-010`, `MTS-029`  
**Execution mode:** TDD implementation ticket  
**Review gate:** Specification compliance, then code quality

### Goal

Implement date header, regional week start, seven-day strip, level/streak placeholders, Today button, date picker, and launch positioning.

### Acceptance criteria

- [ ] Fresh launch opens today/current time.
- [ ] Background return preserves position.
- [ ] Other dates open at first timed mission or 08:00.
- [ ] Today button appears only off today.

### Required TDD evidence

- [ ] Calendar positioning tests.
- [ ] Regional week-start tests.
- [ ] Deep-link date test.
- [ ] Responsive snapshots.

### Code-review focus

- No dashboard panels or persistent extra controls.

### Explicitly out of scope

- Any feature or infrastructure side effect not required by this ticket.
- Live production credentials, deployment, store submission, or public activation unless this ticket explicitly states a separately approved staging action.
- Refactoring unrelated modules merely to standardize style.

### Closure evidence

- [ ] Failing test or test fixture recorded before implementation.
- [ ] Focused tests pass.
- [ ] Affected-workspace format, lint, typecheck, and build checks pass.
- [ ] Code-review findings are resolved.
- [ ] Exact Git SHA and verification commands are recorded.


## MTS-041 — Build timed timeline and current-time ruler

**Depends on:** `MTS-040`  
**Execution mode:** TDD implementation ticket  
**Review gate:** Specification compliance, then code quality

### Goal

Implement hour labels, 30-minute dividers, scroll behavior, current-time line, and bounded day rendering.

### Acceptance criteria

- [ ] Timeline supports exact-minute events while showing 30-minute guides.
- [ ] Today line updates without full-screen rerender.
- [ ] Long days scroll smoothly.
- [ ] Dynamic Type does not break time alignment.

### Required TDD evidence

- [ ] Timeline layout tests.
- [ ] Performance render test.
- [ ] Current-time update test.

### Code-review focus

- Rendering efficiency and stable coordinate model.

### Explicitly out of scope

- Any feature or infrastructure side effect not required by this ticket.
- Live production credentials, deployment, store submission, or public activation unless this ticket explicitly states a separately approved staging action.
- Refactoring unrelated modules merely to standardize style.

### Closure evidence

- [ ] Failing test or test fixture recorded before implementation.
- [ ] Focused tests pass.
- [ ] Affected-workspace format, lint, typecheck, and build checks pass.
- [ ] Code-review findings are resolved.
- [ ] Exact Git SHA and verification commands are recorded.


## MTS-042 — Build all-day mission cards and expansion

**Depends on:** `MTS-040`  
**Execution mode:** TDD implementation ticket  
**Review gate:** Specification compliance, then code quality

### Goal

Render up to three compact all-day cards above the timeline, `+N more`, session/date-scoped expansion, and stable creation/import order.

### Acceptance criteria

- [ ] No pinned all-day section or permanent heading exists.
- [ ] Completion does not reorder cards.
- [ ] Changing date/relaunch resets expansion.
- [ ] Cards remain tappable with large text.

### Required TDD evidence

- [ ] Expansion state tests.
- [ ] Ordering tests.
- [ ] Responsive visual tests.

### Code-review focus

- No drag conversion or manual reordering.

### Explicitly out of scope

- Any feature or infrastructure side effect not required by this ticket.
- Live production credentials, deployment, store submission, or public activation unless this ticket explicitly states a separately approved staging action.
- Refactoring unrelated modules merely to standardize style.

### Closure evidence

- [ ] Failing test or test fixture recorded before implementation.
- [ ] Focused tests pass.
- [ ] Affected-workspace format, lint, typecheck, and build checks pass.
- [ ] Code-review findings are resolved.
- [ ] Exact Git SHA and verification commands are recorded.


## MTS-043 — Implement mission-card and overlap layouts

**Depends on:** `MTS-041`, `MTS-008`  
**Execution mode:** TDD implementation ticket  
**Review gate:** Specification compliance, then code quality

### Goal

Implement colour status, selection outline, one/two/three/four-plus overlap layouts, and compact overflow list.

### Acceptance criteria

- [ ] One is full width; two/three are side by side; four-plus shows two and `+N more`.
- [ ] No persistent visible status label/icon is added.
- [ ] Screen readers announce written status.
- [ ] Completed cards stay in original slots.

### Required TDD evidence

- [ ] Overlap matrix tests.
- [ ] Accessibility-label tests.
- [ ] Light/dark status snapshots.

### Code-review focus

- Compactness, legibility, no colour-only accessibility output.

### Explicitly out of scope

- Any feature or infrastructure side effect not required by this ticket.
- Live production credentials, deployment, store submission, or public activation unless this ticket explicitly states a separately approved staging action.
- Refactoring unrelated modules merely to standardize style.

### Closure evidence

- [ ] Failing test or test fixture recorded before implementation.
- [ ] Focused tests pass.
- [ ] Affected-workspace format, lint, typecheck, and build checks pass.
- [ ] Code-review findings are resolved.
- [ ] Exact Git SHA and verification commands are recorded.


## MTS-044 — Implement two-tap slot selection and mission creation

**Depends on:** `MTS-041`, `MTS-011`  
**Execution mode:** TDD implementation ticket  
**Review gate:** Specification compliance, then code quality

### Goal

Implement first-tap selection, second-tap creation, selection clearing, compact prefilled sheet, default 30-minute duration, and save.

### Acceptance criteria

- [ ] A single tap never accidentally creates.
- [ ] Selection moves predictably.
- [ ] Second tap opens the correct prefilled form.
- [ ] Past creation within 30 days is allowed and 0 XP.

### Required TDD evidence

- [ ] Gesture interaction tests.
- [ ] Selection-clear tests.
- [ ] Past-create eligibility tests.

### Code-review focus

- No floating creation path that bypasses approved interaction.

### Explicitly out of scope

- Any feature or infrastructure side effect not required by this ticket.
- Live production credentials, deployment, store submission, or public activation unless this ticket explicitly states a separately approved staging action.
- Refactoring unrelated modules merely to standardize style.

### Closure evidence

- [ ] Failing test or test fixture recorded before implementation.
- [ ] Focused tests pass.
- [ ] Affected-workspace format, lint, typecheck, and build checks pass.
- [ ] Code-review findings are resolved.
- [ ] Exact Git SHA and verification commands are recorded.


## MTS-045 — Implement mission form and validation

**Depends on:** `MTS-017`, `MTS-044`  
**Execution mode:** TDD implementation ticket  
**Review gate:** Specification compliance, then code quality

### Goal

Build title/date/time/all-day/effort/recurrence/time-zone/travel/private/location/note fields and warnings.

### Acceptance criteria

- [ ] Timed mission requires start/end/time zone.
- [ ] All-day mission requires effort estimate.
- [ ] After-start/past save warns and permanently sets 0 XP.
- [ ] No category, attachment, or direct difficulty field exists.

### Required TDD evidence

- [ ] Form validation tests.
- [ ] Warning confirmation tests.
- [ ] All-day conversion tests.

### Code-review focus

- Accurate warning copy and field ownership.

### Explicitly out of scope

- Any feature or infrastructure side effect not required by this ticket.
- Live production credentials, deployment, store submission, or public activation unless this ticket explicitly states a separately approved staging action.
- Refactoring unrelated modules merely to standardize style.

### Closure evidence

- [ ] Failing test or test fixture recorded before implementation.
- [ ] Focused tests pass.
- [ ] Affected-workspace format, lint, typecheck, and build checks pass.
- [ ] Code-review findings are resolved.
- [ ] Exact Git SHA and verification commands are recorded.


## MTS-046 — Implement Mission Details state matrix

**Depends on:** `MTS-029`, `MTS-045`  
**Execution mode:** TDD implementation ticket  
**Review gate:** Specification compliance, then code quality

### Goal

Build editable, organizer-read-only, completed, expired, cancelled-history, and evidence-state variants.

### Acceptance criteria

- [ ] Completed/expired/cancelled fields follow approved read-only rules.
- [ ] Personal notes appear only here/search.
- [ ] 0-XP reason appears here, not confirmation toast.
- [ ] Cancelled text stays off Calendar cards.

### Required TDD evidence

- [ ] State-matrix component tests.
- [ ] Field-ownership tests.
- [ ] Accessibility snapshots.

### Code-review focus

- No internal AI metadata or categories displayed.

### Explicitly out of scope

- Any feature or infrastructure side effect not required by this ticket.
- Live production credentials, deployment, store submission, or public activation unless this ticket explicitly states a separately approved staging action.
- Refactoring unrelated modules merely to standardize style.

### Closure evidence

- [ ] Failing test or test fixture recorded before implementation.
- [ ] Focused tests pass.
- [ ] Affected-workspace format, lint, typecheck, and build checks pass.
- [ ] Code-review findings are resolved.
- [ ] Exact Git SHA and verification commands are recorded.


## MTS-047 — Implement drag, resize, snap, save, and Undo

**Depends on:** `MTS-041`, `MTS-043`, `MTS-045`, `MTS-011`  
**Execution mode:** TDD implementation ticket  
**Review gate:** Specification compliance, then code quality

### Goal

Implement long-press move and selected bottom-handle resize with 15-minute snapping and immediate optimistic save.

### Acceptance criteria

- [ ] Normal swipe still scrolls.
- [ ] Drag tracks the finger directly.
- [ ] Release saves and shows Undo.
- [ ] Undo restores schedule and synchronizes.
- [ ] Moving into past warns and locks 0 XP.

### Required TDD evidence

- [ ] Gesture tests.
- [ ] Snap tests.
- [ ] Undo sync tests.
- [ ] Reduce Motion tests.

### Code-review focus

- Gesture conflict handling and no all-day drag conversion.

### Explicitly out of scope

- Any feature or infrastructure side effect not required by this ticket.
- Live production credentials, deployment, store submission, or public activation unless this ticket explicitly states a separately approved staging action.
- Refactoring unrelated modules merely to standardize style.

### Closure evidence

- [ ] Failing test or test fixture recorded before implementation.
- [ ] Focused tests pass.
- [ ] Affected-workspace format, lint, typecheck, and build checks pass.
- [ ] Code-review findings are resolved.
- [ ] Exact Git SHA and verification commands are recorded.


## MTS-048 — Implement mission deletion and duplication

**Depends on:** `MTS-045`, `MTS-046`, `MTS-030`  
**Execution mode:** TDD implementation ticket  
**Review gate:** Specification compliance, then code quality

### Goal

Implement deletion, tombstone mutation, brief Undo where allowed, and prefilled duplication for active/completed/expired/cancelled history.

### Acceptance criteria

- [ ] Duplicate creates nothing until Save.
- [ ] No completion/evidence/XP/Story/provider ID is copied.
- [ ] Expired copies default to today and preserve original time.
- [ ] Deletion rules preserve aggregate reward history.

### Required TDD evidence

- [ ] Duplication field-matrix tests.
- [ ] Deletion/tombstone tests.
- [ ] Completed-history ledger tests.

### Code-review focus

- No identifier reuse or accidental external invitation deletion.

### Explicitly out of scope

- Any feature or infrastructure side effect not required by this ticket.
- Live production credentials, deployment, store submission, or public activation unless this ticket explicitly states a separately approved staging action.
- Refactoring unrelated modules merely to standardize style.

### Closure evidence

- [ ] Failing test or test fixture recorded before implementation.
- [ ] Focused tests pass.
- [ ] Affected-workspace format, lint, typecheck, and build checks pass.
- [ ] Code-review findings are resolved.
- [ ] Exact Git SHA and verification commands are recorded.


## MTS-049 — Implement Calendar search UI

**Depends on:** `MTS-033`, `MTS-046`  
**Execution mode:** TDD implementation ticket  
**Review gate:** Specification compliance, then code quality

### Goal

Build stateless search, result excerpts, original-date navigation, highlight, and automatic Mission Details opening.

### Acceptance criteria

- [ ] No recent searches are stored.
- [ ] Personal-note excerpt appears only in result.
- [ ] Offline cached search works.
- [ ] Deleted result shows approved unavailable message.

### Required TDD evidence

- [ ] Search-flow tests.
- [ ] Offline tests.
- [ ] Deleted-result test.

### Code-review focus

- Privacy and navigation correctness.

### Explicitly out of scope

- Any feature or infrastructure side effect not required by this ticket.
- Live production credentials, deployment, store submission, or public activation unless this ticket explicitly states a separately approved staging action.
- Refactoring unrelated modules merely to standardize style.

### Closure evidence

- [ ] Failing test or test fixture recorded before implementation.
- [ ] Focused tests pass.
- [ ] Affected-workspace format, lint, typecheck, and build checks pass.
- [ ] Code-review findings are resolved.
- [ ] Exact Git SHA and verification commands are recorded.


## MTS-050 — Implement Calendar help bottom sheet

**Depends on:** `MTS-009`, `MTS-043`  
**Execution mode:** TDD implementation ticket  
**Review gate:** Specification compliance, then code quality

### Goal

Add `?` trigger, short contextual guide, FAQ link, and three dismissal methods.

### Acceptance criteria

- [ ] Swipe, outside tap, and close button dismiss.
- [ ] No opened-state tracking exists.
- [ ] Written colour meanings are included.
- [ ] Focus returns to the trigger.

### Required TDD evidence

- [ ] Bottom-sheet interaction tests.
- [ ] Screen-reader focus tests.
- [ ] No-tracking assertion.

### Code-review focus

- Compact content and no permanent Calendar clutter.

### Explicitly out of scope

- Any feature or infrastructure side effect not required by this ticket.
- Live production credentials, deployment, store submission, or public activation unless this ticket explicitly states a separately approved staging action.
- Refactoring unrelated modules merely to standardize style.

### Closure evidence

- [ ] Failing test or test fixture recorded before implementation.
- [ ] Focused tests pass.
- [ ] Affected-workspace format, lint, typecheck, and build checks pass.
- [ ] Code-review findings are resolved.
- [ ] Exact Git SHA and verification commands are recorded.


# E07 — Recurrence, Time Zones, and Historical State

**Epic outcome:** Expose recurrence and time behavior in UI and persistence while enforcing split scopes, travel behavior, and historical windows.


## MTS-051 — Build recurrence editor UI

**Depends on:** `MTS-014`, `MTS-009`, `MTS-045`  
**Execution mode:** TDD implementation ticket  
**Review gate:** Specification compliance, then code quality

### Goal

Implement Daily, Weekly, Monthly, Yearly, Custom, ordinal weekday, intervals, and all three ending modes.

### Acceptance criteria

- [ ] Monthly supports same date and ordinal weekday.
- [ ] Yearly supports same date and ordinal weekday/month.
- [ ] Ending supports Never, inclusive date, and actual occurrence count.
- [ ] No pause or exception-date UI exists.

### Required TDD evidence

- [ ] Recurrence form tests.
- [ ] English/zh-HK snapshots.
- [ ] Large-text tests.

### Code-review focus

- Familiar calendar behavior without unsupported complexity.

### Explicitly out of scope

- Any feature or infrastructure side effect not required by this ticket.
- Live production credentials, deployment, store submission, or public activation unless this ticket explicitly states a separately approved staging action.
- Refactoring unrelated modules merely to standardize style.

### Closure evidence

- [ ] Failing test or test fixture recorded before implementation.
- [ ] Focused tests pass.
- [ ] Affected-workspace format, lint, typecheck, and build checks pass.
- [ ] Code-review findings are resolved.
- [ ] Exact Git SHA and verification commands are recorded.


## MTS-052 — Implement recurring edit/delete/restore scope flows

**Depends on:** `MTS-015`, `MTS-051`, `MTS-048`  
**Execution mode:** TDD implementation ticket  
**Review gate:** Specification compliance, then code quality

### Goal

Add scope chooser and apply series split/deletion/restoration operations.

### Acceptance criteria

- [ ] All three scopes are offered consistently.
- [ ] Completed occurrences remain unchanged.
- [ ] Evidence/completion remains occurrence-specific.
- [ ] Hidden-event restore can reuse the scope component.

### Required TDD evidence

- [ ] Scope-flow E2E tests.
- [ ] History preservation tests.
- [ ] Offline split sync tests.

### Code-review focus

- No accidental entire-series default.

### Explicitly out of scope

- Any feature or infrastructure side effect not required by this ticket.
- Live production credentials, deployment, store submission, or public activation unless this ticket explicitly states a separately approved staging action.
- Refactoring unrelated modules merely to standardize style.

### Closure evidence

- [ ] Failing test or test fixture recorded before implementation.
- [ ] Focused tests pass.
- [ ] Affected-workspace format, lint, typecheck, and build checks pass.
- [ ] Code-review findings are resolved.
- [ ] Exact Git SHA and verification commands are recorded.


## MTS-053 — Implement app time-zone and travel settings behavior

**Depends on:** `MTS-016`, `MTS-039`, `MTS-045`  
**Execution mode:** TDD implementation ticket  
**Review gate:** Specification compliance, then code quality

### Goal

Resolve device zone, account override, device-change auto-update, and per-mission travel behavior.

### Acceptance criteria

- [ ] Current app zone updates from device change without notice.
- [ ] Earlier streak days do not recalculate.
- [ ] Internal missions default to keep local time.
- [ ] Imported events preserve provider behavior unless overridden.

### Required TDD evidence

- [ ] Device-zone simulation tests.
- [ ] Travel display tests.
- [ ] No-notice assertion.

### Code-review focus

- Correct account/device/mission ownership.

### Explicitly out of scope

- Any feature or infrastructure side effect not required by this ticket.
- Live production credentials, deployment, store submission, or public activation unless this ticket explicitly states a separately approved staging action.
- Refactoring unrelated modules merely to standardize style.

### Closure evidence

- [ ] Failing test or test fixture recorded before implementation.
- [ ] Focused tests pass.
- [ ] Affected-workspace format, lint, typecheck, and build checks pass.
- [ ] Code-review findings are resolved.
- [ ] Exact Git SHA and verification commands are recorded.


## MTS-054 — Implement 30-day historical state transitions

**Depends on:** `MTS-017`, `MTS-029`, `MTS-046`  
**Execution mode:** TDD implementation ticket  
**Review gate:** Specification compliance, then code quality

### Goal

Materialize read-only state after expiry and enforce create/move limits.

### Acceptance criteria

- [ ] Exact expiry transitions without countdown UI.
- [ ] Expired mission remains visible, transparent, deletable, and duplicable.
- [ ] No completion path remains after expiry.
- [ ] More-than-30-day historical dates reject new/moved missions.

### Required TDD evidence

- [ ] Time-travel UI integration tests.
- [ ] Exact-boundary tests.
- [ ] No-indicator Calendar test.

### Code-review focus

- No hidden grace period or extra status colour.

### Explicitly out of scope

- Any feature or infrastructure side effect not required by this ticket.
- Live production credentials, deployment, store submission, or public activation unless this ticket explicitly states a separately approved staging action.
- Refactoring unrelated modules merely to standardize style.

### Closure evidence

- [ ] Failing test or test fixture recorded before implementation.
- [ ] Focused tests pass.
- [ ] Affected-workspace format, lint, typecheck, and build checks pass.
- [ ] Code-review findings are resolved.
- [ ] Exact Git SHA and verification commands are recorded.


## MTS-055 — Implement imported all-day effort estimation contract

**Depends on:** `MTS-017`, `MTS-023`  
**Execution mode:** TDD implementation ticket  
**Review gate:** Specification compliance, then code quality

### Goal

Define server contract for one-time AI effort estimate with 30-minute fallback and pre-start edit semantics.

### Acceptance criteria

- [ ] Generic or untitled all-day events import.
- [ ] Missing detail defaults to 30 minutes.
- [ ] Provider title is preserved/read-only.
- [ ] Effort changes after start produce 0 XP.

### Required TDD evidence

- [ ] Contract tests.
- [ ] Fallback tests.
- [ ] Untitled placeholder localization test.

### Code-review focus

- No provider-title rewrite.

### Explicitly out of scope

- Any feature or infrastructure side effect not required by this ticket.
- Live production credentials, deployment, store submission, or public activation unless this ticket explicitly states a separately approved staging action.
- Refactoring unrelated modules merely to standardize style.

### Closure evidence

- [ ] Failing test or test fixture recorded before implementation.
- [ ] Focused tests pass.
- [ ] Affected-workspace format, lint, typecheck, and build checks pass.
- [ ] Code-review findings are resolved.
- [ ] Exact Git SHA and verification commands are recorded.


# E08 — Difficulty, Completion, Rewards, and Progress

**Epic outcome:** Connect AI classification to deterministic rewards, implement authoritative completion, Trust/Private modes, Progress, and completion motion.


## MTS-056 — Implement AI difficulty classification gateway

**Depends on:** `MTS-023`, `MTS-018`, `MTS-025`  
**Execution mode:** TDD implementation ticket  
**Review gate:** Specification compliance, then code quality

### Goal

Create hidden mission-type/difficulty classification, structured validation, confidence metadata, and deterministic fallback policy.

### Acceptance criteria

- [ ] Users never see or edit internal type/difficulty metadata.
- [ ] Classification uses task details, duration, effort, complexity, and preparation—not user history.
- [ ] Invalid output fails safely.
- [ ] Before-start edits trigger recalculation.

### Required TDD evidence

- [ ] AI fake contract tests.
- [ ] No-user-history payload test.
- [ ] Fallback tests.

### Code-review focus

- Privacy, hidden metadata, no AI control of XP formula.

### Explicitly out of scope

- Any feature or infrastructure side effect not required by this ticket.
- Live production credentials, deployment, store submission, or public activation unless this ticket explicitly states a separately approved staging action.
- Refactoring unrelated modules merely to standardize style.

### Closure evidence

- [ ] Failing test or test fixture recorded before implementation.
- [ ] Focused tests pass.
- [ ] Affected-workspace format, lint, typecheck, and build checks pass.
- [ ] Code-review findings are resolved.
- [ ] Exact Git SHA and verification commands are recorded.


## MTS-057 — Implement reward locking and recalculation

**Depends on:** `MTS-017`, `MTS-018`, `MTS-024`, `MTS-056`  
**Execution mode:** TDD implementation ticket  
**Review gate:** Specification compliance, then code quality

### Goal

Lock difficulty/base XP at start and permanently revoke XP eligibility after prohibited edits or past moves.

### Acceptance criteria

- [ ] Before-start eligible edits recalculate.
- [ ] At start, reward basis locks.
- [ ] After-start edit makes reward 0 permanently.
- [ ] Moving back to future does not restore eligibility.

### Required TDD evidence

- [ ] Lock boundary tests.
- [ ] Recalculation tests.
- [ ] Permanent-revocation tests.

### Code-review focus

- Single source of reward truth.

### Explicitly out of scope

- Any feature or infrastructure side effect not required by this ticket.
- Live production credentials, deployment, store submission, or public activation unless this ticket explicitly states a separately approved staging action.
- Refactoring unrelated modules merely to standardize style.

### Closure evidence

- [ ] Failing test or test fixture recorded before implementation.
- [ ] Focused tests pass.
- [ ] Affected-workspace format, lint, typecheck, and build checks pass.
- [ ] Code-review findings are resolved.
- [ ] Exact Git SHA and verification commands are recorded.


## MTS-058 — Implement authoritative completion transaction

**Depends on:** `MTS-019`, `MTS-020`, `MTS-024`, `MTS-025`, `MTS-057`  
**Execution mode:** TDD implementation ticket  
**Review gate:** Specification compliance, then code quality

### Goal

Accept one completion, issue one reward, update streak/totals, and append changes atomically.

### Acceptance criteria

- [ ] First server-accepted completion wins.
- [ ] Exactly one reward row exists.
- [ ] Duplicate completion returns stable already-completed result.
- [ ] Deleted/tombstoned/expired occurrences cannot complete.

### Required TDD evidence

- [ ] Concurrent transaction test.
- [ ] Replay/idempotency test.
- [ ] Tombstone/expiry tests.

### Code-review focus

- Race safety and exactly-once issuance.

### Explicitly out of scope

- Any feature or infrastructure side effect not required by this ticket.
- Live production credentials, deployment, store submission, or public activation unless this ticket explicitly states a separately approved staging action.
- Refactoring unrelated modules merely to standardize style.

### Closure evidence

- [ ] Failing test or test fixture recorded before implementation.
- [ ] Focused tests pass.
- [ ] Affected-workspace format, lint, typecheck, and build checks pass.
- [ ] Code-review findings are resolved.
- [ ] Exact Git SHA and verification commands are recorded.


## MTS-059 — Implement Private and Trust Mode completion

**Depends on:** `MTS-039`, `MTS-058`, `MTS-046`  
**Execution mode:** TDD implementation ticket  
**Review gate:** Specification compliance, then code quality

### Goal

Implement per-mission Private/no-evidence and global Trust Mode transitions and confirmation UI.

### Acceptance criteria

- [ ] Private is selectable before first evidence submission.
- [ ] Trust Mode affects new and unfinished missions except active evidence flows.
- [ ] No proof bonus is awarded.
- [ ] Completion preserves streak and uses grey state.

### Required TDD evidence

- [ ] Mode-transition matrix.
- [ ] Evidence-lock tests.
- [ ] Completion confirmation tests.

### Code-review focus

- No per-mission Trust toggle and no camera path.

### Explicitly out of scope

- Any feature or infrastructure side effect not required by this ticket.
- Live production credentials, deployment, store submission, or public activation unless this ticket explicitly states a separately approved staging action.
- Refactoring unrelated modules merely to standardize style.

### Closure evidence

- [ ] Failing test or test fixture recorded before implementation.
- [ ] Focused tests pass.
- [ ] Affected-workspace format, lint, typecheck, and build checks pass.
- [ ] Code-review findings are resolved.
- [ ] Exact Git SHA and verification commands are recorded.


## MTS-060 — Build Progress screen

**Depends on:** `MTS-018`, `MTS-019`, `MTS-029`, `MTS-009`  
**Execution mode:** TDD implementation ticket  
**Review gate:** Specification compliance, then code quality

### Goal

Implement level, XP progress, current/longest streak, total completed, and recent completed list.

### Acceptance criteria

- [ ] No charts, badges, achievements, or leaderboard.
- [ ] Deleted completed missions leave aggregates but disappear from recent list.
- [ ] Other-device updates occur silently.
- [ ] Regional number formatting is used.

### Required TDD evidence

- [ ] Progress component tests.
- [ ] Deleted-history tests.
- [ ] Localization snapshots.

### Code-review focus

- Minimal scope and accurate aggregates.

### Explicitly out of scope

- Any feature or infrastructure side effect not required by this ticket.
- Live production credentials, deployment, store submission, or public activation unless this ticket explicitly states a separately approved staging action.
- Refactoring unrelated modules merely to standardize style.

### Closure evidence

- [ ] Failing test or test fixture recorded before implementation.
- [ ] Focused tests pass.
- [ ] Affected-workspace format, lint, typecheck, and build checks pass.
- [ ] Code-review findings are resolved.
- [ ] Exact Git SHA and verification commands are recorded.


## MTS-061 — Implement completion and level-up confirmation motion

**Depends on:** `MTS-011`, `MTS-058`, `MTS-060`  
**Execution mode:** TDD implementation ticket  
**Review gate:** Specification compliance, then code quality

### Goal

Show total-XP confirmation, optional final level, subtle animation/haptic, and Reduce Motion fallback.

### Acceptance criteria

- [ ] 0 XP is shown without reason.
- [ ] Proof bonus is not broken out.
- [ ] Only final level is shown.
- [ ] No separate results screen opens.
- [ ] Other devices do not replay.

### Required TDD evidence

- [ ] Copy matrix tests.
- [ ] Reduce Motion tests.
- [ ] Multi-level test.

### Code-review focus

- Timing under 900 ms and nonblocking return to Calendar.

### Explicitly out of scope

- Any feature or infrastructure side effect not required by this ticket.
- Live production credentials, deployment, store submission, or public activation unless this ticket explicitly states a separately approved staging action.
- Refactoring unrelated modules merely to standardize style.

### Closure evidence

- [ ] Failing test or test fixture recorded before implementation.
- [ ] Focused tests pass.
- [ ] Affected-workspace format, lint, typecheck, and build checks pass.
- [ ] Code-review findings are resolved.
- [ ] Exact Git SHA and verification commands are recorded.


# E09 — Mission Notifications

**Epic outcome:** Implement per-device local notification permission, scheduling, combination, deep links, rebuilds, and Android release gate.


## MTS-062 — Implement notification permission and status UI

**Depends on:** `MTS-038`, `MTS-009`  
**Execution mode:** TDD implementation ticket  
**Review gate:** Specification compliance, then code quality

### Goal

Request notification permission during onboarding choice and show device-local status in Settings.

### Acceptance criteria

- [ ] Not now remains supported.
- [ ] No repeated nag screens appear.
- [ ] Settings reflects system denial.
- [ ] Permission state is device-local.

### Required TDD evidence

- [ ] Permission-state tests.
- [ ] Denied flow tests.
- [ ] Settings status tests.

### Code-review focus

- Noncoercive flow and platform differences.

### Explicitly out of scope

- Any feature or infrastructure side effect not required by this ticket.
- Live production credentials, deployment, store submission, or public activation unless this ticket explicitly states a separately approved staging action.
- Refactoring unrelated modules merely to standardize style.

### Closure evidence

- [ ] Failing test or test fixture recorded before implementation.
- [ ] Focused tests pass.
- [ ] Affected-workspace format, lint, typecheck, and build checks pass.
- [ ] Code-review findings are resolved.
- [ ] Exact Git SHA and verification commands are recorded.


## MTS-063 — Implement local notification registry and rolling horizon

**Depends on:** `MTS-028`, `MTS-029`, `MTS-062`  
**Execution mode:** TDD implementation ticket  
**Review gate:** Specification compliance, then code quality

### Goal

Persist scheduled notification IDs, build a bounded future horizon, and reconcile local schedules.

### Acceptance criteria

- [ ] Timed missions schedule at start.
- [ ] All-day default is 09:00 mission zone.
- [ ] Infinite recurrence is not scheduled unboundedly.
- [ ] Sign-out cancellation is complete.

### Required TDD evidence

- [ ] Registry tests.
- [ ] Horizon-bound tests.
- [ ] Sign-out cleanup test.

### Code-review focus

- Idempotent scheduling and no duplicates.

### Explicitly out of scope

- Any feature or infrastructure side effect not required by this ticket.
- Live production credentials, deployment, store submission, or public activation unless this ticket explicitly states a separately approved staging action.
- Refactoring unrelated modules merely to standardize style.

### Closure evidence

- [ ] Failing test or test fixture recorded before implementation.
- [ ] Focused tests pass.
- [ ] Affected-workspace format, lint, typecheck, and build checks pass.
- [ ] Code-review findings are resolved.
- [ ] Exact Git SHA and verification commands are recorded.


## MTS-064 — Implement same-time combined notifications

**Depends on:** `MTS-063`  
**Execution mode:** TDD implementation ticket  
**Review gate:** Specification compliance, then code quality

### Goal

Group missions with the same trigger instant and generate single/count copy and deep-link payloads.

### Acceptance criteria

- [ ] Single notification includes mission title.
- [ ] Multiple uses approved count wording.
- [ ] Tap opens selected day and highlights missions.
- [ ] Private mission title remains included.

### Required TDD evidence

- [ ] Grouping tests.
- [ ] Copy localization tests.
- [ ] Deep-link payload tests.

### Code-review focus

- Stable grouping across time zones.

### Explicitly out of scope

- Any feature or infrastructure side effect not required by this ticket.
- Live production credentials, deployment, store submission, or public activation unless this ticket explicitly states a separately approved staging action.
- Refactoring unrelated modules merely to standardize style.

### Closure evidence

- [ ] Failing test or test fixture recorded before implementation.
- [ ] Focused tests pass.
- [ ] Affected-workspace format, lint, typecheck, and build checks pass.
- [ ] Code-review findings are resolved.
- [ ] Exact Git SHA and verification commands are recorded.


## MTS-065 — Implement notification rebuild triggers

**Depends on:** `MTS-031`, `MTS-053`, `MTS-063`  
**Execution mode:** TDD implementation ticket  
**Review gate:** Specification compliance, then code quality

### Goal

Rebuild affected notifications after mission/sync/time-zone/permission/reboot/sign-in changes.

### Acceptance criteria

- [ ] Obsolete future reminders are cancelled.
- [ ] Past reminders are not recreated.
- [ ] Each device acts independently.
- [ ] Rebuild is batched and idempotent.

### Required TDD evidence

- [ ] Lifecycle trigger tests.
- [ ] Reboot simulation test.
- [ ] Cross-device independence test.

### Code-review focus

- No notification storm.

### Explicitly out of scope

- Any feature or infrastructure side effect not required by this ticket.
- Live production credentials, deployment, store submission, or public activation unless this ticket explicitly states a separately approved staging action.
- Refactoring unrelated modules merely to standardize style.

### Closure evidence

- [ ] Failing test or test fixture recorded before implementation.
- [ ] Focused tests pass.
- [ ] Affected-workspace format, lint, typecheck, and build checks pass.
- [ ] Code-review findings are resolved.
- [ ] Exact Git SHA and verification commands are recorded.


## MTS-066 — Validate Android exact-notification path

**Depends on:** `MTS-063`, `MTS-065`  
**Execution mode:** TDD implementation ticket  
**Review gate:** Specification compliance, then code quality

### Goal

Implement exact alarm configuration where permitted, best-supported fallback, and release evidence script.

### Acceptance criteria

- [ ] Build declares only approved capability.
- [ ] Fallback adds no extra user-facing setting.
- [ ] Physical-device test script records delivery behavior.
- [ ] Play policy approval remains an external release gate.

### Required TDD evidence

- [ ] Android integration test.
- [ ] Manifest assertion.
- [ ] Manual release script.

### Code-review focus

- Policy compliance and honest delivery expectations.

### Explicitly out of scope

- Any feature or infrastructure side effect not required by this ticket.
- Live production credentials, deployment, store submission, or public activation unless this ticket explicitly states a separately approved staging action.
- Refactoring unrelated modules merely to standardize style.

### Closure evidence

- [ ] Failing test or test fixture recorded before implementation.
- [ ] Focused tests pass.
- [ ] Affected-workspace format, lint, typecheck, and build checks pass.
- [ ] Code-review findings are resolved.
- [ ] Exact Git SHA and verification commands are recorded.


# E10 — External Calendar Integration

**Epic outcome:** Implement the single-calendar connection model, Google server adapter, iOS EventKit adapter, field ownership, hidden events, outages, disconnect, reconnect, and cancellation history.


## MTS-067 — Implement shared external-calendar adapter contract

**Depends on:** `MTS-023`, `MTS-024`  
**Execution mode:** TDD implementation ticket  
**Review gate:** Specification compliance, then code quality

### Goal

Define normalized provider events, commands, ownership, recurrence, connection state, and adapter contract tests.

### Acceptance criteria

- [ ] Google and Apple adapters use the same internal event model.
- [ ] App-only fields are absent from provider commands.
- [ ] Organizer-controlled permissions are explicit.
- [ ] Provider errors map to stable internal codes.

### Required TDD evidence

- [ ] Adapter contract test suite.
- [ ] Ownership matrix tests.
- [ ] Sensitive-field exclusion tests.

### Code-review focus

- No provider-specific logic in mission domain.

### Explicitly out of scope

- Any feature or infrastructure side effect not required by this ticket.
- Live production credentials, deployment, store submission, or public activation unless this ticket explicitly states a separately approved staging action.
- Refactoring unrelated modules merely to standardize style.

### Closure evidence

- [ ] Failing test or test fixture recorded before implementation.
- [ ] Focused tests pass.
- [ ] Affected-workspace format, lint, typecheck, and build checks pass.
- [ ] Code-review findings are resolved.
- [ ] Exact Git SHA and verification commands are recorded.


## MTS-068 — Build calendar connection direction flow

**Depends on:** `MTS-038`, `MTS-067`, `MTS-009`  
**Execution mode:** TDD implementation ticket  
**Review gate:** Specification compliance, then code quality

### Goal

Implement one external calendar maximum and the two approved initial-direction choices with double confirmation.

### Acceptance criteria

- [ ] Only one connection is allowed.
- [ ] Initial direction is explicit.
- [ ] Past data remains untouched by initial direction.
- [ ] No duplicate-matching UI or visible sync-state complexity is added.

### Required TDD evidence

- [ ] Connection flow tests.
- [ ] Unique-connection test.
- [ ] Confirmation copy tests.

### Code-review focus

- Clear consequences without dashboard complexity.

### Explicitly out of scope

- Any feature or infrastructure side effect not required by this ticket.
- Live production credentials, deployment, store submission, or public activation unless this ticket explicitly states a separately approved staging action.
- Refactoring unrelated modules merely to standardize style.

### Closure evidence

- [ ] Failing test or test fixture recorded before implementation.
- [ ] Focused tests pass.
- [ ] Affected-workspace format, lint, typecheck, and build checks pass.
- [ ] Code-review findings are resolved.
- [ ] Exact Git SHA and verification commands are recorded.


## MTS-069 — Implement Google OAuth and connection storage

**Depends on:** `MTS-034`, `MTS-067`, `MTS-068`  
**Execution mode:** TDD implementation ticket  
**Review gate:** Specification compliance, then code quality

### Goal

Implement server-managed Google OAuth, encrypted refresh token, selected/dedicated calendar, and disconnect revocation.

### Acceptance criteria

- [ ] OAuth state is single-use and bounded.
- [ ] Refresh token is encrypted and never logged.
- [ ] Selected calendar is stored.
- [ ] Disconnect stops synchronization immediately.

### Required TDD evidence

- [ ] OAuth state/replay tests.
- [ ] Token redaction tests.
- [ ] Disconnect tests.

### Code-review focus

- Least privilege and token confidentiality.

### Explicitly out of scope

- Any feature or infrastructure side effect not required by this ticket.
- Live production credentials, deployment, store submission, or public activation unless this ticket explicitly states a separately approved staging action.
- Refactoring unrelated modules merely to standardize style.

### Closure evidence

- [ ] Failing test or test fixture recorded before implementation.
- [ ] Focused tests pass.
- [ ] Affected-workspace format, lint, typecheck, and build checks pass.
- [ ] Code-review findings are resolved.
- [ ] Exact Git SHA and verification commands are recorded.


## MTS-070 — Implement Google initial and incremental synchronization

**Depends on:** `MTS-026`, `MTS-069`  
**Execution mode:** TDD implementation ticket  
**Review gate:** Specification compliance, then code quality

### Goal

Implement full import, sync token, incremental changes, controlled 410 recovery, normalized commands, and latest-valid conflict behavior.

### Acceptance criteria

- [ ] Initial import follows selected direction.
- [ ] Incremental sync preserves query shape.
- [ ] 410 triggers controlled resync without duplicate missions.
- [ ] Completed imported missions remain frozen.

### Required TDD evidence

- [ ] Recorded-fixture tests.
- [ ] 410 recovery test.
- [ ] No-duplicate reconnect test.

### Code-review focus

- Bounded imports and provider ID stability.

### Explicitly out of scope

- Any feature or infrastructure side effect not required by this ticket.
- Live production credentials, deployment, store submission, or public activation unless this ticket explicitly states a separately approved staging action.
- Refactoring unrelated modules merely to standardize style.

### Closure evidence

- [ ] Failing test or test fixture recorded before implementation.
- [ ] Focused tests pass.
- [ ] Affected-workspace format, lint, typecheck, and build checks pass.
- [ ] Code-review findings are resolved.
- [ ] Exact Git SHA and verification commands are recorded.


## MTS-071 — Implement Google watch channels and renewal

**Depends on:** `MTS-025`, `MTS-070`  
**Execution mode:** TDD implementation ticket  
**Review gate:** Specification compliance, then code quality

### Goal

Implement webhook verification, change signal handling, channel renewal job, expiration, and idempotent pull scheduling.

### Acceptance criteria

- [ ] Webhook carries no assumed event body semantics.
- [ ] Duplicate notifications do not duplicate work.
- [ ] Channels renew before expiry.
- [ ] Invalid channel messages fail safely.

### Required TDD evidence

- [ ] Webhook tests.
- [ ] Renewal time-travel tests.
- [ ] Duplicate-signal tests.

### Code-review focus

- Authentication, replay resistance, bounded jobs.

### Explicitly out of scope

- Any feature or infrastructure side effect not required by this ticket.
- Live production credentials, deployment, store submission, or public activation unless this ticket explicitly states a separately approved staging action.
- Refactoring unrelated modules merely to standardize style.

### Closure evidence

- [ ] Failing test or test fixture recorded before implementation.
- [ ] Focused tests pass.
- [ ] Affected-workspace format, lint, typecheck, and build checks pass.
- [ ] Code-review findings are resolved.
- [ ] Exact Git SHA and verification commands are recorded.


## MTS-072 — Implement organizer ownership and imported read-only behavior

**Depends on:** `MTS-046`, `MTS-067`, `MTS-070`  
**Execution mode:** TDD implementation ticket  
**Review gate:** Specification compliance, then code quality

### Goal

Map organizer/invitee permissions, app-only personal notes, completion, and provider-update behavior.

### Acceptance criteria

- [ ] Organizer-controlled fields are read-only.
- [ ] Personal notes stay app-only and sync across user devices.
- [ ] Notes are used for Story text but excluded from evidence verification.
- [ ] Future organizer changes update unfinished missions.

### Required TDD evidence

- [ ] Ownership matrix UI/API tests.
- [ ] Personal-note AI contract tests.
- [ ] Provider-update tests.

### Code-review focus

- No unauthorized provider writes.

### Explicitly out of scope

- Any feature or infrastructure side effect not required by this ticket.
- Live production credentials, deployment, store submission, or public activation unless this ticket explicitly states a separately approved staging action.
- Refactoring unrelated modules merely to standardize style.

### Closure evidence

- [ ] Failing test or test fixture recorded before implementation.
- [ ] Focused tests pass.
- [ ] Affected-workspace format, lint, typecheck, and build checks pass.
- [ ] Code-review findings are resolved.
- [ ] Exact Git SHA and verification commands are recorded.


## MTS-073 — Implement hidden external events and restoration

**Depends on:** `MTS-052`, `MTS-067`, `MTS-070`  
**Execution mode:** TDD implementation ticket  
**Review gate:** Specification compliance, then code quality

### Goal

Implement dismissal records, upcoming-only Settings list, individual restore, current provider details, and recurrence scopes.

### Acceptance criteria

- [ ] Deleting an imported invitation does not modify/decline it externally.
- [ ] Dismissed events do not re-import.
- [ ] No Restore all exists.
- [ ] Past dismissals remain hidden internally.

### Required TDD evidence

- [ ] Dismiss/reimport tests.
- [ ] Restore current-details tests.
- [ ] Scope tests.

### Code-review focus

- No accidental provider deletion.

### Explicitly out of scope

- Any feature or infrastructure side effect not required by this ticket.
- Live production credentials, deployment, store submission, or public activation unless this ticket explicitly states a separately approved staging action.
- Refactoring unrelated modules merely to standardize style.

### Closure evidence

- [ ] Failing test or test fixture recorded before implementation.
- [ ] Focused tests pass.
- [ ] Affected-workspace format, lint, typecheck, and build checks pass.
- [ ] Code-review findings are resolved.
- [ ] Exact Git SHA and verification commands are recorded.


## MTS-074 — Implement external cancellation and completed freeze behavior

**Depends on:** `MTS-070`, `MTS-072`  
**Execution mode:** TDD implementation ticket  
**Review gate:** Specification compliance, then code quality

### Goal

Handle organizer cancellation/deletion and later provider edits for future unfinished, past unfinished, and completed missions.

### Acceptance criteria

- [ ] Future unfinished is removed.
- [ ] Past unfinished remains read-only with cancellation detail.
- [ ] Completed remains frozen history.
- [ ] XP/streak/totals are never reversed.

### Required TDD evidence

- [ ] Cancellation state matrix.
- [ ] Completed-freeze tests.
- [ ] Duplicate cancelled-history test.

### Code-review focus

- No Calendar-card cancellation badge.

### Explicitly out of scope

- Any feature or infrastructure side effect not required by this ticket.
- Live production credentials, deployment, store submission, or public activation unless this ticket explicitly states a separately approved staging action.
- Refactoring unrelated modules merely to standardize style.

### Closure evidence

- [ ] Failing test or test fixture recorded before implementation.
- [ ] Focused tests pass.
- [ ] Affected-workspace format, lint, typecheck, and build checks pass.
- [ ] Code-review findings are resolved.
- [ ] Exact Git SHA and verification commands are recorded.


## MTS-075 — Implement disconnect, permission loss, outage, and reconnect

**Depends on:** `MTS-030`, `MTS-068`, `MTS-070`  
**Execution mode:** TDD implementation ticket  
**Review gate:** Specification compliance, then code quality

### Goal

Implement cached operation, Settings-only status, queued eligible changes, explicit disconnect discard, and same-calendar relinking.

### Acceptance criteria

- [ ] Permission loss pauses sync but keeps internal missions.
- [ ] Outage warnings stay in Settings.
- [ ] Recovery applies queued changes automatically.
- [ ] Disconnect discards delayed provider updates.
- [ ] Reconnect relinks without duplication.

### Required TDD evidence

- [ ] Outage/recovery tests.
- [ ] Permission revoke/restore tests.
- [ ] Disconnect queue-discard test.
- [ ] Reconnect tests.

### Code-review focus

- No later surprise sync after disconnect.

### Explicitly out of scope

- Any feature or infrastructure side effect not required by this ticket.
- Live production credentials, deployment, store submission, or public activation unless this ticket explicitly states a separately approved staging action.
- Refactoring unrelated modules merely to standardize style.

### Closure evidence

- [ ] Failing test or test fixture recorded before implementation.
- [ ] Focused tests pass.
- [ ] Affected-workspace format, lint, typecheck, and build checks pass.
- [ ] Code-review findings are resolved.
- [ ] Exact Git SHA and verification commands are recorded.


## MTS-076 — Implement iOS EventKit native module

**Depends on:** `MTS-067`, `MTS-068`  
**Execution mode:** TDD implementation ticket  
**Review gate:** Specification compliance, then code quality

### Goal

Create Swift Expo module for full-access permission, calendar selection/creation, event CRUD, recurrence, identifiers, and change notifications.

### Acceptance criteria

- [ ] Module is unavailable cleanly on Android.
- [ ] Permission is requested only after Apple Calendar choice.
- [ ] Provider recurrence maps to canonical rules.
- [ ] No app-only fields are written to EventKit.

### Required TDD evidence

- [ ] Swift unit/harness tests.
- [ ] Simulator permission tests.
- [ ] Canonical mapping fixtures.

### Code-review focus

- Native lifecycle, error mapping, no broad calendar access before choice.

### Explicitly out of scope

- Any feature or infrastructure side effect not required by this ticket.
- Live production credentials, deployment, store submission, or public activation unless this ticket explicitly states a separately approved staging action.
- Refactoring unrelated modules merely to standardize style.

### Closure evidence

- [ ] Failing test or test fixture recorded before implementation.
- [ ] Focused tests pass.
- [ ] Affected-workspace format, lint, typecheck, and build checks pass.
- [ ] Code-review findings are resolved.
- [ ] Exact Git SHA and verification commands are recorded.


## MTS-077 — Integrate EventKit changes with mobile sync

**Depends on:** `MTS-031`, `MTS-075`, `MTS-076`  
**Execution mode:** TDD implementation ticket  
**Review gate:** Specification compliance, then code quality

### Goal

Convert EventKit pulls and commands into normal local mutations, retain identifiers, and support foreground/best-effort background refresh.

### Acceptance criteria

- [ ] Cached internal data remains available when adapter is inactive.
- [ ] Changes synchronize when an authorized iOS device runs.
- [ ] Reconnect relinks identifiers.
- [ ] Completed imported missions remain detached/frozen.

### Required TDD evidence

- [ ] iOS integration harness.
- [ ] Offline/foreground sync test.
- [ ] Identifier reconnect test.

### Code-review focus

- Honest device-mediated behavior and no server Apple-calendar assumption.

### Explicitly out of scope

- Any feature or infrastructure side effect not required by this ticket.
- Live production credentials, deployment, store submission, or public activation unless this ticket explicitly states a separately approved staging action.
- Refactoring unrelated modules merely to standardize style.

### Closure evidence

- [ ] Failing test or test fixture recorded before implementation.
- [ ] Focused tests pass.
- [ ] Affected-workspace format, lint, typecheck, and build checks pass.
- [ ] Code-review findings are resolved.
- [ ] Exact Git SHA and verification commands are recorded.


# E11 — Evidence, Verification, and Product Media Retention

**Epic outcome:** Implement camera-only evidence, attempt lifecycle, offline upload, AI verification, self-confirmation, working media, explicit save, and hard deletion.


## MTS-078 — Implement protected media upload service

**Depends on:** `MTS-025`, `MTS-027`, `MTS-021`  
**Execution mode:** TDD implementation ticket  
**Review gate:** Specification compliance, then code quality

### Goal

Create scoped upload authorization, media registry, private Blob containers, thumbnails, derivatives, and content-free logging.

### Acceptance criteria

- [ ] Uploads are bound to account/purpose/asset.
- [ ] Storage containers are private.
- [ ] Working copies are registered for deletion.
- [ ] No public permanent URL is exposed.

### Required TDD evidence

- [ ] Authorization tests.
- [ ] Cross-account upload tests.
- [ ] Azurite integration tests.
- [ ] Logging snapshots.

### Code-review focus

- Least privilege and complete asset inventory.

### Explicitly out of scope

- Any feature or infrastructure side effect not required by this ticket.
- Live production credentials, deployment, store submission, or public activation unless this ticket explicitly states a separately approved staging action.
- Refactoring unrelated modules merely to standardize style.

### Closure evidence

- [ ] Failing test or test fixture recorded before implementation.
- [ ] Focused tests pass.
- [ ] Affected-workspace format, lint, typecheck, and build checks pass.
- [ ] Code-review findings are resolved.
- [ ] Exact Git SHA and verification commands are recorded.


## MTS-079 — Build camera-only evidence capture and review

**Depends on:** `MTS-009`, `MTS-010`, `MTS-078`  
**Execution mode:** TDD implementation ticket  
**Review gate:** Specification compliance, then code quality

### Goal

Implement permission-at-first-flow, full-screen camera, capture, Retake, Submit Evidence, and protected local working file.

### Acceptance criteria

- [ ] No gallery option exists.
- [ ] Retake before submit consumes no attempt.
- [ ] Camera denial has a recoverable Settings path.
- [ ] Original captured evidence is not edited.

### Required TDD evidence

- [ ] Camera-flow component tests.
- [ ] Permission timing tests.
- [ ] No-gallery route assertion.

### Code-review focus

- Minimal camera UI and private file handling.

### Explicitly out of scope

- Any feature or infrastructure side effect not required by this ticket.
- Live production credentials, deployment, store submission, or public activation unless this ticket explicitly states a separately approved staging action.
- Refactoring unrelated modules merely to standardize style.

### Closure evidence

- [ ] Failing test or test fixture recorded before implementation.
- [ ] Focused tests pass.
- [ ] Affected-workspace format, lint, typecheck, and build checks pass.
- [ ] Code-review findings are resolved.
- [ ] Exact Git SHA and verification commands are recorded.


## MTS-080 — Implement evidence-attempt creation and upload

**Depends on:** `MTS-017`, `MTS-024`, `MTS-058`, `MTS-078`, `MTS-079`  
**Execution mode:** TDD implementation ticket  
**Review gate:** Specification compliance, then code quality

### Goal

Insert an attempt at submit-tap time, enforce maximum three, upload, and queue verification.

### Acceptance criteria

- [ ] First submit time is preserved before upload.
- [ ] Offline submission consumes an attempt.
- [ ] Expired or already-completed occurrence is rejected.
- [ ] Attempt count is server-authoritative.

### Required TDD evidence

- [ ] Exact timestamp tests.
- [ ] Maximum-attempt concurrency tests.
- [ ] Offline attempt test.

### Code-review focus

- No attempt loss on network failure.

### Explicitly out of scope

- Any feature or infrastructure side effect not required by this ticket.
- Live production credentials, deployment, store submission, or public activation unless this ticket explicitly states a separately approved staging action.
- Refactoring unrelated modules merely to standardize style.

### Closure evidence

- [ ] Failing test or test fixture recorded before implementation.
- [ ] Focused tests pass.
- [ ] Affected-workspace format, lint, typecheck, and build checks pass.
- [ ] Code-review findings are resolved.
- [ ] Exact Git SHA and verification commands are recorded.


## MTS-081 — Implement AI evidence verification and reason codes

**Depends on:** `MTS-056`, `MTS-080`  
**Execution mode:** TDD implementation ticket  
**Review gate:** Specification compliance, then code quality

### Goal

Send allowed mission context and image to AI gateway, validate accepted/rejected output, and map controlled reason codes.

### Acceptance criteria

- [ ] Personal mission notes are excluded.
- [ ] Verdict and reason code use one call.
- [ ] Raw model text is not shown directly.
- [ ] Successful retry may earn proof bonus.

### Required TDD evidence

- [ ] AI request snapshot.
- [ ] Reason mapping tests.
- [ ] Malformed output tests.

### Code-review focus

- Prompt privacy and bounded user messaging.

### Explicitly out of scope

- Any feature or infrastructure side effect not required by this ticket.
- Live production credentials, deployment, store submission, or public activation unless this ticket explicitly states a separately approved staging action.
- Refactoring unrelated modules merely to standardize style.

### Closure evidence

- [ ] Failing test or test fixture recorded before implementation.
- [ ] Focused tests pass.
- [ ] Affected-workspace format, lint, typecheck, and build checks pass.
- [ ] Code-review findings are resolved.
- [ ] Exact Git SHA and verification commands are recorded.


## MTS-082 — Build evidence result, retry, and self-confirm flows

**Depends on:** `MTS-059`, `MTS-080`, `MTS-081`  
**Execution mode:** TDD implementation ticket  
**Review gate:** Specification compliance, then code quality

### Goal

Implement accepted/rejected UI, remaining retries, double-confirmed self-confirmation, late colour/reward outcomes, and expiry lockout.

### Acceptance criteria

- [ ] Initial plus two retries maximum.
- [ ] Self-confirm is available according to attempt/window rules.
- [ ] No retry/self-confirm after expiry.
- [ ] Calendar state uses green/yellow rules without extra labels.

### Required TDD evidence

- [ ] Flow matrix tests.
- [ ] Expiry-after-verification test.
- [ ] Late retry reward test.

### Code-review focus

- No extra verification call and no expired escape path.

### Explicitly out of scope

- Any feature or infrastructure side effect not required by this ticket.
- Live production credentials, deployment, store submission, or public activation unless this ticket explicitly states a separately approved staging action.
- Refactoring unrelated modules merely to standardize style.

### Closure evidence

- [ ] Failing test or test fixture recorded before implementation.
- [ ] Focused tests pass.
- [ ] Affected-workspace format, lint, typecheck, and build checks pass.
- [ ] Code-review findings are resolved.
- [ ] Exact Git SHA and verification commands are recorded.


## MTS-083 — Implement offline evidence queue and duplicate-completion cleanup

**Depends on:** `MTS-030`, `MTS-032`, `MTS-080`  
**Execution mode:** TDD implementation ticket  
**Review gate:** Specification compliance, then code quality

### Goal

Persist private offline evidence, upload on reconnect, preserve effective timestamp, and delete losing duplicate files.

### Acceptance criteria

- [ ] Waiting-for-verification state survives restart.
- [ ] Validated local time is retained.
- [ ] Server receipt time silently replaces invalid clock.
- [ ] Duplicate-losing image and thumbnails are deleted.

### Required TDD evidence

- [ ] Restart/reconnect tests.
- [ ] Clock fallback test.
- [ ] Two-device race cleanup test.

### Code-review focus

- No silent upload of feedback media; evidence queue only.

### Explicitly out of scope

- Any feature or infrastructure side effect not required by this ticket.
- Live production credentials, deployment, store submission, or public activation unless this ticket explicitly states a separately approved staging action.
- Refactoring unrelated modules merely to standardize style.

### Closure evidence

- [ ] Failing test or test fixture recorded before implementation.
- [ ] Focused tests pass.
- [ ] Affected-workspace format, lint, typecheck, and build checks pass.
- [ ] Code-review findings are resolved.
- [ ] Exact Git SHA and verification commands are recorded.


## MTS-084 — Implement explicit evidence save and early deletion

**Depends on:** `MTS-078`, `MTS-082`  
**Execution mode:** TDD implementation ticket  
**Review gate:** Specification compliance, then code quality

### Goal

Allow explicit Save to Photos and early app-media deletion without changing completion/reward history.

### Acceptance criteria

- [ ] Permission is requested only on save.
- [ ] Saved phone copy is outside app control.
- [ ] Early deletion removes all app-controlled copies.
- [ ] Mission completion and XP remain.

### Required TDD evidence

- [ ] Permission timing test.
- [ ] Early deletion integration test.
- [ ] History preservation test.

### Code-review focus

- No automatic photo-library write.

### Explicitly out of scope

- Any feature or infrastructure side effect not required by this ticket.
- Live production credentials, deployment, store submission, or public activation unless this ticket explicitly states a separately approved staging action.
- Refactoring unrelated modules merely to standardize style.

### Closure evidence

- [ ] Failing test or test fixture recorded before implementation.
- [ ] Focused tests pass.
- [ ] Affected-workspace format, lint, typecheck, and build checks pass.
- [ ] Code-review findings are resolved.
- [ ] Exact Git SHA and verification commands are recorded.


## MTS-085 — Implement product-media cleanup and reconciliation

**Depends on:** `MTS-021`, `MTS-025`, `MTS-078`  
**Execution mode:** TDD implementation ticket  
**Review gate:** Specification compliance, then code quality

### Goal

Create scheduled deletion job for originals, derivatives, thumbnails, temporary files, and cache keys plus retry/reconciliation evidence.

### Acceptance criteria

- [ ] Due product media is hard-deleted at the approved deadline.
- [ ] Feedback-retained assets are excluded.
- [ ] Transient failure retries safely.
- [ ] Database marks final deletion only after all storage keys are gone.

### Required TDD evidence

- [ ] Time-travel Azurite tests.
- [ ] Partial-failure recovery tests.
- [ ] Feedback-exclusion tests.

### Code-review focus

- No recoverable soft-delete/version copy in production configuration.

### Explicitly out of scope

- Any feature or infrastructure side effect not required by this ticket.
- Live production credentials, deployment, store submission, or public activation unless this ticket explicitly states a separately approved staging action.
- Refactoring unrelated modules merely to standardize style.

### Closure evidence

- [ ] Failing test or test fixture recorded before implementation.
- [ ] Focused tests pass.
- [ ] Affected-workspace format, lint, typecheck, and build checks pass.
- [ ] Code-review findings are resolved.
- [ ] Exact Git SHA and verification commands are recorded.


# E12 — AI Planner

**Epic outcome:** Implement one persistent draft, text/image input, extraction, Calendar preview editing, replacement, and atomic confirmation.


## MTS-086 — Build AI Planner input and draft persistence

**Depends on:** `MTS-009`, `MTS-028`, `MTS-078`  
**Execution mode:** TDD implementation ticket  
**Review gate:** Specification compliance, then code quality

### Goal

Implement 2,000-character input, up to three system-picked images, one local/server draft, and draft resume.

### Acceptance criteria

- [ ] Live counter is accurate.
- [ ] Fourth image is blocked.
- [ ] Text and images can coexist.
- [ ] One draft survives app restart and syncs.

### Required TDD evidence

- [ ] Input-limit tests.
- [ ] Image-count tests.
- [ ] Draft persistence tests.

### Code-review focus

- No camera requirement and no draft history.

### Explicitly out of scope

- Any feature or infrastructure side effect not required by this ticket.
- Live production credentials, deployment, store submission, or public activation unless this ticket explicitly states a separately approved staging action.
- Refactoring unrelated modules merely to standardize style.

### Closure evidence

- [ ] Failing test or test fixture recorded before implementation.
- [ ] Focused tests pass.
- [ ] Affected-workspace format, lint, typecheck, and build checks pass.
- [ ] Code-review findings are resolved.
- [ ] Exact Git SHA and verification commands are recorded.


## MTS-087 — Implement schedule extraction gateway

**Depends on:** `MTS-056`, `MTS-086`  
**Execution mode:** TDD implementation ticket  
**Review gate:** Specification compliance, then code quality

### Goal

Create structured extraction request/response, uncertainty omission, sensible default rules, and partial-import indicator.

### Acceptance criteria

- [ ] AI does not optimize/rearrange/judge/add breaks.
- [ ] Highly uncertain items are omitted.
- [ ] Reasonable missing duration may default to 30 minutes.
- [ ] Invalid output never activates missions.

### Required TDD evidence

- [ ] Prompt/contract snapshots.
- [ ] Uncertainty fixtures.
- [ ] Malformed-output tests.

### Code-review focus

- Extraction only and no clarification conversation.

### Explicitly out of scope

- Any feature or infrastructure side effect not required by this ticket.
- Live production credentials, deployment, store submission, or public activation unless this ticket explicitly states a separately approved staging action.
- Refactoring unrelated modules merely to standardize style.

### Closure evidence

- [ ] Failing test or test fixture recorded before implementation.
- [ ] Focused tests pass.
- [ ] Affected-workspace format, lint, typecheck, and build checks pass.
- [ ] Code-review findings are resolved.
- [ ] Exact Git SHA and verification commands are recorded.


## MTS-088 — Build Calendar draft preview and editing

**Depends on:** `MTS-040`, `MTS-043`, `MTS-045`, `MTS-086`, `MTS-087`  
**Execution mode:** TDD implementation ticket  
**Review gate:** Specification compliance, then code quality

### Goal

Render existing missions normally and draft missions as temporary outlines; support edit/move/resize/delete/manual add.

### Acceptance criteria

- [ ] Draft actions do not notify, reward, or sync externally.
- [ ] Overlaps remain allowed.
- [ ] Same Calendar gestures are reused.
- [ ] Draft status is visually distinct in both themes.

### Required TDD evidence

- [ ] Preview component tests.
- [ ] Draft gesture tests.
- [ ] No-side-effect assertions.

### Code-review focus

- No separate planner-specific calendar engine.

### Explicitly out of scope

- Any feature or infrastructure side effect not required by this ticket.
- Live production credentials, deployment, store submission, or public activation unless this ticket explicitly states a separately approved staging action.
- Refactoring unrelated modules merely to standardize style.

### Closure evidence

- [ ] Failing test or test fixture recorded before implementation.
- [ ] Focused tests pass.
- [ ] Affected-workspace format, lint, typecheck, and build checks pass.
- [ ] Code-review findings are resolved.
- [ ] Exact Git SHA and verification commands are recorded.


## MTS-089 — Implement draft replacement and atomic confirmation

**Depends on:** `MTS-025`, `MTS-031`, `MTS-088`  
**Execution mode:** TDD implementation ticket  
**Review gate:** Specification compliance, then code quality

### Goal

Require replacement confirmation, activate the full batch transactionally, queue downstream work, clear draft, and navigate to Calendar.

### Acceptance criteria

- [ ] Starting new extraction confirms replacement.
- [ ] No Discard Draft action exists.
- [ ] Confirm dialog shows mission count and consequences.
- [ ] Either all active missions are created or none are.

### Required TDD evidence

- [ ] Replacement tests.
- [ ] Batch transaction rollback test.
- [ ] Post-confirm navigation test.

### Code-review focus

- No partial activation.

### Explicitly out of scope

- Any feature or infrastructure side effect not required by this ticket.
- Live production credentials, deployment, store submission, or public activation unless this ticket explicitly states a separately approved staging action.
- Refactoring unrelated modules merely to standardize style.

### Closure evidence

- [ ] Failing test or test fixture recorded before implementation.
- [ ] Focused tests pass.
- [ ] Affected-workspace format, lint, typecheck, and build checks pass.
- [ ] Code-review findings are resolved.
- [ ] Exact Git SHA and verification commands are recorded.


# E13 — Story Creation and Sharing

**Epic outcome:** Implement source/AI versions, style profile, suggestions, independent compositions, offline editing, conflicts, local rendering, save, and sharing.


## MTS-090 — Create Story schema and synchronization contracts

**Depends on:** `MTS-022`, `MTS-023`, `MTS-031`  
**Execution mode:** TDD implementation ticket  
**Review gate:** Specification compliance, then code quality

### Goal

Persist one draft per occurrence, image versions, independent compositions, notes, revisions, and effective save time.

### Acceptance criteria

- [ ] Each image version has separate composition state.
- [ ] Latest valid save wins.
- [ ] One unfinished draft per mission is enforced.
- [ ] Completed mission is required for Story eligibility.

### Required TDD evidence

- [ ] Schema constraints.
- [ ] Composition serialization tests.
- [ ] Conflict integration tests.

### Code-review focus

- No shared crop/text/effect state.

### Explicitly out of scope

- Any feature or infrastructure side effect not required by this ticket.
- Live production credentials, deployment, store submission, or public activation unless this ticket explicitly states a separately approved staging action.
- Refactoring unrelated modules merely to standardize style.

### Closure evidence

- [ ] Failing test or test fixture recorded before implementation.
- [ ] Focused tests pass.
- [ ] Affected-workspace format, lint, typecheck, and build checks pass.
- [ ] Code-review findings are resolved.
- [ ] Exact Git SHA and verification commands are recorded.


## MTS-091 — Build source-image Story editor

**Depends on:** `MTS-009`, `MTS-011`, `MTS-090`  
**Execution mode:** TDD implementation ticket  
**Review gate:** Specification compliance, then code quality

### Goal

Implement fixed-canvas preview, source-photo selection, crop/zoom/position, optional text layers, effects, and session undo/redo.

### Acceptance criteria

- [ ] Original evidence remains unchanged.
- [ ] Preview scales responsively.
- [ ] Undo/Redo resets on reopen.
- [ ] Manual editing works offline.

### Required TDD evidence

- [ ] Editor interaction tests.
- [ ] Composition serialization tests.
- [ ] Skia preview snapshots.

### Code-review focus

- No video/music/sticker features.

### Explicitly out of scope

- Any feature or infrastructure side effect not required by this ticket.
- Live production credentials, deployment, store submission, or public activation unless this ticket explicitly states a separately approved staging action.
- Refactoring unrelated modules merely to standardize style.

### Closure evidence

- [ ] Failing test or test fixture recorded before implementation.
- [ ] Focused tests pass.
- [ ] Affected-workspace format, lint, typecheck, and build checks pass.
- [ ] Code-review findings are resolved.
- [ ] Exact Git SHA and verification commands are recorded.


## MTS-092 — Implement Story text suggestions

**Depends on:** `MTS-056`, `MTS-090`, `MTS-091`  
**Execution mode:** TDD implementation ticket  
**Review gate:** Specification compliance, then code quality

### Goal

Generate optional headline, supporting text, and Instagram Sharing Notes using style profile and permitted personal note context.

### Acceptance criteria

- [ ] Suggestions are shown before placement.
- [ ] Initial text request consumes no image-generation budget.
- [ ] Self-confirmed Story text never claims verification.
- [ ] User may choose photo-only.

### Required TDD evidence

- [ ] AI request-context tests.
- [ ] Claim-safety tests.
- [ ] Suggestion placement tests.

### Code-review focus

- No feed-caption subsystem.

### Explicitly out of scope

- Any feature or infrastructure side effect not required by this ticket.
- Live production credentials, deployment, store submission, or public activation unless this ticket explicitly states a separately approved staging action.
- Refactoring unrelated modules merely to standardize style.

### Closure evidence

- [ ] Failing test or test fixture recorded before implementation.
- [ ] Focused tests pass.
- [ ] Affected-workspace format, lint, typecheck, and build checks pass.
- [ ] Code-review findings are resolved.
- [ ] Exact Git SHA and verification commands are recorded.


## MTS-093 — Implement Story style-profile setup and management

**Depends on:** `MTS-078`, `MTS-092`  
**Execution mode:** TDD implementation ticket  
**Review gate:** Specification compliance, then code quality

### Goal

Implement first-use setup/default choice, 3–8 reference images, abstract style extraction, Settings rebuild/reset, and 30-day reference deletion.

### Acceptance criteria

- [ ] Exact templates, logos, watermarks, faces, captions, and usernames are not copied.
- [ ] Abstract profile persists after reference deletion.
- [ ] Existing drafts do not change after profile update.
- [ ] New generation uses updated profile.

### Required TDD evidence

- [ ] Reference-count tests.
- [ ] Extraction contract tests.
- [ ] Profile-update isolation tests.

### Code-review focus

- No copyrighted/template cloning.

### Explicitly out of scope

- Any feature or infrastructure side effect not required by this ticket.
- Live production credentials, deployment, store submission, or public activation unless this ticket explicitly states a separately approved staging action.
- Refactoring unrelated modules merely to standardize style.

### Closure evidence

- [ ] Failing test or test fixture recorded before implementation.
- [ ] Focused tests pass.
- [ ] Affected-workspace format, lint, typecheck, and build checks pass.
- [ ] Code-review findings are resolved.
- [ ] Exact Git SHA and verification commands are recorded.


## MTS-094 — Implement AI Story image generation budget and versions

**Depends on:** `MTS-025`, `MTS-078`, `MTS-090`, `MTS-093`  
**Execution mode:** TDD implementation ticket  
**Review gate:** Specification compliance, then code quality

### Goal

Reserve up to three generation/regeneration requests, generate one image per request, retain versions, and release failed reservations.

### Acceptance criteria

- [ ] Source consumes zero.
- [ ] Existing-version switching consumes zero.
- [ ] Successful generation consumes one.
- [ ] Provider/server fault releases reservation.
- [ ] Remaining count is visible.

### Required TDD evidence

- [ ] Concurrency budget tests.
- [ ] Failure-release tests.
- [ ] Version retention tests.

### Code-review focus

- Atomic budget enforcement.

### Explicitly out of scope

- Any feature or infrastructure side effect not required by this ticket.
- Live production credentials, deployment, store submission, or public activation unless this ticket explicitly states a separately approved staging action.
- Refactoring unrelated modules merely to standardize style.

### Closure evidence

- [ ] Failing test or test fixture recorded before implementation.
- [ ] Focused tests pass.
- [ ] Affected-workspace format, lint, typecheck, and build checks pass.
- [ ] Code-review findings are resolved.
- [ ] Exact Git SHA and verification commands are recorded.


## MTS-095 — Implement independent per-version composition switching

**Depends on:** `MTS-091`, `MTS-094`  
**Execution mode:** TDD implementation ticket  
**Review gate:** Specification compliance, then code quality

### Goal

Switch Source/AI versions without copying composition state and preserve each version’s saved state.

### Acceptance criteria

- [ ] Headline, supporting text, styles, crop, positions, and effects remain separate.
- [ ] Switching back restores prior version without AI call.
- [ ] No automatic migration occurs.
- [ ] Version deletion is safe.

### Required TDD evidence

- [ ] Version-isolation tests.
- [ ] Switch/restore UI tests.
- [ ] No-generation assertion.

### Code-review focus

- Strict independence as approved.

### Explicitly out of scope

- Any feature or infrastructure side effect not required by this ticket.
- Live production credentials, deployment, store submission, or public activation unless this ticket explicitly states a separately approved staging action.
- Refactoring unrelated modules merely to standardize style.

### Closure evidence

- [ ] Failing test or test fixture recorded before implementation.
- [ ] Focused tests pass.
- [ ] Affected-workspace format, lint, typecheck, and build checks pass.
- [ ] Code-review findings are resolved.
- [ ] Exact Git SHA and verification commands are recorded.


## MTS-096 — Implement Story offline saves and multi-device conflicts

**Depends on:** `MTS-032`, `MTS-090`, `MTS-095`  
**Execution mode:** TDD implementation ticket  
**Review gate:** Specification compliance, then code quality

### Goal

Save locally, synchronize after reconnect, validate timestamps, apply latest-save winner, and clear losing undo state.

### Acceptance criteria

- [ ] Offline manual edits survive restart.
- [ ] AI controls are disabled offline.
- [ ] Valid original save time is used.
- [ ] Invalid device time silently uses receipt time.
- [ ] Approved conflict message appears.

### Required TDD evidence

- [ ] Offline reconnect tests.
- [ ] Two-device conflict test.
- [ ] Clock-fallback test.

### Code-review focus

- No real-time collaborative editing.

### Explicitly out of scope

- Any feature or infrastructure side effect not required by this ticket.
- Live production credentials, deployment, store submission, or public activation unless this ticket explicitly states a separately approved staging action.
- Refactoring unrelated modules merely to standardize style.

### Closure evidence

- [ ] Failing test or test fixture recorded before implementation.
- [ ] Focused tests pass.
- [ ] Affected-workspace format, lint, typecheck, and build checks pass.
- [ ] Code-review findings are resolved.
- [ ] Exact Git SHA and verification commands are recorded.


## MTS-097 — Implement Story export, save, and system share

**Depends on:** `MTS-091`, `MTS-095`  
**Execution mode:** TDD implementation ticket  
**Review gate:** Specification compliance, then code quality

### Goal

Render final 1080×1920 PNG locally, Save to Photos, native share sheet, and confirmation.

### Acceptance criteria

- [ ] Output is exactly 1080×1920.
- [ ] Save requests permission at action time.
- [ ] No confirmation is required before save.
- [ ] User may save different versions separately.

### Required TDD evidence

- [ ] Golden-render tests.
- [ ] Export dimension test.
- [ ] Device save/share scripts.

### Code-review focus

- No server round trip required for export.

### Explicitly out of scope

- Any feature or infrastructure side effect not required by this ticket.
- Live production credentials, deployment, store submission, or public activation unless this ticket explicitly states a separately approved staging action.
- Refactoring unrelated modules merely to standardize style.

### Closure evidence

- [ ] Failing test or test fixture recorded before implementation.
- [ ] Focused tests pass.
- [ ] Affected-workspace format, lint, typecheck, and build checks pass.
- [ ] Code-review findings are resolved.
- [ ] Exact Git SHA and verification commands are recorded.


## MTS-098 — Implement Instagram Sharing Notes and open flow

**Depends on:** `MTS-092`, `MTS-097`  
**Execution mode:** TDD implementation ticket  
**Review gate:** Specification compliance, then code quality

### Goal

Show persisted Sharing Notes, copy actions, and Open Instagram without post-status tracking.

### Acceptance criteria

- [ ] Notes appear before Instagram opens.
- [ ] No native stickers/music/polls are placed by the app.
- [ ] No Did you post prompt exists.
- [ ] Notes delete with draft/retention.

### Required TDD evidence

- [ ] Flow tests.
- [ ] Copy-action tests.
- [ ] No-status-tracking assertion.

### Code-review focus

- Platform-appropriate external open behavior.

### Explicitly out of scope

- Any feature or infrastructure side effect not required by this ticket.
- Live production credentials, deployment, store submission, or public activation unless this ticket explicitly states a separately approved staging action.
- Refactoring unrelated modules merely to standardize style.

### Closure evidence

- [ ] Failing test or test fixture recorded before implementation.
- [ ] Focused tests pass.
- [ ] Affected-workspace format, lint, typecheck, and build checks pass.
- [ ] Code-review findings are resolved.
- [ ] Exact Git SHA and verification commands are recorded.


## MTS-099 — Apply Story and style media retention

**Depends on:** `MTS-085`, `MTS-090`, `MTS-093`, `MTS-094`  
**Execution mode:** TDD implementation ticket  
**Review gate:** Specification compliance, then code quality

### Goal

Register all Story/reference assets for approved deletion and return the mission UI to Create Story after deletion.

### Acceptance criteria

- [ ] Originals, versions, thumbnails, temp, and cache are removed.
- [ ] No automatic-deletion notice is displayed in Story section.
- [ ] Saved phone/published external copies are unaffected.
- [ ] Abstract style profile remains.

### Required TDD evidence

- [ ] Time-travel cleanup tests.
- [ ] UI-after-deletion test.
- [ ] Profile-retention test.

### Code-review focus

- Complete asset inventory and no hidden cache.

### Explicitly out of scope

- Any feature or infrastructure side effect not required by this ticket.
- Live production credentials, deployment, store submission, or public activation unless this ticket explicitly states a separately approved staging action.
- Refactoring unrelated modules merely to standardize style.

### Closure evidence

- [ ] Failing test or test fixture recorded before implementation.
- [ ] Focused tests pass.
- [ ] Affected-workspace format, lint, typecheck, and build checks pass.
- [ ] Code-review findings are resolved.
- [ ] Exact Git SHA and verification commands are recorded.


# E14 — Settings, Localization, Accessibility, Feedback, and Diagnostics

**Epic outcome:** Complete the remaining app surface and cross-cutting user controls without expanding the first-release feature set.


## MTS-100 — Build Settings information architecture

**Depends on:** `MTS-009`, `MTS-010`, `MTS-039`  
**Execution mode:** TDD implementation ticket  
**Review gate:** Specification compliance, then code quality

### Goal

Implement grouped Account, Privacy, Calendar, Story, Help, About, Sign out, and deletion rows.

### Acceptance criteria

- [ ] All approved settings are reachable.
- [ ] No appearance/week/time/date/haptic setting is added.
- [ ] No support email link exists.
- [ ] Connected Calendar status remains Settings-only during outages.

### Required TDD evidence

- [ ] Settings inventory test.
- [ ] Navigation tests.
- [ ] Visual snapshots.

### Code-review focus

- Scope fidelity and destructive-action separation.

### Explicitly out of scope

- Any feature or infrastructure side effect not required by this ticket.
- Live production credentials, deployment, store submission, or public activation unless this ticket explicitly states a separately approved staging action.
- Refactoring unrelated modules merely to standardize style.

### Closure evidence

- [ ] Failing test or test fixture recorded before implementation.
- [ ] Focused tests pass.
- [ ] Affected-workspace format, lint, typecheck, and build checks pass.
- [ ] Code-review findings are resolved.
- [ ] Exact Git SHA and verification commands are recorded.


## MTS-101 — Implement English and zh-HK localization

**Depends on:** `MTS-023`, `MTS-008`  
**Execution mode:** TDD implementation ticket  
**Review gate:** Specification compliance, then code quality

### Goal

Create catalogs, locale resolution, manual app-language setting, natural Hong Kong Traditional Chinese, and regional formatters.

### Acceptance criteria

- [ ] Unsupported languages fall back to English.
- [ ] Month/weekday names follow app language.
- [ ] Numeric formats follow phone region.
- [ ] CI fails on missing keys.

### Required TDD evidence

- [ ] Catalog completeness test.
- [ ] Formatter tests.
- [ ] Bilingual screenshots.

### Code-review focus

- No hard-coded user-facing strings.

### Explicitly out of scope

- Any feature or infrastructure side effect not required by this ticket.
- Live production credentials, deployment, store submission, or public activation unless this ticket explicitly states a separately approved staging action.
- Refactoring unrelated modules merely to standardize style.

### Closure evidence

- [ ] Failing test or test fixture recorded before implementation.
- [ ] Focused tests pass.
- [ ] Affected-workspace format, lint, typecheck, and build checks pass.
- [ ] Code-review findings are resolved.
- [ ] Exact Git SHA and verification commands are recorded.


## MTS-102 — Implement system appearance, text size, and bold text

**Depends on:** `MTS-008`, `MTS-009`  
**Execution mode:** TDD implementation ticket  
**Review gate:** Specification compliance, then code quality

### Goal

Follow system light/dark, Dynamic Type, and Bold Text without separate app settings.

### Acceptance criteria

- [ ] All primary screens work in both themes.
- [ ] Critical labels/actions do not clip at supported large text.
- [ ] Story canvas typography remains independent.
- [ ] No special Increase Contrast/Button Shapes adaptation is added.

### Required TDD evidence

- [ ] Theme snapshots.
- [ ] Large-text tests.
- [ ] Bold-text manual script.

### Code-review focus

- Visual consistency and no fixed-height traps.

### Explicitly out of scope

- Any feature or infrastructure side effect not required by this ticket.
- Live production credentials, deployment, store submission, or public activation unless this ticket explicitly states a separately approved staging action.
- Refactoring unrelated modules merely to standardize style.

### Closure evidence

- [ ] Failing test or test fixture recorded before implementation.
- [ ] Focused tests pass.
- [ ] Affected-workspace format, lint, typecheck, and build checks pass.
- [ ] Code-review findings are resolved.
- [ ] Exact Git SHA and verification commands are recorded.


## MTS-103 — Implement VoiceOver and TalkBack semantics

**Depends on:** `MTS-040`, `MTS-046`, `MTS-079`, `MTS-091`, `MTS-100`  
**Execution mode:** TDD implementation ticket  
**Review gate:** Specification compliance, then code quality

### Goal

Add labels, roles, state announcements, focus order, sheet focus trap/return, and accessible alternatives to gestures.

### Acceptance criteria

- [ ] Mission cards announce status in words.
- [ ] Evidence and Story controls are fully navigable.
- [ ] Drag/resize has an accessible edit alternative.
- [ ] Important state changes announce.

### Required TDD evidence

- [ ] Automated accessibility-tree tests.
- [ ] VoiceOver script.
- [ ] TalkBack script.

### Code-review focus

- No colour-only or gesture-only access.

### Explicitly out of scope

- Any feature or infrastructure side effect not required by this ticket.
- Live production credentials, deployment, store submission, or public activation unless this ticket explicitly states a separately approved staging action.
- Refactoring unrelated modules merely to standardize style.

### Closure evidence

- [ ] Failing test or test fixture recorded before implementation.
- [ ] Focused tests pass.
- [ ] Affected-workspace format, lint, typecheck, and build checks pass.
- [ ] Code-review findings are resolved.
- [ ] Exact Git SHA and verification commands are recorded.


## MTS-104 — Implement Reduce Motion and haptic acceptance

**Depends on:** `MTS-011`, `MTS-061`, `MTS-091`  
**Execution mode:** TDD implementation ticket  
**Review gate:** Specification compliance, then code quality

### Goal

Apply Reduce Motion across navigation, selection, celebrations, and Story transitions; validate subtle haptics.

### Acceptance criteria

- [ ] Confetti and moving outlines are removed under Reduce Motion.
- [ ] Direct drag remains.
- [ ] No interface sounds exist.
- [ ] Haptics are not repeated excessively.

### Required TDD evidence

- [ ] Reduce Motion snapshots.
- [ ] Animation-state tests.
- [ ] Manual haptic script.

### Code-review focus

- Consistency across all screens.

### Explicitly out of scope

- Any feature or infrastructure side effect not required by this ticket.
- Live production credentials, deployment, store submission, or public activation unless this ticket explicitly states a separately approved staging action.
- Refactoring unrelated modules merely to standardize style.

### Closure evidence

- [ ] Failing test or test fixture recorded before implementation.
- [ ] Focused tests pass.
- [ ] Affected-workspace format, lint, typecheck, and build checks pass.
- [ ] Code-review findings are resolved.
- [ ] Exact Git SHA and verification commands are recorded.


## MTS-105 — Implement minimal diagnostics with opt-out

**Depends on:** `MTS-027`, `MTS-100`  
**Execution mode:** TDD implementation ticket  
**Review gate:** Specification compliance, then code quality

### Goal

Implement allowlisted mobile diagnostics, immediate opt-out, backend telemetry fields, and content scrubbers.

### Acceptance criteria

- [ ] Enabled by default without onboarding notice.
- [ ] Mission/calendar/AI/photo/Story/token/location content is excluded.
- [ ] Automatic screenshot/view hierarchy/session replay are disabled.
- [ ] Toggle takes effect immediately.

### Required TDD evidence

- [ ] Telemetry payload snapshots.
- [ ] Scrubber tests.
- [ ] Toggle tests.

### Code-review focus

- Allowlist—not blocklist—collection.

### Explicitly out of scope

- Any feature or infrastructure side effect not required by this ticket.
- Live production credentials, deployment, store submission, or public activation unless this ticket explicitly states a separately approved staging action.
- Refactoring unrelated modules merely to standardize style.

### Closure evidence

- [ ] Failing test or test fixture recorded before implementation.
- [ ] Focused tests pass.
- [ ] Affected-workspace format, lint, typecheck, and build checks pass.
- [ ] Code-review findings are resolved.
- [ ] Exact Git SHA and verification commands are recorded.


## MTS-106 — Build feedback and problem-report form

**Depends on:** `MTS-078`, `MTS-100`, `MTS-105`  
**Execution mode:** TDD implementation ticket  
**Review gate:** Specification compliance, then code quality

### Goal

Implement category, description, optional email, optional manual screenshot, preview, technical summary, submit, and success confirmation.

### Acceptance criteria

- [ ] Screenshot is never automatic.
- [ ] Account email is not automatically exposed.
- [ ] Minimal non-content logs only.
- [ ] No user-facing submission history exists.

### Required TDD evidence

- [ ] Form tests.
- [ ] Attachment metadata-stripping test.
- [ ] Payload privacy snapshot.

### Code-review focus

- Retention disclosure and no broad diagnostics.

### Explicitly out of scope

- Any feature or infrastructure side effect not required by this ticket.
- Live production credentials, deployment, store submission, or public activation unless this ticket explicitly states a separately approved staging action.
- Refactoring unrelated modules merely to standardize style.

### Closure evidence

- [ ] Failing test or test fixture recorded before implementation.
- [ ] Focused tests pass.
- [ ] Affected-workspace format, lint, typecheck, and build checks pass.
- [ ] Code-review findings are resolved.
- [ ] Exact Git SHA and verification commands are recorded.


## MTS-107 — Implement offline feedback draft lifecycle

**Depends on:** `MTS-028`, `MTS-036`, `MTS-106`  
**Execution mode:** TDD implementation ticket  
**Review gate:** Specification compliance, then code quality

### Goal

Persist failed/offline report locally, require manual resubmit, preserve across restart, confirm discard, and delete on sign-out.

### Acceptance criteria

- [ ] No automatic later upload occurs.
- [ ] Screenshot and description survive restart.
- [ ] Discard confirmation deletes all local parts.
- [ ] Sign-out deletes draft without affecting submitted feedback.

### Required TDD evidence

- [ ] Offline/restart tests.
- [ ] Discard tests.
- [ ] Sign-out cleanup tests.

### Code-review focus

- Strict separation from automatic evidence queue.

### Explicitly out of scope

- Any feature or infrastructure side effect not required by this ticket.
- Live production credentials, deployment, store submission, or public activation unless this ticket explicitly states a separately approved staging action.
- Refactoring unrelated modules merely to standardize style.

### Closure evidence

- [ ] Failing test or test fixture recorded before implementation.
- [ ] Focused tests pass.
- [ ] Affected-workspace format, lint, typecheck, and build checks pass.
- [ ] Code-review findings are resolved.
- [ ] Exact Git SHA and verification commands are recorded.


## MTS-108 — Implement retained feedback storage and account unlinking

**Depends on:** `MTS-024`, `MTS-078`, `MTS-037`, `MTS-106`  
**Execution mode:** TDD implementation ticket  
**Review gate:** Specification compliance, then code quality

### Goal

Store submitted feedback in separate retained tables/container with restricted access and unlink on deletion.

### Acceptance criteria

- [ ] No automatic deletion policy is applied.
- [ ] Account deletion removes internal user identifier.
- [ ] Optional deliberately entered email remains.
- [ ] Feedback is excluded from marketing/AI training by application policy.

### Required TDD evidence

- [ ] Retention tests.
- [ ] Unlink tests.
- [ ] Access-role configuration test.

### Code-review focus

- Privacy-policy alignment and audited access.

### Explicitly out of scope

- Any feature or infrastructure side effect not required by this ticket.
- Live production credentials, deployment, store submission, or public activation unless this ticket explicitly states a separately approved staging action.
- Refactoring unrelated modules merely to standardize style.

### Closure evidence

- [ ] Failing test or test fixture recorded before implementation.
- [ ] Focused tests pass.
- [ ] Affected-workspace format, lint, typecheck, and build checks pass.
- [ ] Code-review findings are resolved.
- [ ] Exact Git SHA and verification commands are recorded.


## MTS-109 — Implement Help, short FAQ, privacy/legal, and About screens

**Depends on:** `MTS-050`, `MTS-100`, `MTS-101`  
**Execution mode:** TDD implementation ticket  
**Review gate:** Specification compliance, then code quality

### Goal

Build short FAQ, full help entries, Privacy Policy, Terms, About/version, and relevant contextual links.

### Acceptance criteria

- [ ] FAQ remains concise.
- [ ] Calendar help links to full FAQ.
- [ ] Feedback retention exception is disclosed in Privacy Policy content integration.
- [ ] No generic support email is shown.

### Required TDD evidence

- [ ] Navigation tests.
- [ ] Localization completeness.
- [ ] Policy URL configuration test.

### Code-review focus

- No unsupported promises or hidden support channel.

### Explicitly out of scope

- Any feature or infrastructure side effect not required by this ticket.
- Live production credentials, deployment, store submission, or public activation unless this ticket explicitly states a separately approved staging action.
- Refactoring unrelated modules merely to standardize style.

### Closure evidence

- [ ] Failing test or test fixture recorded before implementation.
- [ ] Focused tests pass.
- [ ] Affected-workspace format, lint, typecheck, and build checks pass.
- [ ] Code-review findings are resolved.
- [ ] Exact Git SHA and verification commands are recorded.


# E15 — Security, Performance, Release Hardening, and Acceptance

**Epic outcome:** Prove the app meets privacy, security, performance, accessibility, provider, store, and full-flow release criteria.


## MTS-110 — Create security threat model and abuse controls

**Depends on:** `MTS-027`, `MTS-034`, `MTS-078`, `MTS-105`  
**Execution mode:** TDD implementation ticket  
**Review gate:** Specification compliance, then code quality

### Goal

Document trust boundaries, threats, mitigations, rate limits, upload abuse controls, AI input risks, and account takeover protections.

### Acceptance criteria

- [ ] Threat model covers mobile, API, worker, database, Blob, queues, providers, and external calendars.
- [ ] Mitigations map to tickets/tests.
- [ ] High-risk unresolved issues block release.
- [ ] No credentials are shipped to mobile.

### Required TDD evidence

- [ ] Threat-model review checklist.
- [ ] Rate-limit tests.
- [ ] Mobile binary secret scan.

### Code-review focus

- Evidence/media privacy and provider-token protection.

### Explicitly out of scope

- Any feature or infrastructure side effect not required by this ticket.
- Live production credentials, deployment, store submission, or public activation unless this ticket explicitly states a separately approved staging action.
- Refactoring unrelated modules merely to standardize style.

### Closure evidence

- [ ] Failing test or test fixture recorded before implementation.
- [ ] Focused tests pass.
- [ ] Affected-workspace format, lint, typecheck, and build checks pass.
- [ ] Code-review findings are resolved.
- [ ] Exact Git SHA and verification commands are recorded.


## MTS-111 — Implement API and media security hardening

**Depends on:** `MTS-110`  
**Execution mode:** TDD implementation ticket  
**Review gate:** Specification compliance, then code quality

### Goal

Add security headers, size limits, rate limits, anti-replay controls, upload validation, key rotation hooks, and least-privilege identities.

### Acceptance criteria

- [ ] All public endpoints have bounded bodies and rates.
- [ ] Webhook/OAuth replay protections are enforced.
- [ ] Media types and dimensions are validated.
- [ ] Managed identities use least privilege.

### Required TDD evidence

- [ ] Security integration tests.
- [ ] Fuzz/invalid-input tests.
- [ ] Infrastructure role assertions.

### Code-review focus

- Fail-closed behavior and no broad storage access.

### Explicitly out of scope

- Any feature or infrastructure side effect not required by this ticket.
- Live production credentials, deployment, store submission, or public activation unless this ticket explicitly states a separately approved staging action.
- Refactoring unrelated modules merely to standardize style.

### Closure evidence

- [ ] Failing test or test fixture recorded before implementation.
- [ ] Focused tests pass.
- [ ] Affected-workspace format, lint, typecheck, and build checks pass.
- [ ] Code-review findings are resolved.
- [ ] Exact Git SHA and verification commands are recorded.


## MTS-112 — Profile and enforce mobile performance budgets

**Depends on:** `MTS-043`, `MTS-047`, `MTS-091`, `MTS-097`  
**Execution mode:** TDD implementation ticket  
**Review gate:** Specification compliance, then code quality

### Goal

Profile Calendar rendering, drag/resize, sync application, Story editing/export, and image memory on supported devices.

### Acceptance criteria

- [ ] Warm Calendar is interactive within budget.
- [ ] Cached day query is normally under target.
- [ ] Drag/resize is smooth.
- [ ] Story export meets target or a reviewed budget exception is documented.

### Required TDD evidence

- [ ] Automated benchmark smoke tests.
- [ ] Device profiling evidence.
- [ ] Regression thresholds.

### Code-review focus

- Measured evidence, not subjective claims.

### Explicitly out of scope

- Any feature or infrastructure side effect not required by this ticket.
- Live production credentials, deployment, store submission, or public activation unless this ticket explicitly states a separately approved staging action.
- Refactoring unrelated modules merely to standardize style.

### Closure evidence

- [ ] Failing test or test fixture recorded before implementation.
- [ ] Focused tests pass.
- [ ] Affected-workspace format, lint, typecheck, and build checks pass.
- [ ] Code-review findings are resolved.
- [ ] Exact Git SHA and verification commands are recorded.


## MTS-113 — Build full multi-device and offline acceptance suite

**Depends on:** `MTS-032`, `MTS-058`, `MTS-083`, `MTS-096`  
**Execution mode:** TDD implementation ticket  
**Review gate:** Specification compliance, then code quality

### Goal

Automate and manually verify mission edit/delete/completion/Story conflicts across two devices and offline recovery.

### Acceptance criteria

- [ ] All approved winner rules hold.
- [ ] Silent updates stay silent.
- [ ] Active-work messages appear only when required.
- [ ] No duplicate XP/media/Story draft is created.

### Required TDD evidence

- [ ] Two-device test matrix.
- [ ] Network partition scenarios.
- [ ] Restart recovery scenarios.

### Code-review focus

- Race reproducibility and cleanup.

### Explicitly out of scope

- Any feature or infrastructure side effect not required by this ticket.
- Live production credentials, deployment, store submission, or public activation unless this ticket explicitly states a separately approved staging action.
- Refactoring unrelated modules merely to standardize style.

### Closure evidence

- [ ] Failing test or test fixture recorded before implementation.
- [ ] Focused tests pass.
- [ ] Affected-workspace format, lint, typecheck, and build checks pass.
- [ ] Code-review findings are resolved.
- [ ] Exact Git SHA and verification commands are recorded.


## MTS-114 — Verify media and account deletion end to end

**Depends on:** `MTS-037`, `MTS-085`, `MTS-099`, `MTS-108`  
**Execution mode:** TDD implementation ticket  
**Review gate:** Specification compliance, then code quality

### Goal

Produce evidence that every product-media copy is deleted, sessions are revoked, provider links disconnect, and retained feedback is unlinked.

### Acceptance criteria

- [ ] No product original/derivative/thumbnail/temp/cache remains.
- [ ] No soft-deleted/versioned recoverable copy remains under production policy.
- [ ] All sessions are invalid.
- [ ] External events remain.
- [ ] Feedback remains unlinked.

### Required TDD evidence

- [ ] Staging deletion drill.
- [ ] Blob inventory proof.
- [ ] Database referential proof.
- [ ] Session replay test.

### Code-review focus

- Privacy release gate.

### Explicitly out of scope

- Any feature or infrastructure side effect not required by this ticket.
- Live production credentials, deployment, store submission, or public activation unless this ticket explicitly states a separately approved staging action.
- Refactoring unrelated modules merely to standardize style.

### Closure evidence

- [ ] Failing test or test fixture recorded before implementation.
- [ ] Focused tests pass.
- [ ] Affected-workspace format, lint, typecheck, and build checks pass.
- [ ] Code-review findings are resolved.
- [ ] Exact Git SHA and verification commands are recorded.


## MTS-115 — Complete localization and accessibility acceptance

**Depends on:** `MTS-101`, `MTS-102`, `MTS-103`, `MTS-104`  
**Execution mode:** TDD implementation ticket  
**Review gate:** Specification compliance, then code quality

### Goal

Run all screens in English/zh-HK, large text, bold text, light/dark, VoiceOver/TalkBack, and Reduce Motion.

### Acceptance criteria

- [ ] No critical clipping or inaccessible action remains.
- [ ] Calendar colour statuses have written accessible equivalents.
- [ ] Focus order is logical.
- [ ] Known platform differences are documented.

### Required TDD evidence

- [ ] Bilingual visual matrix.
- [ ] Accessibility audit reports.
- [ ] Manual sign-off scripts.

### Code-review focus

- No waiver without explicit release review.

### Explicitly out of scope

- Any feature or infrastructure side effect not required by this ticket.
- Live production credentials, deployment, store submission, or public activation unless this ticket explicitly states a separately approved staging action.
- Refactoring unrelated modules merely to standardize style.

### Closure evidence

- [ ] Failing test or test fixture recorded before implementation.
- [ ] Focused tests pass.
- [ ] Affected-workspace format, lint, typecheck, and build checks pass.
- [ ] Code-review findings are resolved.
- [ ] Exact Git SHA and verification commands are recorded.


## MTS-116 — Complete external provider staging verification

**Depends on:** `MTS-071`, `MTS-075`, `MTS-077`, `MTS-081`, `MTS-087`, `MTS-094`  
**Execution mode:** TDD implementation ticket  
**Review gate:** Specification compliance, then code quality

### Goal

Run budget-capped live staging tests for Google, EventKit, AI, notifications, and provider outage/recovery.

### Acceptance criteria

- [ ] No production credentials are used.
- [ ] Provider retention terms are reviewed.
- [ ] Reconnect and cancellation behavior match spec.
- [ ] AI structured outputs and error handling are proven.

### Required TDD evidence

- [ ] Staging evidence packet.
- [ ] Provider fixture refresh.
- [ ] Failure injection results.

### Code-review focus

- No public activation or production writes.

### Explicitly out of scope

- Any feature or infrastructure side effect not required by this ticket.
- Live production credentials, deployment, store submission, or public activation unless this ticket explicitly states a separately approved staging action.
- Refactoring unrelated modules merely to standardize style.

### Closure evidence

- [ ] Failing test or test fixture recorded before implementation.
- [ ] Focused tests pass.
- [ ] Affected-workspace format, lint, typecheck, and build checks pass.
- [ ] Code-review findings are resolved.
- [ ] Exact Git SHA and verification commands are recorded.


## MTS-117 — Create operational runbooks and observability dashboards

**Depends on:** `MTS-025`, `MTS-085`, `MTS-105`, `MTS-116`  
**Execution mode:** TDD implementation ticket  
**Review gate:** Specification compliance, then code quality

### Goal

Document incidents, queue failure, calendar watch renewal, media cleanup, account deletion, AI outage, rollback, and support access.

### Acceptance criteria

- [ ] Runbooks include ownership and safe commands.
- [ ] Dashboards use non-content telemetry.
- [ ] Alerts are bounded and actionable.
- [ ] Feedback access is audited.

### Required TDD evidence

- [ ] Runbook tabletop exercises.
- [ ] Alert test.
- [ ] Dead-letter recovery rehearsal.

### Code-review focus

- No user-content logging in operations.

### Explicitly out of scope

- Any feature or infrastructure side effect not required by this ticket.
- Live production credentials, deployment, store submission, or public activation unless this ticket explicitly states a separately approved staging action.
- Refactoring unrelated modules merely to standardize style.

### Closure evidence

- [ ] Failing test or test fixture recorded before implementation.
- [ ] Focused tests pass.
- [ ] Affected-workspace format, lint, typecheck, and build checks pass.
- [ ] Code-review findings are resolved.
- [ ] Exact Git SHA and verification commands are recorded.


## MTS-118 — Run release-candidate end-to-end suite

**Depends on:** `MTS-110`, `MTS-111`, `MTS-112`, `MTS-113`, `MTS-114`, `MTS-115`, `MTS-116`, `MTS-117`  
**Execution mode:** TDD implementation ticket  
**Review gate:** Specification compliance, then code quality

### Goal

Run the complete approved user flows on release-like iOS and Android builds.

### Acceptance criteria

- [ ] Authentication through deletion passes.
- [ ] Calendar, recurrence, evidence, Planner, Story, feedback, and offline flows pass.
- [ ] No excluded v1 feature appears.
- [ ] All high/critical defects are closed.

### Required TDD evidence

- [ ] Maestro critical-path suite.
- [ ] Physical-device matrix.
- [ ] Store-build smoke tests.

### Code-review focus

- Evidence quality and no skipped critical flow.

### Explicitly out of scope

- Any feature or infrastructure side effect not required by this ticket.
- Live production credentials, deployment, store submission, or public activation unless this ticket explicitly states a separately approved staging action.
- Refactoring unrelated modules merely to standardize style.

### Closure evidence

- [ ] Failing test or test fixture recorded before implementation.
- [ ] Focused tests pass.
- [ ] Affected-workspace format, lint, typecheck, and build checks pass.
- [ ] Code-review findings are resolved.
- [ ] Exact Git SHA and verification commands are recorded.


## MTS-119 — Prepare store, privacy, and production go/no-go packet

**Depends on:** `MTS-118`  
**Execution mode:** TDD implementation ticket  
**Review gate:** Specification compliance, then code quality

### Goal

Assemble final SHA, build identifiers, CI results, provider approvals, privacy reviews, policy declarations, rollback plan, and unresolved-risk list.

### Acceptance criteria

- [ ] Packet distinguishes approval from deployment.
- [ ] Production activation requires separate explicit user approval.
- [ ] Exact-alarm and OAuth/store requirements are recorded.
- [ ] No unresolved release blocker is hidden.

### Required TDD evidence

- [ ] Packet completeness check.
- [ ] Independent code-review verdict.
- [ ] Final clean-checkout verification.

### Code-review focus

- No deployment, store submission, or public activation in this ticket.

### Explicitly out of scope

- Any feature or infrastructure side effect not required by this ticket.
- Live production credentials, deployment, store submission, or public activation unless this ticket explicitly states a separately approved staging action.
- Refactoring unrelated modules merely to standardize style.

### Closure evidence

- [ ] Failing test or test fixture recorded before implementation.
- [ ] Focused tests pass.
- [ ] Affected-workspace format, lint, typecheck, and build checks pass.
- [ ] Code-review findings are resolved.
- [ ] Exact Git SHA and verification commands are recorded.


---

## 8. Recommended Execution Policy

For each ticket:

1. Inspect the repository and confirm actual paths and existing conventions.
2. Create or update the ticket branch/worktree according to the repository policy.
3. Use the downloaded **tdd** workflow to establish failing tests.
4. Use the downloaded **implement** workflow to make the smallest compliant change.
5. Run focused verification, then affected-workspace verification.
6. Use the downloaded **code-review** workflow.
7. Resolve review findings and rerun verification.
8. Close the ticket only with SHA-linked evidence.

Do not execute multiple tickets concurrently when they change the same domain invariant, migration sequence, route surface, or mobile interaction. Parallel execution is safe only when dependency and file ownership are clearly independent.

---

## 9. Backlog Self-Review

- **Coverage:** Every technical delivery phase has implementation tickets.
- **Dependency direction:** Foundation precedes design/domain; domain and persistence precede feature transactions; release hardening depends on implemented features.
- **Atomicity:** Tickets target one coherent outcome and have independent acceptance evidence.
- **TDD:** Every ticket specifies required tests or verification fixtures.
- **Reviewability:** Every ticket states a review focus and prohibits unrelated refactoring.
- **Privacy:** Evidence, Story, diagnostics, feedback retention, and account deletion have explicit tickets.
- **UI fidelity:** The four-tab structure, clean Calendar, phone responsiveness, light/dark mode, smooth motion, and accessibility have explicit coverage.
- **No premature execution:** This document creates tickets only. It does not approve implementation, deployment, provider configuration, or release.

---

## 10. Approval Gate

After this backlog is reviewed and approved:

1. Select `MTS-001` as the first implementation ticket.
2. Create the repository/worktree and execute only that ticket.
3. Apply the downloaded **tdd**, **implement**, and **code-review** workflows.
4. Do not start `MTS-002` until `MTS-001` has passing evidence and an approved review verdict.
