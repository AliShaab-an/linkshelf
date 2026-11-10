# Coverage inventory

Reviewed against the stable `v0.3` baseline `b517046` and Phase 1.6 working changes.
Counts are test cases, not coverage percentages. The full suite has 348 cases in
24 files (339 before this phase; 344 before the targeted Zod remediation). No skipped/failed cases in the final verification.
The native runner reports nine grouped workflow checks; do not count these as nine
Vitest tests or as exhaustive UI coverage.

## Architecture and boundaries

| Layer | Files | Evidence and limits |
| --- | --- | --- |
| Domain unit tests | `domain/{backup,defaults,reminders,schemas,url}.test.ts` | Size bound/read-before-parse, Unicode, legacy shapes, URL normalization, defaults, reminder grouping/date logic; no Chrome |
| Feature unit/coordinator tests | `features/parking/*test.ts`, `features/restoration/*test.ts`, `features/bookmarks/*test.ts`, `features/commands/*test.ts`, reminder service/coordinator tests | Restricted/pinned/changed tabs, partial close/open/discard failures, ordering, target windows, duplicates and command routing with dependency mocks |
| Worker integration | `features/operations/{background,concurrent-background}.test.ts`, `features/reminders/reminder-background.test.ts`, `storage/background-recovery.test.ts` | Real worker/repository/coordinators/messages, mocked browser storage/tabs/alarms/bookmarks; primary vs secondary outcomes, reservations, receipt recovery, restart simulations, recovery messages |
| Repository integration | `storage/{repository,backup-roundtrip,integrity-recovery}.test.ts` | All lifecycle states, 10k round trips, merge/replace/stale previews, relational integrity, schema 1/2, quota/rollback/readback failures and raw preservation. JSON-roundtrip storage models Chrome's omitted optional properties. Four bounded 2,048-element malformed-array cases cover schema-1/2 import rejection, preservation and confirmed trusted recovery with patched Zod 4.6.6 |
| View-model unit | `entrypoints/sidepanel/project-view.test.ts` | Sorting/filtering/batches/collapsed sessions; no mounted React DOM |
| Native browser | `scripts/native/{run,harness,fixtures,performance}.mjs` | Actual production MV3 build in generated Chrome profiles, synthetic loopback pages and real APIs; injected failures/barriers explicitly labeled |
| Manual | `manual-test-plan.md`, `release-checklist.md` | Actual toolbar/docked UI, physical shortcuts, OS notification visibility, screen reader, signed update, OS-specific behavior and physical interruption |

## Original audit feature groups, checked against current code

The original audit mixed stable functionality and the experimental redesign.
F20/F21 below are intentionally absent; they are not missing regression tests for
shipped features. Recovery is new since that audit. Source paths are repository-relative.

| ID / feature | Current source and behavior | Existing automated evidence | Native/manual boundary |
| --- | --- | --- | --- |
| F01 Current-tab parking | `features/parking/park-current-tab.ts`, popup form | Current-tab, background and concurrency tests: save-before-close, pinned/current policy, changed tab, secondary warnings | Native bulk uses real closure; actual popup parking/shortcut remains headed |
| F02 Selected-tab parking | `park-selected-tabs.ts`, `ParkTabsSection.tsx` | Bulk selection, restrictions, window movement, partial closure, overlapping reservations | Native A/C; actual selection/scroll UI manual |
| F03 Default destination | Popup/settings/worker command routing | Defaults, settings, project deletion and command tests | Native configured default persists; physical shortcut/popup selection manual |
| F04 Session browsing | Repository grouping, `project-view.ts`, Projects | Filtering, order, collapsed sessions and 25-link batching | Native renders groups/filters; expand/load-more at scale manual |
| F05 Projects/Inbox | Repository create/rename/delete | Duplicate names, Inbox protection, reference and default repairs, lifecycle integration | Native A creates/renames/deletes and checks moved history |
| F06 Move link | Repository creates separate destination session | Repository and reminder/background integration | Native A/B, preserves session/link ownership |
| F07 Notes | Session/link fields and `SavedLinkCard.tsx` | Schema, search, migration and backup round trips with Unicode | Native A/E and long-content screenshot; Show more manual |
| F08 Reminder notifications | Reminder coordinator + worker alarms | Off/denied/create failure, acknowledgment, duplicate prevention, missing alarms, restarts | Native B real alarms/notification acceptance/worker/browser restarts; visible OS delivery manual |
| F09 Due today | `TodaySection.tsx`, repository due query | Time/group logic and reminder worker integration | Native overdue membership after move/restore; timezone boundary UX manual |
| F10 Reopen one | Restore coordinator + single restore | Partial write/open failures, receipts, locks, target window | Native C real tabs/receipt recovery; post-crash user retry caveat |
| F11 Reopen session | Restore collection/session | Ordering, partial failures, shared window queues | Native A session excludes moved/archived records |
| F12 Reopen project | Restore project/collection | Both modes/order, closed windows, partial failures | Native target-window test is single-link; large/unloaded project headed procedure remains |
| F13 Keep parked copies | Settings + restore coordinators | Unit/worker coverage from earlier phases | Native C checks parked lifecycle after actual open |
| F14 Metadata search | Repository `searchLinks`, Search UI | Title/URL/domain/note/project, archived inclusion | Native A includes archived records; native UI filtering smoke |
| F15 Native bookmark search/open | Bookmark tree + worker | Tree search, URL validation and response handling | Native bookmark APIs run, but toolbar search/open gesture remains manual |
| F16 Bookmark conversion | Bookmark coordinator | Existing/overlapping duplicates, per-URL queue, uncertain outcomes and receipts | Native C actual folder/create, duplicate rejection and preserved parked record |
| F17 Archive/unarchive | Repository lifecycle + reminder reconciliation | Repository/worker/reminder regressions | Native A archives and checks export; unarchive UI manual |
| F18 Remove/history | Soft lifecycle mutation, remove dialog | Lifecycle fields, reminder metadata and backup all-state fixtures | Native E preserves removed/bookmarked history; remove-modal focus/Escape checked without deleting |
| F19 Review | `ReviewSection.tsx`, parked-link ordering | Repository oldest-first retrieval | Native section/empty-state render; keyboard review decisions manual |
| F20 Manager tab | Absent from stable entrypoints | Not applicable; remains experimental | Do not import redesign |
| F21 Simplified sidebar | Absent; stable Today/Projects/Review/Search/Archive/Settings navigation retained | Not applicable as redesign feature | Native stable navigation at three widths |
| F22 Popup handoff | Popup opens side panel | Command routing tests do not establish gesture acceptance | Native popup document renders; actual handoff manual |
| F23 Shortcuts | Worker + side-panel command coordinator | Command/window targeting/failure tests | Physical assigned keys and user gesture manual |
| F24 Settings | Settings + QuickSettings, repository | Schema and serialized setting mutations | Native writes persist; two stale forms and cross-interface UI freshness manual |
| F25 Export | Worker/file helper + Settings download | Size/serialization and export/import round trips | Native actual download and independent-profile replacement |
| F26 Merge import | Repository revision-bound plan | Conflicts, skip counts, idempotence, settings and rollback | Native A merge, UI preview/Cancel |
| F27 Replace import | Explicit preview/confirmation | Stale previews, quota, rollback and secondary warning outcomes | Native independent import, actual quota failure, UI Cancel |
| F28 Migration/repair | Shared schemas/integrity + repository initialization | Supported legacy IDs/default repairs, invalid preservation, verified writes | Native E schema-1/2 storage and backups; signed Store upgrade not tested |
| F29 View memory | `ui-state.ts`, local UI key | No direct stable UI-state test file; project view helper tests are different | Native retained selected project across reload; simultaneous UI preference patches manual |
| F30 Onboarding/help | Install handler/onboarding + support/settings links | No dedicated onboarding/DOM suite | Native install opens onboarding and popup renders; real open-panel gesture/manual links remain |
| Additional: integrity/recovery | `domain/integrity.ts`, repository, `StorageRecovery.tsx` | 77 earlier Phase 1.5 regressions plus two Phase 1.6 serialization regressions | Native D corrupted storage restart/raw download/cancel/confirmed restore; no physical disk/power-loss test |

## Cross-feature scenarios

- **A, complete lifecycle:** new worker integration test and native workflow combine projects, parking, notes/reminders, search, move, archive, session restore, export and replacement into a separate clean library/profile. Native also checks idempotent merge and safe project deletion.
- **B, reminders:** existing worker tests plus native move/partial restore, lost-alarm repair, overdue acknowledgment and worker/browser restart. Native notification visibility remains unverified.
- **C, concurrency:** existing exhaustive worker coordination tests plus two actual extension documents, explicit barriers, one confirmed side effect, bookmark duplicate rejection, injected saved-state failure, receipt recovery, Keep Parked Copies and changing focus across two windows.
- **D, corruption:** existing schema/repository/worker failures plus native malformed storage, restart, private-value-free diagnostics, exact raw download, cancel and confirmed trusted replacement. Real Chrome quota failure preserves the original library.
- **E, compatibility:** representative synthetic schema-1/2 shapes with custom Inbox IDs, all lifecycle states and metadata; native storage migration, backup import, reload, browser restart and untouched bookmark records. This is not an actual prior signed release upgrade.

Remaining gaps are explicit manual release requirements, not claimed passes. Findings
and measured results are recorded in the Phase 1.6 implementation report.
