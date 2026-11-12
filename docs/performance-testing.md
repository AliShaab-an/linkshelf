# LinkShelf performance baseline

Phase 2.1 established the original profiling baseline for the merged reliability
build. Phase 2.6 establishes the consolidated reference after the Phase 2
storage, Search, rendering, and restoration optimizations.
[Original profiling report](../PHASE_2_1_PERFORMANCE_REPORT.md) ·
[Phase 2.6 release baseline](../PHASE_2_6_IMPLEMENTATION_REPORT.md)

## Setup

Use Node 22, the repository lockfile, and the disposable Chrome setup in
[testing.md](testing.md). Reuse an external Playwright installation by setting
`LINKSHELF_PLAYWRIGHT_MODULE`; use `CHROME_PATH` if Chrome is not at the default
path. Use a browser supporting the existing CDP unpacked-extension loader.
Finish the production build before launching a benchmark. Avoid running builds,
other benchmarks, or CPU-intensive tasks in parallel with measurements.

```sh
npm ci
npm run build
npm run bench:performance -- --help
npm run bench:performance
```

## Phase 2 release baseline and regression checks

Run `npm run verify` for ordinary automated verification. Deterministic
assertions about results, ordering, invalidation, recovery, and controlled
storage work counts are blocking. The native suites check the actual
extension in Chrome and also treat correctness failures as blocking:

```sh
npm run test:native
node scripts/native/search.mjs
node scripts/native/rendering.mjs
node scripts/native/bulk-restore.mjs
```

With the production build ready, use the small default matrix or the full
baseline. Run them sequentially on the same machine when comparing.

```sh
npm run perf:baseline
npm run perf:baseline -- --full
npm run perf:compare -- <baseline.json> <candidate.json>
npm run perf:compare -- <baseline.json> <candidate.json> --json
```

The full baseline uses both distributions at 100, 1,000, 5,000 and 10,000
links for core, paged Search and Archive. Storage mutations and bulk
restoration use the 100- and 10,000-link few-session cases. The smoke matrix
uses 100 links for core, storage, bulk and paged Search, and 100/1,000 for
Archive. Both include a 1,000-link sidebar Search workload. The full
matrix also records the Projects scenarios and marks absent continuation
controls as intentionally skipped. The raw runners remain
available for choosing individual operations.

Normalized reports are written under ignored `.output/performance-baselines/`.
They link to raw reports under ignored `.output/native-runs/`. The canonical
fixture hash uses the fixed seed and a stable synthetic origin so an ephemeral
loopback port does not make equivalent fixtures incomparable. Raw reports
retain the actual fixture hash where supported. The baseline command closes
Chrome and the loopback server and removes its own disposable profiles
after shutdown. Build snapshots and metrics remain available locally.

A failed or unsupported suite exits nonzero and leaves prior measurements
available. A skipped or failed operation is not used for timing comparison.
The comparator checks workload, clock, environment, instrumentation,
sampling and result counts. A median change of at least 15% and 1 ms is
highlighted for review, with the absolute difference used near zero. That
is a review heuristic rather than a confidence test or a CI threshold.
Nearest-rank p95 effectively equals the observed maximum for two or
three samples. Byte size, heap, long tasks and other work metrics appear
separately from timing classifications.

For the warm synthetic fixtures, unchanged settings and no-change Merge
must do zero sets and readbacks. Changed settings, Merge additions, and
explicit Replace require one validated write and readback. The diagnostic
checks also require a precondition read and reminder reconciliation.
Ten successful collection targets require five verified writes, and 25
targets require 13. Copies do zero lifecycle writes. Search allows at most
25 records per category in each reply and reuses one repository scan and
one bookmark tree read across continuation. Archive mounts at most 25
cards. Search mounts at most 25 cards per category even after additional
loads. These counts protect behavior and the chosen work bounds. Timing,
transfer size, heap, and incidental Chrome activity remain observations.

Ordinary GitHub Actions continues to run the existing Verify workflow.
Native Chrome and statistical benchmarking remain manual. The extension
CDP loader is verified in the documented local Chrome environment. The
hosted runner setup has not been verified, so this phase adds no optional
browser workflow or artifact upload.

Default core runs use 100, 1,000, 5,000 and 10,000 links, both distributions,
two warm-ups and seven retained samples. Mutations that require import preview,
large transport comparisons and cold-worker trials use three retained samples
and one warm-up unless otherwise specified. Percentiles are nearest rank: p95
at these sample sizes is effectively the maximum. Treat it as a tail observation,
not a percentile estimate for a large population. No performance threshold gates CI.

## Reproduce individual experiments

```sh
npm run bench:performance -- --sizes=1000,10000 --distributions=few,many --repetitions=7 --warmups=2
npm run bench:performance -- --diagnostic --repetitions=3 --warmups=1 --only=projects.warm,projects.afterExternalWrite,validation.recheck,write.verified,groups.all,groups.project,search.url,search.broad,search.none,search.project,search.bookmarks,export,backup.preview.merge,backup.preview.replace,backup.commit.replace,reminders.ordinary
npm run bench:performance -- --sizes=10000 --distributions=phase16 --only=cpu.groups,groups.all,groups.fullTransport,groups.project,export,export.fullTransport,write.verified,backup.preview.replace,backup.commit.replace,validation.recheck
npm run bench:performance -- --only=cpu.group.map,cpu.session.list,chrome.bookmarks.getTree,search.bookmarks,search.project
npm run bench:performance -- --suite=bulk --sizes=100,10000 --distributions=few
npm run bench:performance -- --suite=bulk --sizes=10000 --distributions=many --only=restore.three,restore.project10,restore.copies10,reminders.schedule,reminders.delivery
npm run bench:performance -- --suite=bulk --sizes=10000 --distributions=few --diagnostic --only=restore.three,restore.project10,restore.unloaded10,restore.copies10,reminders.schedule,reminders.delivery
npm run bench:performance -- --suite=ui
npm run bench:performance -- --suite=ui --sizes=10000 --distributions=many --only=ui.archive --profile --bulk-repetitions=1
npm run bench:performance -- --suite=memory --sizes=10000
npm run bench:performance -- --suite=fault --sizes=1000,10000 --distributions=few --diagnostic
```

`--sizes`, `--distributions`, `--repetitions`, `--warmups`, `--bulk-repetitions`
and `--only` select inputs and operations. `phase16` reproduces the old
one-session all-parked fixture and its settings for a transport comparison, not the primary
representative baseline. The same seed and origin produce identical fixture
bytes; the local test server's ephemeral port varies across runs. Raw reports
record sizes, counts, state mix and a fixture hash. No real browsing data is used.

## Bulk restoration checkpoints

Use the disposable Chrome setup and a completed production build:

```sh
node scripts/native/bulk-restore.mjs
npm run bench:performance -- --suite=bulk --diagnostic --sizes=100,1000,5000,10000 --distributions=few --bulk-repetitions=2 --only=restore.session10,restore.project10,restore.unloaded10,restore.copies10
npm run bench:performance -- --suite=bulk --diagnostic --sizes=10000 --distributions=many --bulk-repetitions=2 --only=restore.one,restore.project10,restore.copies10
```

For the before run, use the Phase 2.4 merge
`95fd171c000eb1159e6f0f513743c8699a959744` in a separate checkout and run the
same benchmark. Run the builds sequentially. The diagnostic intervals start
and end inside the extension, use synthetic local pages, and include
reminder reconciliation. The driver checks persisted target counts after
the optimized RPC and outside diagnostic capture. The observed maximum
uses only two retained samples per case.

The native suite exercises the production worker with temporary Chrome API
probes. It checks real tab IDs and indexes, discards, verified saved state,
failure and retry, and stops the service worker at controlled boundaries.
The probes and evidence remain in disposable profiles under
`.output/native-runs/`.

## Sidebar rendering comparison

With the production build and disposable Chrome setup ready:

```sh
node scripts/performance/rendering.mjs
node scripts/native/rendering.mjs
node scripts/native/search.mjs
```

For a matched baseline, build the Phase 2.3 merge
`45a486a8daa0e0198e8cb7068ea4ebe3f2ee5fc8` in a separate checkout. Pass the
path to its built extension directory as the first argument to
`scripts/performance/rendering.mjs`. The harness copies that build into a
disposable profile snapshot. Run baseline and optimized measurements
sequentially. Archive tests both distributions at 100, 1,000, 5,000 and
10,000 records. Search measures the first batch and the last continuation
after 12 saved-link batches and three additional bookmark batches. Projects
includes Expand All and, where available, Show More and Show All.

The JSON records mounted cards, DOM elements, browser RPCs, observed frames,
main-thread long tasks, cumulative layout counts and page heap. Frame
measurements include browser scheduling and Playwright interaction. They
cannot isolate React commit time. Heap readings are snapshots without forced
GC. The rendering regression script separately checks keyboard navigation,
focus, variable-height notes, widths, zoom, and cross-document updates.

## Search comparison

Run the following against a completed production build using the same
disposable Chrome setup:

```sh
node scripts/performance/search.mjs
node scripts/performance/search.mjs --paged
node scripts/performance/search.mjs --paged --diagnostic
node scripts/native/search.mjs
```

The first command measures the legacy full-response protocol and works on
the Phase 2.2 merge `6cc2afec4856b30d61473785d19496715027d09b` after copying
the benchmark script into that checkout. The paged run measures the first
response and every broad continuation in both categories. It checks the
complete sequence against the full-response protocol outside the timed
interval. The diagnostic build records worker spans and Chrome API calls
separately from the production clocks. Each run reports JSON under
`.output/native-runs/`.

The sidebar script exercises continuation and measures input, response,
visible-card and frame timing in the real extension document. To repeat only
the matched baseline UI measurements, pass the earlier RPC run's
`built-extension` snapshot as the script's first argument.

## Storage write comparison

The Phase 2.2 write suite measures unchanged and changed settings saves,
identical and repeated Merge commits, a Merge that adds a project, session and
link, and a changed Replace commit as the verified-write control.

```sh
npm run build
npm run bench:performance -- --suite=storage-writes --diagnostic
```

The default matrix retains three samples per case after one warm-up. For each
sample the suite resets the synthetic fixture and obtains a fresh preview token
outside the measured interval. For the repeated case, it first imports the
additions so the timed import sees already-present records. The suite verifies
the reply, counts and persisted state after stopping the diagnostic trace.
Remove `--diagnostic` to time the unmodified production worker.

For a matched before/after comparison, use a separate checkout of the Phase
2.1 merge `d8068d2773977d90b1c25fe3888617ceeef8d0d3`. Copy only
`scripts/performance/run.mjs` and `scripts/performance/storage-writes.mjs`
from Phase 2.2 into that checkout, then install from the lockfile, build and
run the same command. Run the two checkouts sequentially on the same machine.
Report the candidate validation span (`schema.database`) separately from the
backup parser. For the successful fixture operations, the precondition read
is recorded by `repo.readStored` and a changed write also has a post-write
storage get. Check the actual span counts for extra cache reloads.

## Clocks and what they mean

- **Production RPC:** the bridge page starts its clock immediately before
  `chrome.runtime.sendMessage` and stops when the reply resolves. The normal
  WXT worker is unmodified. Only a small summary crosses into Node, except
  the intentional `groups.fullTransport` experiment. `transport` records the
  enclosing Playwright/Node call, which is not product latency.
- **Isolated operations:** a separate bundled extension page runs the real
  repository, schema and backup helpers against in-memory input. No Chrome
  storage IPC is charged to these cases. WebCrypto includes its asynchronous
  wait. Group serialization includes grouping plus JSON encoding; sort kernels
  sort shallow copies and are not subtracted from production timings.
- **Native storage API:** actual `chrome.storage.local.get/set` from the bridge,
  with no repository or large Playwright return. Chrome's internal encoding,
  process scheduling, persistence and decoding cannot be decomposed by this clock.
- **Diagnostic worker:** a second production-mode bundle of the actual worker
  source is built only into a disposable snapshot. Timing wrappers record
  durations/call counts for selected functions and Chrome APIs. It is used for
  attribution, not substituted for the unmodified WXT baseline. Spans nest and
  can overlap; parent/child timings and medians must not be added as if exclusive.
- **Cold vs warm:** cold worker timing starts after confirmed termination, and
  includes the first RPC wake plus initialization. Storage-change and explicit
  recheck timings isolate cache reinitialization with a running worker. A
  storage-change query observes Chrome's event delivery; use diagnostic read counts
  to check whether it was cold. A fresh browser/disk-cache boot is different.
- **UI:** the real production sidebar HTML is observed at 400×800 with request
  counts, DOM article count, long tasks, two animation frames after data, and CDP
  script/layout/heap metrics. The frame proxy is not a React commit profiler.
  Search includes the real debounce. Broad DOM rendering is capped at the
  1,000-link fixture; broad RPC is measured at every size. The sidebar HTML tab
  does not establish docked-pane or toolbar-popup behavior.
- **Memory:** optional GC-normalized page heap snapshots of usage counters and
  sampled allocation stacks. These are neither total browser memory nor exact
  retained repository bytes/peak heap. Profiling overhead is kept out of primary
  UI timings; `--profile` is a separate CDP CPU/allocation capture.

## Repeatability and safety

The harness snapshots the production build, creates a fresh disposable profile and
uses synthetic loopback content. It does not accept a real profile path. The bridge
has no application React tree, so unrelated UI requests do not inflate core timings.
UI cases open and close their own documents. The storage key stays below a synthetic
8 MiB guard to leave headroom under Chrome's actual quota. The harness does not
upload data; it blocks external page requests. This is not whole-browser network isolation.

Writes, import commits, restores and fault samples reset to the original fixture
outside the measured window. Replacement changes a preference while keeping size
and structure; the merge case is an idempotent same-ID merge. The dedicated
ten-record restoration project/session bounds real tab creation. Created tabs are
closed between samples. Normal reminder reconciliation uses future dates with
notifications enabled. Scheduling clears alarms in the fixture before timing;
delivery uses one overdue occurrence and verifies its persisted acknowledgment.
Visible desktop notification delivery remains outside headless measurements.

Fault rollback cases are a separate suite. Every sample either records a result or
records its failure; a stuck iteration is bounded and aborts the profile. Warm-up
failures are retained as failures rather than silently dropping them. Intentional
skips, such as oversized DOM workload, are labeled separately.

`performance.json` and optional `.cpuprofile`/allocation JSON files go under
ignored `.output/native-runs/`. They are generated evidence, not commit content.
The console prints medians; JSON also includes raw timings, sample count, min/max,
p95, environment and stage attribution. For a Markdown table, run
`node scripts/performance/summarize.mjs <path-to-performance.json>`. Close the browser before removing an
ignored generated run. Neither the instrumented worker nor the CPU bridge is
included by `npm run build` or `npm run zip`.
