# LinkShelf v0.3 Phase 2.2 — Safe storage write optimization

## 1. Executive summary

Saving unchanged settings or confirming a Merge that leaves the library
unchanged can now succeed after a verified storage read. These operations keep
their existing result and reminder handling. The optimization eliminates the
database set and post-write readback when the validated candidate already
matches persisted storage.

## 2. Root cause

The repository stores the database as one object. Settings saves clone the
current database and apply the submitted fields. Merge clones the snapshot and
plans additions, retaining existing metadata for matching records and checking
relationships. Both paths previously validated and persisted the entire
candidate even when no value would change. Chrome received a whole-database
set followed by a whole-database readback.

## 3. Architectural decision

`initializeStateUnsafe` returns the parsed database and the corresponding
original storage snapshot together. The original is the parsed database if it
is storage-equivalent to the raw value, otherwise a clone of the raw value.
The repository captures it before asynchronous work. A Chrome storage change
event clears the shared cache and snapshot without changing the operation's
captured precondition.

The skip decision lives in `writeValidated`, after full candidate schema and
relational validation and after a fresh storage read matches the original.
It compares settings first to reject obvious changes without traversing the
library, then compares the whole validated candidate to that raw storage read
with `storedValuesEqual`. The comparator keeps Chrome's omitted object property
semantics for `undefined` and distinguishes missing from null, array contents
and order, and changed nested values. Comparing against the raw read also
preserves necessary schema normalization. A verified no-op leaves cache state
alone so it cannot repopulate a cache invalidated while the read was pending.

## 4. Technical changes

- Settings opt in through the serialized mutation path and return the
  validated settings. The default project must still exist.
- Merge opts in when its plan adds no records, after backup parsing, revision
  validation and conflict detection. Import uses the same result counts, preserving current settings
  and same-ID records under the existing relationship rules.
- Replace, recovery replacement, initialization, migration, deterministic
  repair and general lifecycle mutations retain their write path. Only the
  two reviewed entry points opt in. The previous implementation performed
  writes for identity candidates through the common primitive, including
  explicit Replace. No settings or Merge handler uses the write event as its
  reminder trigger. Both invoke reconciliation directly after success.
- The benchmark suite adds matched cases with state and result assertions.
  The native regression suite uses a temporary storage API wrapper to count
  database writes through the production worker.

## 5. Integrity guarantees

Operations still run through the repository queue. The precondition mismatch
and unreadable-storage branches preserve the raw value and enter the existing
read-only recovery state. Initialization rejects normal mutations while recovery
is active. A changed write still sets the validated value, verifies the
readback, and caches the confirmed result. If an expected value cannot be
confirmed, the original rollback rules apply. Import and recovery keep their
explicit rollback policy. Unexpected third-party values are preserved for
recovery, and uncertain readback or rollback continues to block unsafe writes.

Preview revisions hash the snapshot, parsed backup and mode with SHA-256.
They expire when those inputs change. The existing design has no time-based
expiry. Import checks the token before using the plan, then the shared write
path checks the persisted precondition. Backup size and format checks and
candidate integrity validation apply to every no-op Merge.

## 6. Automated tests

All 348 existing automated tests and 16 new cases passed (364 tests across
24 files). The new repository cases cover repeated saves and Merge commits,
persisted settings normalization, array order and length, real additions and
readback, changed-write rollback, stale tokens, conflicting relationships,
external modifications, read failures, cache invalidation, recovery and
worker restart. Background-handler cases verify alarm repair after an unchanged
save and a reminder warning after a successful identical Merge, both with
zero database sets. Existing tests cover uncertain readback, corrupted
storage, historical formats, browser effects and backup limits.

The first TypeScript run caught an unsupported field on an inline test
payload. The rollback test now changes the supported `defaultRestoreMode`
field. TypeScript and the full automated suite passed on rerun.

## 7. Native Chrome verification

The built extension passed all 10 scenarios in disposable profiles on Chrome
157.0.8103.39. The suite imported a synthetic library and temporarily wrapped
the production worker's actual database set API. Unchanged settings and
identical Merge each made zero sets. Changing density and adding a project
through Merge each made one set and the exact expected database was read back.
An unchanged settings save also succeeded after explicit worker termination.
The existing scenarios passed controlled failure injection, raw recovery
preservation, trusted recovery, actual quota rejection, backup and legacy
migration, reminders, overlapping restoration/bookmark operations and UI smoke.

Evidence: [native results](.output/native-runs/2026-11-11T14-37-56.119Z-18196/results.json).

## 8. Benchmark comparison

The before run uses the merged Phase 2.1 application source with the same
benchmark driver as the after run. Both diagnostic runs use the Phase 2.1
browser-side RPC clock, including secondary reminder handling. Preview,
fixture resets, first Merge in the repeated case and persisted-state assertions
are outside the timed RPC and its worker span capture. Each shape and operation
uses one warm-up and three retained samples. The maximum is reported because
nearest-rank p95 is also the maximum with three samples.

The environment was Windows 10.0.26200, Node 22.13.1, Chrome 157.0.8103.39,
Playwright 1.62.1, an Intel i5-1035G1 and 15.77 GiB RAM. Each run used both
fixture distributions at 100, 1,000, 5,000 and 10,000 links. The baseline is
a direct measurement of the old no-op operations. Phase 2.1's previously
reported changed-settings timings are useful context for real writes.

Each cell shows **before median / max → after median / max**, in milliseconds.

| Fixture / links | Unchanged settings | Changed settings | Identical Merge | Repeated Merge | Merge additions | Verified Replace |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| few / 100 | 14.6 / 17.7 → 7.9 / 9.2 | 17.2 / 19.3 → 13.6 / 14.0 | 22.0 / 22.1 → 10.1 / 10.9 | 29.0 / 29.6 → 15.4 / 16.7 | 30.1 / 33.0 → 19.6 / 30.7 | 25.7 / 32.7 → 16.7 / 16.7 |
| few / 1,000 | 155.6 / 165.8 → 31.0 / 33.1 | 165.4 / 179.0 → 103.6 / 107.8 | 195.1 / 201.7 → 58.3 / 74.2 | 161.5 / 223.5 → 62.9 / 72.1 | 218.2 / 224.8 → 153.5 / 276.8 | 214.3 / 241.2 → 138.2 / 151.8 |
| few / 5,000 | 602.0 / 665.3 → 163.9 / 185.7 | 1115.0 / 1144.5 → 866.8 / 1082.2 | 908.3 / 916.9 → 287.9 / 298.4 | 1021.3 / 1025.3 → 303.5 / 361.1 | 1057.3 / 1160.5 → 674.1 / 1027.6 | 1067.2 / 1106.8 → 710.0 / 736.9 |
| few / 10,000 | 1256.8 / 1487.8 → 433.1 / 508.5 | 1876.0 / 2045.0 → 1446.8 / 2573.3 | 1367.5 / 1744.8 → 563.0 / 585.7 | 1536.3 / 1542.0 → 697.3 / 793.2 | 2098.3 / 2427.7 → 1353.8 / 1359.6 | 2219.0 / 2556.9 → 1461.2 / 1504.3 |
| many / 100 | 25.4 / 30.2 → 5.0 / 5.1 | 17.9 / 27.3 → 11.5 / 12.0 | 20.8 / 28.4 → 7.2 / 7.7 | 16.1 / 16.9 → 7.8 / 8.8 | 19.2 / 37.9 → 15.1 / 15.4 | 31.7 / 37.6 → 15.5 / 15.5 |
| many / 1,000 | 166.7 / 177.3 → 31.8 / 32.5 | 173.4 / 218.6 → 109.2 / 110.7 | 206.8 / 221.1 → 60.5 / 69.6 | 185.5 / 252.5 → 63.7 / 139.7 | 227.6 / 256.2 → 141.3 / 145.8 | 210.7 / 258.4 → 143.4 / 144.8 |
| many / 5,000 | 621.7 / 686.5 → 149.0 / 152.3 | 945.2 / 1077.2 → 560.6 / 571.9 | 890.4 / 990.1 → 308.8 / 316.1 | 1168.3 / 1198.1 → 307.0 / 310.4 | 1478.6 / 1672.6 → 767.7 / 925.0 | 1165.4 / 1574.0 → 748.2 / 875.5 |
| many / 10,000 | 1160.1 / 1595.0 → 300.5 / 313.9 | 2047.1 / 2316.9 → 1211.4 / 1316.3 | 1680.5 / 1807.8 → 652.0 / 726.5 | 1770.7 / 1876.9 → 614.9 / 620.5 | 2252.1 / 2355.2 → 1490.0 / 1643.3 | 2188.4 / 2301.6 → 1488.7 / 1493.2 |

At 10,000 links, the median fell by **66–74%** for unchanged settings,
**59–61%** for identical Merge, and **55–65%** for repeated Merge. Timings
for the changed-write controls also varied between runs despite identical
storage work counts. These sequential measurements quantify the observed
difference, and the call counts establish what the optimization eliminated.

The following counts held in every retained sample across all eight fixture
shapes. The candidate validation column counts `writeValidated`'s schema
parse, separate from the import's backup parsing and preview validation.

| Path | Chrome gets | Chrome sets | Candidate validations | Precondition reads | Readbacks | Reminder reconciliations |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Baseline, all six operations | 2 | 1 | 1 | 1 | 1 | 1 |
| Optimized unchanged settings, identical Merge, repeated Merge | 1 | 0 | 1 | 1 | 0 | 1 |
| Optimized changed settings, Merge additions, verified Replace | 2 | 1 | 1 | 1 | 1 | 1 |

Both runs finished with zero failed measurements. Every retained sample
verified the response and exact persisted state. Fixture reminders were in
the future, so the timed reconciliation did not need to persist an
acknowledgment. The raw reports include individual samples and ordered spans.

Evidence: [baseline trace](.output/native-runs/2026-11-11T13-52-34.954Z-18428/performance.json)
and [optimized trace](.output/native-runs/2026-11-11T14-39-38.113Z-26616/performance.json).

Focused Phase 2.1 [production core](.output/native-runs/2026-11-11T14-50-17.248Z-20692/performance.json)
and [diagnostic rollback](.output/native-runs/2026-11-11T14-50-23.048Z-17776/performance.json)
smoke runs also passed. Both failure injection cases preserved the original
stored value, including the case where the injected error occurred after Chrome
had applied the write.

## 9. Compatibility

Schema 2 and supported legacy databases and backups retain their formats.
No message or UI response shape changed. The background handlers still
reconcile reminders and preserve secondary warnings. A due reminder may
independently require a real acknowledgment write during that reconciliation.
History, links and metadata continue to follow existing write and Merge
rules. Browser-operation coordination and confirmation receipts use the
unchanged general mutation path.

The editable settings include the default project, notification preference,
`defaultRestoreMode` and `displayDensity`. The stored URL normalization
configuration is `trackingParamsToRemove`, which is preserved by an unchanged
save and remains outside the typed editable settings contract.

## 10. Remaining risks

Chrome storage has no general compare-and-swap operation. There is still a
race window after the verified read if an external writer changes storage.
Eligible operations still clone, validate, read and compare the whole value.
Merge also still parses the backup, computes the revision and builds the plan.
Real restoration, lifecycle, acknowledgment and Merge additions continue to
pay for verified writes. Timings are from synthetic fixtures on one machine
and carry diagnostic instrumentation overhead.

## 11. Modified files

- `storage/repository.ts`
- `storage/integrity-recovery.test.ts`
- `features/reminders/reminder-background.test.ts`
- `scripts/native/run.mjs`
- `scripts/performance/run.mjs`
- `scripts/performance/storage-writes.mjs` (new)
- `docs/performance-testing.md`
- `PHASE_2_2_IMPLEMENTATION_REPORT.md` (new)

## 12. Git status

Branch `perf/storage-noop-optimization`, based on
`d8068d2773977d90b1c25fe3888617ceeef8d0d3` (Phase 2.1 merge, PR #8).
The files above are the Phase 2.2 review scope. Generated benchmark evidence is ignored
under `.output/native-runs/`.

`npm run verify`, `npm run test:integration` (257 passing tests), `npm run zip`,
`npm run check:package`, `npm run test:native`, the benchmark CLI help and
`git diff --check` passed. The production archive contains 17 files and
retains extension version 0.2.0. Only the built background worker differs from
the Phase 2.1 production snapshot. It contains no benchmark instrumentation.
