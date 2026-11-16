# LinkShelf v0.3 — Phase 2.1 performance profiling

November 11, 2026 (Asia/Beirut). Baseline: `80fb23dee1480ed42d33823dac81c27c4b92b46c`,
the Phase 1.6 merge. Branch: `perf/profiling-baseline`.

## 1. Executive summary

This phase adds measurement tools and diagnoses the merged reliability build. It
does not optimize the extension or change its data model. The merged baseline
contains **348 automated tests**; 344 in the plan referred to the report before the
Zod follow-up.

Five measured product costs stand out:

1. **Whole-value verified writes.** At 10,000 links a settings change took
   **2.20–2.43 s** in the normal build. Diagnostic samples show two full reads
   and one full write, with Chrome storage API waits dominating.
2. **Per-link persistence in restoration.** Ten normal project restores took
   **29.75 s**, versus **0.52 s** opening the same ten tabs with Keep Parked
   Copies on the few-large fixture. The work that marks each record restored
   is the main lever, not a rewrite of the tab-creation API.
3. **Unbounded card rendering.** Archive built 1,962 cards in about **1.9 s**.
   At 1,000 links broad Search took **1.18–1.71 s** in the UI despite a roughly
   **13–18 ms** worker RPC. Both incur long renderer tasks.
4. **Repeated backup stages.** Replace preview took **0.60–0.66 s** at 10,000;
   commit separately took **2.05–3.04 s**. Parsing, validation, cloning and
   token generation are repeated before the verified write.
5. **Whole-library work on cold/invalidated reads.** A warm project query
   remained about **2 ms**, but explicit recheck took **580–855 ms** at 10,000.
   A small returned list does not make a cold database read small.

Session grouping itself is not quadratic in the implementation or the measured
fixtures. On the old 10,000-link shape, the same grouping invocation took **133 ms**
in Chrome and **2.90 s** including the full Playwright return. That timing boundary
explains much of the apparent earlier grouping bottleneck. Broad *application*
payloads still matter, but test protocol transfer should not drive an app rewrite.

Keep Chrome storage for now. Start Phase 2.2 with a verified no-op path for
unchanged settings and same-ID no-change Merge; preserve all guards for changed
writes. Safe batching has much larger collection potential and requires its own
recovery/concurrency design. Do not start either implementation in this phase.

## 2. Profiling methodology

- Windows `10.0.26200`, Intel Core i5-1035G1, 8 logical CPUs, about 15.8 GiB RAM;
  Node 22.13.1, Playwright 1.62.1, headless Chrome 157.0.8103.39. Phase 1.6 used
  Chrome 156 and its preliminary measurements also used the pre-patch Zod build.
- Fixed seed **326** and synthetic titles, URLs, notes, mixed states, relationships,
  original indexes and future reminders. Each run uses its own disposable Chrome
  profile and loopback origin; equal seed, size, shape and origin reproduce bytes.
  Approximate bytes below are compact UTF-8 JSON. The profile guard is 8 MiB, leaving
  room under [Chrome's local-storage quota](https://developer.chrome.com/docs/extensions/reference/api/storage).
  The additional 15,000-link size was not needed for this baseline.
- **Production** timings use the normal WXT worker and React pages from a completed
  build snapshot. A blank extension bridge keeps core RPC measurements free of the
  sidebar's refresh traffic. In-page `performance.now()` brackets Chrome RPC;
  outer Playwright/Node timings are tracked separately. The isolated CPU bridge
  runs actual repository/validation helpers with in-memory inputs.
- **Diagnostic** timings come from a benchmark-only production-mode bundle of the
  same worker source, with selected stage/API spans inserted into a copied build.
  This is not the shipping worker. Inclusive spans can overlap and nest. Child
  and parent medians must not be added as an exclusive breakdown. No real URLs,
  notes, request payloads or response objects are recorded in diagnostic spans.
- Core: 2 warm-ups, 7 retained samples; cold startup, full Playwright transport and
  import commits: 1 warm-up, 3 samples. Diagnostic core: 1 warm-up, 3 samples.
  Bulk, UI and fault cases use 1 warm-up, 3 samples unless noted. Raw JSON includes
  minima/maxima and nearest-rank p95; with small n, p95 is the observed maximum,
  not a stable tail estimate. A browser-clock zero is below timer resolution.
- Fixtures are reset outside timed mutation samples. Actual Chrome storage and
  tabs are used. Fault cases are separate. Cold-worker timing starts after CDP
  observes termination; it includes first RPC wake and cache initialization but
  not the stop command. This is not a fresh browser boot or disk-cache flush.
- No concurrent benchmark processes. An active development workstation still
  contributes scheduler, JIT and GC noise. Record shape and clock before comparing
  results. No hardware-dependent thresholds in tests or CI.

Reproduce with [performance-testing.md](docs/performance-testing.md). The raw JSON
includes parameters, environment, fixture fingerprints, raw samples, failures,
skips and diagnostic stage counts. All profiles and raw evidence are ignored.

## 3. Baseline measurements

The primary production run completed **all eight fixtures** without failures.
Figures are milliseconds, **median / p95**. “Groups” fetches all parked sessions;
“URL” is a narrow exact URL query; “write” is a verified settings mutation
including reminder reconciliation. Import commit excludes its prior preview.

| Shape / links | Projects / sessions | JSON bytes | Projects | Groups | URL search | Recheck | Verified write |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Few / 100 | 5 / 9 | 47,005 | 1.3 / 1.6 | 2.3 / 2.8 | 2.9 / 3.8 | 5.1 / 6.0 | 23.2 / 56.4 |
| Few / 1,000 | 5 / 9 | 452,841 | 1.2 / 2.0 | 12.5 / 14.6 | 5.6 / 6.3 | 48.8 / 63.9 | 202.6 / 239.0 |
| Few / 5,000 | 5 / 9 | 2,281,737 | 2.3 / 2.5 | 61.4 / 83.7 | 13.3 / 17.5 | 253.6 / 334.6 | 1,033.3 / 1,152.2 |
| Few / 10,000 | 5 / 9 | 4,565,294 | 1.7 / 2.5 | 135.7 / 160.6 | 16.8 / 23.0 | 580.4 / 771.5 | 2,200.6 / 3,040.1 |
| Many / 100 | 3 / 19 | 48,387 | 2.5 / 2.6 | 2.0 / 2.6 | 3.3 / 5.6 | 5.3 / 8.1 | 26.2 / 29.8 |
| Many / 1,000 | 12 / 199 | 486,427 | 2.0 / 2.3 | 6.0 / 8.9 | 5.6 / 6.3 | 51.8 / 66.2 | 242.7 / 261.6 |
| Many / 5,000 | 52 / 999 | 2,465,871 | 1.8 / 2.1 | 52.1 / 61.1 | 12.0 / 14.5 | 289.9 / 336.1 | 1,321.9 / 1,669.5 |
| Many / 10,000 | 102 / 1,999 | 4,944,614 | 2.3 / 2.7 | 96.8 / 119.3 | 16.5 / 20.8 | 854.5 / 925.0 | 2,432.6 / 3,437.3 |

| Shape / links | Export | Replace preview | Replace commit |
| --- | ---: | ---: | ---: |
| Few / 100 | 4.2 / 5.3 | 10.6 / 12.0 | 26.6 / 30.1 |
| Few / 1,000 | 34.0 / 53.4 | 52.8 / 84.1 | 208.2 / 220.3 |
| Few / 5,000 | 180.4 / 232.0 | 345.2 / 459.3 | 1,067.1 / 1,317.0 |
| Few / 10,000 | 320.2 / 421.6 | 602.0 / 759.1 | 2,045.7 / 2,055.4 |
| Many / 100 | 6.4 / 8.6 | 11.3 / 12.8 | 33.8 / 34.3 |
| Many / 1,000 | 43.2 / 51.5 | 67.3 / 89.7 | 251.3 / 269.7 |
| Many / 5,000 | 153.6 / 227.0 | 321.6 / 366.7 | 1,422.3 / 1,725.5 |
| Many / 10,000 | 286.9 / 339.9 | 656.6 / 889.0 | 3,040.1 / 3,369.8 |

The earlier second-scale write remains reproducible. Smaller warm reads remain
cheap even when the database is large. The old multi-second grouping/export
numbers bracketed full results crossing Playwright; these page-clock results
measure a different boundary. See the matched transport replay in §6.

From 1,000 to 10,000 links, write medians grew about **10.9×/10.0×**
(few/many). This is consistent with repeated whole-value work, not evidence
of a quadratic storage algorithm. The fixed workload differences and sample
noise do not establish an asymptotic bound for Chrome's implementation.

## 4. Storage profiling

The repository's warm `getDatabase()` returns the validated cache reference; it
does not clone the entire database for every read. Cold initialization reads one
stored object, structurally parses it, checks relationships, and compares it with
the parsed candidate to retain a reliable raw precondition. A verified mutation
clones the current database, applies the update, validates the candidate, reads and
compares the current stored value, writes, then reads back and compares. Chrome
storage change events can invalidate the cache. Schema-v2 fixtures do not migrate;
the migration helper span on these fixtures is structural validation.

Production median times (ms):

| Shape / links | Native get | Native changed set | Projects after external write | Cold worker projects | Isolated clone | Full schema | Relational only | Compare |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Few / 100 | 2.0 | 9.1 | 5.2 | 40.2 | 0.5 | 2.2 | <0.1 | 0.3 |
| Few / 1,000 | 31.6 | 86.6 | 50.7 | 106.4 | 4.2 | 19.5 | 0.4 | 5.0 |
| Few / 5,000 | 160.9 | 447.5 | 310.7 | 241.2 | 29.8 | 107.0 | 2.1 | 14.9 |
| Few / 10,000 | 169.5 | 1,254.4 | 568.8 | 602.5 | 37.4 | 175.7 | 3.3 | 51.1 |
| Many / 100 | 3.5 | 10.3 | 9.3 | 48.2 | 0.8 | 2.3 | 0.1 | 0.7 |
| Many / 1,000 | 17.8 | 92.9 | 55.1 | 125.4 | 5.3 | 8.9 | 0.6 | 5.1 |
| Many / 5,000 | 168.1 | 517.0 | 331.3 | 357.2 | 15.9 | 68.4 | 1.3 | 14.9 |
| Many / 10,000 | 246.9 | 1,062.9 | 570.0 | 666.5 | 105.5 | 166.6 | 5.0 | 29.0 |

Cold and invalidated reads require full work even when the response is only a few
projects. Non-monotonic results (including the clone spread) should not be assigned
to one cause without more runs. **Relation checking is not the main expense**;
full structural parsing, whole-value Chrome storage calls, cloning and comparisons
are individually measurable and much larger at scale.

Typical **diagnostic verified settings write** (median of three, ms). The two
storage reads are the precondition read and the post-write readback. Compare is
the sum of the two comparison calls within a sample; integrity is included in
full schema. Separate stage medians need not sum to the RPC median.

| Shape / links | RPC | Clone | Full schema | Integrity within schema | Pre-read | Set | Readback | Compare | Reminder reconcile |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Few / 100 | 24.3 | 0.5 | 2.1 | 0.1 | 3.0 | 11.4 | 3.5 | 0.7 | 0.9 |
| Few / 1,000 | 222.0 | 4.9 | 15.9 | 0.6 | 34.5 | 114.7 | 38.5 | 5.0 | 0.9 |
| Few / 5,000 | 1,422.8 | 23.1 | 103.8 | 3.2 | 150.9 | 613.5 | 241.3 | 43.6 | 1.2 |
| Few / 10,000 | 3,334.0 | 54.7 | 259.3 | 11.3 | 452.6 | 1,974.3 | 354.0 | 83.9 | 2.6 |
| Many / 100 | 36.0 | 0.5 | 3.0 | 0.1 | 8.1 | 12.3 | 3.1 | 0.7 | 0.7 |
| Many / 1,000 | 153.3 | 2.7 | 12.4 | 0.9 | 28.9 | 82.6 | 24.7 | 4.7 | 0.9 |
| Many / 5,000 | 1,092.8 | 24.9 | 99.0 | 6.5 | 132.6 | 640.8 | 158.6 | 30.1 | 1.3 |
| Many / 10,000 | 2,529.5 | 31.8 | 142.9 | 7.6 | 266.3 | 1,560.8 | 457.6 | 55.0 | 13.5 |

Each traced write had two `get`s, one `set`, one candidate validation, one clone,
two comparisons and one invalidation. The trace does **not** show a third full read
in this isolated path. Invalidation and assignment costs are not significant
standalone CPU measurements. In a separate 10,000-link query after an external
write, diagnostic cold initialization took 361/488 ms (few/many), including
210/303 ms for the `get` and 117/151 ms for structural parsing. The warm path
did not call storage. Chrome storage-call time is measured; the split among disk,
marshalling, event dispatch and waiting is not. The diagnostic build/run can shift
timings relative to production, so use it to attribute work, not to compare raw
throughput across the two bundles.

## 5. Search profiling

Saved-link search scans eligible parked/archived links. It builds a project-name
Map, creates intermediate arrays with filter/map/filter, concatenates and lowercases
the title, URL, domain, note and project name, tests all tokens, then sorts matches.
There is no index. The native bookmark tree is obtained and searched separately.
The UI waits 150 ms before dispatch, cancels stale result use, and renders returned
cards without search-list virtualization. Removed/restored history is not searched.

Production medians at 10,000 links (ms):

| Query | Few large | Many small |
| --- | ---: | ---: |
| Exact URL | 16.8 | 16.5 |
| Title tokens | 20.7 | 12.1 |
| Note token | 13.8 | 19.4 |
| No results | 16.2 | 15.0 |
| Broad synthetic term | 161.0 | 126.5 |
| Archived title | 27.1 | 32.2 |

The gap between narrow and broad is larger than the cost of finding a match.
Saved-link scanning still happens for no results. Broad queries return thousands
of records, so a small-response query and a large-response query should not be
given the same transport budget. The benchmark seeds 100 native bookmarks; it
does not characterize very large native bookmark trees.

At 10,000, the diagnostic saved-link scan was **8–19 ms** across these query
variants. The broad query returned **8,352** saved records; the project-name token
query used in that run also matched broadly (8,342) because numeric tokens can
match other searchable fields. Query timing is not project-ID filtering.
Bookmark-tree filtering itself was **0.2–0.8 ms**. `getTree` wait spans overlap the
saved-link scan in `Promise.all`; they cannot be added or interpreted as exclusive
Chrome bookmark cost. Narrow/broad RPC difference remains substantial after a
similarly sized scan.

In the focused 10,000-link replay (few/many), direct Chrome `bookmarks.getTree`
took **1.5/2.0 ms**. The bookmark-only query returned 100 native bookmarks and
zero saved links in **15.6/13.9 ms**; the project-name query returned ten saved
links and zero bookmarks in **13.6/17.5 ms**. These narrow cases do not implicate
native bookmark retrieval as a leading bottleneck for this fixture.

## 6. Project and session grouping

The worker filters parked links, groups via one Map pass, filters sessions against
the Map, sorts each group by original index, and sorts sessions by date. Source
complexity is roughly O(links + sessions + per-group sorts + session sort), not a
nested session-by-link search. Ordered fixture runs are not worst-case sort tests.
The sidebar filters/sorts its copy again to support the user's order/filter and
receives full groups even when all but one session is collapsed.

| Shape / links | Actual repository grouping in process | Grouping + JSON stringify in process | Scoped project RPC | All groups RPC | Full outer Playwright transport |
| --- | ---: | ---: | ---: | ---: | ---: |
| Few / 100 | 0.1 | 0.1 | 1.8 | 2.3 | 45.9 |
| Few / 1,000 | 0.5 | 1.2 | 5.2 | 12.5 | 167.3 |
| Few / 5,000 | 2.8 | 8.5 | 17.2 | 61.4 | 928.1 |
| Few / 10,000 | 7.7 | 14.6 | 49.1 | 135.7 | 936.6 |
| Many / 100 | <0.1 | 0.2 | 2.2 | 2.0 | 31.4 |
| Many / 1,000 | 0.4 | 2.0 | 2.5 | 6.0 | 219.5 |
| Many / 5,000 | 4.0 | 4.9 | 3.1 | 52.1 | 1,026.6 |
| Many / 10,000 | 3.2 | 15.0 | 2.0 | 96.8 | 2,011.9 |

Numbers are medians in ms. Outer transport is a separate full-return experiment,
not a subtraction from the compact-return RPC column. At 10,000 links, diagnostic
worker grouping was 7.2 ms for 9 active groups and 2.0 ms for 1,985 active groups.
Isolated sort kernels over shallow copies took 1.5–2.1 ms for links and ≤0.2 ms
for sessions; those are not exclusive production stage estimates. Current shape
does not support the hypothesis of a quadratic grouping bottleneck. A selected
project in the many-project fixture returns far fewer links than a project in the
few-project fixture. The response construction/transfer boundary matters more
than the grouping algorithm alone. The focused 10,000-link few/many replay
isolated Map construction at 0.7/1.0 ms and session-list construction from an
already-built Map at <0.1/0.3 ms. Neither kernel includes sorting.

Matched replay: the Phase 1.6 generator's **single session, 10,000 parked links**,
same full-response shape, in the current production build. Each full-return pair
times the same invocation inside Chrome and at the outer Playwright boundary:

| Operation | Phase 1.6 outer measurement | Replay in-page median | Replay full outer median |
| --- | ---: | ---: | ---: |
| Session grouping | 2,369 ms | 133.0 ms | 2,903.0 ms |
| Export (outer includes Node stringify) | 2,844 ms | 424.2 ms | 3,283.1 ms |

Actual in-process grouping on that ordered single-session fixture took **1.6 ms**.
The same result crossing the Playwright protocol makes multi-second timings
reproducible; they are not evidence of a multi-second worker grouping algorithm.
The replay preserves the earlier fixture's settings; unlike the primary
few/many fixtures it is not a notification-delivery workload.
The original run also had a mounted sidebar, fewer samples, different browser/Zod
versions and possible additional refresh/GC load. Import's earlier combined
clock included transferring large input objects through Playwright twice, while
the new preview/commit clocks start after input reaches the browser page. No
exact cross-phase speedup is claimed. Legacy recheck still took 515 ms and its
verified settings write 2,780 ms: these costs persist without a large outer reply.

## 7. UI rendering and responsiveness

Projects initially asks for storage status, projects and settings, then fetches
the selected project's groups. It renders session headers and batches expanded
links in groups of 25; collapse prevents card creation but not transport or
group-level transforms. Search and Archive render every result card; Today maps
its due links. Archive additionally finds project names per card. Navigation keeps
small local preferences and mounts the selected section. Recovery status listens
for database changes; some mutations update the local UI, others explicitly fetch
the list again. The popup has an active-tab form, not the large-library card tree.

Actual production sidebar documents, 400×800. Medians in ms; Projects/Archive/
Today run from navigation to an observed ready frame, Search from the input
action through the post-data frame, and Restore from the single-card action
through the updated list and storage-status response.

| Shape / links | Projects | Narrow search | Archive | Today (empty) | Single restore + UI refresh |
| --- | ---: | ---: | ---: | ---: | ---: |
| Few / 100 | 300.2 | 236.7 | 304.0 | 263.5 | 186.2 |
| Few / 1,000 | 331.2 | 230.6 | 396.1 | 145.2 | 355.3 |
| Few / 5,000 | 230.6 | 228.1 | 1,845.1 | 193.2 | 2,134.8 |
| Few / 10,000 | 309.2 | 245.8 | 1,904.2 | 155.7 | 3,040.3 |
| Many / 100 | 284.7 | 236.9 | 202.7 | 156.2 | 187.7 |
| Many / 1,000 | 284.4 | 239.0 | 462.2 | 173.4 | 492.6 |
| Many / 5,000 | 297.9 | 239.4 | 1,135.0 | 148.7 | 1,972.7 |
| Many / 10,000 | 177.5 | 258.7 | 1,916.8 | 194.5 | 2,307.7 |

At 10,000, Projects rendered **25/4** link articles (few/many); Archive rendered
**1,962** in both. Archive spent **1,703/1,754 ms** from the relevant response
to the observed frame, with **1,431/1,425 ms** of long tasks and **295/319 ms**
in CDP's cumulative layout counter. Some startup samples also briefly requested
Projects data before the saved Archive section took over. Single-card restore
observed the action RPC and one extra `GET_STORAGE_STATUS`, with no groups refetch
in that measured flow. Bulk refresh counts with multiple open interfaces remain
unmeasured.

Broad Search at 1,000 links rendered **958** saved/native bookmark articles.
It took **1,705/1,180 ms** total, of which **1,507/979 ms** followed the data
response; median long-task time was **1,396/881 ms**. This is strong evidence of a
rendering problem independent of the search scan. At 100 links (185 articles),
the same broad UI query took **471/393 ms**. Broad DOM cases at 5,000/10,000 are
explicitly skipped to bound the test workload; broad RPC is measured there.
Narrow Search includes the 150 ms debounce and renders one card. The Today
fixture has no due cards; these are empty-state timings, not overdue list timings.

Separate CDP sampling at many/10,000 Archive produced CPU and allocation profiles
(outside the primary timing run). CPU profiles included DOM `setAttribute`,
`appendChild`/`createElement`, GC and minified script frames. They support the
renderer cost finding but do not identify exclusive React commit time. The
response-to-frame proxy includes polling and frame scheduling, and the sidebar
HTML tab does not reproduce the docked Chrome container. No scroll FPS or
toolbar popup latency claim is made.

## 8. Restoration and bulk operations

The controlled project/session has ten parked records in the full fixture. It
bounds tab creation and preserves the same target workload while storage grows.
Ten independent single-link RPCs differ from a single session/project RPC: each
independent request can reconcile reminders, while collection restore does so once
after the collection. Existing per-link/window reservations, tab targeting,
confirmed-open receipts and partial outcomes stay in force.

Production few-large fixture, ms **median / p95** (three samples):

| Operation | 100 links in library | 10,000 links in library |
| --- | ---: | ---: |
| One link | 85.7 / 94.0 | 1,980.9 / 2,037.4 |
| Three single-link requests | 296.1 / 338.4 | 9,970.6 / 10,152.4 |
| Ten single-link requests | 1,212.6 / 1,262.2 | 31,692.2 / 32,666.2 |
| Session of ten | 982.6 / 1,031.5 | 30,524.0 / 33,890.5 |
| Project of ten, normal | 1,096.7 / 1,133.9 | 29,749.9 / 34,581.1 |
| Project of ten, unloaded | 1,019.3 / 1,111.3 | 32,523.1 / 32,596.1 |
| Project of ten, Keep Parked Copies | 481.2 / 485.5 | 517.0 / 575.1 |

Every unloaded sample reported ten discarded tabs and zero fallbacks. These are
confirmed API operations, not end-to-end navigation time of real pages. The old
7.57 s for three restores is reproduced as the same **seconds-scale** behavior,
not the same point estimate (9.97 s here; 8.82 s on many/10,000). The probe links
are at the front of the fixture, so this does not bound arbitrary ID lookup cost.
The collection contains ten records by design; the library contains 10,000.
In the many-small 10,000-link confirmation, the ten-record normal project took
**34,607.7 ms** (p95 **36,097.8**); copies took **396.7 ms** (p95 **416.0**).
The three individual restores were **8,824.4 ms** (p95 **11,002.0**).

The three-restore diagnostic trace took **7,651.6 ms**: three verified writes
accounted for **7,371.0 ms** at the median, actual `tabs.create` for **91.5 ms**,
and reconciliation for **5.1 ms**. The remaining interval includes other
repository work, queues and messaging; it is not all messaging overhead.

Diagnostic few/10,000 medians (ms; stage clocks can be nested):

| Restore | RPC | Verified writes (count / total) | Tab creation | Discard | Reminder reconciliation |
| --- | ---: | ---: | ---: | ---: | ---: |
| Three selected | 7,651.6 | 3 / 7,371.0 | 91.5 | — | 5.1 |
| Project, ten normal | 31,182.4 | 10 / 29,816.9 | 225.7 | — | 9.4 |
| Project, ten unloaded | 31,914.3 | 10 / 30,548.4 | 201.3 | 158.8 | 2.1 |
| Project, ten with Keep Parked Copies | 510.2 | 0 / 0 | 424.3 | — | 44.7 |

These RPCs used the extension bridge without rendering the sidebar. All ten
discards succeeded without fallback in every measured unloaded sample. The
discard span measures its cost directly; storage variance makes the difference
between the normal and unloaded RPC totals a poor estimate. Any future batching
must preserve partial progress, confirmed browser effects and recovery receipts,
revision validation, rollback and coordination between concurrent operations.

## 9. Backup performance

Export builds and validates the schema-2 envelope, then serializes it to enforce
the file bound. Settings performs file serialization again for download. Preview
parses/validates the incoming backup, clones the live snapshot, creates and checks
the candidate, and hashes the current database plus backup and mode into a token.
Confirmation repeats the input/token/plan checks before a verified write. The
benchmark separates preview from commit. Replacement changes one setting to
force a different stored value while keeping the same record count; Merge is a
same-ID idempotent merge. File-reader measurements use preloaded text, not disk
or file chooser latency. The 32 MiB guard and rollback remain intact.

At 10,000, production Merge preview medians were **663/664 ms** (few/many),
and same-ID Merge commits **1,461/1,517 ms**. Replace preview and commit are in §3.
Compact backup envelopes add 99 UTF-8 bytes to the database JSON, about
**4,565,393/4,944,713 bytes** for the original 10,000-link fixtures.
The preloaded file-reader pipeline took **364/324 ms**. Isolated JSON stringify
was **22/19 ms**, JSON parse **23/21 ms**, and UTF-8 encoding + WebCrypto SHA-256
**45/44 ms** for one database. Confirmation hashes a larger envelope containing
both the database and backup, not just that isolated database payload.

Diagnostic breakdown at 10,000 (median ms; nested scopes are inclusive):

| Shape / stage | RPC | Parse + check input | Candidate schema | Snapshot clone | Plan | Revision token | Verified write |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Few / Merge preview | 615.9 | 253.2 | 113.6 | 37.2 | 4.4 | 109.2 | — |
| Few / Replace preview | 797.8 | 224.6 | 180.3 | 79.4 | 46.2 | 141.4 | — |
| Few / Replace commit | 2,048.6 | 188.3 | 116.8 | 56.7 | 28.5 | 120.9 | 1,589.3 |
| Many / Merge preview | 712.3 | 205.0 | 157.2 | 51.1 | 9.2 | 111.5 | — |
| Many / Replace preview | 701.7 | 216.2 | 153.1 | 50.1 | 22.3 | 108.1 | — |
| Many / Replace commit | 2,597.1 | 260.1 | 179.6 | 72.5 | 47.8 | 134.5 | 1,993.9 |

Export's worker envelope schema stage took **164/137 ms**, with **15/14 ms**
for its size-check stringify, and no cold storage read in the warm trace.
The normal app still needs valid input, current revision checks, a verified write
and rollback on failure. A future optimization should avoid redundant work only
where validation and revision ownership are provably unchanged.

Separate injected-failure run (few-large fixture, median ms, three samples):

| Links | Failure before storage mutation | Failure after acknowledged mutation |
| ---: | ---: | ---: |
| 1,000 | 314.3 | 367.9 |
| 10,000 | 2,156.0 | 3,167.6 |

In both cases the import reported failure and raw storage matched the original.
The “before” injection still exercised the actual verified rollback write; the
“after” injection made the candidate write and rollback native `set` calls. These
are controlled failures, not normal commit samples or physical I/O fault claims.

## 10. Reminder cost

Ordinary reconciliation reads the cache, groups pending session/time occurrences,
lists alarms, reconciles differences, and checks due groups. Diagnostics distinguish
grouping, alarm APIs, notification APIs and verified acknowledgment writes. Future
reminders remain enabled. Scheduling starts with cleared alarms; delivery uses one
overdue synthetic occurrence and checks its persisted acknowledgment. API acceptance
is not a visible desktop notification measurement.

Production ordinary due/reconciliation RPC medians at 10,000 were **4.3/4.0 ms**
(few/many), with diagnostic coordinator spans **1.1/1.4 ms**. Isolated grouping
took **0.4/0.6 ms**. For few/100 the schedule control took 2.5 ms with no pending
future group; for few/10,000 clearing then rebuilding alarms took **4.3 ms**.
One overdue notification plus persisted acknowledgment took **50.6 ms** at 100
and **2,374.3 ms** at 10,000.

Many/10,000 took **6.2 ms** to rebuild its scheduled alarms and **2,097.2 ms**
for one delivery plus acknowledgment. There is measurable repeated grouping
in ordinary reconciliation, but it is far smaller than an acknowledgment write.

In diagnostic few/10,000, scheduling did two grouping passes (0.8 ms total at
the median), one alarm enumeration and four alarm creations (2.4 ms total for
the creation calls). Delivery did three grouping passes (1.4 ms total), one
notification creation (10.1 ms) and one verified acknowledgment write
(2,019.1 ms of the 2,078.7 ms RPC). This verifies Chrome API success and the
stored acknowledgment; it does not measure whether a system notification was
visible to the user.

## 11. Memory and allocations

At 10,000 links, compact JSON is **4.35/4.72 MiB** (few/many). The isolated
workbench keeps the input, a comparison clone, serialized database/backup and
validated repository reference. Its GC-normalized page heap before each sample
was **27.3/29.9 MiB**. This is not the production cache size. On successful warm
reads the repository keeps the database and precondition snapshot by reference;
they may refer to one object or separate raw/parsed objects depending on equality.
Exact retained worker/cache bytes were not isolated.

| Operation, three invocations | Few: sampled allocation MiB | Many: sampled allocation MiB | Few / many heap after MiB |
| --- | ---: | ---: | ---: |
| Structured clone | 16.5 | 18.4 | 42.6 / 46.7 |
| Full database schema | 125.9 | 141.6 | 27.3 / 29.9 |
| Stored-value comparison | 25.8 | 28.7 | 27.3 / 29.9 |
| Backup file validation | 143.1 | 155.2 | 18.6 / 20.5 |

These are separate [CDP allocation sampling](https://chromedevtools.github.io/devtools-protocol/tot/HeapProfiler/)
experiments at 32 KiB sampling intervals, including collected objects. Sampled
allocation totals show transient work; they are not peak live bytes or exact
allocations attributed solely to LinkShelf. GC can lower the “after” reading.
UI page/isolate readings at 10,000 were **28.8/48.8 MiB** for Projects and
**53.3/71.8 MiB** for Archive. They include runtime, retained objects and GC
history, and are neither total browser memory nor proof of a leak. Full-import
peak heap, live worker allocation stacks and exact Chrome serialization buffers
remain unmeasured. Repeated full-schema construction is more allocation-heavy
than the serialized size alone suggests.

## 12. IndexedDB evaluation

Keep the current Chrome storage design for the first optimization steps. It is
viable for the measured smaller libraries and meets the current compatibility and
recovery requirements. At 10,000 links, whole-object writes and capacity headroom
need attention; no evidence here establishes that migrating the entire store is
necessary. Benchmark counts are fixture sizes, not telemetry on users' libraries.

Reducing repeated passes, response size and the number of whole-object commits
can improve the current design. A derived in-memory read model is a lower-risk
hybrid than a second authoritative store. IndexedDB could eventually improve
record-level mutation/query costs and offer transactions, but transactions do not
make native tab/bookmark side effects exactly-once. It adds migration, dual-write
or cutover, worker lifecycle, versioned backup, verified recovery and reminder
consistency work. Revisit an isolated migration prototype if optimized real-world
latency or actual quota usage still justifies it. Do not choose solely on future scale.

## 13. Ranked optimization opportunities

Ranked by evidence, user impact and implementation risk. Benefits refer to
specific workloads; this phase does not estimate unmeasured percentage speedups.

| Rank | Opportunity | Expected benefit / user impact | Complexity | Data risk | Evidence confidence |
| ---: | --- | --- | --- | --- | --- |
| 1 | Skip a proven no-op verified mutation after current-state comparison | Avoid an expensive full set/readback for unchanged settings and idempotent imports; useful first storage target | Low–medium | Low if the current-value check stays and no actual write is skipped | High on API cost; frequency in real usage unknown |
| 2 | Bound Search/Archive card work and large response projections | High: removes hundreds/thousands of unnecessary initial DOM nodes and reduces transfer | Medium | Low; reads only, preserve result completeness and navigation | High, observed long tasks and broad RPC cost |
| 3 | Batch confirmed restore lifecycle persistence | Highest potential changing-write benefit for collections | High | High; partial progress, receipts, interruption and concurrency require explicit design | High on repeated whole writes; safe implementation not proven |
| 4 | Reuse a verified backup candidate only under an unchanged revision | Medium–high for preview/commit allocation and repeated schema work | Medium–high | Medium; invalid/stale input and rollback must remain guarded | High on repeated stages |
| 5 | Fetch narrower group projections and avoid duplicate startup/refresh requests | Medium for large few-project payloads and multi-interface responsiveness | Medium | Low for read projection | High for payload cost; some refresh duplication needs further targeted capture |
| 6 | Reduce search intermediate allocations and repeated normalization | Small–medium at current sizes; do after measuring bounded rendering/response | Low–medium | Low if token semantics stay identical | High on scan cost; index benefit not supported yet |
| 7 | Revisit cache policy only after a contention trace | Potentially useful for overlapping UI/mutations; no evidence to weaken invalidation | Medium | Medium | Warm reads are fast and verified writes showed only two full reads |
| 8 | Investigate record-level storage if quota/latency still binds | Potentially large longer-term capacity/write benefit | High | High migration/recovery burden | Not justified as the first change by this baseline |

## 14. Recommended Phase 2 roadmap

**First Phase 2.2 target:** define and test a no-op path in the verified-write
primitive, starting with unchanged settings and same-ID no-change Merge. Establish
candidate validity and compare with current raw storage before treating the result
as unchanged. Preserve stale revision checks, genuine changed writes' precondition,
readback and rollback, and reminder/result behavior. A no-op should issue zero
Chrome `set`s; prove that with counters and preservation tests, then compare with
these fixtures. This is a contained first change; it will not make real changing
writes cheap by itself. Evaluate reusing already-validated candidates next, under
explicit trusted-data/revision ownership. No safeguards should be removed for a
better timing number.

- **2.3 Search and filtering:** reduce large result transfer and intermediate
  construction, retain exact token/project/archive/bookmark semantics. Delay a
  search index until reduced payload and rendering are measured.
- **2.4 UI rendering:** cap initial Archive/Search card work, preserve keyboard
  navigation and all results, then remeasure long tasks/heap. Avoid a redesign.
- **2.5 Bulk restoration:** prototype verified persistence of confirmed successes
  in bounded batches. Preserve reservations, fixed target windows/order,
  acknowledged partial progress, Keep Parked Copies and precise failure receipts.
  Review the larger crash window between Chrome effects and persisted lifecycle
  state before changing behavior. Keep existing native and fault regressions.
- **2.6 Regression checks:** repeat this baseline on comparable hardware and add
  stable work-count invariants where useful. Keep latency benchmarks opt-in and
  record p95/noise rather than making ordinary CI depend on this laptop.

## 15. Remaining unknowns and failed measurements

Chrome's API clock does not isolate disk flush, internal serialization, event
delivery, process scheduling or IPC. Renderer frames and CDP script/layout
counters do not isolate React commit cost or docked-panel paint. This is one
desktop environment, not a cross-device comparison. Actual profile size mix,
large native bookmark libraries, cold disk caches and browser interruption during
an operation are not characterized. No large or uncontrolled exhaustion tests.

Large-result UI scroll FPS, exact DOM commit time, exact worker retained/peak
heap, true physical disk flush and high-contention queue delays remain open.
The Chrome tab targets load small loopback HTML, not real-page assets. Target
window changes and concurrent-operation correctness are covered by Phase 1,
but were not used as performance load in these sequential runs.

An initial diagnostic smoke build failed when a timing wrapper moved an `await`
into a synchronous closure. The benchmark-only call wrapper was corrected before
collecting baseline samples; no production source was changed. Broad DOM Search
at 5,000/10,000 is recorded as an intentional workload cap, not a passing scenario.

| Local ignored evidence | Run |
| --- | --- |
| Production core matrix | [09:15 core](.output/native-runs/2026-11-11T09-15-26.722Z-24472/performance.json) |
| Diagnostic core matrix | [09:34 diagnostic](.output/native-runs/2026-11-11T09-34-07.357Z-11320/performance.json) |
| Phase 1.6 replay | [09:42 replay](.output/native-runs/2026-11-11T09-42-05.466Z-26896/performance.json) |
| Production UI matrix | [09:45 UI](.output/native-runs/2026-11-11T09-45-57.102Z-20024/performance.json) |
| Archive CDP CPU/allocations | [09:50 capture](.output/native-runs/2026-11-11T09-50-12.497Z-720/performance.json); profiles alongside JSON |
| Isolated allocation sampling | [09:50 memory](.output/native-runs/2026-11-11T09-50-30.813Z-6788/performance.json); profiles alongside JSON |
| Injected rollback | [09:50 fault](.output/native-runs/2026-11-11T09-50-58.374Z-8976/performance.json) |
| Production restoration and reminders, few | [09:52 bulk](.output/native-runs/2026-11-11T09-52-54.116Z-22844/performance.json) |
| Production restoration and reminders, many | [10:06 bulk](.output/native-runs/2026-11-11T10-06-41.813Z-20736/performance.json) |
| Diagnostic restoration and reminders | [10:11 bulk trace](.output/native-runs/2026-11-11T10-11-57.804Z-8840/performance.json) |
| Focused grouping, session list and bookmark isolation | [11:33 supplementary replay](.output/native-runs/2026-11-11T11-33-43.154Z-21472/performance.json) |
| Final native regression suite | [11:35 native results](.output/native-runs/2026-11-11T11-35-46.048Z-14344/results.json) |

The production and diagnostic core matrices, production sidebar matrix, matched
Phase 1.6 replay, focused replay, CDP profile, memory, fault and selected
restoration matrices finished with zero recorded operation failures or timeouts.
The fault suite intentionally injects write failures and asserts preservation.
The sidebar suite intentionally skips broad Search above 1,000 saved links
under its DOM safety cap; broad RPCs were measured at all sizes. The first
diagnostic build failed before measurement; the corrected instrumentation was
rebuilt and the diagnostic matrix rerun.

## 16. Git status and verification

The benchmarked application revision is the Phase 1.6 merge
`80fb23dee1480ed42d33823dac81c27c4b92b46c`. The Phase 2.1 branch
`perf/profiling-baseline` adds the benchmark command, reusable test harness,
profiling scripts and documentation.

`npm run verify` passed: TypeScript, 348 tests across 24 files, and the
production build. `npm run test:integration` passed all 241 tests in its
subset. `npm run zip`, `npm run check:package` (17 files), and
`git diff --check` passed. The native Chrome regression suite passed all nine
scenario checks in disposable profiles. Syntax checks passed for all new
JavaScript modules and the updated native harness.

The 17 final production assets are byte-identical to their counterparts in
the production benchmark snapshot; the final package contains no profiling
bridge or instrumentation. Raw evidence remains local under ignored
`.output/native-runs/`.
