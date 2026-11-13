# LinkShelf v0.3 · Phase 3.4 tab parking

## Design and implementation

Park keeps the selected count and Review selection action in a sticky
footer while the tab list scrolls. Each row is a checkbox label.
Pinned and restricted tabs remain disabled and retain their explanations.

Review uses the shared native dialog. It shows the destination project,
optional note and local-time reminder, and an expandable list of the
selected tabs. The confirmation explains that LinkShelf saves first
and then attempts to close tabs. Back or idle Escape retains the
selection, project, note, and reminder. The pending guard disables
editing and confirmation and blocks dialog dismissal.

## Safety and outcomes

The existing worker still validates tab eligibility, persists records,
and rechecks tab identity before attempting closure. The UI requires a
refresh after a stale-selection response and retains still-eligible
selections. Persistence failure keeps the draft available. An ambiguous
response directs the user to check Saved and open tabs. There is no
automatic retry.

On confirmed success, the UI derives three separate counts from the
response: saved records, confirmed closures, and closures not confirmed.
Worker warnings stay visible. View saved session uses the returned
session ID and submitted project ID through the existing Saved route.
The destination opens and expands the matching session and focuses its
control if focus is still available. The handoff is transient and
leaves the existing project preferences intact. If the session is gone,
focus falls back to the selected project heading.

## Verification

`npm run verify` passed TypeScript, 430 tests across 30 files, and
the production build. The three new tests cover full, partial, and
zero confirmed closures and preserve the returned session ID.
`npm run test:integration` passed 275 tests. ZIP creation and package
validation passed.

The focused Chrome suite passed four scenarios with 12 eligible tabs
plus pinned and restricted entries. It selected exactly three with
the keyboard and checked that Review stayed visible before and after
scrolling. At 200% Chrome zoom, an effective 320 CSS px width, the
suite verified Review and confirmation geometry and draft retention.
The headless zoom screenshot came back blank, so the zoom evidence is
the recorded browser assertions.

The stale selection left storage intact and Refresh pruned the closed
tab. Injecting a worker persistence failure left all three tabs open.
Injecting one Chrome closure refusal after verified persistence left
three saved records, two confirmed closures and one unconfirmed closure.
The suite checked the saved local-time reminder, pending Escape and
backdrop behavior, and the exact new session among two sessions in the
destination project.

[320 px selection](.output/native-runs/2026-11-13T09-38-35.024Z-11736/parking-selection-320.png) ·
[Partial result](.output/native-runs/2026-11-13T09-38-35.024Z-11736/parking-partial-320.png) ·
[Focused run](.output/native-runs/2026-11-13T09-38-35.024Z-11736/parking-results.json)

The existing native suites passed 10 General, nine Navigation, nine
Accessibility, eight Search, six Rendering, and nine Bulk Restoration
checks. Together with the four focused parking scenarios, 55 native
checks passed.

## Performance and package

All five performance smoke suites passed. The 41 comparable rows
against the Phase 3.3 run included 33 timing deviations for review and
eight within the no-meaningful-change band. The Phase 3.2 reference
yielded 11 deviations, four observed improvements and 26 within that
band. A repeat on the same Phase 3.4 build passed all five suites and
flagged 23 deviations against Phase 3.3. Comparing the two Phase 3.4
runs directly flagged 12 deviations, with 15 observed improvements and
14 within the band. The spread warrants review and the small samples
do not establish a regression. Archive and Search retained
their 25-card limits per category, and the storage and restore
invariants passed. [Smoke baseline](.output/performance-baselines/2026-11-13T09-36-21.892Z-34752/baseline.json) · [Repeat](.output/performance-baselines/2026-11-13T09-43-53.534Z-24548/baseline.json)

The 17-file production ZIP was 186,907 bytes. The built worker and
manifest matched Phase 3.3 byte for byte. `git diff --check` passed.

## Scope and limitations

The worker API, eligibility checks, close coordination, storage,
permissions, popup source, and restoration logic retain their stable
contracts. Chrome evidence uses synthetic tabs and disposable extension
documents. Actual docked sidebar behavior and screen-reader speech
remain unverified.

## Files and Git status

- Sidebar `App.tsx`, `style.css`, `parking-outcome.ts`, and
  `parking-outcome.test.ts`.
- Sidebar components `ParkTabsSection.tsx`, `ProjectsSection.tsx`,
  and `ui/Button.tsx`.
- Focused Chrome suite `scripts/native/parking.mjs` and this report.

Branch `ux/tab-parking-experience` is based on the Phase 3.3 merge
`7794ada8f6970e3e320918cb1b84a349ccc09388` and targets `v0.3`.
Existing unrelated files were preserved. Generated browser evidence
is ignored.
