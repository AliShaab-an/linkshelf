# LinkShelf v0.3 Phase 2.4 — UI rendering and responsiveness

## 1. Executive summary

Archive mounts at most 25 link cards. Search mounts at most 25 saved links
and 25 Chrome bookmarks, including after many continuation requests. Both
interfaces provide numbered navigation through their available records.

## 2. Root cause

Archive requested the full collection and projects in parallel, then mounted
all archived cards and looked up each project with a linear search during
render. Each card formatted dates with a new locale formatter, and note
previews measured layout after mounting. Phase 2.3 Search bounded its first
RPC and then appended every card from each continuation. React batches
related updates, but batching does not eliminate mounting a large tree.

The side panel uses the document scroller. The top header and parts of
Projects are sticky, and dialogs use a fixed overlay with their own scrolling.
Long text, expandable notes and density preferences produce variable card
heights. The Archive and Search card lists previously grew naturally in
document flow.

## 3. Architecture decision

Incremental append makes initial rendering cheaper and still allows the DOM
to grow with every batch. Virtualization could keep the DOM bounded while
preserving continuous scrolling, with added complexity for measured heights,
keyboard focus, dialogs, and scroll anchoring. Explicit numbered ranges bound
the DOM with a small shared component, allow direct jumps, and keep variable
height cards in normal document flow. Each range uses stable record IDs.

## 4. Technical implementation

- The shared range helper computes a clamped slice. The navigator supports
  previous, next and direct page entry with an announced range.
- Archive memoizes a project-name Map. It debounces database change
  notifications and discards obsolete refresh replies.
- Search uses two independent display ranges over its existing loaded arrays.
- Saved cards reuse a locale date formatter and return focus to the stable
  menu trigger when a menu action opens a dialog.

## 5. Archive

Archive retains the full ordered list returned by the existing API. Any
page can be opened directly, including the last one. Successful actions
remove records from the local list by ID. Refreshes reconcile cross-view
changes, clamp the selected page if the last page disappears, and use the
section heading as a focus fallback if the active item is removed.

## 6. Search

Phase 2.3 continuation requests and cursor handling are unchanged. Load More
appends records to the appropriate local collection and opens the new range.
Earlier loaded ranges stay accessible via navigation. The category headings
distinguish loaded and total matches, while the page controls describe the
range of loaded records currently on screen. Query changes and refreshed
snapshots start at the first range. Request versioning and the existing
single pending continuation guard protect against late or duplicate appends.

## 7. Projects, Today and popup

Projects already memoizes filtered/sorted groups, collapses sessions and
initially batches links per expanded session. Its explicit Show All can
still mount hundreds of cards. The benchmark measures this case, and the
existing batching, preferences and Show All behavior are preserved.
Today renders the due result set, which was small or empty in the
representative fixtures. A synthetic burst of overdue reminders remains
unmeasured. The popup uses a single park form and a project select, with no
large card list. These interfaces keep their existing architecture.

## 8. Accessibility and scrolling

The navigator uses native buttons and a labeled page-number input. Number
entry keeps the same DOM node after a jump. Ranges do not rely on estimated
heights or observers. Browser layout handles expanding notes and viewport
changes. Search keeps focus when a continuation button remains available and
provides a heading or query input fallback when the focused control or card
disappears. Archive returns focus to the card menu on cancel when it still
exists, or to the heading after focused removal. The known general modal
focus containment issue is still a Phase 3 item.

## 9. Data and action integrity

Paging changes only the mounted elements. Search result identities, bookmark
IDs, archived order and archive history stay intact. Actions continue to
use the original IDs and established background commands. An action
completion does not remove records from a different range by positional
index. Database, backup, reminder, recovery and browser-operation behavior
remain on the existing paths.

## 10. Automated tests

The merged baseline had 370 tests. Three range cases cover empty and small
collections, complete ordered coverage of a 1,962-item list, and clamping
after deletion. The suite passed 373 tests in 26 files and the integration
subset passed 258. See final verification below.

## 11. Native Chrome tests

The focused rendering suite passed six scenario groups in Chrome
157.0.8103.39 using the production extension in a disposable profile.
It reached the first, second and last Archive ranges, verified their order,
and used Enter, Space, Tab and Shift+Tab with visible focus. Long notes stayed
expanded through 320/400/600/800 px resizing and were operable at 200% zoom.
Measured cards did not overlap. Cancel restored focus to the card menu, and
confirmed removal after worker restart persisted the correct record and
focused the section heading.

A second extension document changed Archive data. The visible list reconciled
by ID. A deliberately delayed action reply arrived after a page jump without
moving the user back or affecting the wrong record. Projects still supported
expansion, Show More, Show All, sorting, filtering and density changes.

The first native run exposed a focus loss after the confirmation button was
disabled. The final run passed after adding a fallback for that case. Eight
synthetic scroll steps moved the document 1,600 px, with observed animation
frame intervals of 12.4–16.9 ms. One remove interaction took about 1.84 s from
keyboard input to DOM removal, including verified persistence and automation.
These are single observations.

The general native suite passed all 10 scenarios. The updated Search suite
passed eight groups, including traversal to the final page in both categories
with the exact legacy order, navigation back to the first loaded page, worker
restart, out-of-order responses, external changes and card actions.

[Focused rendering evidence](.output/native-runs/2026-11-11T16-01-18.459Z-19204/rendering-results.json),
[general native evidence](.output/native-runs/2026-11-11T16-01-43.406Z-8688/results.json),
[Search evidence](.output/native-runs/2026-11-11T16-03-04.530Z-9636/search-ui.json).

## 12. Performance comparison

The matched builds ran sequentially in fresh disposable Chrome profiles.
The same seeded fixtures and 400 × 800 viewport were used for both builds.
Archive rows retain three samples after a warm-up. Search rows use three
repetitions of the same click sequence. Timings end two animation frames
after the expected DOM state. Action clocks include Playwright input
scheduling. RPC timing runs inside Chrome. Layout counts are cumulative
since page navigation and heap is page JavaScript heap without forced GC.
These are browser observations, not isolated React commit or retained heap
measurements.

Chrome 157.0.8103.39 and Node 22.13.1 ran both builds. Values below are
old → optimized medians. Archive timing starts before the navigation click.
Search continuation timing covers the last click in each stage. The longest
RPC is the slower of Archive's two concurrent reads.

| Archive fixture | Cards | DOM elements | Open (ms) | Response to frame (ms) | Longest RPC (ms) | Long tasks (ms) | Heap (MiB) | Layout count |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| few/100 | 15 → 15 | 313 → 313 | 173.4 → 94.5 | 97.2 → 49.2 | 6.9 → 5.2 | 0 → 0 | 11.8 → 11.9 | 7 → 6 |
| few/1000 | 193 → 25 | 3339 → 491 | 250.8 → 101.1 | 201.5 → 52.5 | 5.9 → 6.0 | 99 → 0 | 8.6 → 16.3 | 7 → 8 |
| few/5000 | 968 → 25 | 16514 → 491 | 578.5 → 116.7 | 487.8 → 48.3 | 17.3 → 13.7 | 415 → 0 | 28.7 → 15.0 | 6 → 7 |
| few/10000 | 1962 → 25 | 33412 → 491 | 1041.3 → 136.3 | 960.3 → 45.2 | 25.4 → 23.9 | 849 → 0 | 53.9 → 29.9 | 7 → 7 |
| many/100 | 15 → 15 | 313 → 313 | 122.9 → 89.8 | 79.0 → 54.6 | 5.4 → 2.3 | 0 → 0 | 29.5 → 27.1 | 7 → 6 |
| many/1000 | 193 → 25 | 3339 → 491 | 208.4 → 94.3 | 147.8 → 48.3 | 4.5 → 5.9 | 75 → 0 | 28.0 → 29.6 | 6 → 6 |
| many/5000 | 968 → 25 | 16514 → 491 | 556.7 → 121.5 | 508.1 → 45.3 | 13.3 → 13.0 | 409 → 0 | 48.4 → 34.6 | 7 → 6 |
| many/10000 | 1962 → 25 | 33412 → 491 | 1006.4 → 107.5 | 930.2 → 41.7 | 23.9 → 22.9 | 802 → 0 | 71.4 → 50.7 | 7 → 6 |

| Search at 1,000 links | Cards | DOM elements | Input or last click to frame (ms) | Response to frame (ms) | RPC (ms) | Long tasks (ms) | Heap (MiB) | Layout count |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Initial 25 + 25 | 50 → 50 | 815 → 817 | 236.2 → 225.1 | 57.1 → 54.3 | 9.3 → 10.7 | 0 → 0 | 65.2 → 49.1 | 9 → 9 |
| 325 saved + 25 bookmarks loaded | 350 → 50 | 7853 → 789 | 358.8 → 88.2 | 128.1 → 58.4 | 44.3 → 2.5 | 0 → 0 | 60.5 → 48.8 | 57 → 34 |
| 325 saved + 100 bookmarks loaded | 425 → 50 | 8302 → 795 | 330.0 → 88.4 | 129.4 → 59.9 | 57.1 → 2.4 | 109 → 0 | 59.3 → 47.2 | 64 → 40 |

At 10,000 links the Archive RPC remained roughly 23–25 ms, while
response-to-frame dropped from 930–960 ms to 42–45 ms. The main gain was
after delivery. Small collections mounted the same 15 cards and showed no
slowdown in these runs. Heap readings varied at 1,000 links and do not
measure retained memory.

Projects observations at 10,000 total links were single samples. Expand All
mounted 75/64 cards for few/many sessions on both builds and took 101 → 82 ms
and 128 → 110 ms. Show More mounted 100 cards and took 129 → 117 ms. Show All
mounted 828 cards and 17,512 elements on both builds, taking 506 → 412 ms
to the observed frame with 387 → 286 ms in long tasks. The shared formatter
is cheaper to reuse, but these observations do not isolate its effect.
Explicit Show All remains expensive.

The same 17 production files total 621,351 → 626,407 bytes before ZIP
compression. Sidebar JavaScript grew from 176,669 to 181,431 bytes. The
checked ZIP grew from 181,530 to 183,200 bytes. The production background
worker matches the Phase 2.3 binary byte for byte. There is no new
dependency, observer or persistent cache.

[Phase 2.3 measurements](.output/native-runs/2026-11-11T15-52-34.404Z-18768/rendering-performance.json),
[Phase 2.4 measurements](.output/native-runs/2026-11-11T16-03-35.303Z-11632/rendering-performance.json).

## 13. Remaining limitations

Archive still transfers and retains the complete list. Search retains loaded
records and worker cursors still have their Phase 2.3 memory and lifetime
limits. Bounded rendering reduces mounted nodes. It does not reduce the size
of those retained data collections. Browser Find can search mounted cards,
with explicit navigation to reach other pages. Notes remount collapsed when
returning to a different range. The general modal focus trap, native docked
sidebar checks and screen-reader testing remain open. No compositor FPS or
React commit profiling is claimed.

## 14. Modified files

- `entrypoints/sidepanel/components/ArchiveSection.tsx`
- `entrypoints/sidepanel/components/SearchSection.tsx`
- `entrypoints/sidepanel/components/SavedLinkCard.tsx`
- `entrypoints/sidepanel/components/NativeBookmarkCard.tsx`
- `entrypoints/sidepanel/components/ui/ListNavigation.tsx`
- `entrypoints/sidepanel/list-range.ts` and `list-range.test.ts`
- `scripts/native/search.mjs` and `scripts/native/rendering.mjs`
- `scripts/performance/rendering.mjs`
- `docs/performance-testing.md` and this report

## 15. Git status

Branch `perf/ui-rendering-optimization` is based on
`45a486a8daa0e0198e8cb7068ea4ebe3f2ee5fc8`, the Phase 2.3 merge.
Generated profiles and evidence are ignored under
`.output/native-runs/`.

`npm run verify` passed TypeScript, 373 tests and production build.
`npm run test:integration` passed 258 tests. `npm run zip`,
`npm run check:package`, `git diff --check`, all three native suites and the
matched benchmarks passed. The ZIP contains the expected 17 files and
no benchmark instrumentation.
