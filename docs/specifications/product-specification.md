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
- Organizer-controlled fields become editable in the copy.
- Personal mission note is copied.
- External invitation linkage is not copied.

---

## 11. Recurrence

### Patterns

Presets:

- Daily
- Weekly
- Monthly
- Yearly
- Custom

Custom supports:

- Every N days
- Every N weeks
- Selected weekdays
- Every N months
- Monthly on same date
- Monthly on first/second/third/fourth/last selected weekday
- Every N years
- Yearly on same month/date
- Yearly on first/second/third/fourth/last selected weekday of a month

Not supported:

- Multiple ordinal weekdays in one rule
- Complex exception dates
- Pause/resume

### Ending

- Never
- On a date
- After a number of occurrences

Date is inclusive.

Occurrence count includes only created occurrences. Invalid skipped dates do not count.

### Invalid dates

- Monthly 29th/30th/31st skips months without that date.
- February 29 yearly skips non-leap years.
- Never move to another date.

### Scopes

For edit, delete, hide, and restore where applicable:

1. This occurrence
2. This and future occurrences
3. Entire series

This and future splits the series internally. Earlier history remains unchanged. Completed occurrences remain immutable under every scope, including Entire series; series deletion removes only applicable unfinished occurrences.

Evidence, completion, lateness, XP award, Story draft, and colour always belong to individual occurrences.

### Series XP

- Calculate difficulty/base XP once for the series.
- Reuse per occurrence.
- Recalculate when shared task details/estimated duration change.
- Schedule-only changes do not require recalculation unless duration changes.
- Every occurrence keeps independent XP eligibility and award.

---

## 12. Time Zones and Travel

- Use IANA time zones.
- Store mission time zone and UTC instants.
- Compare lateness using absolute timestamps.
- Detect device time zone and allow manual override.
- When device zone changes, update current app zone and show a small notice without confirmation.
- Never recalculate historical streak days.

Mission time behaviour:

- Local time: preserves clock time when travelling.
- Fixed instant: preserves absolute moment and displays in new local time.

Defaults:

- Internally created missions default to Keep at local time when travelling.
- Imported events preserve provider behaviour.
- User may override when permitted.

Current app time zone controls streak-day boundaries from the change forward.

---

## 13. External Calendar Connection

### General model

- Internal Calendar remains central.
- External connection is optional.
- Maximum one connected external calendar.
- After setup, synchronization is bidirectional for fields the user controls.

### Initial direction

Offer:

1. Sync with [External Calendar]
   - External schedule is initial source.
   - Import eligible events as missions.

2. Sync with [App Name]
   - App schedule is initial source.
   - Create a dedicated provider calendar named after the app.
   - Export eligible missions there.

Use double confirmation because initial direction may migrate/replace future schedule data. Past data remains unchanged.

### Synchronized fields where ownership permits

- Title
- Date
- Start/end
- Time zone
- All-day status
- Recurrence
- Location
- Provider notes/description
- Deletion

App-only fields:

- Difficulty/XP
- Evidence/privacy/verification
- Completion colour/streak
- Story
- Personal mission note
- Internal mission type

### Disconnect

- Ends synchronization immediately.
- Discards queued external updates.
- Keeps internal mission copies.
- Removes active sync links.
- Does not modify external events.

### Reconnect

Same calendar:

- Relink using retained provider identifiers.
- Avoid duplicates.
- Import genuinely new events.
- Resume unfinished synchronization.
- Completed imports remain frozen.

Different calendar:

- Use normal source-direction setup.

### Permission revocation/outage

- Keep last synchronized data.
- Internal completion, evidence, XP, and Story remain usable.
- Queue eligible changes.
- Show status only in Settings → Connected Calendar.
- No repeated app-wide warnings.
- Resume and apply queued changes automatically when access returns.

### Conflict rule

- Latest valid edit timestamp wins automatically.
- Show a brief message only when actively viewed content changes.
- Server-accepted deletion always wins.

---

## 14. Imported Events and Organizer Ownership

### Invitee events

- App completion, evidence, XP, privacy, personal notes, and Story are allowed.
- Organizer-controlled title, schedule, recurrence, location, and provider description are read-only.
- Do not attempt unauthorized provider changes.
- RSVP behaviour stays governed by the external provider.

### Personal mission notes

For organizer-controlled events:

- App-only and private.
- Sync across the user’s devices.
- Never sync to Apple/Google.
- Organizer changes do not overwrite them.
- Visible only in Mission Details and relevant search results.
- May be used for Story text.
- Must be ignored by evidence verification.
- Deleted with internal mission/account.
- Copied when duplicated into an independent mission.

### Deleting an imported invitation

- Remove only the internal mission copy and synchronization link.
- Leave external invitation unchanged.
- Create hidden dismissal record.
- Do not decline/remove provider invitation.

### Hidden calendar events

Settings list:

- Upcoming hidden events only
- Event title/date
- Individual Restore
- No Restore all

Past hidden events disappear from visible list but remain dismissed.

Recurring hide/restore offers:

- This occurrence
- This and future occurrences
- Entire series

Restore:

- Removes matching dismissal.
- Fetches current provider details.
- Reimports as active mission.
- Does not restore prior completion/evidence/XP/Story.

Reconnection ends the relevant dismissal exclusion according to reconnect flow.

### Organizer updates before completion

Unfinished future event:

- Apply title, schedule, duration, location, provider notes, recurrence, and time-zone changes automatically.
- Preserve app-only settings and personal notes.
- Recalculate difficulty/XP when task details/duration change before start.

Moved into the past within 30 days:

- Remains completable.
- Permanently 0 XP.
- No user-edit warning because organizer caused it.

Moved more than 30 days into past:

- Read-only history.
- Disable completion, evidence, editing, and rescheduling.
- Keep deletion and duplication.

### Completion freeze

Once completed:

- Freeze title, date, time, time zone, location, provider notes, and recurrence context.
- Later organizer edits do not change history.
- Evidence, lateness, XP, and Story remain stable.

### Organizer cancellation/deletion

Future unfinished:

- Remove automatically.

Past unfinished:

- Keep read-only history.
- Disable completion, evidence, editing, and rescheduling.
- Allow deletion and duplication.

Completed:

- Keep read-only history.
- Do not reverse XP, streak, level, or totals.
- Allow deletion and duplication.

Mission Details shows Cancelled by organizer when provider status clearly supports it; otherwise Event cancelled. Calendar card stays clean.

### Generic/untitled events

- Import generic titles such as Busy unchanged.
- Import events with no title.
- Show app-only placeholder:
  - English: Untitled event
  - `zh-HK`: 未命名活動
- Never write placeholder back to provider.
- Update unfinished mission if organizer later adds title.
- Imported all-day events with insufficient detail use 30-minute effort estimate.

---

## 15. AI Difficulty and XP

### Difficulty inputs

AI uses mission details only:

- Title/description
- Estimated duration
- Physical effort
- Mental effort
- Complexity
- Preparation

Do not use user history.

Users cannot directly set difficulty.

Relevant edits before start recalculate on Save. No AI call while typing, dragging, or previewing. AI Planner drafts calculate only after Confirm Schedule.

### Base XP

```text
effectiveMinutes = clamp(estimatedMinutes, 5, 180)
timeScore = 10 + 1.3 × effectiveMinutes
Easy multiplier   = 0.70
Normal multiplier = 1.00
Hard multiplier   = 1.35
baseXP = min(250, round to nearest 5(timeScore × multiplier))
```

Missions estimated above 180 minutes should be divided.

### Proof bonus

- Accepted evidence: +15%.
- Accepted late evidence still receives bonus.
- Self-confirmed, Private, and Trust Mode: base XP only.
- XP-ineligible missions: 0 base and no bonus.

---

## 16. Completion and Evidence

### Normal Mode

- Evidence required by default.
- Individual mission may become Private before completion and before first evidence submission.
- Private completion: grey, base XP, streak credit.
- After first evidence submission, Private is no longer available.

### Trust Mode

- Global only.
- Applies to new and unfinished missions except those already in evidence processing.
- Disabling restores evidence requirement for unfinished missions except those already processing.
- Completed missions never change.
- Completion uses Complete Mission plus Mark completed? confirmation.
- Grey, base XP, streak, no camera.

### Capture

- In-app camera only; no gallery.
- Either camera orientation allowed.
- Preview: Retake / Submit Evidence.
- Retake before submit does not consume attempt.
- Submitted original remains immutable.
- User may explicitly save original to phone.

### Attempts

Maximum three submitted attempts:

- Initial
- Retry 1
- Retry 2

After failure while attempts remain:

- Show predefined short reason.
- Try another photo.
- I completed this mission (self-confirm).

After third failure, only self-confirmation remains if the 30-day window is still open.

### Verification response

- AI returns verdict and reason code in one request.
- App maps code to predefined message.
- No second AI explanation call.

### Self-confirmation

- Double confirmation.
- Yellow.
- Base XP only.
- Preserves streak.
- Never claims AI verification.

### Lateness

Timed:

`late threshold = scheduled finish + 10 minutes`

All-day:

`late threshold = 00:10 after the scheduled local date`

- On time if `firstSubmittedAt < threshold`.
- Late if `firstSubmittedAt >= threshold`.
- First submission timestamp controls retries.
- A successful retry can earn proof bonus.

### Offline evidence

- Record tap time.
- Consume attempt.
- Store photo securely.
- Show Waiting for verification.
- Upload automatically after reconnect.
- Use tap time when clock validation succeeds.

### Evidence deletion

- User may delete early without changing completion/XP/streak.
- Automatically delete after 30 days, including originals, server copies, thumbnails, temp files, and caches.
- Mission Details then shows Evidence automatically deleted after 30 days.

---

## 17. XP, Levels, and Streaks

### Award matrix

- Green verified on time: base + 15%
- Yellow verified late: base + 15%
- Yellow self-confirmed: base
- Grey Private: base
- Grey Trust Mode: base
- Incomplete: 0
- Deleted unfinished: 0
- Edited after start: 0
- Created/moved into past: 0

### Levels

- Unlimited.
- XP is not spendable.

Next-level XP:

`100 + 25 × (current level − 1)`

### Completion confirmation

Examples:

- Mission complete · +86 XP
- Mission complete · 0 XP
- Mission complete · +86 XP · Level 12

If multiple levels are gained, show only final level.

Behaviour:

- Brief subtle animation over Calendar
- One light haptic pulse
- Close the completion flow back to Calendar immediately
- Present Done and Create Story within the compact confirmation rather than a separate result screen
- Reduce Motion uses static confirmation
- Total XP only
- Breakdown/zero-XP reason in Mission Details

### Daily streak

Day with scheduled missions:

- At least one completion continues/preserves streak.
- No completion breaks it.

Day without scheduled missions:

- Pauses streak.

Eligible completion types:

- Verified on time
- Verified late
- Self-confirmed
- Private
- Trust Mode

Rules:

- Late completion of an earlier day does not repair a finalized streak.
- Creating a past mission does not repair it.
- Deleting a completed mission later does not change history.
- Offline evidence may mark Pending.
- Successful verification/self-confirm finalizes.
- Unresolved rejected evidence does not permanently preserve.
- Finalize at local day end using current app time zone.

### Cross-device progress

- XP, level, streak, totals, and mission status synchronize.
- Only completing device shows animation/haptic.
- Other devices update silently.

---

## 18. AI Planner

### Inputs

- Text up to 2,000 characters with live counter
- Camera/gallery screenshots
- Maximum three images per draft
- Text and images together where practical

### AI role

May extract title, date, time, duration, recurrence, location, and notes.

Must not:

- Rearrange schedule
- Optimize density
- Add breaks
- Judge lifestyle
- Ask clarification questions
- Invent highly uncertain items

Use sensible defaults only when reasonable. Use current zone and 30-minute duration where appropriate. Omit highly uncertain parts and show:

**Some schedule details could not be imported.**

### Preview

- Existing active missions appear normally.
- Draft missions use temporary outline.
- Drafts may be edited, moved, resized, deleted, or manually added.
- Overlaps allowed.
- Drafts do not notify, sync, affect XP, or affect streak.

### Persistence

- One unconfirmed draft.
- Persist across app closure and devices.
- Remains until confirmed/replaced.
- No draft history and no separate Discard Draft.
- Starting new extraction asks Replace current draft?

### Confirm

Show:

**Add this schedule to your calendar? This will activate N missions, schedule notifications, and sync with your connected calendar.**

On Confirm:

- Activate batch.
- Calculate difficulty/XP.
- Schedule notifications.
- Synchronize eligible fields.
- Clear draft.
- Open relevant Calendar date.

---

## 19. Story Creation

### Entry/output

- After completion, close the evidence/completion flow back to Calendar.
- Show the concise completion confirmation over Calendar with Done and Create Story actions.
- Do not auto-open the Story editor.
- Static 1080 × 1920 image only.
- No video, animation, music editing, or default watermark.

### Source

- Original evidence source
- Any submitted evidence-attempt photo
- AI-styled image

Original evidence is never modified. Story uses a separate copy.

Self-confirmed mission photos may be used, but Story must not claim AI verification.

### Drafts

- One unfinished draft per mission.
- Auto-save on leaving.
- Resume later.
- Starting over confirms and replaces.
- Undo/Redo is current session only.
- Reopening starts new edit stack.

### AI request budget

Maximum three AI generation requests per mission.

Counts:

- Initial styled image
- Image regeneration
- AI regeneration of headline/supporting text/layout/effects

Free:

- Source image
- Initial free text suggestions
- Manual edits
- Switching to retained version

Show remaining count.

### Initial suggestions

May suggest:

- Headline
- Supporting text
- Music/song or mood
- Mention
- Location
- Poll question/options

Use style profile or concise default.

Suggestions appear first and are not auto-placed. User chooses headline, supporting text, both, or photo only.

No feed-caption feature.

### Manual editing

Allow text edit/move/resize/recolour/remove, font category, crop/zoom/reposition, supported effects/decorations.

No built-in native Instagram stickers, GIFs, music, polls, links, mentions, or location stickers. Provide suggestions only.

### Style profile

First Create Story:

- Set up my style
- Use default

Setup uses 3–8 reference images.

Extract only abstract palette, contrast, crop, text position, font category, text density, emoji, effects, and tone.

Do not copy exact templates, usernames, logos, watermarks, faces, or captions.

Settings:

- Add/replace references
- Rebuild
- Reset default

References delete after 30 days; abstract profile remains until reset/account deletion.

Profile updates do not alter existing drafts; they apply to new Stories and later AI regenerations.

### Versions

- Up to three AI-generated image versions.
- Switch between source and existing AI versions for free.
- Delete individual generated versions.

Every version has fully separate:

- Headline/supporting text
- Fonts/colours/styles
- Crop/zoom/image position
- Text positions
- Effects/decorations/adjustments

No automatic sharing of composition state.

### Save/share

Save to Photos:

- 1080 × 1920
- No confirmation
- Show Saved to Photos.
- Save versions separately

Open Instagram:

- Show Sharing Notes first.
- Include copyable music/mood, mention, location, and poll suggestions.
- Notes persist with draft.
- Then use supported platform handoff.
- No Did you post? prompt or status tracking.

Share elsewhere:

- System share sheet.
- No Sharing Notes requirement.

External published media must be deleted on the external platform.

### Retention

Automatically delete after 30 days:

- Story drafts
- Generated images
- Export working copies
- Sharing Notes
- Thumbnails/temp/cache

After deletion, Story area returns to Create Story without deletion message.

---

## 20. Search

Search title, location, general notes, personal mission notes, past, and future missions.

- Show short personal-note excerpt only when it caused the match.
- Never show note excerpt on main Calendar.
- Tapping result opens original date, scrolls/highlights mission, then opens Mission Details.
- If deleted after results loaded: This mission is no longer available.
- Closing search clears query/results.
- No search history.
- Queries do not synchronize.
- Offline search uses cached data and may be incomplete.
- Refresh automatically after reconnect.

---

## 21. Notifications

### Mission reminders

Timed:

- One notification at start.
- `[Title] starts now.`

All-day:

- Default 09:00 in mission time zone.
- User may change per mission/series.

No early, repeated, overdue, or missed reminders.

### Same-time missions

- One combined notification: `3 missions start now`.
- Opens selected date and highlights missions.
- Single notification opens Mission Details.
- Private mission notification still shows title; OS controls lock-screen preview.

### Multi-device

- Every signed-in device with notifications enabled schedules locally.
- Complete/delete/reschedule cancels obsolete reminders after sync.
- Sign-out cancels local reminders.
- Other-device progress updates do not show banners.

---

## 22. Offline and Multi-Device Synchronization

### Available offline

- View cached Calendar/details/Progress
- Create/edit/move/resize/delete eligible missions
- Complete Trust/Private missions
- Capture/submit evidence for later verification
- Manually edit existing Story drafts
- Search cached missions/notes

Requires internet:

- AI Planner
- Evidence verification
- AI Story image/text
- Style-profile build/rebuild
- External sync

### Queues

Queue internal sync, eligible external updates, evidence upload, and Story saves. Apply automatically after reconnect.

Feedback reports are not auto-submitted; user taps Submit again.

### Clock validation

- Prefer original local action/save time.
- Validate device clock.
- If valid, use local timestamp.
- If invalid, silently use server receipt time.
- No user message.
- Record only in non-content diagnostics.

Applies to evidence, mission edits, completion, Story saves, and conflicts.

### Mission edit conflicts

- Latest valid saved edit wins.
- No field merge.
- Losing device reloads and shows This mission was updated on another device.
- Unsaved local changes are discarded.

### Deletion conflicts

- Server-accepted deletion wins.
- Delayed edits cannot recreate.
- Losing device shows This mission was deleted on another device.
- Permanent deletion marker and retired identifier enforce it.

### Completion conflicts

- First completion accepted by server wins.
- Local tap ordering across devices does not override acceptance.
- Award evidence result, colour, XP, streak, and Story eligibility once.
- Later attempts are duplicates.
- Losing device deletes temporary evidence/cache, excludes photo from Story, shows This mission was already completed on another device, and updates to accepted state.

### Story conflicts

- Sync after each saved edit.
- No real-time collaboration.
- Undo/Redo local only.
- Offline manual edits allowed.
- Latest valid saved version wins.
- No merge of layout/text/crop/effects.
- Losing device reloads and shows This Story draft was updated on another device.
- Reload clears Undo/Redo history.

---

## 23. Calendar Help

Calendar `?` opens a compact bottom sheet containing:

- Colour meanings
- Recurring behaviour
- Basic gestures
- Completion/evidence timing
- Link to full FAQ in Settings

Dismiss by swipe down, outside tap, or close button.

No tracking of whether it was opened. Button always remains available.

---

## 24. Accessibility and Feedback

### Supported

- System text-size scaling within practical limits
- System Bold Text
- VoiceOver
- TalkBack
- Reduce Motion
- Logical screen-reader order
- Accessible control labels
- Spoken mission title, time, recurrence, completion, and verification state
- Announcements for important changes

Story canvas stays fixed at 1080 × 1920; editor controls scale accessibly.

### Colour accessibility

Calendar may visually use colour only to stay clean.

Safeguards:

- Written status in Mission Details
- VoiceOver/TalkBack status
- Calendar `?` guide
- Other screens should not rely only on colour when space permits

### Reduce Motion

Replace moving outlines, parallax, decorative motion, and elaborate transitions with fades/immediate updates. Completion uses static confirmation. Essential loading remains visible.

### Haptics/sound

- Subtle haptics for selection, drag/resize, completion, and Story save.
- Respect system haptic settings.
- No in-app haptic toggle.
- No interface sounds.

---

## 25. Diagnostics, Privacy, and Retention

### Minimal diagnostics

Enabled by default with opt-out in Settings.

May collect:

- Anonymous crash reports
- Reliability metrics
- App version/build
- Device model
- OS version
- Error codes
- Crash identifiers
- Network state
- Screen name
- Timestamp
- Silent clock-validation correction events

Never collect automatically:

- Mission titles/notes
- Locations
- Calendar event content
- AI Planner input
- Evidence photos
- Story content
- Tokens
- Precise location

No advertising trackers, cross-app tracking, or personalized-ad use.

Do not show diagnostics notice during onboarding.

### Media retention

Automatically delete 30 days after each retained item is created:

- Evidence and derivatives
- Story drafts/media
- Sharing Notes
- Story reference images
- Thumbnails/temp/cache

Retain:

- Abstract Story style profile until reset/account deletion
- Mission metadata until mission/account deletion
- Aggregate progress/reward ledger under deletion rules
- Hidden-event dismissals until restore/reconnection reset/account deletion

Users may delete retained media early without affecting completion/XP/streak.

### Privacy settings

Include:

- Diagnostics toggle
- Connected-calendar management
- Media-retention information
- Account deletion
- Privacy Policy
- Terms of Service

---

## 26. Help, Feedback, and Problem Reporting

### Help

- Short FAQ only
- No support email link
- No chatbot
- No forum
- No public ticket-tracking interface

### Feedback form

Entry points:

- Send feedback
- Report a problem

Fields:

- Category
- Short description
- Optional follow-up email
- Optional manually selected screenshot

Do not auto-expose account email.

### Screenshot

- User selects manually through system photo picker.
- Never capture automatically.
- Preview before submit.
- Allow remove/replace.
- Strip unnecessary metadata.

### Automatic technical details

Only:

- App version/build
- Device model
- OS version
- Current screen name
- Error codes
- Crash identifiers
- Network state
- Submission timestamp

Never automatically include mission/calendar/AI/evidence/Story/token/location content.

### Submission preview

Show description, optional email, screenshot preview, plain-language technical summary, and Submit. Do not expose raw logs.

### Confirmation/follow-up

After success:

**Feedback sent. Thank you.**

- No in-app history/status.
- No reply without email.
- Follow-up only through deliberately supplied email.

### Offline draft

If offline:

- Keep local draft with description/type/email/screenshot/technical details.
- Show Couldn’t send. Try again when you’re online.
- Do not auto-submit.
- User taps Submit again.
- Persist after app closure.
- Delete after successful submit, manual discard, sign-out, or uninstall.

Discard asks Discard this feedback draft? with Cancel/Discard.

### Submitted feedback retention

- No automatic deletion period.
- Retain reports, optional email, screenshots, and technical information indefinitely unless administrators remove them.
- Restrict access to authorized personnel.
- Do not use for marketing or AI training.
- Account deletion does not delete submitted feedback.
- Remove internal account linkage after account deletion.
- Keep optional email because user deliberately supplied it.

This differs from the 30-day product-media policy and must be clearly disclosed.

---

## 27. Non-Functional Requirements

### Reliability

- Cached Calendar/completion remain available where specified.
- Destructive operations are idempotent.
- Deleted identifiers are never reused.
- Sync tolerates retries/provider outages.
- Reward issuance is exactly once per occurrence.

### Security

- OS secure storage for credentials and local keys.
- Encrypt sensitive synchronized data in transit and at rest.
- Protect evidence/Story working media from unrelated app access.
- Restrict feedback access by role.
- Never put tokens/private mission content in diagnostics.

### Performance

- Day navigation and cached search should feel immediate.
- Long histories use incremental loading/indexing without changing behaviour.
- Completion confirmation must not wait for non-critical sync.
- AI operations expose clear loading/retry states.

### Consistency

- Server-authoritative completion/deletion.
- Stable all-day ordering.
- Deterministic recurrence expansion.
- Shared time-zone and clock-validation rules.
- No automatic field merge.

### Privacy review risk

Before release, conduct focused privacy/legal review of:

- Indefinite feedback/screenshot retention
- Retention after account deletion
- Optional email follow-up
- Calendar-provider access
- AI processing of evidence/Story content
- 30-day deletion guarantees

This review does not alter approved product behaviour.

---

## 28. Key Acceptance Flows

### New user without external calendar

1. Sign in.
2. Language resolves automatically.
3. Notification explanation and optional permission.
4. Skip calendar connection.
5. Open empty Calendar.
6. Create mission.
7. Receive start notification if enabled.
8. Complete through evidence, Private, or Trust Mode.
9. Receive XP confirmation.
10. Optionally create/share Story.

### AI Planner import

1. Enter text and/or up to three images.
2. Extract without clarification questions.
3. Review outlined draft over active Calendar.
4. Edit/move/resize/add/delete draft missions.
5. Confirm schedule.
6. Calculate difficulty/XP.
7. Activate notifications and external sync.
8. Open relevant date.

### Evidence completion

1. Completion becomes available at start.
2. Open evidence flow.
3. Request camera permission contextually if needed.
4. Capture/retake/submit.
5. Record first submission time.
6. Verify.
7. Apply colour, XP, bonus, and streak.
8. Show concise confirmation.
9. Offer Create Story.

### Imported invitation dismissal

1. User deletes organizer-owned imported mission.
2. Remove app copy/sync link only.
3. Leave invitation unchanged.
4. Create hidden dismissal.
5. Prevent re-import.
6. Allow individual restore using current provider details.

### External cancellation

1. Provider reports cancellation/deletion.
2. Future unfinished disappears.
3. Past unfinished becomes read-only.
4. Completed remains frozen.
5. Preserve rewards.
6. Show cancellation only in Mission Details.

### Offline evidence conflict

1. Device A submits offline.
2. Store photo and validated local timestamp.
3. Device B completes online first.
4. Server accepts B.
5. A reconnects.
6. Reject duplicate.
7. Delete A temporary evidence.
8. Show already-completed message.
9. Sync accepted result.

### Account deletion

1. Open Privacy → Account deletion.
2. Reauthenticate.
3. Confirm permanent deletion.
4. Delete account data/media.
5. Disconnect calendar without deleting external events.
6. Invalidate all sessions.
7. Retain submitted feedback, remove account linkage, preserve deliberately supplied email.

---

## 29. Completion Criteria

The first-release design is implemented only when:

- Included features follow this specification.
- Excluded features are not introduced indirectly.
- App-owned deletion and organizer-owned invitation dismissal behave differently and correctly.
- Reward, streak, evidence, and Story state is occurrence-specific.
- Exact 30-day completion rules are enforced.
- Offline/multi-device conflicts are deterministic.
- Media deletion covers originals, derivatives, thumbnails, temp files, and caches.
- Accessibility semantics exist even where Calendar uses colour only.
- English and `zh-HK` are complete.
- Privacy Policy accurately describes diagnostics, AI processing, media retention, and indefinite feedback retention.
- No unresolved launch-scope decisions remain.

---

## 30. Next Gate

This is the approved-design consolidation, not an implementation plan.

After user review and approval:

1. Choose implementation stack and deployment architecture.
2. Decompose the system into independently deliverable phases.
3. Produce a detailed implementation plan with tests, provider validation, migration strategy, and release gates.
4. Begin implementation only after that plan is approved.
