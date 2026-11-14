# UI Refinement 1 — Saved and Review Screens

Implemented locally on `ux/saved-review-ui-refinement`, based on `aeebd6a`, the Phase 3.5 merge into `v0.3`.

## Changes and design

- **Saved** keeps the name-only project selector, project filter and Restore all directly available. The plus button opens a small form. Project actions contains Rename and Delete and is disabled in Inbox. View options groups order and density using the same native select as the project selector and Chrome bookmark folder picker.
- **Saved sessions** start closer to the toolbar. Expand all and Collapse all sit beside Sessions. Flat session rows make their dates, counts, reminders and restore actions easier to scan. The restore confirmation explains that hidden links are included and shows the effective copy preference and restore modes.
- **Review** shows the queue count beside its heading. Restore, Bookmark and More align on one row. Shared cards retain title, domain, project, date and note information with tighter spacing. The bookmark confirmation identifies the destination as Chrome bookmarks and explains what happens to the parked copy.
- The implementation uses the existing blue accent, navigation, worker messages and restoration paths. It keeps the existing per-session card batches and Search and Archive ranges.
- The dropdown consistency follow-up applies the Saved native select treatment to every sidebar picker, including Park, Quick Settings, full Settings, and the move and bookmark dialogs. The floating panels share View options' border, radius, padding and shadow. The More navigation button keeps its original appearance and placement.

## Before and after

Captured with the same four synthetic links, two sessions and long project name in disposable Chrome 157.0.8103.39 profiles. The 320px and 400px captures use 100% zoom. The 200% captures use Chrome tab zoom with a 640px viewport and a 320 CSS-pixel layout. The PNGs live in the ignored `.output/ui-refinement-1/` directory.

| Screen | Layout | Phase 3.5 | Refinement |
| --- | --- | --- | --- |
| Saved | 320px | [Before](.output/ui-refinement-1/before/saved-320.png) | [After](.output/ui-refinement-1/after/saved-320.png) |
| Saved | 400px | [Before](.output/ui-refinement-1/before/saved-400.png) | [After](.output/ui-refinement-1/after/saved-400.png) |
| Saved | 200% zoom | [Before](.output/ui-refinement-1/before/saved-200-percent.png) | [After](.output/ui-refinement-1/after/saved-200-percent.png) |
| Review | 320px | [Before](.output/ui-refinement-1/before/review-320.png) | [After](.output/ui-refinement-1/after/review-320.png) |
| Review | 400px | [Before](.output/ui-refinement-1/before/review-400.png) | [After](.output/ui-refinement-1/after/review-400.png) |
| Review | 200% zoom | [Before](.output/ui-refinement-1/before/review-200-percent.png) | [After](.output/ui-refinement-1/after/review-200-percent.png) |

Reproduce with `node scripts/native/saved-review-screenshots.mjs before` on the baseline build and the same command with `after` on the refinement build. Use the disposable browser setup in `docs/testing.md`.

## Accessibility and responsive verification

- Screenshot assertions check for horizontal overflow in both screens at all three settings. The 320px capture exposed a long project name expanding the toolbar during the first pass. The final selector is width-constrained and truncates the closed label.
- Project actions and View options are labeled disclosures with ordinary Tab order. Native select controls provide their own selection keys. Escape returns focus to the disclosure trigger. The creation form opens with focus on the name field.

## Automated verification

- `npm run verify` passed compilation, all 434 tests across 31 files and the production build.
- `npm run test:integration` passed 275 tests across seven files, included in the full test count. Initial parallel Vitest runs hit local worker-process failures. Both suites passed with `VITEST_MAX_WORKERS=2`.
- `npm run zip` and `npm run check:package` passed.
- `git diff --check` passed.

### Native Chrome

| Suite | Result | Coverage |
| --- | --- | --- |
| [Saved and Review](.output/ui-refinement-1/saved-links.log) | 5 check groups passed | Empty and populated views, long content, create/rename/delete and Inbox protection, filter and sort, persisted density, session batching, restore scope and partial failure, 40px action targets at 200%, bookmark focus return, Today due metadata |
| [Accessibility](.output/ui-refinement-1/accessibility.log) | 9 passed | Keyboard order, Escape, focus return, pending state, project confirmations, Chrome bookmark creation and duplicate handling, Search and Archive dialogs |
| [Navigation](.output/ui-refinement-1/navigation.log) | 9 passed | Five navigation controls, zoom, project view persistence, sticky toolbar, multi-window intents |
| [Parking](.output/ui-refinement-1/parking.log) | 4 passed | Save-before-close, partial closure, and focus on the newly saved session |
| [Native regression](.output/ui-refinement-1/run.log) | 10 passed | Real tab and bookmark operations, restart, recovery and backup, responsive sections, storage no-op writes |
| [Search](.output/ui-refinement-1/search.log) | 8 check groups passed | Independent categories, complete paging, stale and out-of-order replies, cross-document invalidation and shared card actions |
| [Rendering](.output/ui-refinement-1/rendering.log) | 6 passed | Bounded Archive ranges, notes at four widths and 200% zoom, focus and mutation reconciliation, Saved session controls |
| [Bulk restore](.output/ui-refinement-1/bulk-restore.log) | 9 cases passed | Normal, unloaded and copy modes, partial browser failure, checkpoint failure and retry, worker stops |

### Performance smoke

All 41 operations completed in the [baseline](.output/performance-baselines/2026-11-13T12-29-20.847Z-24112/baseline.json) and the [refined build before the dropdown follow-up](.output/performance-baselines/2026-11-13T12-54-31.292Z-31464/baseline.json). The [comparison](.output/ui-refinement-1/performance-comparison.md) found matching result counts, mounted card counts, and measured storage calls and readbacks. The built worker SHA-256 was identical. Median timings were mixed across two or three samples per operation. Seven operations were flagged for review, including ten-tab project restore at 692 → 839 ms and six RPCs at +1.0 to +1.75 ms. These single smoke runs leave timing repeatability open.

### Dropdown follow-up verification

The updated build passed all 434 tests, the 275-test integration subset and package verification. The native [accessibility rerun](.output/ui-refinement-1/dropdown-accessibility.log) passed 10 scenarios, including a computed-style comparison of the floating panels and select controls, viewport fit at 320px, and Escape focus return. [Navigation](.output/ui-refinement-1/dropdown-navigation.log), [Parking](.output/ui-refinement-1/dropdown-parking.log), and [Saved and Review](.output/ui-refinement-1/dropdown-saved-links.log) also passed. The After screenshots above use the updated build. Open panels at 320px are visible in the [View options capture](.output/native-runs/2026-11-13T13-09-22.976Z-15924/view-options-320.png) and [Quick Settings capture](.output/native-runs/2026-11-13T13-09-22.976Z-15924/quick-settings-320.png).

## Tradeoffs and manual review

- Long project names and card titles are truncated in the closed selector and card preview to preserve space at 320px. The native selector exposes the option text and the closed selector and card title carry full-text tooltips.
- At short viewport heights the Saved toolbar scrolls with content so it takes less of the available vertical space. The screenshot and regression runs used extension documents opened as tabs. Docked sidebar behavior, physical touch and screen-reader announcements remain for manual acceptance.
- The unrelated `.gitignore` change and existing local files are outside this refinement. Screenshot and log links refer to local, ignored build artifacts.

## Settings and interaction follow-up

- Settings now starts with Reminders, Parking, Restoring tabs, and Appearance. A native checkbox styled as a switch controls desktop reminders in both Settings views. Appearance uses two radio choices with visual previews in full Settings. Backup, shortcuts, permissions, and feedback follow everyday preferences.
- Both Settings views save individual preferences immediately and show feedback beside the control. Verified storage writes and reminder reconciliation still use the existing repository and worker path. The worker accepts a validated partial update so simultaneous changes to different preferences compose. Backup import keeps its preview, revision check, and explicit confirmation.
- Restore all uses “Load tabs immediately” and “Load tabs when selected.” Partial restore results lead with the confirmed tab count. Park results show confirmed closures and keep View saved session as the primary action. Today’s empty state explains how to add a reminder.
- Enabled buttons, dropdowns and switches use a pointer cursor across the sidebar and popup. Disabled controls use the unavailable cursor. The switch uses the existing Tailwind styles and adds no dependency.

Settings screenshots in disposable Chrome at [320px](.output/native-runs/2026-11-13T14-34-49.473Z-17868/settings-320.png), [400px](.output/native-runs/2026-11-13T14-34-49.473Z-17868/settings-400.png) and [200% zoom](.output/native-runs/2026-11-13T14-34-49.473Z-17868/settings-200-percent.png). The [Quick Settings capture](.output/native-runs/2026-11-13T14-34-49.473Z-17868/quick-settings-320.png) shows the same switch in its on state.

TypeScript compilation, 435 automated tests, the 276-test integration subset, ZIP creation and package verification passed. One large backup test hit the default five-second timeout on a concurrent rerun. All 435 passed with a local 15-second test timeout. The [accessibility suite](.output/ui-refinement-1/settings-accessibility.log) passed 11 scenarios, including switch keyboard behavior, persistence, failed saves, focus retention, cursor states, and layout at all three screenshot sizes. [Navigation](.output/ui-refinement-1/settings-navigation.log), [Park](.output/ui-refinement-1/settings-parking.log), [Saved and Review](.output/ui-refinement-1/settings-saved-links.log), and [bulk restore](.output/ui-refinement-1/settings-bulk-restore.log) passed on the same build.

The [Settings smoke comparison](.output/ui-refinement-1/settings-performance-comparison.md) completed all 41 operations against the earlier refinement with matching measured result and card counts, storage calls, and readbacks. Ten median timing differences were flagged for review, eight moved in the faster direction, and 23 were below the tool’s threshold. The sample sizes and overlapping test activity limit timing conclusions.

The [general native Chrome suite](.output/ui-refinement-1/settings-run.log) passed 10 checks after its Settings readiness check was updated for autosave. Hover checks confirmed a pointer cursor on enabled buttons in the sidebar, popup, and onboarding.
