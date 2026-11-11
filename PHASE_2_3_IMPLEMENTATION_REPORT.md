# LinkShelf v0.3 Phase 2.3 — Search and filtering optimization

## 1. Executive summary

Search now delivers up to 25 saved links and 25 native bookmarks initially.
Users can load more results from either category and see the loaded and total
counts. Every match is reachable while the dataset is stable. The unchanged
request shape continues to return the full result set for existing callers.

## 2. Root cause

The old repository allocated a filtered array and one result wrapper per
eligible link before checking whether it matched. Bookmark search built a
record for every eligible bookmark and then filtered. More significantly,
broad searches serialized thousands of full records in one message, and the
sidebar mounted a card for every result on the first render. Phase 2.1 measured
over one second of broad Search UI latency with roughly 958 cards.

## 3. Search architecture

The background reads the validated repository database and native bookmark
tree concurrently, then returns the two categories. The saved-link scan now
builds wrappers only for matches and sorts them as before. Bookmark search
walks the tree once using an iterative depth-first traversal and builds only
matching records. Existing bookmark folder and conversion utilities retain
their own behavior. Whitespace-only queries return no records without I/O.

Previously the sidebar debounced inputs by 150 ms, ignored superseded
requests, rendered the entire reply, patched most local actions in place and
reran search after bookmark conversion. It did not refresh Search on general
database or bookmark changes. The updated sidebar still debounces and now
refreshes after matching change events and actions that mutate results.

## 4. Result delivery

Omitting `payload.page` retains the original response shape. An empty page
request starts bounded delivery and returns a cursor, separate totals and
the next offsets. A continuation includes the original trimmed query,
cursor, category and aligned offset. Page size is fixed server-side. Twenty-five
per category keeps the mixed initial response at 50 cards and roughly 15 KB
on the broad fixture. At 50 per category the same first batch would mount twice
as many cards. These results support bounding delivery, and do not establish an
optimal page size for all devices.

The worker retains at most four recent snapshots. An idle cursor expires
after two minutes, with expired snapshots removed lazily. Database changes
and bookmark events clear snapshots, and a change observed during initial
collection rejects the mixed result. Invalid page shapes and invalid offsets
return an explicit error. A missing cursor after eviction, expiration, data
change or worker restart prompts a fresh query. Repeated requests for the same
offset return the same page, while the sidebar serializes append requests.
No persistent index or per-page database hash is used.

## 5. Search semantics

Saved-link matching trims and locale-lowercases the query, splits on whitespace
and requires every token to be a substring of the lowercased title, URL,
domain, note or project name. Fields remain newline-separated. Unicode and
punctuation follow the same locale and literal substring rules. Parked and
archived links qualify. Restored and removed links do not. Duplicate URLs
retain independent records. Results sort by descending `updatedAt`, preserving
database order on ties. The same project lookup and fallback label apply.

## 6. Native bookmarks

Search retains eligible URL filtering, fallback titles, IDs and parent IDs.
Title and URL use the same token rules. The iterator walk retains the
preorder and duplicates across folders. Native bookmarks have their own
continuation and total, independent of the saved links. Paging does not
re-fetch the bookmark tree and search does not modify native bookmarks.

## 7. UI integration

The current cards and actions remain in place. Each section has a named
button to load more and shows how many results are loaded. The sidebar keeps
existing results during a same-query refresh, reports failures with a retry
control, and discards in-flight replies on query change or refresh. An
expired continuation restarts the query, replacing the previous pages once
the fresh first page arrives. Loaded cards still accumulate in the DOM.

## 8. Automated tests

The baseline had 364 passing tests. Six new cases bring the total to 370 in
25 files. The separately run integration subset passed 258 tests. The old
matching flow serves as the repository and bookmark test oracle. New paging
tests cover 8,352 saved matches, independent categories, stable ordering,
concurrent identical requests, invalid requests, expiry, eviction, worker
restart and invalidation during initial collection.

## 9. Native Chrome verification

The general native suite passed all 10 scenarios, including backup and recovery,
reminders, concurrent restore and bookmark conversion, stable UI smoke and the
Phase 2.2 no-op storage probe. The focused Search suite passed eight scenario
groups in separate disposable profiles. It covered 100, 1,000 and 10,000
saved links, independent pagination through the final saved and bookmark
pages, worker restart, out-of-order initial and continuation responses,
cross-document project and bookmark changes, and search after parking,
archive, unarchive, removal, restore and bookmark conversion. It also
confirmed Keep Parked Copies and opening a native bookmark.

The paired 1,000-link UI smoke used a 400 × 800 viewport and 60 native
bookmarks. These are individual observations, with a MutationObserver for
the first DOM card and two animation frames as a paint proxy. Input timing
includes the 150 ms debounce. Heap is the page's observed JavaScript heap
without forced GC. It excludes the worker and total browser memory.

| UI measure | Old broad | Paged broad |
| --- | ---: | ---: |
| Initial cards | 918 | 50 |
| Input to first DOM card | 955 ms | 214 ms |
| Input to observed frame | 1,057 ms | 247 ms |
| RPC | 21 ms | 14 ms |
| Response to observed frame | 883 ms | 82 ms |
| Main-thread long tasks in interval | 847 ms | 0 ms |
| Observed page JS heap | 16.2 MiB | 9.4 MiB |

On the same fixture, the narrow query took 166 → 162 ms to its first card.
No-result completion took 204 → 211 ms to the observed frame, and the
bookmark-only query reached its first card in 162 → 167 ms. At 10,000 links,
the optimized first broad frame was 208 ms with 50 cards. Adding pages in
the 100-link UI took 78–119 ms per click to the expected DOM count, including
Playwright interaction time. Phase 2.1 used 100 bookmarks and observed
roughly 958 broad cards and over a second of UI latency. The table above
uses the matched 60-bookmark comparison.

[General native suite](.output/native-runs/2026-11-11T15-24-57.742Z-3380/results.json),
[optimized Search UI](.output/native-runs/2026-11-11T15-28-59.734Z-17844/search-ui.json),
[baseline Search UI](.output/native-runs/2026-11-11T15-29-30.074Z-20200/search-ui.json).

## 10. Benchmark comparison

Chrome 157.0.8103.39 and Node 22.13.1 ran the same seeded fixture shapes and
queries in fresh disposable profiles. The ephemeral loopback port varies
between runs. Each scenario used one warm-up and three retained samples.
The clock surrounds `chrome.runtime.sendMessage` in the extension page.
Payload size is UTF-8 JSON bytes, a proxy for message size. Playwright
transport and the extra JSON sizing work are outside the RPC clocks. Full
paged time sums sequential browser RPCs without user interaction or rendering.

| Broad fixture | Initial records, old → paged | Initial bytes, old → paged | Old full ms | New legacy full ms | First page ms | Next page ms | All pages ms | All page bytes |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| few/100 | 185 → 50 | 51535 → 14976 | 3.5 | 3.3 | 3.5 | 1.3 | 11.1 | 52573 |
| few/1000 | 958 → 50 | 431507 → 14977 | 14.3 | 18.2 | 5.2 | 2.0 | 83.3 | 437450 |
| few/5000 | 4250 → 50 | 2066265 → 14978 | 40.5 | 38.0 | 7.9 | 1.5 | 235.6 | 2093201 |
| few/10000 | 8452 → 50 | 4153605 → 14978 | 87.6 | 85.7 | 10.2 | 0.9 | 348.3 | 4207581 |
| many/100 | 185 → 50 | 51567 → 14982 | 3.4 | 3.2 | 2.5 | 1.0 | 9.4 | 52605 |
| many/1000 | 958 → 50 | 432729 → 14983 | 8.3 | 7.4 | 3.0 | 1.1 | 47.3 | 438672 |
| many/5000 | 4250 → 50 | 2080679 → 14996 | 46.3 | 44.5 | 5.1 | 0.9 | 175.9 | 2107615 |
| many/10000 | 8452 → 50 | 4189012 → 14996 | 85.2 | 92.0 | 7.8 | 0.9 | 350.3 | 4242988 |

Full paging adds repeated messaging and page metadata. It makes the initial
response much smaller, while fetching everything is slower. The new legacy
full-response measurements are close to the old results at 10,000 links,
and the single-pass changes are not credited with the first-page speedup.

| 10,000 links | Scenario | Total matches | Old full → new first page median (ms) |
| --- | --- | ---: | ---: |
| few | url | 1 | 8.2 → 6.9 |
| few | title | 224 | 9.2 → 7.3 |
| few | note | 93 | 7.5 → 6.8 |
| few | project | 10 | 7.3 → 6.7 |
| few | none | 0 | 7.0 → 6.7 |
| few | archived | 813 | 14.8 → 8.4 |
| few | bookmarks | 100 | 7.3 → 6.8 |
| many | url | 1 | 7.4 → 7.9 |
| many | title | 291 | 9.7 → 7.5 |
| many | note | 93 | 8.8 → 8.1 |
| many | project | 10 | 7.1 → 8.6 |
| many | none | 0 | 6.5 → 8.5 |
| many | archived | 813 | 15.3 → 8.8 |
| many | bookmarks | 100 | 6.9 → 6.6 |

The separate diagnostic run measured the 10,000-link saved scan at about
5–8 ms across these queries. Broad scans were 6.8/5.9 ms for few/many
sessions. Bookmark traversal was 0.2–0.3 ms with 100 synthetic bookmarks.
The warm first request used one repository scan and one bookmark tree API
call, with zero storage reads and writes. Full broad traversal had the
same counts, so every continuation added zero scans, storage calls or tree
reads. A cold worker still initializes the repository through its normal
storage path. Worker spans include nested work and can overlap, so they
should not be added together. The reduction in candidate arrays and
non-matching result objects follows from the implementation. No isolated
allocation or GC saving is attributed to it.

[Diagnostic Chrome trace](.output/native-runs/2026-11-11T15-26-50.801Z-21152/search-performance.json)

Evidence: [old production RPC](.output/native-runs/2026-11-11T15-16-53.361Z-18616/search-performance.json),
[paged production RPC](.output/native-runs/2026-11-11T15-29-36.114Z-21848/search-performance.json),
and [new legacy production RPC](.output/native-runs/2026-11-11T15-22-02.036Z-20752/search-performance.json).

## 11. Compatibility

The database schema, backup and recovery formats, restoration and bookmark
conversion paths, reminders, permissions, extension version and dependencies
retain their existing behavior. The general browser regression suite also
covers Phase 2.2 storage write counts.

## 12. Remaining risks

Worker snapshots retain matching records and references in memory until
evicted, invalidated, pruned, or terminated. The number of snapshots is
bounded, and an individual snapshot still scales with the matches. The page
limit bounds records rather than exact bytes, so long notes can raise the
payload. There is
no atomic snapshot across Chrome storage and the bookmark API, so correctness
after external changes relies on event delivery and refresh. On a busy
library or expired worker, users may need to reload pages after a refresh.
The first query still scans and sorts eligible data, and loading many pages
can still make the sidebar heavy.

## 13. Modified files

- `entrypoints/background.ts` and `messaging/contracts.ts`
- `entrypoints/sidepanel/components/SearchSection.tsx`
- `storage/repository.ts` and `storage/repository.test.ts`
- `features/bookmarks/bookmark-tree.ts` and `features/bookmarks/bookmark-tree.test.ts`
- `features/search/search-pages.ts` and `features/search/search-pages.test.ts` (new)
- `scripts/native/search.mjs` and `scripts/performance/search.mjs` (new)
- `docs/performance-testing.md` and this report

## 14. Git status

Branch `perf/search-filter-optimization` starts at
`6cc2afec4856b30d61473785d19496715027d09b`, the Phase 2.2 merge. The changes
above define the Phase 2.3 review scope. Raw evidence is ignored under
`.output/native-runs/` and contains synthetic fixtures only.

`npm run verify`, `npm run test:integration`, `npm run zip`,
`npm run check:package`, the general native suite and `git diff --check`
passed. TypeScript compiled and the production ZIP contained the expected
17 files, without benchmark entrypoints or instrumentation markers.
