# LinkShelf v0.3 Phase 2.5 — Safe bulk restoration

## 1. Executive summary

Session and project restore now verify lifecycle changes in checkpoints of
at most two ordered candidates. Chrome confirms each open before its record
can enter a checkpoint. The response reports browser openings separately
from saved changes. A failed checkpoint stops the collection, while earlier
verified checkpoints remain committed.

## 2. Root cause

The collection previously created one tab, recorded a worker-local receipt,
cloned and validated the database, and performed a fresh precondition read,
whole-value write and readback. It then cleared the receipt and moved to the
next link. This repeated the largest storage work for every confirmed open.
The selected destination and the link reservations stayed held throughout.

## 3. Architecture decision

One post-open write for the entire collection could leave the entire project
between browser effects and persistence. A durable intent journal would
require additional persistence, interruption states and cleanup. Intent alone
cannot establish whether Chrome created a tab before a reply was lost.
Checkpoints of two use the existing verified repository path and reduce ten
successful opens from ten writes to five. Sizes three, five and ten would
need four, two and one writes respectively for ten successes, but would expose
more confirmed opens per interrupted collection. These alternatives are
work-count calculations, not measured configurations.

## 4. Interruption and crash safety

| Worker termination point | Observable outcome |
| --- | --- |
| Before any create | No confirmed opening or lifecycle change |
| During a create request | Chrome may have created a tab without returning confirmation |
| After create returns, before receipt insertion | The new tab exists and its record may still be parked |
| After the receipt, before set | Up to two newly confirmed tabs in the current checkpoint may still be parked |
| During set | The worker cannot establish which value Chrome persisted |
| After set is applied, before readback | The database may already contain restored records, though the interrupted invocation could not confirm it |
| After verified persistence, before receipt cleanup | Persisted records remain restored and are excluded from fresh selection |
| Between checkpoints | Prior verified records remain restored, later candidates remain parked until processed |
| After the last checkpoint, before the response | Persisted records remain restored, while the UI can lose the reply |

Receipts are inserted immediately after a successful create, before discard.
They bind the ID, URL, creation time, session and project to that confirmation.
Discard success updates the receipt's outcome. The same worker reuses a
matching receipt instead of creating another tab. A mismatching receipt
blocks replay for that ID. Receipts are cleared only after verified
persistence. They are lost on worker termination, and startup does not
automatically replay restores. An explicit retry after interruption requires
the user to check open tabs and parked records.

## 5. Repository changes

The batch method rejects an empty request, duplicates, missing links, any
non-parked state, and mismatched identity. It maps the current database
once and changes only the selected links. All records in one checkpoint
receive the same commit-time `restoredAt` and `updatedAt`, consistent with
the previous single-link meaning. Notes, reminders, history, IDs and
relationships are copied through from the current records.

The existing serialized mutation path supplies the clone, validation, fresh
precondition read, write, verified readback and rollback/recovery behavior.
A candidate that fails identity validation cannot partially write. Chrome
storage has no cross-context compare-and-swap. The single-link path still
does one verified write and now validates its receipt's identity too.

## 6. Restoration coordinator

The coordinator preserves per-link reservations, fixed destination-window
selection, FIFO per-window execution, and sequential tab creation with
append indexes. Each checkpoint covers two candidate positions, so a
failed browser operation does not delay flushing a successful neighbor
until an arbitrarily distant success. Unloaded mode preserves confirmed
discard and loaded fallback reporting. Keep Parked Copies performs no
restored-state writes and can still intentionally open copies.

## 7. Partial progress

`openedLinkIds` counts confirmed openings, including reused receipts.
`restoredLinkIds` advances only after verified checkpoint persistence.
Failed or skipped browser candidates remain distinct from opened records.
A storage failure stops the collection and reports confirmed opens,
verified records and the number of unattempted links. Existing response
fields remain compatible.

## 8. Storage failures and recovery

An ordinary rejection preserves the previous value. If Chrome applies a
candidate then rejects, verified rollback restores the preceding state
when possible. An unreadable or unexpected readback enters the established
recovery flow. External modifications are preserved by the same
precondition check. Earlier checkpoints remain reflected in the database and
the response. A failed checkpoint retains matching receipts while the
worker lives and stops further opens for that collection.

## 9. Reminders

The existing background wrapper reconciles reminders after the collection,
including after reported partial storage failure. It sees the last available
persisted database. A reminder failure still becomes a secondary warning.
Worker termination can interrupt reconciliation, as before. Startup and
later normal reconciliation use the persisted lifecycle state.

## 10. Automated tests

The merged baseline had 373 tests. All 390 tests passed in 26 files, with
17 added cases. The integration subset passed 275 tests. New tests cover
atomic candidate rejection, two/five/ten-record repository commits,
verified readback, rollback, uncertain storage, external modification,
five-checkpoint session/project restoration and a moved receipt. Existing
background failure tests now exercise failure after a successful pair,
receipt reuse and reminder reconciliation from the committed subset.

## 11. Native Chrome verification

The production-worker test used a fresh disposable Chrome profile and
temporary wrappers around real Chrome APIs. It checked native tab IDs,
order and destination, discard results, persisted lifecycle fields, and
unchanged notes and reminders. Counts below refer to the successful
requests and exclude fixture seeding.

| Scenario | Opened | Persisted | Chrome gets | Sets | Readbacks | Confirmed discards |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Session, 3 | 3 | 3 | 4 | 2 | 2 | 0 |
| Normal project, 10 | 10 | 10 | 10 | 5 | 5 | 0 |
| Unloaded project, 10 | 10 | 10 | 10 | 5 | 5 | 10 |
| Normal project, 25 | 25 | 25 | 26 | 13 | 13 | 0 |
| Keep Parked Copies, 10 | 10 | 0 | 0 | 0 | 0 | 0 |

An injected tab-open failure left its record parked while both successful
neighbors were saved. The second-checkpoint failure reported four opens,
two verified restorations and one unattempted link. The retry created one
new tab, reused the two receipts and persisted all remaining records. The
result survived a full browser restart.

Chrome actually stopped the worker at two deterministic barriers. Before
the first set, two tabs existed with both records still parked and no
automatic replay. Between checkpoints, two tabs and their restored records
survived. An explicit retry in the latter case opened only the two remaining
records. These are browser worker stops, separate from the injected API
failures. The focused suite initially failed while identifying discarded
tabs by URL or by pre-discard ID. The test now follows the ID Chrome returns
from discard. There was no corresponding production failure.

Both termination barriers also rejected an overlapping request before
another tab was created. One preliminary overlap probe waited behind
the held repository write. The final probe uses the single-link entry point
at that barrier because it checks its reservation before reading storage.
The between-checkpoints probe still uses an overlapping collection. The
native single-observation times for three and 25 targets were 137 ms and
1,740 ms, respectively, on the small fixture.

[Nine focused Chrome cases](.output/native-runs/2026-11-12T08-07-58.359Z-29528/bulk-restore-results.json),
[ten general Chrome scenarios](.output/native-runs/2026-11-12T07-58-47.460Z-22432/results.json).

## 12. Performance comparison

Matched diagnostic runs used Chrome 157.0.8103.39, Node 22.13.1,
the same synthetic fixture shapes and the extension-side RPC clock. Both
runs used one warm-up and two retained samples per case. The maximum
describes the two observations. The optimized run verified persisted
target counts outside the timed interval. RPC time includes reminder
reconciliation and excludes Playwright transport and UI rendering.

| Library size | Ten-target workload | Before median / max → after median / max (ms) |
| --- | --- | ---: |
| 100 | Session | 784.2 / 831.7 → 592.0 / 606.2 |
| 100 | Project | 675.0 / 708.2 → 582.8 / 605.2 |
| 100 | Unloaded project | 594.7 / 599.1 → 578.3 / 604.0 |
| 100 | Keep Copies | 415.1 / 432.5 → 328.3 / 347.5 |
| 1,000 | Session | 2134.7 / 2178.0 → 1347.0 / 1371.1 |
| 1,000 | Project | 2146.5 / 2192.3 → 1340.7 / 1389.7 |
| 1,000 | Unloaded project | 1814.8 / 1995.6 → 1264.8 / 1314.4 |
| 1,000 | Keep Copies | 391.8 / 399.2 → 441.0 / 441.6 |
| 5,000 | Session | 7957.1 / 8702.4 → 5043.9 / 5231.6 |
| 5,000 | Project | 8067.3 / 8079.3 → 4917.4 / 5030.7 |
| 5,000 | Unloaded project | 6105.1 / 6388.7 → 3468.1 / 3502.0 |
| 5,000 | Keep Copies | 430.6 / 438.3 → 467.4 / 489.2 |
| 10,000 | Session | 13598.2 / 13971.8 → 8133.3 / 8600.2 |
| 10,000 | Project | 13905.6 / 14945.9 → 9139.1 / 10824.5 |
| 10,000 | Unloaded project | 12835.3 / 12893.6 → 8834.4 / 8871.6 |
| 10,000 | Keep Copies | 381.5 / 468.7 → 437.2 / 450.9 |

For every measured ten-target session, normal project and unloaded project,
confirmed opens and persisted lifecycle updates were both ten. Chrome
storage gets fell from **20 to 10**, sets from **10 to 5**, and post-write
readbacks, candidate validations and verified commits each fell from
**10 to 5**. Keep Parked Copies opened ten tabs with zero persisted
restorations, storage operations or validations on the fixture.

| 10,000 links, few sessions | Verified write time (ms) | Tab creation (ms) | Reminder reconciliation (ms) | Discards |
| --- | ---: | ---: | ---: | ---: |
| Session | 12953.7 → 7641.1 | 170.1 → 193.7 | 1.4 → 4.0 | 0 → 0 |
| Project | 13219.8 → 8639.0 | 169.6 → 199.7 | 1.3 → 6.1 | 0 → 0 |
| Unloaded project | 12161.1 → 8277.7 | 163.9 → 199.7 | 1.1 → 4.5 | 10 → 10 |
| Keep Copies | 0.0 → 0.0 | 330.3 → 388.4 | 32.0 → 26.8 | 0 → 0 |

The many-session 10,000-link supplementary run measured one single restore
at 2,390 ms median with 2 gets, 1 set and 1 readback, ten project restores
at 10,923 ms with 10 gets, 5 sets and 5 readbacks, and ten copies at 402 ms
with zero database operations. This distribution has no matched before
measurement in Phase 2.5. The production native run also verified a
25-record project with 13 checkpoints. The bulk driver resets fixtures
between samples. Its tab cleanup uses synthetic URLs, which Chrome may
omit briefly for discarded tabs. Unloaded and copy timings reflect that
test environment. No memory or real-site loading speed is inferred.
Keep Copies timings varied despite the same zero-write path.

[Phase 2.4 baseline](.output/native-runs/2026-11-11T16-28-03.110Z-24436/performance.json),
[matched Phase 2.5 run](.output/native-runs/2026-11-12T08-00-11.850Z-10144/performance.json),
[Phase 2.5 many-session supplement](.output/native-runs/2026-11-12T08-04-10.527Z-21512/performance.json).

## 13. Safety tradeoffs

At most two new confirmed openings per active collection can be awaiting
one checkpoint. Independently active windows can each have a checkpoint,
and receipts from separate failed operations can coexist in the worker.
The database queue serializes commits. A failed collection stops opening
additional tabs as soon as its storage failure is known. This trades one
additional exposed record per collection for half the verified writes on
the successful ten-record workload.

## 14. Remaining risks

A browser effect and a storage write cannot be atomic. Chrome can lose a
reply after creating a tab, and a manually repeated restore after worker
termination can open another tab for a still-parked record. There is no
durable receipt. Native barriers isolate two interruption boundaries rather
than a physical crash in the Chrome storage engine. A large real project
still opens real sites sequentially and can incur substantial browser and
storage cost.

## 15. Modified files

- `domain/restore-identity.ts`
- `features/restoration/restore-collection.ts`
- `features/restoration/restore-coordinator.ts`
- `storage/repository.ts` and `storage/integrity-recovery.test.ts`
- `features/operations/background.test.ts` and `concurrent-background.test.ts`
- `features/reminders/reminder-background.test.ts`
- `scripts/native/bulk-restore.mjs` and `scripts/performance/run.mjs`
- `docs/performance-testing.md` and this report

## 16. Git status

Branch `perf/bulk-restoration` is based on
`95fd171c000eb1159e6f0f513743c8699a959744`, the Phase 2.4 merge.
The files listed above define the review scope. Generated evidence is
ignored under `.output/native-runs/`.

`npm run verify` passed TypeScript, 390 automated tests and the production
build. `npm run test:integration` passed 275 tests. ZIP generation, package
validation, `git diff --check`, both native suites and all benchmark runs
passed. The packaged manifest matches Phase 2.4 and the 17-file production
package contains no benchmark instrumentation. No dependencies were added.
