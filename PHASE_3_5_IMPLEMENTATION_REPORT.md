# LinkShelf v0.3 — Phase 3.5 Saved Links Experience

## Design and behavior

- Saved separates project selection, filtering, sorting, density and session
  browsing from the **Manage projects** disclosure. Delete still moves links
  and sessions to Inbox. Confirmation focus returns to the action or its
  disclosure, with an Inbox heading fallback after deletion.
- **Restore link** opens one tab. **Restore session** opens the full session,
  including links hidden by a filter. Both load tabs normally. **Restore all**
  covers the full project and keeps the existing normal/unloaded confirmation
  choices. The configured choice and parked-copy preference are shown in
  context, including preference changes made in another extension document.
- Restore feedback distinguishes confirmed Chrome opens, persisted restored
  records, intentional parked copies, unconfirmed opens, and unload fallback.
  Storage errors and retry warnings remain visible. Failed writes do not
  appear as intentional copies. Updates use record IDs, including when two
  records share a URL.
- Shared cards use explicit restore and Chrome bookmark labels and put parked,
  due or archived status next to the relevant date. Search describes its
  separate bookmark results and Archive explains Return to project. Their
  existing independent counts, cursor/range behavior and mutation focus paths
  are retained. Short viewports and active project confirmations release the
  sticky browsing toolbar so it does not cover focused actions.

The phase leaves worker restoration, search ranking, message contracts,
storage schemas, backups, popup and navigation architecture untouched. The
Phase 3.4 handoff still selects the returned project/session.

## Verification

| Check | Result |
| --- | --- |
| `npm run verify` | TypeScript and production Chrome build passed, 434 tests in 31 files |
| `npm run test:integration` | 275 tests in 7 files |
| `npm run zip` and `npm run check:package` | Passed, 17 files and 187,446 bytes |
| `git diff --check` | Passed |

Four focused unit tests cover restore feedback, including duplicate-URL record
IDs, intentional copies, and partial progress after a storage failure.

## Browser evidence

Chrome 157.0.8103.39 with Node 22.13.1, synthetic loopback fixtures and
disposable profiles. The [Saved Links run](.output/native-runs/2026-11-13T11-49-43.253Z-9920)
exercised 320 CSS pixels, real 200% Chrome tab zoom, long title and expanded
note, project creation/rename/deletion with Inbox preservation, cross-document
preference changes, duplicate URLs, single/session copy opens, filtered project
restore with a simulated Chrome open failure, and 25/50/0 mounted cards
through Show More and Collapse all. It checked that the focused restore choice
was visible and unobstructed at 200%. The run contains two screenshots.

| Native suite | Coverage |
| --- | --- |
| [Search](.output/native-runs/2026-11-13T11-44-50.557Z-28112/search-ui.json) | 8 checks including complete reachability, cursor expiry after worker restart, out-of-order replies, multi-document invalidation, archived and native bookmark results |
| [Rendering](.output/native-runs/2026-11-13T11-45-32.619Z-35276/rendering-results.json) | 6 checks including bounded Archive ranges, focus after mutations, cross-document reconciliation, long notes and Projects controls |
| [Bulk Restoration](.output/native-runs/2026-11-13T11-46-08.401Z-23180/bulk-restore-results.json) | 9 cases including unloaded tabs, parked copies, unconfirmed opens, checkpoint failure, retry and worker termination |
| [Accessibility](.output/native-runs/2026-11-13T11-46-22.572Z-33636/accessibility-results.json) | 9 checks including inline confirmation focus, bookmark duplicate handling and Archive focus fallback |
| [Navigation](.output/native-runs/2026-11-13T11-48-49.628Z-32340/navigation-results.json) | 9 checks passed on rerun after synchronizing the zoom assertion with Chrome's viewport resize |
| [Parking](.output/native-runs/2026-11-13T11-47-43.543Z-29068) | 4 checks including the saved-session handoff after a partial tab closure |
| [Release regression](.output/native-runs/2026-11-13T11-47-53.375Z-35336/results.json) | 10 checks including backup/migration, reminders, verified writes, quota errors and browser restart |

## Performance

One pre-change and one final observation used the 1,000-record few-session
fixture at 320 CSS pixels. Projects measured from availability of the first
session action to the first visible article. Review measured from initiating
navigation to the first visible article. These wall-clock observations include
browser automation overhead.

| View | Phase 3.4 | Phase 3.5 | Mounted cards |
| --- | ---: | ---: | ---: |
| Projects | 18 ms | 13 ms | 25 in both builds |
| Review | 3,500 ms | 3,738 ms | 665 in both builds |

Review still mounts the whole parked queue. This sample establishes the mount
count, with insufficient repetitions for a timing conclusion. Projects still
supports deliberate Show More and Show All. Expanding or filtering many
sessions can mount one batch per matching session.

The [final smoke run](.output/performance-baselines/2026-11-13T11-49-49.480Z-19500/baseline.json)
completed Core, Storage Writes, Bulk, Search and Rendering. Comparing with the
[Phase 3.4 smoke run](.output/performance-baselines/2026-11-13T09-43-53.534Z-24548/baseline.json)
yielded 41 compatible operations. The comparator marked 12 within its band,
13 observed improvements and 16 timing deviations. The Search initial and
loaded UI medians rose 6.3% and 8.1%, within the comparison band. In the
1,000-record fixture, initial Search document elements fell from 836 to 761,
and Archive elements fell from 507 to 457. The smoke retained the 25-card
Search and Archive bounds and passed its storage and bulk-restore invariants.
Two or three samples per row and variation in worker-only workloads limit
attribution of timing changes to the UI.

## Scope, limitations and Git status

- Browser evidence exercises extension documents as tabs. Actual docked
  sidebar behavior and screen-reader speech remain unverified.
- Source scope covers Projects, Search, Archive, Review, Today, the shared
  saved-link and Chrome bookmark cards, sidebar CSS, and restore feedback with
  unit tests. Test tooling includes the focused Saved Links suite, updated
  labels and zoom synchronization in existing suites, and a benchmark locator
  compatible with both Restore button labels.
- Branch `ux/saved-links-experience` starts at `68e1c4b`, the Phase 3.4 merge
  on `v0.3`. Earlier unrelated files were preserved, and generated browser
  and benchmark evidence is ignored.
