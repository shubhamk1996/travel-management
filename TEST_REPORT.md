# Test Report

## Scope

The application was reviewed against `REQUIREMENTS.md`. Existing coverage was expanded with isolated JSON Server fixtures, persisted-document assertions, real Playwright browser interactions, and focused Vitest tests for deterministic business rules.

Coverage status: every documented functional requirement is exercised by at least one automated assertion. The report does not imply verification of unsupported concurrent clients or browsers outside the configured Chromium projects.

## Execution summary

| Suite / check | Total | Passed | Failed | Skipped | Actual result |
| --- | ---: | ---: | ---: | ---: | --- |
| Vitest | 15 | 15 | 0 | 0 | 2 files passed in 6.25s |
| Playwright | 23 | 23 | 0 | 0 | 23 passed in 3.0m |
| **Automated tests** | **38** | **38** | **0** | **0** | **All passed** |
| Type checking | 1 command | Passed | 0 | 0 | `tsc -b --pretty false` |
| Production build | 1 command | Passed | 0 | 0 | Vite production build completed |

The Playwright suite uses a fresh deterministic copy of `e2e/fixture.json` and resets all trip records before each test. Tests inspect JSON Server after UI actions to verify persistence rather than relying only on rendered elements.

## Requirement-wise coverage

| Requirement area | Automated verification |
| --- | --- |
| Trip lifecycle | Playwright creates a trip, validates dates, edits it, confirms refresh persistence, cancels and confirms deletion, and verifies the JSON Server resource. |
| Trip dates and status | Vitest verifies inclusive ranges, reversed ranges, the 366-day maximum, the 367-day rejection, and Upcoming/In progress/Completed boundary dates. Playwright verifies date edits and invalid ranges. |
| Money contracts | Vitest verifies non-negative integer-cent parsing, two-decimal input, the exact maximum amount, oversized amounts, deterministic formatting, and exact split totals. Playwright verifies invalid money input is not persisted. |
| Whole-document persistence | Playwright checks that mutations persist through JSON Server and survive reload. Failed API mutations are verified not to alter stored data. |
| Undo / redo | Playwright verifies persisted undo/redo across modules, atomic booking/schedule operations, redo clearing after a new change, and history reset after refresh. Vitest verifies the exact 50-snapshot cap. |
| Itinerary CRUD | Playwright creates, edits, deletes, and persists activities. Trip date shortening is used to verify out-of-range activities remain visible for correction. |
| Itinerary drag and drop | Playwright verifies pointer drag-and-drop within one day and across days, slot exchange, persisted dates/times, undo, redo, and reload. |
| Earlier/later movement | Playwright verifies adjacent flexible slot exchange through the movement controls. Fixed-activity movement controls are verified disabled. |
| Fixed activities | Vitest verifies fixed events are never rescheduled. Playwright verifies drag and earlier/later controls are disabled and that a booking preview preserves a conflicting fixed activity. |
| Booking lifecycle | Playwright creates, edits, delays, discards, applies, cancels, and deletes bookings. Linked-expense deletion is blocked and verified against persisted data. |
| Booking cancellation and delays | Playwright verifies preview dialogs, discard without saving, apply as one operation, undo restoration, and linked expense retention after cancellation. |
| Hotels and booking time blocking | Vitest verifies hotel costs affect budget but hotels do not create overlap/travel conflicts. Out-of-range hotel dates are still flagged. |
| Conflict detection | Vitest covers overlaps, travel-time gaps, unavailable travel times, opening hours, out-of-trip dates, hotel exclusions, and midnight overruns. Playwright exposes opening-hours and travel conflicts through UI edits. |
| Smart rescheduling | Vitest verifies minute-by-minute valid slot discovery, no new conflicts, fixed-item preservation, unresolved activities, and itinerary-order candidate processing. Playwright verifies booking preview/application with fixed conflicts and remaining conflicts. |
| Budget calculations | Vitest verifies estimated plans, actual spending, remaining budget, category totals, pending/confirmed/cancelled semantics, multiple linked payments, and linked-expense replacement of booking costs. Playwright verifies edited and deleted expenses change the displayed and persisted remaining budget correctly. |
| Duplicate expense prevention | Vitest verifies a confirmed booking linked to expenses is not counted once per record, including multiple linked payments and cancellation. Playwright confirms persisted expense IDs remain unique after equal, custom, and percentage additions. |
| Equal splitting | Vitest and Playwright verify deterministic leftover-cent distribution in participant selection order. |
| Custom splitting | Vitest and Playwright verify exact sum validation and persisted custom shares. |
| Percentage splitting | Vitest and Playwright verify hundredths-of-a-percent input, exact 100.00% validation, largest-remainder rounding, participant-order tie breaking, and exact cent totals. |
| Traveller management | Playwright adds, renames, and removes travellers; verifies the ID/reference-preserving edit; blocks deletion of referenced travellers; and verifies the new/removed state after persistence. |
| Settlements | Vitest verifies exact balances and greedy traveller-order transfers. Playwright verifies settlement rendering changes and remains consistent with expense undo/redo. |
| Form validation and boundaries | React integration tests verify trip form creation and reversed-date rejection. Playwright verifies invalid dates, midnight-overrun durations, excessive decimal precision, custom split totals, percentage totals, and no persistence for rejected input. |
| API and UI states | Playwright verifies loading, empty dashboard, success notices, mutation errors, unavailable trips, unknown routes, dialogs, cancellation confirmations, and navigation recovery. |
| Refresh persistence | Playwright verifies trips, activities, bookings, expenses, traveller edits, and cross-module state after page reload, plus session-only history loss. |
| Responsive navigation | Playwright runs all primary tabs and modal sizing at desktop (1440×1000), tablet (900×1100), and mobile (390×844), and asserts no horizontal document overflow. |

## Bugs identified and fixed

1. **Scheduler candidate order violated the requirement.** Flexible activities involved in conflicts were processed in JSON storage order rather than itinerary order. The scheduler now sorts candidates by date and time before greedy rescheduling. A Vitest case reproduces conflicting entries stored in the opposite order and verifies the corrected behavior.

## Test infrastructure changes

- Expanded `src/test/domain.test.ts` from broad baseline checks to explicit boundary, rounding, budget, conflict, scheduling, and history-cap assertions.
- Expanded `e2e/travel.spec.ts` from 6 to 23 deterministic browser workflows.
- Added atomic persisted-state checks against JSON Server throughout the Playwright suite.
- Stabilized same-day pointer drag assertions by sampling both real DOM hitboxes atomically before the drag.
- Extracted the existing 50-entry snapshot operation into the tested `recordSnapshot` helper without changing behavior.

## Remaining issues / untested requirements

- No functional requirement is currently left without automated coverage.
- Production build succeeds with a Vite warning: the minified application chunk is approximately 907 kB (276 kB gzip), above Vite's 500 kB warning threshold. This is a bundle-size concern, not a failed requirement or test.
- The configured browser verification is Chromium. Firefox, WebKit, accessibility-screen-reader tooling, and concurrent multi-client behavior were not required by `REQUIREMENTS.md` and are not claimed as verified.

## Actual commands executed

```text
npm run test -- --reporter=verbose
15 passed, 0 failed, 0 skipped

npm run test:e2e -- --reporter=line
23 passed, 0 failed, 0 skipped

npm run typecheck
passed

npm run build
passed
```
