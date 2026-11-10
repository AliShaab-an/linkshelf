# LinkShelf v0.3 — Phase 1.6 implementation report

Date: November 10, 2026 (Asia/Beirut). Branch: `test/release-readiness`.
Baseline: `b5170461f1926fa0bb4dc2c11f18305e886eb9c6`, the merge of Phase 1.5 PR #6.

## 1. Executive summary

Implemented a repeatable verification process, nine meaningful automated regression
cases, a disposable-profile native Chrome runner, optional native performance
measurements, a minimal GitHub Actions workflow, ZIP inspection, a coverage inventory,
testing instructions and a reusable release checklist.

Native testing discovered and reproduced a **High-severity Phase 1.5 regression**:
Chrome omits undefined object properties on storage readback, while the integrity
comparator required their presence. Creating a normal project persisted it, reported
failure, and incorrectly latched recovery. Fixed the comparison and added a Chrome
JSON-serialization regression. Subsequent native project/parking/lifecycle tests pass.

Final Zod-remediation verification: **348/348 tests in 24 files**, TypeScript and production build
pass. The integration subset passes **241 tests in 7 files** (already included in
348). Before remediation, the native suite completed **nine workflow groups twice**, once with scale
measurements and once with the build-snapshot runner. Package inspection and
`git diff --check` pass. A clean lockfile installation and local CI-equivalent
compile/test/build/package check also pass.

After remediation, the final Zod 4.6.6 build completed all **nine native workflow
groups again**. Final production packaging and the zero-advisory production audit pass.

This is **ready for implementation review, not an unconditional release sign-off**.
Zod is now pinned to the patched **4.6.6**, and the production-only audit reports
**zero advisories**. Dialog focus escapes the modal; large-library writes/imports are slow; actual Store
update, headed popup/sidebar gestures, physical shortcuts, screen reader and visible
desktop notification checks remain manual. Finalization authorizes a reviewed commit,
push and PR after verification. No release, version bump, merge, backend work or Phase 2 implementation is authorized.

## 2. Testing architecture

- Vitest unit tests remain beside source; repository and worker integration tests
  exercise real application modules with mocked browser boundaries.
- New `test:integration` provides a repeatable focused subset. Generated `.output`
  and `.wxt` trees are explicitly excluded, including disposable clean-install copies.
- `scripts/native/run.mjs` uses an optional external Playwright installation. No
  Playwright dependency is added. The only dependency/lockfile change is patched Zod.
  `harness.mjs` generates fresh profiles,
  snapshots the finished production build, runs loopback-only synthetic pages and
  closes its own browser contexts. It never accepts a real-profile path.
- API barriers make overlap deterministic; failure injection is labeled. Tabs,
  windows, bookmarks, storage, quota, alarms, downloads and worker termination use
  actual Chrome APIs. State polling replaces guessed sleeps.
- `fixtures.mjs` represents supported historical schemas using synthetic values;
  `performance.mjs` adds optional measurements. Five-minute normal / 15-minute scale
  watchdogs bound stuck runs; these are execution limits, not performance targets.
- `scripts/check-package.mjs` reads the ZIP, compares all decompressed files against
  the build and checks manifest/entrypoints/permissions/artifact patterns.

Developer commands and environment requirements are in [docs/testing.md](docs/testing.md).

## 3. Coverage inventory

[docs/test-coverage.md](docs/test-coverage.md) maps all 30 original audit feature
groups to current source, existing tests, native evidence and manual gaps. The audit
included experimental Manager and simplified sidebar groups (F20/F21); neither is
in this stable branch and neither was introduced. Shared integrity/recovery is
listed as an additional current feature.

The inventory distinguishes domain/feature unit tests, repository/worker integration,
native Chrome and manual verification. It does not claim coverage percentages or
mounted React component unit tests. Existing Phase 1.1–1.5 regressions remain intact.
Direct stable `ui-state.ts` tests, stale forms across interfaces, full keyboard/assistive
technology checks and signed update coverage remain gaps rather than invented passes.

## 4. Automated regression results

| Check | Result |
| --- | --- |
| Baseline `npm run verify` | 339 tests, 24 files; compile/build passed |
| New tests | 3 cross-feature worker + 2 storage-serialization/comparison + 4 bounded malformed-array cases |
| Pre-remediation `npm run verify` | 344 tests, 24 files; compile/build passed |
| Final `npm run verify` | 348 tests, 24 files; compile/build passed |
| Failed / skipped automated cases | 0 / 0 |
| Final `npm run test:integration` | 241 tests, 7 files; passed (subset of full suite) |
| Original clean isolated `npm ci` + verify | Installation, WXT prepare, 344 tests, compile/build passed before Zod remediation |
| Final `npm ci` | Passed with the Zod-only lockfile after retrying a transient Windows native-module file lock |
| Final `npm audit --omit=dev` | Exit 0; zero production advisories |
| Clean isolated zip/package check | Passed |
| Workflow validation | YAML parsed with installed js-yaml; trigger, read-only permission and command assertions passed |
| New JavaScript syntax checks | All five `.mjs` scripts passed `node --check` |
| Package negative check | Truncated ZIP rejected with exit 1 |
| `git diff --check` | Passed |

New cross-feature cases cover:

1. Project creation, parking three tabs with notes/reminders, move, archive, session
   restoration, metadata search, shared integrity and export/import into an independent
   repository, preserving all resulting lifecycle states without repeated browser actions.
2. Deleting the configured default project after archive/restoration: history and
   relationships move to Inbox, the default resets, and density/restore mode remain.
3. Bookmark creation failure followed by export and idempotent merge: information stays
   parked, no bookmark/open is repeated by import, and a deliberate retry succeeds.
4. JSON-roundtrip storage omits optional project/tab fields across successive writes
   without entering false recovery.
5. Storage equality ignores only undefined object properties; null, array lengths,
   array values and genuine nested changes still differ.
6. Four bounded malformed-array cases (schema 1/2 × import/storage) use exactly
   2,048 null entries. Imports fail without a write, healthy libraries remain healthy,
   malformed raw storage remains intact with bounded private-value-free diagnostics,
   and a subsequent valid import or confirmed trusted recovery preserves the fixture.
   These do not attempt memory exhaustion or assert machine-specific timing/heap limits.

The final verification ran after the comparator fix, Zod 4.6.6 update and all nine
new tests. The only lockfile package entry changed is `node_modules/zod`, alongside
the root requirement; unrelated optional-tool metadata generated by npm was excluded.
Zod consumers in database/backup/migration/recovery schemas and navigation/UI-state
validation retain their established definitions. RPC guards remain handwritten.

## 5. Cross-feature integration and native Chrome results

Environment: Windows `10.0.26200`, Intel Core i5-1035G1, 8 logical CPUs, approximately
15.8 GiB RAM; Node `22.13.1`, Playwright `1.62.1`, installed Chrome `156.0.8078.80`,
headless. This does not assert that every supported Chrome/OS combination was tested.

| Workflow | Actual result |
| --- | --- |
| Installation | Fresh install opened onboarding; onboarding/popup/sidebar documents rendered; empty Projects state displayed |
| A — Complete lifecycle | Real synthetic tabs saved then closed; project creation/rename, search, move, archive, session restore and lifecycle counts correct; export replaced a separate clean-profile library exactly; merge was idempotent; deleting a project preserved history/default ownership |
| B — Reminders | Moving one link and restoring another retained correct pending membership; missing alarms repaired after actual worker stop/wake; overdue Chrome notifications accepted and acknowledged; acknowledgment survived worker and browser restart without routinely adding duplicate active notifications |
| C — Concurrency | Two actual extension documents overlapped restores/bookmark conversion using injected barriers; one native creation; existing URL duplicate rejected while saved information remained; injected state-write failure followed by confirmed-open receipt recovery created no second tab; Keep Parked Copies retained status; sender-window targeting survived focus changes |
| D — Corruption | Actual malformed Chrome storage survived worker restart; normal UI gated; diagnostics excluded a synthetic private value; real raw download matched exactly and ordinary import rejected its format; Cancel preserved raw; explicit trusted replacement restored the library; invalid references rejected; real 11-MiB note import hit Chrome quota and preserved the previous library |
| E — Compatibility | Representative schema-1/2 native storage and backups preserved IDs, custom Inbox ID, sessions, notes, reminders/acknowledgment, archived/restored/removed/bookmarked metadata and settings; reload/browser restart preserved migrated data; unrelated local key and native bookmark records remained unchanged |
| UI/files | Six navigation sections at 320/400/800px; actual export download; invalid JSON and above-32-MiB file rejected without mutation; Merge/Replace preview cancellation preserved data; 200% Chrome zoom, long content, keyboard/modal focus and remote favicon probe recorded |

Local generated evidence, deliberately ignored by Git:

- Scale run: [.output/native-runs/2026-11-10T09-05-13.795Z-14356/results.json](.output/native-runs/2026-11-10T09-05-13.795Z-14356/results.json), nine groups passed, 09:05–09:09 UTC.
- Final repeatability run: [.output/native-runs/2026-11-10T09-17-00.268Z-22044/results.json](.output/native-runs/2026-11-10T09-17-00.268Z-22044/results.json), nine groups passed, 09:17–09:18 UTC. This run used the isolated build snapshot and recorded modal return focus/header control bounds.
- Final Zod 4.6.6 run: [.output/native-runs/2026-11-10T10-44-29.591Z-4856/results.json](.output/native-runs/2026-11-10T10-44-29.591Z-4856/results.json), all nine groups passed against the patched final production build. The scale benchmark was not repeated.
- Each main run includes screenshots and synthetic standard/raw backup downloads.

Earlier development attempts are not counted as passes: the first exposed the fixed
serialization bug; harness assertions were corrected for JSON key ordering and
Chrome's regenerated virtual bookmark-root timestamp. Another startup overlapped a
build rewrite and could not read its manifest; the final runner now snapshots a
completed build, and its subsequent complete run passed. No real user profile was used.

Native notifications establish Chrome acceptance, active-ID behavior and persisted
acknowledgment, not visible desktop delivery. Fault-injected writes and barriers are
not claims of physically reproduced disk/power failures. No exactly-once guarantee
is claimed across an unobserved side effect and worker crash.

## 6. UI and accessibility smoke results

- All six stable sections rendered with root scroll width equal to 320/400/800px.
  Navigation intentionally scrolls horizontally; this does not prove every action
  is immediately visible without scrolling.
- At actual Chrome zoom 2, CSS viewport and root scroll width were 400px; Quick
  settings and Park header button bounds remained within the viewport in the final run.
- Long project names, URLs and Unicode notes rendered without root horizontal
  overflow at 320px. Very long project names consume substantial vertical space.
- Remove confirmation initially focused a dialog control; after two Tab presses,
  focus was outside the dialog. Escape closed it, and focus returned to a connected
  element. This is a confirmed accessibility finding, not a passing focus-trap test.
- Recovery, invalid-file error and import cancellation paths were exercised. Transient
  loading states were not deterministically held for accessibility inspection; full
  warning UI, screen reader, high contrast and reduced-motion checks remain manual.
- Screenshots were visually reviewed for long-content and zoom layouts. This was
  headless HTML-tab smoke testing, not a complete headed popup/docked-sidebar assessment.

## 7. CI implementation and execution

Added `.github/workflows/verify.yml`: PRs into `main`/`v0.3`, pushes to `v0.3`,
`fix/**`, `test/**`, `codex/**`, and manual dispatch. Node 22, npm cache, lockfile
installation, existing `npm run verify`, local ZIP creation and package check.
Repository permissions are read-only; checkout does not persist credentials.
Superseded runs cancel. No deploy, Store upload, release, artifact upload or secrets.

YAML/config assertions passed locally. An isolated generated source copy installed
from the lockfile and ran the workflow commands successfully. **Remote GitHub
Actions has not run for these uncommitted changes**; it can only be verified after
a separately authorized push. Native Chrome is not a required CI job: browser
executable/CDP availability and a cross-platform timing baseline are not established.

## 8. Security, permissions and privacy review

Generated MV3 manifest remains version `0.2.0`, with only these permissions:

| Permission | Existing feature requiring it |
| --- | --- |
| storage | Database, preferences, navigation intents |
| tabs | Read selected/current tabs; safe close; restore/target windows |
| bookmarks | Search/tree/folder selection, duplicate checking, requested creation |
| alarms | Reminder scheduling/reconciliation |
| notifications | Reminder and shortcut feedback |
| sidePanel | Sidebar interface and commands |

No broad host permissions, content scripts, externally-connectable configuration,
remote code, new dependency, telemetry or backend was added. There is no explicit
CSP override; Chrome's default extension-page CSP limits scripts/objects to packaged
resources. It is not a blanket image-network prohibition. See
[Chrome CSP documentation](https://developer.chrome.com/docs/extensions/reference/manifest/content-security-policy).

Confirmed privacy discrepancy: `SavedLinkCard.tsx` renders stored `faviconUrl` as an
image. A synthetic `.invalid` URL produced a recorded request attempt (blocked by
the harness). README/policy previously claimed no remote transmission. Updated
README, Markdown/HTML privacy policy and draft Store listing to disclose remote
favicon requests and avoid an unconditional off-device “No”. Removed the inaccurate
`activeTab` permission description; manifest permissions were not removed or added.
These are local draft documentation changes, not a policy deployment or Store filing.

Data is local and not encrypted by LinkShelf. Standard/raw exports can contain
sensitive URLs and notes. Recovery diagnostics use sanitized fixed messages/paths;
native tests confirm no injected private raw value appears. Browser API exceptions
may still appear in local developer console logs; no remote logging exists. Treat
logs and exported files as sensitive rather than uploading real browsing data.

The initial audit identified one production High finding in Zod 4.4.3:
[GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5), which identifies
4.6.6 as patched. Remediation now pins `zod` to **4.6.6** in `package.json` and the
lockfile. `npm ls zod --all` confirms LinkShelf and WXT's publishing helper share
that patched installation. The lockfile changes only the root Zod requirement and
the resolved Zod version/URL/integrity; no unrelated versions or dependencies changed.

Final `npm audit --omit=dev` exits **0** with **zero production advisories**. Final
`npm ci` reports **76 remaining development-tree findings** (5 low, 20 moderate,
43 high, 8 critical), including legacy web-ext/WXT chains. They remain tooling and
supply-chain maintenance work, not shipped-runtime vulnerabilities. No automatic
major upgrades or `npm audit fix --force` were run. Bounded malformed-array tests
verify rejection, preservation and recovery, not uncontrolled exhaustion resistance
or a universal peak-memory guarantee for all inputs below the file-size limit.

The final audit is in ignored `.output/phase-1-6-production-audit-final.json`; the
initial full/production audit files retain historical evidence. Scanner severity
does not establish that every development-tool attack path is reachable here.

## 9. Data preservation and update safety

The implementation still stores one schema-2 database under `linkshelfDatabase`.
Only genuinely absent storage initializes defaults. Valid schema 1 migrates to 2;
valid schema 2 is preserved. Unsupported/malformed/relationally invalid data is
preserved in read-only recovery. Pre/post-write checks and verified rollback remain.
No destructive migration, schema version bump, reset, IndexedDB change or second
database copy was introduced. Native bookmarks are not changed by import/recovery.

Updates preserve data when Chrome retains the same extension identity/profile and
storage has not been cleared or uninstalled; supported data can then initialize or
migrate successfully. Native tests establish storage migration/reload/browser
persistence using representative shapes, **not a signed Store update from the actual
previous release**. That remains an explicit release check. Chrome documents local
storage persistence/limits and removal behavior in its
[storage reference](https://developer.chrome.com/docs/extensions/reference/api/storage).
Uninstall/reinstall is not a preservation procedure.

In-memory operation reservations/receipts disappear when a worker dies; alarms
reconcile from persisted state, but an unacknowledged browser side effect may remain
ambiguous. Physical crash interruption, disk corruption, other software changing
storage between final precondition and write, and proof that a downloaded raw file
was retained are not established guarantees. No automatic side-effect replay or
destructive “repair to empty” was introduced.

## 10. Build and local package verification

`npm run verify`, `npm run zip` and `npm run check:package` passed. The working-tree
production ZIP has **17 files**, **179,943 bytes**, with manifest at root and all
worker/popup/sidepanel/onboarding/icon assets present. Uncompressed build: approximately
616.61 kB. No source maps, source TypeScript/tests, profiles, reports, common credential
patterns or unrelated output were found. ZIP entries match the current build bytes.

ZIP SHA-256: `b742d67a47b34591173e4aabaa4314c408119ff2d8027975ff7f8cfb60552e01`.
The package checker is a focused allow/deny and byte-comparison check, not a general
secret scanner. Human review remains in the checklist.

The earlier, pre-security isolated clean-install build/package also passed, producing a larger CSS bundle
in that generated source location (177,869-byte ZIP vs the then working tree's 166,751).
Both matched their respective outputs; byte-for-byte cross-location reproducibility
is not claimed. Package/manifest versions remain `0.2.0`; only Zod was updated in
dependencies/lockfile. Chrome permissions are unchanged. No archive was uploaded or published.

## 11. Performance smoke findings

Real Chrome measurements from the original scale native run, before Zod remediation
(Zod 4.4.3). The final patched build is covered by the full native smoke suite; these
latencies were not rebenchmarked after the dependency update. One synthetic session with
all links parked, approximately 54 kB / 535 kB / 2.70 MB / 5.40 MB compact JSON.
Three sequential samples per RPC, median below, in **milliseconds**:

| Links | Projects | Session groups | Search | Validation recheck | Verified write | Export + stringify | Preview + Replace |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 100 | 8.22 | 43.99 | 6.49 | 13.12 | 30.66 | 51.40 | 122.56 |
| 1,000 | 7.33 | 927.66 | 77.98 | 395.21 | 523.91 | 840.50 | 2,928.91 |
| 5,000 | 103.62 | 1,295.38 | 24.80 | 424.72 | 1,071.52 | 2,209.72 | 4,449.51 |
| 10,000 | 5.96 | 2,369.06 | 26.59 | 687.57 | 1,813.90 | 2,844.30 | 7,809.62 |

Single observations (not medians):

| Links | Worker stop+wake ms | Project document to visible card ms | Three actual restores ms | Page JS heap MiB |
| ---: | ---: | ---: | ---: | ---: |
| 100 | 111.83 | 241.81 | 1,496.19 | 52.6 |
| 1,000 | 1,607.58 | 1,234.33 | 6,353.77 | 62.5 |
| 5,000 | 1,687.54 | 378.13 | 4,999.86 | 76.4 |
| 10,000 | 779.99 | 474.53 | 7,574.06 | 134.3 |

Measurements include page/worker IPC, Chrome serialization/storage, application
cloning/validation and competing UI refresh work. Validation recheck is not isolated
relational-validator CPU time; stop+wake includes CDP and startup reconciliation.
Page heap excludes worker/browser memory and is affected by earlier file/UI tests,
retained objects and GC. It is not peak memory or memory attributable solely to link
count. There is no dedicated quiet-host run, pre-Phase-1 native baseline, p95, or
hardware-independent pass threshold. Non-monotonic timings show scheduling/JIT noise.

No data loss or assertion failure occurred at these sizes, but second-scale
whole-database operations are a clear Phase 2 priority. Investigate redundant
cloning/validation/refreshes and per-link lifecycle writes with a profiler before
choosing indexing/storage/rendering changes. No performance overhaul was made here.

## 12. Findings, severity and disposition

### R1 — High: false recovery after successful Chrome writes — FIXED

- Evidence/reproduction: on the Phase 1.5 build, fresh disposable profile → create
  project without optional description/color → actual storage contains it, RPC says
  failure, and subsequent writes are blocked by recovery.
- Files: `domain/recovery.ts`, `storage/repository.ts` caller; regression tests in
  `storage/integrity-recovery.test.ts`.
- Impact: core project/parking workflows can fail despite successful persistence.
- Correction: compare Chrome's omitted undefined object properties semantically,
  while retaining null/value/array distinctions; avoid JSON allocation copies.
- Release blocker: yes before fix; fixed and verified in Phase 1.6 automated/native runs.

### R2 — High advisory: affected production Zod version — REMEDIATED

- Initial evidence: `npm audit --omit=dev` resolved `zod@4.4.3` to
  GHSA-mrhx-c7xc-m3w5; advisory range is below 4.6.6. An actual memory-exhaustion
  attack against LinkShelf was not run.
- Files: `package.json`, `package-lock.json`, validation consumers in domain/storage.
- Impact: potential availability/memory risk while validating hostile invalid input.
- Correction: pinned patched Zod 4.6.6, targeted lockfile update, four bounded
  schema-1/2 malformed-array regressions; full tests, integration, build and package checks pass.
- Release gate: this advisory is resolved; final production audit is clean. Remaining
  development-tool findings are separately documented, with no broad unrelated upgrades.

### R3 — Medium: privacy text understated remote favicon requests — DOCS CORRECTED

- Evidence/reproduction: import a synthetic parked link with a remote favicon URL,
  open Projects, observe the image request. Native probe records it without allowing
  the network request to reach the host.
- Files: `SavedLinkCard.tsx`, README, privacy Markdown/HTML and Store-listing draft.
- Impact: image hosts can observe requests; unconditional off-device “No” is inaccurate.
- Correction: local disclosures updated; owner should review publication copy and
  decide whether future UI should avoid remote favicons.
- Release gate: approved disclosure/Store answers must match actual behavior. Doc
  correction belongs here; a favicon behavior redesign belongs in Phase 3. No hosted
  policy or dashboard was changed.

### R4 — Medium: modal focus escapes — DEFERRED PHASE 3

- Evidence/reproduction: Projects → More link actions → Remove; initial focus is
  inside dialog, press Tab twice → focus outside. Repeated in both native runs.
- File: `entrypoints/sidepanel/components/ui/Modal.tsx`.
- Impact: keyboard/screen-reader users can navigate underlying controls while an
  `aria-modal` dialog remains open. Escape and connected focus return work.
- Recommended correction: contain enabled visible focusable elements and verify
  Tab/Shift-Tab, Escape and trigger focus in headed/assistive-technology testing.
- Release gate: accessibility sign-off remains pending; not a demonstrated data-loss
  regression from Phases 1.1–1.5. No redesign code imported.

### R5 — Medium: large-library whole-database latency — PHASE 2

- Evidence/reproduction: `npm run test:native -- --performance`; see measured tables.
- Files: repository, worker RPC/refresh paths and restore lifecycle writes.
- Impact: users with large libraries wait seconds for writes/exports/imports or a
  few restores. No arbitrary acceptable threshold or causality beyond evidence claimed.
- Recommended correction: profile clone/validation/serialization/refresh and write
  counts before optimizing. Release decision should consider target library sizes.
- Release gate: performance acceptance is pending; no severe data-integrity failure
  observed. Optimization explicitly remains Phase 2.

### R6 — Low: very long project names dominate vertical layout — PHASE 3

- Evidence/reproduction: set a project name to repeated long text, open Projects at
  320px; screenshot `long-content-320.png`. Root width stays 320px, but the heading
  pushes the session far down the page.
- File: `ProjectsSection.tsx`.
- Impact/correction: excess scrolling; consider wrapping/clamping with accessible
  full-name disclosure during UI work. Does not block core recovery or this integration.

### R7 — Low: cross-location CSS output differs — PHASE 2 INVESTIGATION

- Evidence/reproduction: build the isolated lockfile-installed source copy under
  `.output/clean-ci` and compare its CSS/ZIP sizes with the working-tree build.
- Files: generated CSS, Tailwind build/source-discovery context; no source cause
  was established or changed during this phase.
- Impact/correction: extra packaged CSS in that location; inspect source discovery
  and generated selectors when investigating build size. Both packages passed local
  byte/manifest checks; exact cross-location reproducibility is not established.
- Release gate: no demonstrated functional failure; track as Phase 2 build/performance
  work and inspect the actual eventual release artifact.

No confirmed Critical data-loss/destructive/security defect was found in this phase.
Eight Critical development-tree scanner findings are not relabeled as confirmed
production defects. They still require development-tool maintenance review.

## 13. Remaining manual release requirements

1. Actual prior-released-build update in place with the same extension identity;
   compare exported IDs, relations, settings, history and native bookmarks.
2. Current stable headed Chrome: actual toolbar popup and docked sidebar, onboarding
   handoff, physical assigned shortcuts, both restore modes at larger tab counts,
   window closure/focus behavior and visible OS notification delivery/denial/dismissal.
3. Keyboard/screen reader/high contrast/reduced motion and modal containment, transient
   loading/warning states, simultaneous stale settings forms and UI preference edits.
4. Remote CI on the eventual pushed commit; development-tool advisory triage, final
   privacy/Store disclosure review, approved version/release notes and final ZIP review.

Exact developer/headed/synthetic-data procedures are in `docs/testing.md`, the
expanded `docs/release-checklist.md`, and the corrected manual test plan. These are
explicit remaining checks, not claims that native automation is unavailable.

## 14. Release-readiness assessment

The stability foundation now has automated integration evidence, a repeatable native
workflow, CI configuration and a package/data-safety checklist. The confirmed Chrome
serialization regression is fixed. The branch is suitable for review of Phase 1.6.
The production Zod advisory is resolved. Do not call the product fully release-ready until the explicit
headed/update/accessibility/CI requirements have a recorded disposition. No Phase 2
work was started, and no Chrome Web Store publication is authorized by these results.

## 15. Git status and changed files

- Branch: `test/release-readiness`; baseline / pre-commit HEAD:
  `b5170461f1926fa0bb4dc2c11f18305e886eb9c6`.
- `v0.3` was fast-forwarded only for the requested preparation; implementation is
  isolated on the new branch. `main`, `v0.2` and
  `experiment/ui-redesign` remain unchanged.
- This report is finalized before the requested commit/push/PR. Final commit SHA,
  PR URL and observed remote CI status are provided in the final delivery. No merge
  or release is authorized.
- Earlier audit and Phase 1.1–1.5 reports remain untouched and untracked.
- Earlier Phase 1.2 preservation snapshot remains accessible; SHA-256 rechecked as
  `9c2b800ac1baaa52034bcceb03b88851d7670f4bd6b97301058c1e6a50c1dd7f`.
- Generated build/ZIPs, clean-install copy/cache, native profiles, screenshots and
  synthetic downloads are inside ignored `.output`; no credentials or real user data.

Phase 1.6 changes comprise these 21 files:

```text
.github/workflows/verify.yml
README.md
PHASE_1_6_IMPLEMENTATION_REPORT.md
docs/chrome-web-store-listing.md
docs/manual-test-plan.md
docs/privacy-policy.html
docs/privacy-policy.md
docs/release-checklist.md
docs/test-coverage.md
docs/testing.md
domain/recovery.ts
features/operations/background.test.ts
package.json
package-lock.json
scripts/check-package.mjs
scripts/native/fixtures.mjs
scripts/native/harness.mjs
scripts/native/performance.mjs
scripts/native/run.mjs
storage/integrity-recovery.test.ts
vitest.config.ts
```

The finalization request authorizes commit, push and an unmerged PR after successful
verification. Stop after checking available CI results; no publication or Phase 2 work.
