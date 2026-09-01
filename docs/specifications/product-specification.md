# Mission-to-Story Mobile App
## Product and Functional Design Specification

**Document status:** Consolidated design for user review  
**Scope:** First public release  
**Platforms:** iOS and Android  
**Languages:** English and Hong Kong Traditional Chinese (`zh-HK`)  
**Orientation:** Portrait only

---

## 1. Product Summary

The product is a mobile calendar and mission-completion app that turns ordinary plans into achievable missions. Users schedule or import activities, complete them with optional evidence, earn XP and streak progress, and may transform completed missions into vertical social Story images.

The app supports lawful everyday activity without judging the user’s lifestyle. Work, exercise, meals, meetings, travel, errands, study, and social activities are all valid missions. AI assists with extraction, difficulty estimation, verification, and Story creation, but it does not optimize, rearrange, or criticize the user’s schedule.

The first release prioritizes a simple, familiar calendar experience over advanced productivity systems.

---

## 2. Product Principles

1. The Calendar is the product centre.
2. The user controls the schedule; AI never rearranges it.
3. One calendar item equals one mission.
4. Completion is always explicit.
5. Normal Mode requests evidence by default; Private missions and Trust Mode allow no-evidence completion.
6. XP drives levels only and is never spendable.
7. The Calendar remains visually clean.
8. External-calendar ownership and permissions are respected.
9. Offline and multi-device conflicts use deterministic rules rather than manual merge screens.
10. First-release scope excludes avoidable complexity.

---

## 3. First-Release Scope

### Included

- Internal calendar and mission system
- Optional connection to one Apple or Google calendar
- Manual mission creation and editing
- Recurring missions
- AI Planner extraction from text and images
- Camera-based evidence verification
- Private completion and global Trust Mode
- XP, levels, streaks, and minimal progress history
- Static 1080 × 1920 Story creation
- Instagram handoff and system sharing
- English and `zh-HK`
- Offline mission and Story editing
- Multi-device synchronization
- Minimal diagnostics
- Short FAQ, feedback, and problem reporting

### Excluded

- Desktop or web app
- Dedicated tablet layout
- Landscape interface
- Paywall or purchases
- Guest mode
- Multiple signed-in accounts or quick switching
- Manual account recovery
- Provider switching or account merging
- Biometric/PIN app lock
- Sign out from all devices
- Internal social network, messaging, comments, feeds, or leaderboards
- User-facing mission categories
- Subtasks or checklists
- Attachments other than evidence and optional feedback screenshots
- Apple Health or Android Health Connect
- Data export
- Chatbot, public support email, forum, or in-app ticket tracking
- Search history
- Advanced analytics, charts, badges, or achievements
- Flexible or anytime tasks
- Automatic rescheduling or lifestyle optimization
- Timers, overrun detection, overdue prompts, or missed-task recovery
- Video Stories, music editing, animation, or direct Instagram publishing
- Recurrence pause/resume
- Manual all-day ordering
- Dragging between all-day and timed areas
- Advanced recurrence exception-date editors

---

## 4. Platform, Language, and Regional Behaviour

### Platforms and screens

- Launch on iOS and Android.
- Use one shared product experience with platform-specific calendar, camera, notification, photo-save, secure-storage, and share integrations.
- Implementation technology is intentionally unspecified in this product design.
- Portrait only.
- Phone screens are the primary design and QA target.
- Tablets receive a functional scaled phone interface.

### Language

- English and Hong Kong Traditional Chinese (`zh-HK`).
- Follow the phone language on first launch.
- Use `zh-HK` for supported Traditional Chinese; otherwise fall back to English.
- Allow manual language change in Settings.
- Use clear written Hong Kong Traditional Chinese rather than forced colloquial Cantonese.
- AI may use natural Cantonese wording when the user writes in Cantonese.
- User-entered mission titles and notes remain unchanged.
- AI Planner and Story text primarily follow the user’s input language, with app language as fallback.

### Regional formatting

- First day of week follows the phone region.
- No in-app week-start setting.
- Time follows the phone’s 12/24-hour setting.
- Numeric date order follows the phone region.
- Month and weekday names follow app language.
- XP, streaks, and recurrence values use regional number formatting.
- Internal timestamps and values remain standardized.
- Google Calendar may visually differ if its own week-start setting is customized; synchronization is unaffected.

### Appearance

- Follow system light/dark mode.
- No in-app appearance setting.
- Story exports are independent of app appearance.
- Do not implement special Increase Contrast or Button Shapes adaptation in v1.

---

## 5. Navigation

Permanent bottom navigation:

1. Calendar
2. AI Planner
3. Progress
4. Settings

### Calendar

- Main landing screen.
- Combined day timeline with seven-day strip.
- Month/date picker.
- Navigation to any past or future date.
- Calendar search.
- Small level and streak indicators.
- Contextual `?` help button.

### Progress

Show only:

- Current level
- XP toward next level
- Current streak
- Longest streak
- Total completed missions
- Recent completed missions

No charts, badges, leaderboards, or advanced analytics.

### Settings

Include:

- Language
- Trust Mode
- Notification status
- Connected Calendar
- Hidden calendar events
- Story style profile
- Privacy
- Help & Support
- Feedback / Report a problem
- Sign out
- Account deletion

---

## 6. Account and Authentication

### Entry and provider binding

- Account required before app entry.
- Sign in with Apple or Google.
- No guest mode.
- Account stays permanently linked to the original provider identity.
- No provider replacement, account merge, or manual recovery.
- Users recover provider access through Apple or Google.

### Session behaviour

- Automatic sign-in between launches.
- Credentials stored in OS-protected storage.
- Silent refresh where possible.
- Reauthentication after manual sign-out, revoked access, unrecoverable expiry, or security failure.
- No biometric, fingerprint, PIN, or independent app lock.
- One active account per device.
- Normal sign-out affects only the current device.
- The same account may be used on multiple devices.

### Sign-out

On sign-out:

- Delete local mission, calendar, progress, Story, evidence, and feedback-draft data.
- Delete local tokens and app encryption keys.
- Cancel local mission notifications.
- Keep server-side account data.
- Keep the external-calendar connection attached to the account.
- Stop synchronization on that device.
- Keep general device-level settings such as language where appropriate.

On later sign-in:

- Restore account data from synchronization.
- Resume calendar synchronization after permission checks.
- Recreate eligible future notifications.
- Do not restore past notifications.

### Account deletion

Requires recent reauthentication and final confirmation.

Deletion is immediate and permanent, with no recovery period.

Delete:

- Internal missions and calendar data
- Progress data
- Evidence media
- Story media and drafts
- Story reference media
- Style profile and settings
- Authentication tokens
- External synchronization links
- Hidden-event dismissal records

Also:

- Disconnect/revoke external-calendar access.
- Do not delete existing external-calendar events.
- Invalidate access on all devices.

**Submitted feedback exception:** retain submitted feedback, optional email, screenshot, and technical details. Remove the internal account identifier so the retained report cannot be reconnected to the deleted account. This must be disclosed in the Privacy Policy.

---

## 7. Onboarding and Permissions

### Onboarding flow

1. Sign in with Apple or Google.
2. Select app language automatically from phone language.
3. Explain mission notifications.
4. Offer notification permission.
5. Offer optional external-calendar connection.
6. Open Calendar.

Story style setup occurs only when the user first chooses Create Story.

### Notification permission

Before the system prompt, explain that notifications are used for mission-start reminders.

Actions:

- Enable notifications
- Not now

Denial does not block app access. Users can enable later in Settings.

### Camera permission

- Request only when evidence capture first begins.
- Explain why camera access is required.
- If denied, provide a system-settings shortcut.
- Private and Trust Mode completion remain available.

### Calendar permission

- Request only after the user chooses to connect a calendar.
- If denied, internal Calendar remains usable.
- Allow retry from Settings/connection flow.

### Photo access

- Use system photo picker for Story references and feedback screenshots.
- Do not request broad library access.
- Request save permission only when Save to Photos is first used.
- Denial does not block Story editing or external sharing.

### Location permission

- Do not request location permission.
- No GPS tracking or automatic place detection.
- Users enter location text manually.

---

## 8. Mission Domain Model

A mission is a scheduled calendar item with independent completion, evidence, reward, sharing, and synchronization state.

### Core fields

- Internal mission identifier
- Title
- Date
- Start/end time
- Saved IANA time zone
- All-day flag
- Estimated effort duration for all-day missions
- Recurrence rule
- Optional location
- Optional general notes for app-owned missions
- Optional private personal mission note for organizer-controlled imports
- Time behaviour: local clock time or fixed instant
- Evidence/privacy state
- XP eligibility
- Difficulty and base XP
- Completion/verification state
- Awarded XP
- Story linkage
- External provider linkage and ownership metadata
- Stable creation/import ordering key
- Permanent deletion marker

### Hidden AI metadata

AI may retain:

- Difficulty
- Internal mission type
- Explanation
- Confidence
- Model/version information

Users do not edit these fields. Internal mission type may guide verification and Story suggestions but does not directly change XP.

### Separate state dimensions

Keep schedule, completion, evidence, reward, Story, and external-sync state separate. Do not collapse them into one status field.

### Calendar colours

- Transparent/background: upcoming, current, or unfinished
- Green: accepted evidence and on time
- Yellow: accepted evidence late or self-confirmed after failed verification
- Grey: Private or Trust Mode completion

No red missed state. Unfinished historical missions remain transparent.

Written status is available in Mission Details, screen-reader output, and Calendar help.

---

## 9. Calendar Experience

### Opening behaviour

- Fresh launch opens today.
- Mission notification opens the mission and scheduled date.
- Supported deep links open their destination.
- Deleted target falls back to today.
- Returning from background keeps current date, scroll position, and selected mission while the app remains in memory.

### Today behaviour

- Show Today only when another date is selected.
- Tapping Today returns to today and the current-time position.
- Opening today scrolls to current time with a small amount of earlier context.

### Other dates

- Scroll to the first timed mission.
- If none, open at 08:00.
- All-day missions do not control timed-timeline scroll.

### Timeline

- Hour labels
- Visible 30-minute dividers
- Default mission duration: 30 minutes
- Drag/resize snap: 15 minutes
- Exact minute editing in Mission Details
- Current-time line on today

### Selection and gestures

- First tap selects a slot/mission and shows a frame.
- Second tap on the same item opens creation/details.
- Tapping another item moves selection.
- Scroll, date change, or outside tap clears it.
- Long-press drag moves an unfinished mission.
- Normal swipe scrolls.
- Selected unfinished timed mission shows a bottom resize handle.
- Long-press dragging the handle changes finish.
- Drag/resize saves immediately, synchronizes where eligible, and shows brief Undo.

### Creation sheet

Second tap on an empty slot opens a compact prefilled form.

Initial fields:

- Title
- Start
- End
- Save/Create

More options:

- Recurrence
- All day
- Estimated effort for all-day missions
- Time zone
- Keep at local time when travelling
- Private/evidence setting where allowed
- Location
- Notes

### Overlaps

Allowed with no blocking, penalty, or rearrangement.

- One: full width
- Two: side by side
- Three: side by side
- Four or more: two cards plus `+N more`
- Tapping grouped area opens a compact list

### All-day missions

- Display above timed events, between date header and timeline.
- No permanent ALL-DAY heading.
- Scroll with the page; not pinned.
- Show up to three cards plus `+N more`.
- Expand within the same page.
- Expansion lasts only for that date and current session.
- Date change/relaunch resets it.
- Stable creation/import order.
- No manual reordering.
- Completion does not move the card.
- No drag conversion between all-day and timed areas.
- Convert through Mission Details.

### Historical visibility

- Completed missions remain in original time slots indefinitely.
- Unfinished past missions also remain indefinitely.
- No automatic missed state or rescheduling.
- Completed and expired historical missions are read-only but deletable and duplicable.

---

## 10. Manual Mission Rules

### Scheduling requirements

Every mission requires:

- Scheduled date
- Start/end for timed missions
- Saved time zone
- Estimated effort for all-day missions

No unscheduled/anytime task system.

### Completion availability

Timed missions:

- Available from scheduled start.
- Remains available until the 30-day window expires.

All-day missions:

- Available from 00:00 on the scheduled local date.
- Scheduled finish is 00:00 immediately after that date.
- Remains available until 30 days after that finish.

Future completion is blocked.

### Thirty-day completion window

Deadline:

`scheduled finish + 30 days`

- Use the mission’s saved time zone.
- At the exact expiry timestamp, no new completion path remains.
- No retry or self-confirmation may begin after expiry.
- Evidence submitted before expiry may still succeed afterward.
- If it fails after expiry, no retry or self-confirmation is allowed.
- After expiry, mission becomes read-only but deletable and duplicable.
- It remains transparent and unfinished on Calendar.
- Mission Details shows only Completion window expired.
- No countdown or exact deadline before expiry.

### Creating/moving into the past

- Users may create a new mission within the previous 30 days.
- It is permanently worth 0 XP.
- It cannot repair a finalized streak.
- Users cannot create or move missions to more than 30 days in the past.

### Editing before start

- Edit unfinished missions normally.
- Relevant task changes recalculate difficulty/base XP on Save.
- Typing, dragging, and preview do not call AI.
- Schedule-only changes do not require AI unless task/estimated duration changes.

### Editing after start

Saving an edit after scheduled start permanently makes that occurrence XP-ineligible.

Show:

**Editing after the start time will remove XP for this mission.**

Effects:

- Base XP becomes 0.
- Proof bonus unavailable.
- Completion may still preserve an eligible current-day streak.
- Moving back to the future does not restore XP.

Moving a future mission into the past shows:

**Moving this mission to a past time will remove XP eligibility.**

### Completed mission restrictions

Completed missions cannot be edited, moved, rescheduled, converted between all-day/timed, or changed by later organizer updates.

They can be viewed, deleted, duplicated, and used for Story creation while retained media exists.

### Deletion

Unfinished deletion:

- Awards 0 XP.
- Cancels notifications.
- Synchronizes external deletion when the user owns/may edit the external event.
- Uses brief Undo where safe.

Completed deletion:

- Removes visible mission and retained mission media.
- Removes it from recent completion history.
- Does not reverse XP, level, streak, or completion totals.
- Retains a minimal reward-ledger record without title, notes, schedule, or evidence.

Every deleted mission/occurrence:

- Keeps a permanent deletion marker.
- Identifier is never reused.
- Delayed offline edits cannot restore it.

Organizer-owned invitations use dismissal rather than external deletion.

### Duplication

Duplicate opens a new editable creation form. Nothing is created until Save.

Copy where applicable:

- Title
- Date/time defaults
- Duration
- Recurrence only when deliberately selected
- Location
- Notes/personal mission note
- Time-zone behaviour
- Current evidence setting

Never copy:

- Completion
- Evidence/attempts
- Awarded XP
- Verification
- Story data
- Provider identifiers
- Invitation/attendee state
- Cancellation state

Recurring occurrence duplication defaults to one-time.

Expired/cancelled historical duplication:

- Defaults to today.
- Preserves original time and duration, even when already past today.
- If saved with a past start, remains permanently 0 XP.

Imported event duplication:

- Creates a new independent mission.
- Organizer-controlled fields become editable in the new copy.
- New copy has no provider ID or invitation state.
- If the source is cancelled/expired, it still defaults to today.

---

## 11. Evidence, Privacy, and Completion

### Normal Mode

Evidence is required by default.

Evidence capture:

- Camera only
- One new photo per attempt
- No gallery selection
- No video
- Maximum three submitted attempts per mission

Before submission:

- Retake
- Submit

After submission, the photo cannot be replaced for that attempt.

### Verification results

Accepted evidence:

- On time: green
- Late: yellow
- XP base + 15% proof bonus
- Preserves streak

Rejected evidence:

- Explain the reason.
- Retry only if attempts remain and the completion window has not expired.
- After final failure, or at any failure when the user insists, offer self-confirmation where time rules allow.

Self-confirmation:

**I really did it**

- Marks complete.
- Yellow status.
- Base XP only.
- No proof bonus.
- Preserves streak.

### Private mission

Private is chosen per mission.

- No photo/evidence.
- Complete with one confirmation.
- Grey status.
- Base XP only.
- Preserves streak.

### Trust Mode

Global Settings toggle.

When enabled:

- Normal missions complete without photo.
- One confirmation.
- Grey status.
- Base XP only.
- Preserves streak.

Changing Trust Mode affects future completion actions only. It does not recolour or rewrite historical completions.

### Organizer-owned/imported missions

Evidence mode remains user-controlled. Organizer ownership limits provider-controlled field editing, not completion privacy.

### Evidence retention

Submitted evidence photos auto-delete 30 days after the scheduled mission finish time.

Deletion is independent of verification timing. If verification is still pending at the deadline, backend deletion may wait only as long as operationally necessary to finish the in-flight check, then delete promptly. This exception must not become indefinite retention.

No manual evidence-photo delete while the mission record remains.

Deleting the mission/account deletes retained evidence immediately where deletion policy requires.

---

## 12. XP and Levels

### Difficulty

AI estimates Easy / Normal / Hard from:

- Duration or estimated duration
- Title
- Notes

Relevant edits before start recalculate on Save.

Difficulty is not directly user-editable.

### Base XP formula

```text
effectiveMinutes = clamp(estimatedMinutes, 5, 180)
timeScore = 10 + 1.3 × effectiveMinutes

Easy   = 0.70
Normal = 1.00
Hard   = 1.35

baseXP = min(250, roundToNearest5(timeScore × multiplier))
```

Tasks over 180 minutes should be divided; XP remains capped.

### Proof bonus

Accepted evidence earns a fixed 15% bonus.

### Level progression

```text
XP to next level = 100 + 25 × (currentLevel - 1)
```

Levels are unlimited.

No currency, marketplace, spending, or unlock store.

---

## 13. Streaks

- Scheduled day continues streak when at least one mission is completed.
- Scheduled day breaks streak when no mission is completed.
- Day with no scheduled missions pauses streak.
- Private, Trust, verified, late, and self-confirmed completions all preserve streak.
- Finalized past days do not repair from retroactive mission creation or completion.
- Offline pending evidence may show a temporary pending streak until accepted or self-confirmed.

---

## 14. Recurring Missions

Supported:

- Daily
- Weekly
- Custom weekdays
- Monthly by date
- Monthly by ordinal weekday, including second Tuesday
- Last day of month
- Yearly by date

No recurrence pause/resume.

### Edit/delete scope

When editing or deleting a recurring mission:

- This occurrence
- This and future
- Entire series

Provider behaviour may limit what can be changed for imported organizer-controlled events.

### Ending

- Never
- On date
- After N occurrences

`After N` counts created valid occurrences. Invalid dates that are skipped do not count.

---

## 15. External Calendar

### Connection limit

Maximum one connected Apple or Google calendar.

### Modes

Choose one:

- Sync with external calendar
- Misyra only

### Sync behaviour

- Two-way where provider permissions allow.
- Disconnect keeps an internal copy.
- Organizer-controlled fields remain read-only.
- Provider title remains read-only.
- Personal mission note is app-only and never written back to provider.
- Invitation/cancellation semantics follow provider truth.

### Hidden external events

Users may dismiss imported organizer-owned events from Misyra without deleting the provider event.

Dismissal identity includes provider event ID and recurrence scope.

---

## 16. AI Planner

Input:

- Free text up to 2000 characters
- Up to 3 images

Flow:

1. User submits text/images.
2. AI extracts candidate missions.
3. App shows one draft preview.
4. User edits the draft.
5. User taps Confirm schedule.
6. Only then are missions created.

Rules:

- One active draft per mission/import context where applicable.
- Undo/redo ±5 editing steps.
- No Q&A interrogation flow.
- AI may suggest schedule density but cannot rearrange the user’s existing schedule.

---

## 17. Story Creation and Sharing

- Manual Create Story from completed mission.
- Static 1080 × 1920 output.
- AI generates headline + supporting text.
- Style profile influences output.
- One AI image per request.
- User may choose Source image where available.
- No automatic stickers/music.
- No watermark.
- Share through Instagram handoff or system share sheet.

Story drafts are account data and synchronize across devices.

---

## 18. Search

Search appears only in Calendar search results, not as persistent Calendar clutter.

Search across:

- Mission title
- Personal mission note
- Provider title where allowed

Do not expose provider-private metadata.

---

## 19. Offline and Multi-Device

- Latest valid draft wins where drafts conflict.
- Server time is authoritative when device time is invalid.
- Deletion wins over delayed offline edits.
- Permanent tombstones prevent resurrection.
- Recurring create/delete uses explicit scope.
- Completion is occurrence-specific and exactly once.

---

## 20. Notifications

- Mission-start notifications only in v1.
- No overdue or missed prompts.
- Recreate eligible future notifications after sign-in/resync.
- Past notifications are not restored.

---

## 21. Privacy, Diagnostics, Feedback

- Minimal diagnostics only.
- Avoid content-rich logs.
- User may optionally include email and screenshot in feedback.
- Submitted feedback may be retained after account deletion only after internal account identity is removed.
- No data export in v1.

---

## 22. Account Data Deletion Semantics

Account deletion removes account-owned operational data, including missions, completion state, progress, external links, hidden events, Story state, retained product media, and auth/session data.

Submitted feedback is the explicit exception described above: retain only after unlinking the internal account identity.

No recovery period.

---

## 23. Accessibility and Visual Simplicity

- Maintain screen-reader labels for status and controls.
- Written status available outside colour alone.
- Keep Calendar uncluttered.
- No special high-contrast mode beyond system defaults in v1.

---

## 24. First-Release Non-Goals

Do not add categories, subtasks, health integration, payments, social feeds, direct Instagram publishing, advanced analytics, export, flexible tasks, or automatic rescheduling unless explicitly approved as a specification change.
