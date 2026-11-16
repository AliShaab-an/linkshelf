# LinkShelf v0.3 · Phase 3.3 navigation and workspace

## 1. Executive summary

The sidebar now exposes Park, Saved, Search, Today, and More directly.
Review, Archive, and full Settings remain reachable in More. The layout
uses LinkShelf's existing visual style and keeps one workspace section
mounted at a time.

## 2. Root cause

The previous rail scrolled horizontally. At 320 px it clipped Search,
Archive, and Settings, and Park lived separately in a taller header.
The header, rail, and Projects toolbar also relied on independent fixed
sticky offsets. The navigation changes address discoverability and
focus without changing the feature screens.

## 3. Navigation architecture

- Park owns the existing multi-tab parking entry. Saved opens the
  current Projects screen and keeps the internal `projects` ID.
- Search and Today are direct destinations. Today uses a text label
  without a numeric count, so the shell adds no reminder fetches.
- More reveals a labeled group of ordinary buttons. It identifies
  Review, Archive, or Settings when that section is current, and
  leaves Saved inactive. The active destination in an open group
  also carries `aria-current`.
- Quick Settings remains a separate shortcut in the header. Full
  Settings remains in More.

## 4. Sidebar layout

The compact brand header and destination grid share a single sticky
wrapper. A ResizeObserver publishes its measured height for the
Projects toolbar and the document's scroll padding. The five controls
fit in one row at the tested widths and the grid can reflow at tighter
widths. Disclosures are positioned below the rail, use an internal
scroll limit, and leave the navigation controls visible. The native
dialog top layer remains above the shell.

## 5. Section state

The stable IDs and `linkshelfUiState` shape are preserved. Fresh and
malformed state still use the Saved/Projects default, Inbox, newest
order, and an empty expansion list. The existing project selection
fallback handles removed projects. Returning users load their last
valid section before the workspace mounts. Last section is a shared
preference, while an open document's active view remains local.

Cooperating extension documents serialize read/merge/write preference
patches with a same-origin Web Lock. An unchanged section update
skips the write. The lock protects cooperating code paths. Chrome
storage itself does not expose a transaction for arbitrary writers.

## 6. Search continuity

The App retains only query text in the mounted sidebar. The query
survives section switching and is cleared on reload. It is never
written to settings or a URL. Returning to Search creates a fresh
Search component and requests current data, with new cursor and
page state. The existing backend ranking, category counts,
invalidation, and response-generation checks remain in use.

## 7. Keyboard and focus management

Explicit Search selection and Search commands request input focus,
including a new command while Search is already selected. Ordinary
section switches leave focus on the activating control and reset
the view's scroll position. Selecting a secondary destination
returns focus to More. Escape returns focus to a disclosure trigger.
Tab and Shift+Tab follow document order. Leaving a disclosure by
focus or pointer closes it. The group uses ordinary buttons without
menu keyboard semantics.

## 8. Window-scoped intents

The worker continues to open the Chrome-provided target window and
write its request to `linkshelfSidePanelIntents`. Both producer and
consumer hold the same lock when updating the map. The sidebar reads
only its own window entry and consumes only an ID that still matches
the stored request. It applies the request after successful
consumption. A local choice supersedes a pending request, stale
results do not suppress newer valid ones, and seen IDs are ignored
for the life of the sidebar. Modal-blocked requests are discarded
even if the modal closes while consumption is pending. Disposal
prevents late responses from navigating a closed document.

## 9. Popup handoff

The existing popup retains its direct user-click call to Chrome's
Side Panel API with the active tab's window ID. It does not set a
section intent. Popup parking and error handling remain in their
existing paths. [Chrome Side Panel API](https://developer.chrome.com/docs/extensions/reference/api/sidePanel)

## 10. Recovery gate

The recovery gate owns the workspace shell, so unhealthy storage
shows recovery and its export/restore controls without exposing
workspace navigation or Quick Settings. Successful recovery
re-enables the workspace. Validated backup replacement, raw
export, and worker storage protections remain in their established paths.

## 11. Accessibility

Visible text labels and existing focus outlines support keyboard
and pointer access. The current section is identified without a
false Saved state when a secondary section is active. Native tests
exercise real Chrome keyboard input and zoom in extension documents.
Screen-reader speech and the actual docked browser side panel require
manual verification.

## 12. Automated tests

The merged Phase 3.2 baseline had 418 tests. New focused cases
cover malformed preferences, independent patches, same-section
write avoidance, current-window consumption, stale and duplicate
events, failed consumption, and dismissal during asynchronous work.

`npm run verify` passed TypeScript, 427 tests across 29 files,
and the production build. `npm run test:integration` passed 275
tests across seven files. ZIP creation and package validation passed.

## 13. Native Chrome evidence

The new suite uses `node scripts/native/navigation.mjs` and the
disposable Chrome harness. It captures the workspace at 320, 400,
600, and 800 px and 200% zoom, and measures target size, overflow,
and control placement. It also checks native focus, search refresh
on return, project preferences, two real Chrome windows, popup
handoff, and recovery restrictions.

Chrome 157.0.8103.39 passed all nine navigation scenarios. All five
controls were fully visible and at least 44 CSS px tall, with no
document-width overflow at the four test widths. The zoom check used a
640 px outer width at 200%, giving a 320 CSS px effective width. The
Projects toolbar remained below the sticky shell after scrolling.

Two extension documents in different real Chrome windows consumed
their own Search and Today intents. A new Search request refocused the
existing input. A replayed ID and a modal-blocked request did not
navigate. A separate Chrome probe confirmed the worker could see the
same lock held by the sidebar. The popup test captured its window ID, verified the error
path, and confirmed that a user click resolved the actual Chrome
Side Panel API call. The test does not inspect the docked panel.
The recovery scenario downloaded the raw corrupt value and replaced
it through a validated backup before restoring the workspace.

[320 px](.output/native-runs/2026-11-12T15-45-16.600Z-15968/navigation-320.png) ·
[More at 320 px](.output/native-runs/2026-11-12T15-45-16.600Z-15968/navigation-more-320.png) ·
[200% zoom](.output/native-runs/2026-11-12T15-45-16.600Z-15968/navigation-200-percent.png) ·
[Geometry and scenario results](.output/native-runs/2026-11-12T15-45-16.600Z-15968/navigation-results.json)

The existing native suites also passed 10 general scenarios, eight
Search checks, six Rendering checks, nine Bulk Restoration cases,
and nine Accessibility cases. The general suite now waits for the
Saved preference to be persisted before its favicon test reloads
the document. The test still verifies the actual request attempt.
An initial recovery fixture used direct storage reseeding. The final
navigation check instead used the full trusted-backup flow.

## 14. Performance and compatibility

Search and Archive retain their 25-card bounds per applicable category.
No background list is mounted to maintain navigation state. The
only worker change serializes writes to the navigation-intent map.
The database schema, backup format, reminder scheduling, storage
and restoration logic, extension version, dependencies, and
permissions retain their existing contracts.

The final package contains 17 files and is 186,276 bytes compressed.
The unpacked build grew from 631,432 to 633,619 bytes. The manifest
matched Phase 3.2 byte for byte. The production build contains no WXT
hot-reload client or native test instrumentation.

All five performance smoke suites passed. The Phase 2.6 comparator
reported 41 compatible rows, with eight within its no-meaningful-change
band, 32 observed improvements, and one timing deviation for review.
With two or three retained samples per operation, the timing labels
describe run-to-run observations. Archive timing begins with the final
destination activation and excludes opening More. The 1,000-link
fixture still mounted 25 Archive cards and 50 Search cards when both
categories were full. The storage no-op and restore checkpoint
assertions passed. [Smoke report](.output/performance-baselines/2026-11-12T17-12-37.180Z-3128/baseline.json)

## 15. Modified files

- `domain/side-panel.ts` and `entrypoints/background.ts`.
- Sidebar `App.tsx`, `style.css`, `ui-state.ts`,
  `navigation-intents.ts`, and `navigation-intents.test.ts`.
- Sidebar components `SidePanelNavigation.tsx`, `useDisclosure.ts`,
  `QuickSettings.tsx`, `ProjectsSection.tsx`, `SearchSection.tsx`,
  and `StorageRecovery.tsx`.
- Native `navigation.mjs`, `harness.mjs`, `run.mjs`,
  `rendering.mjs`, and `accessibility.mjs`.
- Benchmark `scripts/performance/rendering.mjs` and `ui.mjs`.
- `docs/testing.md` and this report.

## 16. Remaining risks

Session intent locking coordinates updated extension documents and
the worker. If Chrome refuses the storage write, the mounted document
discards the failed request, but a persistent storage error can leave
an entry in Chrome's session store until it can be removed. Actual
Chrome shortcut dispatch, panel docking, and screen-reader output
remain distinct from testing extension tabs. The viewport sweep
starts at 320 CSS px. The live docked check
should cover popup open, Search/Today shortcuts with the panel open
and closed, keyboard focus, and narrow panel resize.

The previously reported WXT popup stack matched the local
`.output/chrome-mv3-dev` hot-reload chunk. The standalone production
build uses `.output/chrome-mv3`. See [development reload troubleshooting](docs/testing.md#development-reload-and-standalone-builds).

## 17. Git status

Phase 3.3 is on `ux/navigation-workspace`, based on
`e0f4a006113f1715b6fbd98f37e4a969dc0c088c`, the Phase 3.2 merge.
Implementation and documentation remain unstaged and uncommitted.
`git diff --check` passed.
Pre-existing untracked reports were preserved and generated Chrome
evidence is ignored.
