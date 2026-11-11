# LinkShelf performance baseline

Phase 2.1 measures the merged reliability build. It does not change application
behavior, permissions, database format, backup semantics, or ordinary CI. See
[the report](../PHASE_2_1_PERFORMANCE_REPORT.md) for findings and exact evidence.

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
