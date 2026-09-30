# MTS-112 physical-device performance profile

Run this profile on the exact reviewed iOS and Android builds after automated GREEN. This file is the execution record as well as the procedure: do not replace blank evidence with estimated values, simulator-only values, or CI timing.

## Preconditions

- Use one supported mid-range iPhone/iOS device and one supported mid-range Android device.
- Record the exact Git commit, app build, device model, OS version, and profiling tool.
- Use the same reviewed commit as canonical CI.
- Warm the app once before warm-screen measurements.
- Prepare a representative cached Calendar day, queued sync changes large enough to exercise batching, and a completed mission with a supported Story source/effect combination.
- Keep mission titles, notes, evidence content, and Story content out of the evidence record. Record timings, counts, dimensions, and memory only.
- CI/Node benchmark results are smoke/regression evidence; they are not a substitute for this physical-device profile.

## Approved numeric budgets

| Metric | Budget |
| --- | ---: |
| Warm Calendar interactive | <= 2,000 ms |
| Cached day query | normally < 50 ms |
| Ordinary screen transition after data is available | <= 300 ms |
| 1080 x 1920 Story export | < 5,000 ms |

For repeated measurements, use the p95 summary produced by the MTS-112 performance helper. Do not create a numeric pass threshold for drag/resize frame pacing, Story editor frame pacing, sync application, or image-memory peak where the specification does not define one; preserve the raw profiler evidence for review.

## Device metadata

| Field | iOS | Android |
| --- | --- | --- |
| Git commit | _not run_ | _not run_ |
| App build | _not run_ | _not run_ |
| Device model | _not run_ | _not run_ |
| OS version | _not run_ | _not run_ |
| Profiling tool/version | _not run_ | _not run_ |
| Date/time | _not run_ | _not run_ |

## Warm Calendar and cached day

1. Open Calendar once and allow the local cache to settle.
2. Move away from Calendar, then return to it repeatedly without restarting the process.
3. Capture the MTS-112 `warmCalendarInteractive` samples from focus through the committed cached-data render.
4. Capture cached one-day query samples separately.
5. Record at least enough repeated samples to make p95 meaningful; keep the same dataset for both platforms.
6. Confirm the Calendar remains scrollable and selectable when the data appears.

| Evidence | iOS | Android |
| --- | --- | --- |
| Warm Calendar sample count | _not run_ | _not run_ |
| Warm Calendar p95 ms | _not run_ | _not run_ |
| Warm Calendar <= 2,000 ms | _not run_ | _not run_ |
| Cached day sample count | _not run_ | _not run_ |
| Cached day p95 ms | _not run_ | _not run_ |
| Cached day normally < 50 ms | _not run_ | _not run_ |

## Drag and resize

1. Select an unfinished timed mission.
2. Long-press and drag continuously through multiple intermediate positions for several seconds.
3. Repeat with resize.
4. Capture the platform frame timeline.
5. Confirm direct visual tracking continues while intermediate movement stays on UI-thread shared values; JS work is scheduled only on release.
6. Record frame/jank evidence without inventing a pass threshold beyond the specification's smooth/direct-tracking requirement.

| Evidence | iOS | Android |
| --- | --- | --- |
| Profiling trace/reference | _not run_ | _not run_ |
| Observed frame/jank summary | _not run_ | _not run_ |
| Full-day React rerender on each movement frame | _not run_ | _not run_ |
| Direct tracking remained usable | _not run_ | _not run_ |

## Sync application

1. Prepare enough queued/authoritative changes to require more than one default sync batch.
2. Run background/foreground synchronization with the native profiler attached.
3. Confirm push and pull batches never exceed the default 100-item budget unless an explicitly configured bounded batch size is under test.
4. Record batch counts, apply duration, and provider/network call counts.
5. Confirm changes are applied in batches rather than by repeated per-item provider calls.

| Evidence | iOS | Android |
| --- | --- | --- |
| Total changes | _not run_ | _not run_ |
| Largest observed batch | _not run_ | _not run_ |
| Number of sync/provider calls | _not run_ | _not run_ |
| Apply-duration summary | _not run_ | _not run_ |

## Story editor and export

1. Open Story editor with a supported source image and supported effect limits.
2. Exercise source/version switching, text edits, and background transforms while profiling frame pacing.
3. Export the same 1080 x 1920 Story repeatedly.
4. Capture the MTS-112 `storyExport` samples around native rendering.
5. Record p95 export duration and keep frame-pacing evidence for the editor.

| Evidence | iOS | Android |
| --- | --- | --- |
| Story editor trace/reference | _not run_ | _not run_ |
| Story editor frame/jank summary | _not run_ | _not run_ |
| Story export sample count | _not run_ | _not run_ |
| Story export p95 ms | _not run_ | _not run_ |
| Story export < 5,000 ms | _not run_ | _not run_ |

## Image memory

1. Profile memory while Calendar/Evidence/Story thumbnail surfaces are visible.
2. Record the displayed dimensions and the decoded/source dimensions of the image being loaded.
3. Confirm thumbnail/display surfaces use display-sized image resources rather than decoding an original solely for thumbnail presentation.
4. In Story editor, distinguish any full-resolution resource needed for final export from the resource used for interactive preview.
5. Record peak memory and any material allocation spike during source/version switching and export.

| Evidence | iOS | Android |
| --- | --- | --- |
| Thumbnail/display decoded dimensions | _not run_ | _not run_ |
| Original decoded for thumbnail-only surface | _not run_ | _not run_ |
| Peak memory during Story editing | _not run_ | _not run_ |
| Peak memory during export | _not run_ | _not run_ |

## Review rule

MTS-112 physical-device profiling is not complete until the iOS and Android evidence columns above contain real measurements from the exact reviewed commit. Any exceeded numeric budget requires a fix or an explicitly reviewed Story-export budget exception as allowed by the ticket.
