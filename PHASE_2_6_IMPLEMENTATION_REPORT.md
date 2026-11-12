# LinkShelf v0.3 Phase 2.6 — Performance regression testing

## 1. Executive summary

Phase 2.6 adds a repeatable smoke and full release baseline, an environment-
and workload-aware comparator, and deterministic browser work checks.
Reports include outcomes, sample summaries, and work metrics. A correctness
failure can fail a test or benchmark command. Timing deviations are review
signals.

## 2. Phase 2 improvements

Phase 2.1 established disposable Chrome profiling. Phase 2.2 removed
database writes for verified settings and Merge no-ops. Phase 2.3 bounded
initial Search delivery while retaining every match. Phase 2.4 capped
mounted Archive and Search cards. Phase 2.5 halved verified writes for ten
successful collection restores while preserving partial progress. Phase 2.6
measures the combined implementation at the Phase 2.5 merge.

## 3. Testing architecture

The existing core, bulk, UI, memory, fault, storage, search and rendering
suites remain available. The baseline command composes a selected subset
of them in sequence. It reuses the fixture generator, isolated profiles,
diagnostic wrappers and existing statistics. Existing native scripts cover
actual browser actions and layout. Ordinary Vitest covers repository,
background messaging, cursor and range behavior. The old 200 ms search
assertion was replaced by an expected-result check on the same large fixture.

Deterministic work counts are blocking in their controlled paths. The
timing comparator reports observations, work changes, incompatibility,
unavailable measurements and missing operations separately. Invalid
reports and failed or unsupported benchmark jobs produce nonzero exits.

## 4. Baseline methodology

The full matrix exercises both fixture shapes at 100, 1,000, 5,000 and
10,000 links for core, paged Search and Archive. Storage and restoration
use 100 and 10,000 links with few sessions. Search rendering uses a
1,000-link fixture and fixed continuation sequence. Projects includes
selected one-sample observations. Warm-ups and retained sample counts are
recorded by operation. Browser RPC and observed frame clocks are distinct.
Fixture hashes use a stable synthetic origin to normalize ephemeral
loopback ports. The reports record the app revision, machine, browser,
tool version, fixture, clock, instrumentation and work counts.

## 5. Storage regression coverage

Existing repository and background tests verify candidate and preview
validation, fresh preconditions, zero sets on verified no-ops, changed
values, readback, rollback and recovery. Diagnostic samples now check the
number of candidate validations, precondition reads, sets, readbacks and
reminder reconciliation. Controlled fixtures check one set/readback for
changed settings, Merge additions and explicit Replace. Incidental reads
outside verified persistence are reported separately.

## 6. Search regression coverage

Automated tests cover URL, title, note, project, mixed case, multiple tokens,
Unicode, duplicates, timestamps and cursor invalidation. The pagination test
checks both first-page limits independently and compares the entire traversal
with the ordered source. Diagnostic Chrome checks require one repository scan
and one bookmark tree read across a full query and continuation sequence.
First-page and full transfer bytes are reported as observations.

## 7. Rendering regression coverage

Archive's native checks cover first, intermediate and final ranges, keyboard
navigation, removal, focus, project changes and external refresh. Search
exercises both categories and navigation through loaded records. The benchmark
checks each category's mounted limit after repeated loading. Archive's card
limit applies to rendering. It still transfers the full archived collection.

## 8. Restoration regression coverage

Repository and background tests continue to check validated writes and
partial progress. Browser diagnostics enforce five writes/readbacks for
ten successful collection targets and zero lifecycle writes for copies.
The focused native suite checks 13 checkpoints for 25 links, the single
and small restore paths across suites, unload, target and order, failed
opens, failed writes, worker termination and retry.

## 9. Comparison tool

Run `npm run perf:baseline` or use `--full` for the larger matrix.
Run `npm run perf:compare -- <baseline.json> <candidate.json>` for Markdown
or append `--json` for machine-readable comparisons. The comparator checks
fixture identity, dataset shape, operation, clock, instrumentation,
environment, result count and sample methodology before reporting a
percentage. It withholds deltas when required metadata is missing or
malformed, including when both inputs share the same metadata defect.
Near-zero baselines show absolute differences. A 15% and 1 ms
change is a review heuristic, with the absolute threshold used near zero.
It establishes no statistical significance.

Two sequential final smoke runs produced 41 comparable measurements in both
Markdown and JSON. The comparator classified 17 as no meaningful change,
11 as observed improvements, and 13 as timing deviations to review. The
earlier same-build pair surfaced 21 timing deviations. Both pairs illustrate
run-to-run variation that warrants review. The thresholds are unchanged.

| Operation | Baseline median | Candidate median | Median change | Status |
| --- | ---: | ---: | ---: | --- |
| Broad Search first page, 100 links | 14.30 ms | 12.60 ms | -1.70 ms (-11.9%) | No meaningful change |
| Project restore of 10 tabs, 100 links | 829.45 ms | 1,067.35 ms | +237.90 ms (+28.7%) | Review timing deviation |

Search returned 50 initial results and 14,976 response bytes in each run,
with one repository scan and one bookmark tree read. Both restoration
samples used five verified checkpoints. The comparator listed observed
rendering metric variation separately. A test copy with an altered clock
and a failed sample produced one incomparable and one unavailable row,
both without timing deltas.

Smoke reports are under `.output/performance-baselines/` in
`2026-11-12T11-24-29.567Z-17308/baseline.json` and
`2026-11-12T11-25-41.824Z-29876/baseline.json`. Comparison outputs are
`.output/phase-26-smoke-comparison.md` and
`.output/phase-26-smoke-comparison.json`.

## 10. CI integration

Ordinary Verify still uses the existing workflow and now runs the comparator
tests through Vitest. There is no mandatory timing gate. The supported
extension CDP setup was verified locally. GitHub-hosted native support was
not established, so no workflow or artifact upload was added. The local
commands provide the manual baseline procedure.

## 11. Automated tests

`npm run verify` passed TypeScript compilation, 413 tests across 27
files, and the production build. The 23 comparator tests cover
compatible and incompatible measurements, invalid inputs, failed and
missing operations, and work-count changes. The integration command
passed 275 tests across seven files, including the existing integrity,
backup, reminder and operation regressions.

## 12. Native Chrome verification

All 10 general scenarios, eight Search checks, six Rendering checks and
nine Bulk Restoration cases passed in disposable Chrome profiles with
synthetic data. Search reached every result in both categories and recovered
from worker restart and invalidation. Rendering covered keyboard controls,
focus, narrow widths, 200% zoom and bounded Archive ranges. The general
suite exercised storage recovery, actual Chrome quota failure, and backup
compatibility.

Chrome observed five database sets and five readbacks for ten successful
project restores, the same counts with ten unloaded tabs, 13 sets and 13
readbacks for 25 restores, and zero lifecycle writes when keeping parked
copies. The suite also passed the partial browser failure, checkpoint retry,
and worker termination cases.

## 13. Performance baseline

The canonical full baseline ran on November 12, 2026, from 11:32:51 to
11:44:23 UTC with runner 2.6.2. It completed all five suites and 231
measurements on headless Chrome 157.0.8103.39, Node 22.13.1 and Windows
build 26200, on an Intel Core i5-1035G1 with eight logical CPUs and
15.8 GiB of RAM. The canonical report is
`.output/performance-baselines/2026-11-12T11-32-51.328Z-24748/baseline.json`.

The eight broad Search continuation summaries account for the increase
from the preliminary 223 measurements. The final report also records two
intentional skips for Projects Show More and Show All in the many-session
fixture, which has no continuation controls. There were zero failures.
The full and smoke reports used the same production worker fingerprint.
Their normalized hashes matched the regenerated fixtures and all 15 raw
reports remained readable after the harness removed the generated profiles.
A separate unsupported-environment run recorded five unsupported jobs
and exited with code 1.

Representative medians from the full run use the few-sessions fixture.
Archive uses an observed frame clock. The remaining rows measure browser
RPC. For cold startup, the worker is stopped before timing the initial
request.

| Operation | Links | Median | Samples | Observed work |
| --- | ---: | ---: | ---: | --- |
| Warm Projects request | 10,000 | 1.2 ms | 2 | |
| Cold Projects request | 10,000 | 581.8 ms | 3 | |
| Backup export | 10,000 | 417.7 ms | 2 | |
| Replace preview | 10,000 | 816.4 ms | 2 | |
| Ordinary reminder reconciliation | 10,000 | 4.8 ms | 2 | |
| Unchanged settings | 10,000 | 639.9 ms | 2 | 0 sets and readbacks |
| Changed settings | 10,000 | 1,736.9 ms | 2 | 1 set and readback |
| Identical Merge | 10,000 | 1,014.2 ms | 2 | 0 sets and readbacks |
| Merge additions | 10,000 | 2,359.2 ms | 2 | 1 set and readback |
| Explicit Replace | 10,000 | 2,533.2 ms | 2 | 1 set and readback |
| Restore one link | 10,000 | 2,000.8 ms | 2 | 1 set and readback |
| Restore ten from a session | 10,000 | 10,710.3 ms | 2 | 5 sets and readbacks |
| Restore ten from a project | 10,000 | 13,826.8 ms | 2 | 5 sets and readbacks |
| Restore ten unloaded | 10,000 | 11,576.0 ms | 2 | 5 sets and readbacks |
| Restore ten keeping parked copies | 10,000 | 451.7 ms | 2 | 0 sets and readbacks |
| Broad Search first page | 10,000 | 16.7 ms | 3 | 14,978 bytes |
| Broad Search all pages | 10,000 | 791.2 ms | 3 | 4,207,581 bytes |
| Broad Search continuation | 10,000 | 2.3 ms | 3 | Median subsequent request per run |
| Archive initial rendering | 10,000 | 236.7 ms | 3 | 25 mounted cards |

Full Search traversal includes all continuation requests. The median
first-page latency measures only the initial request. Normalized reports
include nearest-rank p95, minimum, maximum, sample counts and links to raw
reports.

## 14. Known limitations

Two or three retained samples make nearest-rank p95 the observed maximum.
Profiled API waits can include browser scheduling and serialization. Heap
snapshots do not establish retained memory. Observed frame clocks do not
isolate React commits. Synthetic loopback tabs and headless extension
documents do not represent live sites or every docked sidebar configuration.
Suite failures keep earlier results and raw evidence, with unavailable
operations excluded from timing deltas. Forcibly terminating the benchmark
process can interrupt cleanup of its generated profile.

## 15. Remaining technical debt

Consider a verified hosted Chrome environment before adding an optional CI
workflow. Future profiling can expand sample sizes and cover real-site
loading and large retained libraries. The general modal focus trap, full
Archive data transfer, Projects Show All cost, and worker-local restoration
receipt limits remain tracked from earlier phases.

## 16. Modified files

- `package.json` and `docs/performance-testing.md`
- `storage/repository.test.ts` and `features/search/search-pages.test.ts`
- `scripts/native/harness.mjs`
- `scripts/performance/baseline.mjs`, `compare.mjs`, and `compare.test.mjs`
- `scripts/performance/fixtures.mjs`, `rendering.mjs`, `run.mjs`, `search.mjs`, and `stats.mjs`
- This report

## 17. Git status

Branch `test/performance-regression` is based on
`c1a84e2b0ae23db3bae73f9f37de7e890496de2f` and targets `v0.3`.
The baseline records that base revision and a dirty worktree because it
was generated before the Phase 2.6 commit. Existing historical reports
remain outside the change set. Generated baseline and native artifacts
are ignored.

`npm run zip`, `npm run check:package`, and `git diff --check` passed.
All 17 production files matched the retained Phase 2.5 build byte for
byte, including the worker and manifest. The package contained no
benchmark instrumentation. Production behavior, schema version, Chrome
permissions, extension version and backup formats remain unchanged.
