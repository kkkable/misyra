# Mission-to-Story Technical Specification

**Status:** Review draft  
**Date:** 2026-08-06  
**Product baseline:** Approved `mission-to-story-product-specification.md`  
**Visual baseline:** Approved Mission-to-Story UI and animation reference image  
**Platforms:** iOS and Android, portrait only  
**Languages:** English and Hong Kong Traditional Chinese (`zh-HK`)  
**Primary cloud region:** Azure Japan East  
**Delivery model:** Greenfield, local-first mobile application with server-authoritative conflict resolution

---

## 1. Purpose

This document converts the approved product specification and visual direction into an implementation-ready technical specification.

It defines:

- system boundaries;
- mobile and backend architecture;
- repository organization;
- interface and animation rules;
- persistent data models;
- synchronization and conflict rules;
- external-calendar adapters;
- AI and media-processing boundaries;
- privacy and retention enforcement;
- testing and release gates.

The product specification remains authoritative for user-facing behavior. This technical specification may clarify implementation details, but it must not introduce excluded features or weaken approved privacy, evidence, reward, synchronization, or deletion rules.

The next document after approval is a dependency-ordered ticket set. No feature implementation begins before this technical specification is approved.

---

## 2. Product Invariants

The implementation must preserve these invariants:

1. **One calendar item equals one mission.**
   - No subtasks, checklists, user-facing categories, or general attachments.

2. **The internal mission model owns app-only state.**
   - External calendars never own completion, evidence, XP, streaks, privacy, verification, completion colour, Story data, or personal mission notes.

3. **Completion is occurrence-specific and exactly once.**
   - The first completion accepted by the server wins.
   - XP, streak credit, completion totals, evidence result, and Story eligibility are issued once.

4. **Deletion is final for a deleted identifier.**
   - A server-accepted deletion wins over delayed edits.
   - Tombstones prevent offline or provider synchronization from recreating deleted occurrences.
   - A newly created or duplicated mission receives a new identifier.

5. **Completed mission history is immutable.**
   - Completed missions cannot be edited or rescheduled.
   - Imported completed missions freeze their historical provider details.

6. **Offline actions remain deterministic.**
   - The server validates local timestamps.
   - Valid original action time is used; server receipt time silently replaces an invalid device time.
   - Mission and Story conflicts use latest valid saved edit.
   - Deletion wins over edits.

7. **The 30-day rules are exact.**
   - Completion expires at scheduled finish plus 30 days.
   - Submission eligibility uses the recorded evidence-submit action time.
   - Product media is removed from app-controlled storage after 30 days.

8. **Rewards are deterministic.**
   - Shared pure domain code owns difficulty, XP, level, proof bonus, and streak rules.
   - No platform-specific reward calculation is permitted.

9. **Privacy boundaries are explicit.**
   - Mission content and product media are excluded from automatic diagnostics.
   - Personal mission notes are app-only.
   - Feedback and optional screenshots are retained under the separately approved retention policy and unlinked from deleted accounts.

10. **The app remains visually simple.**
    - Calendar cards use colour as the compact visible status signal.
    - Written status remains available in Mission Details, help, and accessibility output.
    - No dashboard-like density, extra navigation tabs, or decorative feature expansion.

---

## 3. First-Release Scope Boundary

### 3.1 Included systems

- Apple and Google account authentication
- Internal mobile calendar
- Manual and recurring missions
- Timed and all-day missions
- Offline mission creation and editing
- Local mission notifications
- Optional single external-calendar connection
- Google Calendar synchronization
- Apple Calendar synchronization on iOS through EventKit
- Evidence camera and verification
- Private mission completion
- Global Trust Mode
- Deterministic XP, levels, and streaks
- AI Planner extraction and preview
- Static 1080 × 1920 Story creation
- Source and AI-styled Story versions
- Progress screen
- Settings, hidden calendar events, FAQ, diagnostics toggle
- Feedback and problem reporting
- English and `zh-HK`
- Light and dark mode
- VoiceOver and TalkBack
- Dynamic text, bold text, and Reduce Motion
- Multi-device synchronization

### 3.2 Explicit exclusions

The first release must not contain:

- desktop or web application;
- dedicated tablet layout;
- landscape app interface;
- guest mode;
- multiple signed-in accounts on one device;
- account linking, provider replacement, or account merging;
- manual account recovery;
- friends, feeds, comments, follows, messaging, groups, or leaderboards;
- user-facing mission categories;
- subtasks or checklists;
- document, audio, or generic file attachments;
- health-platform integrations;
- live location or GPS tracking;
- paywall, subscription, or in-app purchase;
- export-all-data feature;
- analytics dashboards, charts, badges, or achievements;
- missed-mission state or red missed colour;
- recurring-series pause;
- advanced recurrence exception dates;
- Story video, music, animation, stickers, or internal Story gallery;
- real-time collaborative Story editing;
- automatic screen capture for feedback;
- broad photo-library permission;
- in-app interface sounds;
- separate week-start, time-format, date-format, number-format, appearance, or haptics settings;
- special Increase Contrast or Button Shapes adaptation in v1.

---

## 4. Technology Baseline

### 4.1 Mobile

Use:

- Expo SDK 57
- React Native 0.86
- React 19.2.3
- TypeScript strict mode
- Expo Router
- Hermes
- development builds and prebuild, not Expo Go
- iOS 16.4 or later
- Android 10 or later as the supported product floor

The repository uses Node.js 24 LTS. Expo SDK 57 requires Node.js 22.13 or later, so Node.js 24 satisfies both mobile tooling and server requirements.

### 4.2 Mobile libraries and platform services

Use:

- `expo-sqlite` for durable local state, local search, and mutation queues;
- `expo-secure-store` for refresh tokens and local encryption material;
- `expo-notifications` for local reminders and notification deep links;
- `expo-camera` for evidence capture;
- system photo-picker integration for Story references and feedback screenshots;
- `expo-file-system` for protected working files;
- `expo-media-library` only after explicit Save to Photos actions;
- `expo-localization` for language and regional settings;
- `expo-haptics` for subtle feedback;
- `react-native-reanimated` for interface motion;
- `react-native-gesture-handler` for Calendar and Story gestures;
- `@shopify/react-native-skia` for Story composition and export;
- `@js-temporal/polyfill` for IANA time-zone arithmetic;
- `zod` for runtime schemas;
- `@tanstack/react-query` for server synchronization lifecycle;
- `zustand` only for transient interface state.

Durable state must not be stored only in React state, Zustand, or React Query cache.

### 4.3 Server

Use:

- Node.js 24 LTS
- TypeScript strict mode
- Fastify
- PostgreSQL 18
- Drizzle ORM
- Azure Container Apps for the API and queue worker
- Azure Container Apps Jobs for scheduled cleanup and repair tasks
- Azure Service Bus for asynchronous commands
- Azure Blob Storage with private containers
- Azure Key Vault for secrets and encryption keys
- Azure Container Registry
- Application Insights and OpenTelemetry for backend reliability telemetry

### 4.4 AI boundary

Use a server-side `AiGateway` interface. No AI provider key is included in the app.

The gateway supports:

- schedule extraction;
- difficulty and hidden mission-type classification;
- evidence verification;
- Story text suggestions;
- Story style-profile extraction;
- Story image generation.

All AI responses must use structured outputs validated with Zod. Invalid AI output is rejected and never written directly into authoritative domain state.

Model identifiers remain environment configuration. Production requires an explicit provider-retention review before evidence or personal Story media is processed.

### 4.5 Infrastructure and delivery

Use:

- pnpm workspaces;
- Turborepo;
- Bicep;
- GitHub Actions;
- local, development, staging, and production environments;
- Docker Compose for local PostgreSQL and Azurite;
- deterministic provider fakes for normal automated tests.

Do not mix npm, Yarn, or additional lockfiles into the repository.

---

## 5. Repository Structure

```text
mission-to-story/
├─ apps/
│  ├─ mobile/
│  │  ├─ app/                           # Expo Router route composition only
│  │  ├─ src/
│  │  │  ├─ auth/
│  │  │  ├─ onboarding/
│  │  │  ├─ calendar/
│  │  │  ├─ missions/
│  │  │  ├─ recurrence/
│  │  │  ├─ ai-planner/
│  │  │  ├─ evidence/
│  │  │  ├─ progress/
│  │  │  ├─ story/
│  │  │  ├─ search/
│  │  │  ├─ settings/
│  │  │  ├─ feedback/
│  │  │  ├─ sync/
│  │  │  ├─ storage/
│  │  │  ├─ notifications/
│  │  │  ├─ design-system/
│  │  │  ├─ accessibility/
│  │  │  └─ localization/
│  │  ├─ modules/
│  │  │  └─ apple-calendar/             # Local Expo module, Swift/EventKit
│  │  ├─ assets/
│  │  ├─ app.config.ts
│  │  └─ eas.json
│  ├─ api/
│  │  └─ src/
│  │     ├─ bootstrap/
│  │     ├─ auth/
│  │     ├─ accounts/
│  │     ├─ devices/
│  │     ├─ missions/
│  │     ├─ recurrence/
│  │     ├─ rewards/
│  │     ├─ sync/
│  │     ├─ calendars/
│  │     │  ├─ google/
│  │     │  └─ common/
│  │     ├─ evidence/
│  │     ├─ ai-planner/
│  │     ├─ stories/
│  │     ├─ media/
│  │     ├─ feedback/
│  │     ├─ diagnostics/
│  │     └─ webhooks/
│  └─ worker/
│     └─ src/
│        ├─ consumers/
│        ├─ jobs/
│        ├─ ai/
│        ├─ calendar-sync/
│        ├─ media-cleanup/
│        └─ reconciliation/
├─ packages/
│  ├─ domain/                            # Pure TS; no framework/provider imports
│  ├─ contracts/                         # API and event schemas
│  ├─ database/                          # Drizzle schema and migrations
│  ├─ testing/                           # Builders, fakes, deterministic clocks
│  ├─ localization/                      # English and zh-HK catalogs
│  ├─ config/                            # Shared TS/lint/test config
│  └─ design-tokens/                     # Typed visual and motion tokens
├─ infra/
│  └─ azure/
├─ docs/
│  ├─ specs/
│  ├─ tickets/
│  ├─ architecture/
│  ├─ privacy/
│  └─ runbooks/
├─ .github/workflows/
├─ compose.yaml
├─ package.json
├─ pnpm-workspace.yaml
└─ turbo.json
```

### 5.1 Boundary rules

- Route files compose feature screens; they do not contain domain calculations, SQL, provider logic, or synchronization policy.
- `packages/domain` has no React Native, Fastify, database, Azure, Google, Apple, or AI imports.
- Database access occurs through repositories or transaction services.
- Provider-specific recurrence and event formats are converted at adapter boundaries.
- Design tokens are the only source of visual constants.
- User-visible strings must come from localization catalogs.
- API request and response bodies must use shared contract schemas.
- Cross-package deep imports are forbidden.

---

## 6. Visual Design System

### 6.1 Visual character

The app should feel like a polished native calendar enhanced by mission progression.

It must be:

- clean;
- lightweight;
- calm;
- bright and optimistic in light mode;
- deep but not black-heavy in dark mode;
- rounded without becoming playful or childish;
- subtly gamified;
- animation-rich only where motion clarifies an action.

Avoid:

- conventional SaaS-dashboard panels;
- excessive labels on Calendar cards;
- large gradients behind ordinary content;
- heavy shadows;
- glassmorphism that reduces legibility;
- oversized game effects;
- dense icon toolbars;
- permanent explanatory copy.

### 6.2 Responsive phone frames

Design against a reference frame near **393 × 852 points**, then validate:

- 360 × 800
- 390 × 844
- 393 × 852
- 412 × 915

Rules:

- respect all safe-area insets;
- use width constraints, not fixed screenshot coordinates;
- never scale the whole interface to fit;
- scroll long content;
- keep touch targets at least 44 × 44 points;
- keep the bottom navigation and primary actions above system gesture areas;
- allow text wrapping instead of clipping;
- do not create a dedicated tablet layout;
- do not rotate the interface to landscape.

Only Story exports use a fixed 1080 × 1920 canvas.

### 6.3 Grid and spacing

Use a 4-point base grid.

```ts
export const space = {
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
} as const;
```

Default screen horizontal padding: 16 points.  
Compact Calendar internal padding: 8–12 points.  
Large section separation: 24–32 points.

### 6.4 Shape

```ts
export const radius = {
  xs: 8,
  sm: 10,
  md: 14,
  lg: 18,
  xl: 24,
  pill: 999,
} as const;
```

Use:

- 10–14 for fields and compact mission cards;
- 14–18 for sheets and large cards;
- 24 only for major modal surfaces;
- pill radius for status chips and primary compact actions.

### 6.5 Typography

Use platform system fonts.

- iOS: San Francisco system stack
- Android: Roboto system stack
- no bundled custom font in v1

Recommended semantic scale:

| Token | Size | Weight | Use |
|---|---:|---:|---|
| `caption2` | 11 | 500 | timeline metadata |
| `caption1` | 12 | 500 | supporting labels |
| `bodySmall` | 14 | 400/500 | secondary body |
| `body` | 16 | 400/500 | main text and controls |
| `headline` | 18 | 600 | card/sheet headings |
| `title3` | 22 | 700 | screen section title |
| `title2` | 28 | 700 | Progress level |
| `title1` | 34 | 700 | rare celebration use |

Support system text scaling. Critical controls may use layout adaptation and bounded scaling, but must never clip or disappear.

### 6.6 Light-mode tokens

```ts
export const lightColors = {
  canvas: '#F8F8FC',
  surface: '#FFFFFF',
  surfaceRaised: '#FFFFFF',
  surfaceMuted: '#F3F2F8',
  textPrimary: '#15152D',
  textSecondary: '#667085',
  textTertiary: '#98A2B3',
  border: '#E7E5EF',
  divider: '#EEEAF4',

  primary: '#6D3CF3',
  primaryPressed: '#5728D5',
  primarySoft: '#F0EAFF',
  primaryText: '#FFFFFF',

  verified: '#22A95B',
  verifiedSoft: '#EAF8EF',
  late: '#E89A12',
  lateSoft: '#FFF4D8',
  privateState: '#8A93A3',
  privateSoft: '#F0F2F5',
  destructive: '#E5484D',
  destructiveSoft: '#FDECEC',
  external: '#4A7FE7',
  externalSoft: '#EAF1FF',

  overlay: 'rgba(18, 18, 32, 0.38)',
  focusRing: '#8A63FF',
} as const;
```

### 6.7 Dark-mode tokens

```ts
export const darkColors = {
  canvas: '#11111A',
  surface: '#191925',
  surfaceRaised: '#222231',
  surfaceMuted: '#242434',
  textPrimary: '#F7F5FF',
  textSecondary: '#B9B5C8',
  textTertiary: '#8E899F',
  border: '#343247',
  divider: '#2A2939',

  primary: '#9B7AFF',
  primaryPressed: '#8461F4',
  primarySoft: '#2A214A',
  primaryText: '#FFFFFF',

  verified: '#54CF83',
  verifiedSoft: '#173325',
  late: '#FFC04D',
  lateSoft: '#3C2E13',
  privateState: '#A9B0BD',
  privateSoft: '#292D35',
  destructive: '#FF6B70',
  destructiveSoft: '#3D1F24',
  external: '#79A3FF',
  externalSoft: '#1E2D4D',

  overlay: 'rgba(0, 0, 0, 0.62)',
  focusRing: '#B29CFF',
} as const;
```

Status colour tokens require separate light and dark values. Do not invert light-mode colours automatically.

### 6.8 Elevation

Use restrained shadows:

- card: subtle 1–2 point vertical offset, low opacity;
- bottom sheet: stronger top separation;
- floating capture or primary action: medium elevation;
- no stacked heavy shadows.

Android elevation and iOS shadows must be tuned to appear visually equivalent, not numerically identical.

### 6.9 Core components

The design system must provide:

- `Screen`
- `SafeAreaScreen`
- `TopBar`
- `BottomNavigation`
- `SevenDayStrip`
- `Timeline`
- `TimeRuler`
- `CurrentTimeLine`
- `MissionCard`
- `AllDayMissionCard`
- `MissionSelectionFrame`
- `OverlapGroup`
- `PrimaryButton`
- `SecondaryButton`
- `DestructiveButton`
- `IconButton`
- `TextField`
- `TextArea`
- `ToggleRow`
- `SettingsRow`
- `SectionHeader`
- `StatusChip`
- `BottomSheet`
- `ConfirmationDialog`
- `Toast`
- `InlineMessage`
- `EmptyState`
- `LoadingSkeleton`
- `ImagePickerTile`
- `EvidenceThumbnail`
- `XPProgressBar`
- `StoryCanvas`
- `StoryToolbar`
- `GenerationCounter`
- `HelpSheet`

Every component must define:

- light and dark states;
- pressed, selected, focused, disabled, loading, and error states where applicable;
- Dynamic Type behavior;
- accessibility role and label behavior;
- Reduce Motion behavior;
- test identifiers only where needed for deterministic E2E tests.

---

## 7. Motion and Haptics

### 7.1 Motion principles

Motion must:

- clarify selection, hierarchy, and navigation;
- maintain direct finger tracking during drag and resize;
- never delay a save, completion, or navigation operation;
- never block the user behind a celebration;
- remain subtle and short;
- use the same motion language across iOS and Android.

### 7.2 Timing tokens

```ts
export const duration = {
  instant: 80,
  fast: 140,
  standard: 220,
  sheet: 280,
  emphasis: 420,
  celebrationMin: 600,
  celebrationMax: 900,
} as const;
```

Recommended easing:

```ts
export const easing = {
  standard: [0.2, 0.0, 0.0, 1.0],
  enter: [0.0, 0.0, 0.2, 1.0],
  exit: [0.4, 0.0, 1.0, 1.0],
} as const;
```

Recommended spring for release after drag/resize:

```ts
export const spring = {
  damping: 22,
  stiffness: 260,
  mass: 0.8,
} as const;
```

Values may be tuned through device testing, but must remain centralized tokens.

### 7.3 Required animations

- Tab change: restrained fade and small content translation.
- Bottom sheet: slide from bottom with backdrop fade.
- Mission selection: fast outline and handle appearance.
- Mission drag/resize: direct tracking; soft spring on release.
- Calendar date change: short directional slide or crossfade.
- Story Source/AI Style switch: crossfade with slight horizontal movement.
- Toast: short slide/fade; automatic dismissal.
- Mission completion: 600–900 ms success animation and one light haptic.
- Level-up: brief scale accent and small confetti burst within the same completion confirmation.
- Evidence result: sheet content transition, not a full page reload.

### 7.4 Reduce Motion

When the system setting is active:

- remove parallax;
- remove confetti;
- remove moving outlines;
- replace directional page movement with a fade or immediate update;
- keep static success confirmation;
- keep essential loading indicators;
- preserve direct drag interaction.

### 7.5 Haptics

Use subtle haptics for:

- time-slot selection;
- snapping during drag/resize;
- successful save;
- completion;
- Story save;
- destructive confirmation;
- validation failure where useful.

Respect system haptic settings. Do not provide a separate haptic toggle. Do not play interface sounds.

---

## 8. Navigation Architecture

Permanent bottom navigation:

1. Calendar
2. AI Planner
3. Progress
4. Settings

Rules:

- Calendar is the default root.
- There is no permanent Missions tab.
- There is no permanent Stories tab.
- The reference image’s central floating plus button is not a fifth navigation destination.
- Mission creation uses the approved two-tap Calendar interaction.
- Full-screen flows such as evidence capture and Story editing sit above the tab navigator.
- Modal bottom sheets are used for compact actions and contextual help.
- Deep links route to the relevant tab/date/mission where possible.
- A deleted deep-linked mission falls back to today.

---

## 9. Screen Specifications

### 9.1 Authentication

Required states:

- initial loading;
- Sign in with Apple;
- Sign in with Google;
- provider error;
- account unavailable;
- reauthentication for account deletion.

Behavior:

- no guest path;
- one account on a device at a time;
- automatic sign-in after first success;
- no biometric or in-app lock;
- no provider switching or account merge.

### 9.2 Onboarding

Sequence:

1. authenticate;
2. resolve app language from device;
3. explain mission-start notifications;
4. user chooses Enable notifications or Not now;
5. offer external calendar connection;
6. open Calendar.

Do not request:

- camera;
- photo-library save access;
- calendar access before the user chooses a calendar;
- location;
- health data.

No diagnostics notice is shown during onboarding.

### 9.3 Calendar

#### Structure

Top to bottom:

1. system safe area;
2. compact top bar;
3. month/date affordance;
4. seven-day strip;
5. small level and streak indicators;
6. Calendar help `?`;
7. up to three all-day mission cards, then `+N more`;
8. timed timeline;
9. bottom navigation.

All-day cards scroll with the Calendar; they are not pinned and have no permanent “ALL-DAY” heading.

#### Opening behavior

- Fresh launch: today.
- Return from background while retained in memory: preserve date, scroll, and selection.
- Notification/deep link: relevant date and mission.
- Today: current time line with earlier context visible.
- Other date: first timed mission; 08:00 when no timed mission.
- Today button appears only when not viewing today.

#### Timeline

- hour labels;
- visible 30-minute dividers;
- mission creation default duration 30 minutes;
- drag/resize snapping every 15 minutes;
- exact minute retained in details;
- current time line on today.

#### Selection and creation

- first tap selects a slot or mission;
- second tap on the same selected slot opens creation;
- second tap on the same mission opens Mission Details;
- tap elsewhere moves selection;
- scroll, date change, or outside tap clears selection;
- selected mission exposes a bottom resize handle;
- long-press drag moves or resizes;
- save is immediate after drag/resize;
- show Undo.

#### Mission card content

Compact card priority:

1. title;
2. time;
3. minimal secondary location when space permits;
4. no persistent visible status label;
5. no personal-note excerpt;
6. no internal category;
7. no difficulty explanation.

Status is communicated by approved colour treatment. Mission Details and accessibility output provide written status.

#### Overlap layout

- one: full available width;
- two: side by side;
- three: side by side;
- four or more: two visible cards plus `+N more`;
- tapping the grouped overflow opens a compact list.

#### Calendar help

The `?` button opens a compact bottom sheet explaining:

- status colours;
- recurrence behavior;
- two-tap creation;
- drag/resize;
- completion and evidence timing;
- link to full FAQ.

Dismiss through swipe down, outside tap, or close button. Do not track whether it was opened.

### 9.4 Mission creation and editing

Compact initial form:

- title;
- date;
- start;
- finish;
- Create/Save.

More options:

- all-day;
- effort duration for all-day;
- recurrence;
- time zone;
- travel behavior;
- Private/no evidence;
- location;
- personal notes where applicable.

Rules:

- field changes do not trigger AI;
- save triggers one classification/reward calculation when needed;
- after-start edit warning is explicit;
- creation or movement into the past permanently removes XP eligibility;
- no direct difficulty control;
- no category selector;
- no attachments.

### 9.5 Mission Details

Layout order:

1. title and schedule;
2. location/provider ownership where applicable;
3. written completion/evidence state;
4. personal notes;
5. XP summary;
6. evidence summary;
7. allowed actions;
8. destructive action.

Use a scrollable page, not a dense dashboard.

States:

- future editable internal mission;
- future read-only organizer-controlled imported mission;
- active mission;
- completed read-only mission;
- expired read-only mission;
- cancelled historical external mission;
- hidden/restorable external context where applicable.

Completed mission fields are frozen. Expired and cancelled historical missions remain deletable and duplicable.

### 9.6 Recurrence editor

Presets:

- Daily
- Weekly
- Monthly
- Yearly
- Custom

Supported patterns:

- every N days;
- every N weeks on selected weekdays;
- monthly same date;
- monthly first/second/third/fourth/last weekday;
- yearly same month/date;
- yearly first/second/third/fourth/last weekday of selected month.

Ending:

- Never
- On date, inclusive
- After count of actual created occurrences

Editing/deletion/restoration scopes:

- This occurrence
- This and future occurrences
- Entire series

Do not expose exception-date management or pause/resume.

### 9.7 AI Planner

Layout:

- text area with live 2,000-character counter;
- image row with up to three images;
- generation action;
- Calendar preview;
- fixed or sticky Confirm Schedule action when appropriate.

Behavior:

- one active draft;
- text and images may be combined;
- generated draft missions appear as temporary outlined cards;
- existing active missions remain visible;
- draft missions can be edited, moved, resized, added, or deleted;
- overlaps are visible and allowed;
- no notifications, rewards, or external sync before confirmation;
- replacing an existing draft requires confirmation;
- no draft history;
- no Discard Draft button;
- Confirm Schedule activates the batch and opens the relevant Calendar date.

AI only extracts schedule information. It must not optimize, rearrange, judge density, add breaks, or ask clarification questions.

### 9.8 Evidence capture

Flow:

1. open in-app camera;
2. capture;
3. review;
4. Retake or Submit Evidence;
5. verification pending;
6. accepted or rejected;
7. retry or self-confirm according to attempt state.

Rules:

- no gallery selection;
- retake before submit does not consume an attempt;
- maximum three submitted attempts;
- first submit timestamp controls lateness;
- offline submit stores the image privately and queues verification;
- rejected final attempt leads only to self-confirm while still inside completion window;
- no retry or self-confirm after expiry;
- submitted attempt photos are available for Story selection until deletion;
- original evidence is immutable;
- source photos may be saved explicitly.

Visual direction:

- full-screen camera;
- large familiar capture control;
- simple top close action;
- clear review;
- verification feedback in a bottom card or sheet;
- no unnecessary camera settings.

### 9.9 Completion confirmation

Show one brief confirmation:

- `Mission complete · +86 XP`
- `Mission complete · 0 XP`
- `Mission complete · +86 XP · Level 12`

Rules:

- total XP only;
- no base/bonus breakdown;
- no zero-XP reason;
- final level only when multiple levels are gained;
- one short animation and light haptic;
- immediately return to Calendar;
- other devices update silently without replaying animation.

### 9.10 Story creation

Initial choice:

- Source
- AI Style

Layout:

1. version selector;
2. large Story preview;
3. optional text suggestions;
4. editor toolbar;
5. remaining generation count;
6. Save to Photos;
7. Open Instagram;
8. Share elsewhere.

Rules:

- fixed 1080 × 1920 output;
- source image consumes no AI-generation request;
- maximum three AI generation/regeneration requests per mission;
- free initial text suggestions do not consume that budget;
- suggestions are not auto-placed;
- each image version has independent crop, text, style, position, effects, and composition;
- returning to an existing generated version is free;
- Undo/Redo is session-local;
- one unfinished draft per mission;
- no real-time collaboration;
- saved drafts sync across devices;
- offline manual editing works;
- AI operations require network;
- Open Instagram first shows Sharing Notes;
- no posting confirmation or status tracking.

### 9.11 Progress

Show only:

- current level;
- XP toward next level;
- current streak;
- longest streak;
- total completed missions;
- recent completed missions.

Use one clear level/progress card and a simple recent list. Do not add charts, badges, achievements, trends, or leaderboards.

### 9.12 Settings

Sections:

**Account and preferences**
- Trust Mode
- connected calendar
- language

**Privacy**
- diagnostics toggle
- media-retention information
- account deletion
- Privacy Policy
- Terms of Service

**Calendar and missions**
- hidden calendar events
- notification status

**Story**
- Story style profile

**Help**
- short FAQ
- Send feedback
- Report a problem
- About
- Sign out

No support email link is shown as a general Help action.

### 9.13 Feedback and problem report

Fields:

- type/category;
- short description;
- optional follow-up email;
- optional manually selected screenshot.

Automatically attach only:

- app version/build;
- device model;
- OS version;
- current screen name;
- error codes;
- crash identifiers;
- network state;
- submission timestamp.

Before submission, show:

- entered description;
- optional email;
- screenshot preview;
- plain-language summary of included technical information.

Offline:

- preserve local draft;
- do not auto-upload later;
- require the user to submit again;
- preserve after app close;
- discard requires confirmation;
- sign-out deletes the unsent local draft.

After success, show `Feedback sent. Thank you.` There is no in-app history or status tracking.

---

## 10. Accessibility

### 10.1 Supported system settings

Support:

- Dynamic Type / system text size;
- Bold Text;
- VoiceOver;
- TalkBack;
- Reduce Motion;
- system light/dark mode;
- system haptic settings.

Do not add special v1 adaptation for:

- Increase Contrast;
- Button Shapes.

Even without those adaptations, ordinary interface text and controls must meet baseline contrast and touch-target requirements.

### 10.2 Screen-reader behavior

Mission cards must announce:

- title;
- time;
- recurrence where relevant;
- completion/evidence status;
- external read-only state where relevant.

The Calendar visual card may rely on colour for compact status, but accessibility output must never rely on colour alone.

Drag/resize actions need accessible alternatives through Mission Details.

Status changes and validation errors should be announced through accessibility live-region equivalents.

### 10.3 Focus order

- follow visual top-to-bottom order;
- bottom sheets trap focus until dismissed;
- closing a sheet returns focus to its trigger;
- evidence result focuses the result heading;
- confirmation dialogs focus the title, then primary choices;
- Story toolbar uses deterministic order.

---

## 11. Domain Model

### 11.1 Mission series and occurrences

Use:

- `mission_series` for shared definition and recurrence;
- `mission_occurrence` for one stable scheduled instance.

A one-time mission is a series with no recurrence and one occurrence.

Recurring occurrences are materialized in bounded windows as needed. Once created, each occurrence receives a UUID that is never reused.

### 11.2 Canonical recurrence

```ts
export type RecurrenceEnd =
  | { type: 'never' }
  | { type: 'date'; inclusiveLocalDate: string }
  | { type: 'count'; occurrenceCount: number };

export type RecurrencePattern =
  | { type: 'daily'; interval: number }
  | {
      type: 'weekly';
      interval: number;
      weekdays: number[];
      weekStartsOn: number;
    }
  | { type: 'monthly-date'; interval: number; dayOfMonth: number }
  | {
      type: 'monthly-ordinal';
      interval: number;
      ordinal: 1 | 2 | 3 | 4 | -1;
      weekday: number;
    }
  | { type: 'yearly-date'; interval: number; month: number; day: number }
  | {
      type: 'yearly-ordinal';
      interval: number;
      month: number;
      ordinal: 1 | 2 | 3 | 4 | -1;
      weekday: number;
    };
```

Weekly recurrence is phased by calendar weeks, not rolling seven-day blocks from the anchor. `weekdays` and `weekStartsOn` use `0 = Sunday` through `6 = Saturday`. `weekStartsOn` is persisted with the recurrence rule and recurrence creation supplies the current phone-region week start. The calendar week containing the anchor is phase 0. Selected weekdays earlier than the anchor within phase 0 are not created; subsequent active weeks repeat every `interval` calendar weeks.

Invalid dates are skipped. Skipped dates do not count toward count-based endings.

### 11.3 Mission time model

Each mission stores:

- IANA time-zone ID;
- local date/time representation;
- derived UTC start and finish instants;
- `timeBehavior: 'local_time' | 'fixed_instant'`;
- all-day flag;
- estimated effort minutes for all-day missions.

Lateness compares absolute timestamps.

### 11.4 Separate state dimensions

Do not use one overloaded status enum. Persist separate values for:

- schedule state;
- completion state;
- evidence state;
- reward eligibility;
- reward issuance;
- calendar source;
- field ownership;
- synchronization state;
- Story state;
- deletion/tombstone state.

### 11.5 Persistent constraints

- one accepted completion per occurrence;
- one reward-ledger entry per occurrence;
- one active Story draft per occurrence;
- maximum three submitted evidence attempts;
- maximum three Story AI-generation requests;
- permanent tombstone for deleted occurrence IDs;
- completed occurrence fields immutable;
- deleted completed records leave minimal aggregate ledger data;
- provider subjects uniquely identify accounts;
- hidden external-event dismissal uniqueness includes provider ID and recurrence scope.

---

## 12. Reward and Streak Domain

### 12.1 Base XP

```text
effectiveMinutes = clamp(estimatedMinutes, 5, 180)
timeScore = 10 + 1.3 × effectiveMinutes

difficulty multiplier:
Easy   = 0.70
Normal = 1.00
Hard   = 1.35

baseXP = min(250, roundToNearest5(timeScore × multiplier))
```

Tasks over 180 minutes should be divided; XP remains capped.

### 12.2 Proof bonus

Accepted evidence earns a fixed 15% proof bonus.

Award matrix:

- verified on time: base + 15%;
- verified late: base + 15%;
- self-confirmed: base only;
- Private: base only;
- Trust Mode: base only;
- XP-ineligible edit/create/move: 0;
- unfinished: 0.

### 12.3 Levels

```text
XP to next level = 100 + 25 × (currentLevel - 1)
```

Levels are unlimited.

### 12.4 Streak

A scheduled day:

- continues streak when at least one mission is completed;
- breaks when no mission is completed;
- does not repair after local day finalization.

A day with no scheduled missions pauses the streak.

Private, Trust, verified, late, and self-confirmed completion all preserve the streak.

Offline evidence may show a temporary pending streak state until accepted completion or self-confirmation.

All reward and streak functions live in `packages/domain`.

---

## 13. PostgreSQL Model

Principal tables:

- `accounts`
- `account_sessions`
- `devices`
- `user_settings`
- `mission_series`
- `mission_occurrences`
- `mission_occurrence_tombstones`
- `mission_personal_notes`
- `mission_completions`
- `evidence_attempts`
- `reward_ledger`
- `streak_days`
- `story_drafts`
- `story_image_versions`
- `story_compositions`
- `story_style_profiles`
- `ai_planner_drafts`
- `ai_planner_items`
- `external_calendar_connections`
- `external_event_links`
- `hidden_external_events`
- `calendar_sync_cursors`
- `device_sync_mutations`
- `account_change_log`
- `media_assets`
- `feedback_reports`
- `feedback_media_assets`
- `outbox_events`
- `idempotency_keys`

### 13.1 Transaction boundaries

Use one transaction for:

- completion acceptance, reward issuance, streak update, and change-log append;
- occurrence deletion, tombstone insert, link removal, and change-log append;
- recurrence-series split;
- Story save after conflict comparison;
- account deletion and feedback unlinking;
- AI Planner confirmation batch activation;
- AI-generation budget reservation.

### 13.2 Outbox

Every committed state change requiring asynchronous work inserts an outbox row in the same transaction.

Outbox consumers cover:

- external-calendar commands;
- AI work;
- media processing;
- cleanup;
- notification-relevant account changes;
- reconciliation.

Consumers must be idempotent.

---

## 14. Local-First Mobile Data

SQLite is the mobile read model.

Store:

- cached mission series and occurrences;
- completion and reward summaries;
- personal notes;
- external links;
- hidden-event summaries;
- Story drafts and composition documents;
- AI Planner draft;
- local search index;
- notification registry;
- sync cursor;
- queued mutations.

### 14.1 Mutation lifecycle

1. Validate with shared domain code.
2. Update SQLite optimistically.
3. Insert mutation envelope in the same local transaction.
4. Submit queued mutations in order.
5. Receive authoritative results and account changes.
6. Apply accepted state or conflict result.
7. Remove settled mutation.

```ts
export interface SyncMutation<TPayload = unknown> {
  mutationId: string;
  accountId: string;
  deviceId: string;
  entityType:
    | 'mission'
    | 'story'
    | 'completion'
    | 'evidence'
    | 'settings';
  entityId: string;
  operation: 'create' | 'update' | 'delete' | 'complete' | 'submit';
  baseVersion: number | null;
  clientOccurredAt: string;
  payload: TPayload;
}
```

### 14.2 Incremental synchronization

Use a monotonically increasing per-account change sequence.

Mobile sends its last cursor and receives ordered:

- entity changes;
- tombstones;
- conflict outcomes;
- next cursor.

Use full snapshot only for:

- first sign-in;
- expired/corrupt cursor;
- repair;
- explicit local reset.

### 14.3 Search

Use SQLite FTS for:

- title;
- location;
- provider notes where permitted;
- personal mission notes.

Search works offline over cached data. Search query and history are not persisted. Note excerpts appear only in search results.

---

## 15. Conflict Resolution

### 15.1 Mission edit

- latest valid effective save time wins;
- no field merge;
- losing active editor reloads;
- show `This mission was updated on another device.`

### 15.2 Deletion

- accepted deletion always wins;
- tombstone rejects later offline edits;
- edited copy cannot recreate mission;
- show `This mission was deleted on another device.` when active work is affected.

### 15.3 Completion

- unique constraint on occurrence completion;
- first accepted server transaction wins;
- later evidence/completion submissions return `already_completed`;
- losing temporary evidence is deleted;
- show `This mission was already completed on another device.`

### 15.4 Story

- latest valid saved draft wins;
- no layout or text merge;
- losing device reloads;
- clear local Undo/Redo history;
- show `This Story draft was updated on another device.`

### 15.5 Timestamp validation

Store:

- original client time;
- server receipt time;
- effective time;
- validation result.

When device time fails validation, silently use server receipt time.

---

## 16. Authentication and Sessions

Immutable account key:

```text
(provider, provider_subject)
```

Do not use email as the primary identity key.

### 16.1 Exchange flow

1. Complete Apple or Google authentication.
2. Send provider proof to API.
3. Validate signature, issuer, audience, nonce, and freshness.
4. Find or create immutable provider-bound account.
5. Issue short-lived access token and rotating opaque refresh token.
6. Store refresh token in SecureStore.

### 16.2 Session rules

- access token target: 15 minutes;
- refresh token target: 30 days;
- rotate on every refresh;
- store refresh token hash on server;
- reuse of rotated token revokes that session family;
- normal sign-out revokes current device session only;
- account deletion revokes all sessions;
- account deletion requires provider proof issued within five minutes.

Sign-out also:

- clears account-specific SQLite data;
- clears local working media;
- clears unsent feedback draft;
- deletes local app keys/tokens;
- cancels notifications;
- preserves server data and external-calendar link.

---

## 17. API Surface

All endpoints are versioned under `/v1`.

Representative endpoints:

### Authentication

- `POST /v1/auth/apple/exchange`
- `POST /v1/auth/google/exchange`
- `POST /v1/auth/refresh`
- `POST /v1/auth/sign-out`
- `POST /v1/auth/reauthenticate`

### Account

- `GET /v1/account`
- `PATCH /v1/account/settings`
- `DELETE /v1/account`

### Sync

- `POST /v1/sync/push`
- `GET /v1/sync/pull?cursor=...`
- `GET /v1/sync/snapshot`

### Missions

- `POST /v1/missions`
- `PATCH /v1/missions/:occurrenceId`
- `DELETE /v1/missions/:occurrenceId`
- `POST /v1/missions/:occurrenceId/duplicate`
- `POST /v1/missions/:occurrenceId/complete`

### Evidence

- `POST /v1/evidence/attempts`
- `POST /v1/evidence/attempts/:attemptId/upload`
- `GET /v1/evidence/attempts/:attemptId`
- `DELETE /v1/evidence/assets/:assetId`

### AI Planner

- `POST /v1/ai-planner/drafts`
- `POST /v1/ai-planner/drafts/:id/extract`
- `PATCH /v1/ai-planner/drafts/:id`
- `POST /v1/ai-planner/drafts/:id/confirm`

### Stories

- `GET /v1/stories/:occurrenceId/draft`
- `PUT /v1/stories/:occurrenceId/draft`
- `POST /v1/stories/:occurrenceId/generate`
- `POST /v1/stories/:occurrenceId/text-suggestions`
- `DELETE /v1/stories/:occurrenceId/assets/:assetId`

### External calendars

- `POST /v1/calendars/google/connect`
- `GET /v1/calendars/google/callback`
- `POST /v1/calendars/disconnect`
- `GET /v1/calendars/hidden-events`
- `POST /v1/calendars/hidden-events/:id/restore`
- `POST /v1/webhooks/google-calendar`

Apple EventKit synchronization reaches the server through normal mobile sync mutations, not a public Apple webhook.

### Feedback

- `POST /v1/feedback`
- no feedback-list or status endpoint for the user.

### API rules

- mutating commands accept an idempotency key;
- request bodies are schema validated;
- content-bearing request bodies are excluded from general logs;
- media uploads use short-lived scoped upload authorization;
- provider errors map to stable internal error codes;
- active UI conflicts return explicit client-action codes;
- authorization checks occur before resource existence is disclosed.

---

## 18. External Calendar Architecture

Only one external calendar connection is active per account.

### 18.1 Shared adapter

```ts
export interface ExternalCalendarAdapter {
  connect(input: ConnectCalendarInput): Promise<CalendarConnection>;
  initialImport(connectionId: string): Promise<ImportBatch>;
  pullChanges(connectionId: string): Promise<ProviderChangeBatch>;
  applyCommands(commands: CalendarCommand[]): Promise<CalendarCommandResult[]>;
  restoreHiddenEvent(input: RestoreHiddenEventInput): Promise<ImportedEvent>;
  disconnect(connectionId: string): Promise<void>;
}
```

### 18.2 Google Calendar

- server-managed OAuth and refresh token;
- incremental sync token;
- webhook watch channel as a change signal;
- scheduled watch renewal;
- controlled full resync after invalid sync token;
- dedicated app calendar when app schedule is chosen as source;
- provider field-ownership mapping;
- retained provider IDs for reconnect and dismissal.

### 18.3 Apple Calendar

- iOS-only EventKit adapter;
- local Expo native module in Swift;
- request full calendar access only after user selection;
- support selected existing calendar or dedicated app calendar;
- listen for EventKit store changes;
- foreground and best-effort background sync;
- preserve external identifiers;
- cached internal missions remain available when no authorized iOS device is active.

### 18.4 Initial connection direction

Offer exactly:

1. Sync with external calendar
2. Sync with Mission-to-Story

The chosen direction controls the initial import/migration only. Subsequent eligible changes are bidirectional.

### 18.5 Field ownership

Sync where permitted:

- title;
- schedule;
- all-day;
- time zone;
- recurrence;
- location;
- provider description/notes;
- deletion.

App-only:

- difficulty;
- XP;
- evidence;
- privacy;
- verification;
- completion;
- colour;
- streak;
- Story;
- personal mission note.

Organizer-controlled imported fields remain read-only.

### 18.6 Hidden events

A dismissal record stores:

- provider;
- calendar ID;
- event ID;
- recurrence scope;
- effective range.

Deleting an imported invitation from the app:

- removes internal mission copy and link;
- does not modify or decline external invitation;
- prevents re-import.

Settings lists upcoming hidden events only. Restore fetches current provider details. Restore supports the three recurrence scopes.

### 18.7 Disconnect/reconnect

Disconnect:

- immediately stops sync;
- discards queued provider commands;
- retains current internal missions;
- removes future provider linkage behavior.

Reconnect same calendar:

- relink using retained provider IDs;
- avoid duplicates;
- import genuinely new events;
- keep completed imported missions frozen.

---

## 19. Notifications

Notifications are local on every signed-in device where enabled.

Rules:

- one notification at timed mission start;
- all-day default at 09:00 mission time zone;
- same-time missions combine;
- notification body includes title for a single mission;
- combined message uses count;
- no early, repeated, overdue, or missed prompts;
- sign-out cancels all local notifications;
- sync changes rebuild affected reminders;
- each device maintains its own schedule registry.

Use a rolling scheduling horizon rather than scheduling an infinite recurrence series.

Rebuild after:

- sign-in;
- mission change;
- recurrence materialization;
- time-zone change;
- permission restoration;
- device reboot;
- synchronization.

Android exact-alarm usage requires release policy validation. If exact access is unavailable, use the best supported local notification path without adding another user-facing setting.

---

## 20. Completion and Evidence Service

### 20.1 Completion command

```ts
export interface CompleteMissionCommand {
  occurrenceId: string;
  completionMode: 'verified' | 'self_confirmed' | 'private' | 'trust';
  effectiveActionAt: string;
  evidenceAttemptId?: string;
  deviceId: string;
  idempotencyKey: string;
}
```

Server transaction:

1. check tombstone;
2. check completion window;
3. check completion uniqueness;
4. check evidence/private/trust eligibility;
5. accept completion;
6. issue reward once;
7. update streak day;
8. append account changes;
9. emit outbox events.

### 20.2 Evidence attempt

Insert attempt before upload begins so the submit action time is preserved.

Persist:

- attempt number;
- first-submit time;
- effective submit time;
- upload status;
- verification status;
- controlled reason code;
- media asset ID;
- deletion deadline.

AI receives:

- mission title/task;
- relevant provider task details;
- schedule context;
- submitted image.

AI must not receive personal mission notes for verification.

### 20.3 Expiry

After exact finish + 30 days:

- no new completion;
- no retry;
- no self-confirmation;
- mission becomes read-only but deletable;
- already submitted evidence may still succeed;
- failed evidence after expiry creates no new path.

---

## 21. AI Planner Service

Inputs:

```ts
interface PlannerExtractionInput {
  text?: string;              // max 2,000 chars
  imageAssetIds: string[];    // max 3
  appTimeZone: string;
  locale: 'en' | 'zh-HK';
}
```

Output must be schema-validated:

```ts
interface PlannerExtractionResult {
  items: Array<{
    title: string;
    localDate: string;
    startLocalTime?: string;
    endLocalTime?: string;
    allDay: boolean;
    estimatedMinutes: number;
    location?: string;
    notes?: string;
    confidence: number;
  }>;
  omittedUncertainContent: boolean;
}
```

Highly uncertain items are omitted. The user sees only a simple partial-import message.

The AI does not:

- rearrange schedule;
- evaluate lifestyle;
- add breaks;
- optimize density;
- ask follow-up questions.

Draft confirmation creates active missions in one server transaction and dispatches asynchronous provider/notification work through the outbox.

---

## 22. Story Data and Rendering

### 22.1 Composition

Every image version has independent composition state.

```ts
export interface StoryComposition {
  canvas: { width: 1080; height: 1920 };
  background: {
    scale: number;
    translateX: number;
    translateY: number;
    rotation: number;
  };
  headline: StoryTextLayer | null;
  supportingText: StoryTextLayer | null;
  effects: StoryEffect[];
  revision: number;
  savedAt: string;
}
```

No text, crop, effect, or transform is shared automatically between versions.

### 22.2 Rendering

- Skia renders preview and final PNG.
- Coordinates use the fixed canvas coordinate space.
- Preview scales to available phone width.
- Export is local after all required assets are available.
- Save to Photos requests permission only at action time.
- System share uses the native share sheet.
- Instagram flow displays Sharing Notes before opening Instagram.

### 22.3 Generation budget

Reserve budget atomically before AI dispatch.

- maximum three requests per mission;
- successful user-requested generation consumes one;
- provider/server failure releases reservation;
- Source image consumes zero;
- existing version switching consumes zero;
- initial text suggestions consume zero.

---

## 23. Media Storage and Retention

Separate private containers:

- `evidence-working`
- `story-working`
- `planner-working`
- `style-references`
- `feedback-retained`

Every product media record stores:

- owner account;
- purpose;
- created time;
- delete-after time;
- storage keys for original, thumbnail, derivative, and temporary copies;
- deletion state;
- retry state.

Cleanup job:

1. lock due assets;
2. delete every app-controlled storage key;
3. retry transient failures;
4. record deletion evidence;
5. remove or mark the database row only after storage deletion succeeds.

Product-media containers must not retain recoverable soft-deleted versions or snapshots beyond the approved policy. Storage lifecycle at day 31 is defense in depth, not the primary timer.

Feedback media is stored separately and is not subject to the 30-day product-media lifecycle.

---

## 24. Diagnostics and Privacy

### 24.1 Mobile diagnostics

Enabled by default; user may disable in Settings.

Allow only:

- app/build version;
- device/OS class;
- screen identifier;
- error code;
- crash identifier;
- network state;
- timing and reliability metrics.

Do not collect automatically:

- mission title;
- mission notes;
- calendar content;
- AI Planner input;
- evidence;
- Story content;
- screenshot;
- view hierarchy;
- session replay;
- token;
- precise location.

Apply an allowlist-based scrubber before sending.

### 24.2 Backend logs

Do not log content-bearing request bodies for:

- missions;
- calendar synchronization;
- AI Planner;
- evidence;
- Stories;
- feedback.

Use:

- correlation ID;
- hashed account reference where possible;
- device/app/platform;
- operation category;
- provider error code;
- duration;
- outcome.

### 24.3 Account deletion

Account deletion:

- requires recent reauthentication;
- is immediate;
- revokes all sessions;
- deletes internal mission, progress, product media, drafts, styles, settings, tokens, links, and dismissal records;
- disconnects calendar access;
- leaves external events unchanged;
- unlinks submitted feedback from the account;
- retains deliberately submitted feedback content, optional email, screenshot, and technical information.

This exception must be explicit in privacy documentation.

---

## 25. Localization and Regional Behavior

Supported locales:

- `en`
- `zh-HK`

Rules:

- resolve from phone language on first launch;
- unsupported language falls back to English;
- user may change app language in Settings;
- user-entered content is not translated;
- AI output follows input language unless app-language context clearly overrides;
- Chinese copy uses natural Hong Kong written Traditional Chinese;
- Cantonese input may produce natural Cantonese output where appropriate.

Formatting:

- first day of week follows phone region;
- time format follows phone;
- numeric date order follows phone region;
- month and weekday names follow app language;
- number formatting follows phone region;
- no in-app formatting settings.

All user-visible strings must use localization keys. CI blocks missing keys in either locale.

---

## 26. Performance Budgets

Target supported mid-range phones, not only flagship devices.

Budgets:

- warm Calendar screen interactive within 2 seconds;
- cached day query normally below 50 ms;
- timeline scroll maintains smooth rendering under ordinary day density;
- drag/resize uses UI-thread animation and direct tracking;
- no full-day rerender on each drag frame;
- ordinary screen transition completes within 300 ms after data is available;
- Story preview interaction remains responsive with supported effect limits;
- 1080 × 1920 Story export target under 5 seconds on supported mid-range devices;
- background sync batches changes and avoids repeated provider calls;
- image thumbnails are sized for display rather than loading originals.

Performance regressions require profiling evidence before release.

---

## 27. Testing Strategy

### 27.1 Test-driven implementation

Each ticket follows:

1. write failing test;
2. implement minimum behavior;
3. refactor while green;
4. run focused verification;
5. run affected package verification;
6. pass code review before ticket closure.

### 27.2 Pure domain tests

Cover:

- recurrence expansion;
- monthly/yearly invalid-date skipping;
- count endings;
- series split scopes;
- IANA time zones;
- local-time vs fixed-instant travel;
- lateness threshold;
- exact 30-day boundary;
- XP calculation and rounding;
- proof bonus;
- level progression;
- streak pause/break/finalization;
- clock validation;
- conflict ordering;
- tombstone behavior;
- completion exactly once.

### 27.3 Mobile tests

Use React Native Testing Library and SQLite integration tests for:

- screen states;
- two-tap Calendar interaction;
- Calendar overlap layouts;
- all-day expansion;
- form validation;
- offline mutation queue;
- search;
- notification registry;
- Story composition persistence;
- localization;
- accessibility labels;
- Reduce Motion behavior.

### 27.4 Visual acceptance

Maintain screenshot fixtures for:

- light and dark mode;
- English and `zh-HK`;
- 360 × 800 and 412 × 915;
- default and enlarged text;
- Calendar;
- Mission Details;
- AI Planner;
- evidence review/result;
- Story editor;
- Progress;
- Settings;
- confirmation dialogs and bottom sheets.

Visual tests should detect token or layout regressions without forcing pixel-identical rendering across iOS and Android.

### 27.5 Gesture and animation tests

Automate where reliable:

- date navigation;
- slot selection;
- mission open;
- long-press drag;
- resize;
- bottom-sheet dismissal;
- Story version switch.

Use manual release scripts for:

- haptic quality;
- animation smoothness;
- VoiceOver;
- TalkBack;
- Reduce Motion;
- device-specific safe areas.

### 27.6 API and worker tests

- Fastify routes against disposable PostgreSQL;
- concurrency tests for completion and deletion;
- idempotent outbox/consumer tests;
- media deletion against Azurite and staging;
- Google Calendar adapter contract tests;
- EventKit harness tests;
- deterministic AI gateway fakes;
- staging-only live provider tests with budget limits.

### 27.7 End-to-end scenarios

Required E2E coverage:

- sign in and onboarding;
- create/edit/delete/duplicate mission;
- recurrence scopes;
- offline mission edit and reconnect;
- cross-device completion race;
- evidence success/failure/retry/self-confirm;
- 30-day expiry;
- Google connection/reconnect;
- Apple EventKit connection on iOS;
- hidden external event restore;
- AI Planner extraction and confirmation;
- Story create/edit/save/share;
- account sign-out cleanup;
- account deletion;
- feedback offline draft and successful submit.

---

## 28. CI and Quality Gates

Every pull request must run:

- lockfile install;
- formatting check;
- lint;
- TypeScript checks;
- unit tests;
- integration tests for affected packages;
- mobile component tests;
- build;
- dependency audit at high severity;
- secret scan;
- localization completeness;
- privacy/logging checks;
- Bicep compilation;
- contract compatibility checks.

Additional gates before release:

- iOS development and release build;
- Android development and release build;
- Maestro critical-path suite;
- VoiceOver/TalkBack scripts;
- media-deletion proof;
- account-deletion proof;
- provider reconnect proof;
- Android exact-notification policy check;
- Privacy Policy review for retained feedback;
- AI provider-retention approval.

---

## 29. Delivery Phases

The ticketing step should decompose work in this order:

1. Foundation and repository toolchain
2. Design system and four-tab mobile shell
3. Pure domain kernel
4. Local SQLite and synchronization foundation
5. Authentication and account lifecycle
6. Internal Calendar and mission editing
7. Recurrence and time-zone behavior
8. Rewards, levels, and streaks
9. Notifications
10. External calendars
11. Evidence and media retention
12. AI Planner
13. Story editor and sharing
14. Progress, Settings, feedback, and diagnostics
15. Localization, accessibility, and visual polish
16. Security, privacy, performance, and release hardening

Tickets must remain independently testable. A later phase must not be partially implemented inside an earlier ticket merely because a future interface is known.

---

## 30. Operational Facts to Resolve During Ticketing

These are configuration facts, not unresolved product behavior:

- final app display name;
- iOS bundle identifier;
- Android application ID;
- Apple Developer team and service identifiers;
- Google OAuth client IDs and consent configuration;
- Azure subscription/resource naming;
- final database sizing by environment;
- exact production AI models;
- Privacy Policy and Terms URLs;
- feedback operational access group;
- App Store and Play Store metadata.

Provider credentials, deployments, public activation, and production data remain separate explicit execution gates.

---

## 31. Specification Acceptance Checklist

The technical specification is approved when the reviewer confirms:

- architecture matches the product specification;
- UI matches the approved visual direction without copying conflicting reference features;
- four-tab navigation is preserved;
- Calendar remains the main interface;
- evidence remains camera-only;
- external organizer ownership is protected;
- recurrence and 30-day rules are exact;
- rewards and streaks are deterministic;
- offline conflicts are server-authoritative;
- product media deletion is enforceable;
- feedback retention exception is explicit;
- light/dark, localization, accessibility, and Reduce Motion are covered;
- no excluded first-release feature has been introduced;
- the phase order is suitable for conversion into tickets.

After approval, run the ticket-conversion step. Do not begin implementation directly from this document.
