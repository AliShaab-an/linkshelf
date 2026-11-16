# Popup and Saved refinement

Local branch `ux/popup-saved-refinement` starts at `a4a6973`, the merge of PR #19 into `v0.3`.

## Changes

- **Popup.** The compact preview identifies the active tab and the shared Save to dropdown uses the configured default project, with Inbox as the fallback for a missing default. Note and reminder fields stay collapsed until opened and the summary indicates when details are set. Restricted pages show a brief explanation and Open sidebar. A saved tab with unconfirmed closure gets a distinct result and a keyboard path to Open sidebar.
- **Saved.** Compact spacing now gives each link a row with Restore and More beside the title. Comfortable spacing keeps the larger card layout. Shared notes and matching parking dates appear once per session. Individual notes and different parking dates remain on the corresponding links.
- **Filtering and restore.** View contains expansion controls. Filtering expands matches independently, so clearing it recovers the previous session expansion. Restore all shows the full project count when results are hidden, states how many links the filter hides, and uses one confirmation button. Its load-mode choice starts from the saved preference and applies to that operation.
- **Organization.** Move to project uses the existing dialog and worker operation. Park tabs in an empty project takes the user to Park and preselects the project. Entering Park normally uses the configured default.

The UI continues to use the existing worker-owned save, close, move and restore operations. Project cards still mount in batches of 25 before the user requests more. The extension manifest, storage schema and dependencies stay the same.

## Screenshots

These captures use synthetic records in disposable Chrome 157 extension tabs. The 200% captures use real Chrome tab zoom. Local evidence is stored in ignored `.output` directories.

| Surface | 320px | 400px | 200% zoom |
| --- | --- | --- | --- |
| Saved compact rows | [320px](.output/native-runs/2026-11-15T11-57-05.710Z-596/saved-compact-320.png) | [400px](.output/native-runs/2026-11-15T11-57-05.710Z-596/saved-compact-400.png) | [200%](.output/native-runs/2026-11-15T11-57-05.710Z-596/saved-compact-200-percent.png) |
| Popup | [320px](.output/native-runs/2026-11-15T12-06-11.213Z-11416/popup-320.png) | [400px](.output/native-runs/2026-11-15T12-06-11.213Z-11416/popup-400.png) | [200%](.output/native-runs/2026-11-15T12-06-11.213Z-11416/popup-200-percent.png) |

The [filtered restore capture](.output/native-runs/2026-11-15T11-57-05.710Z-596/saved-links-200.png) shows the hidden-link count and confirmation controls while the final action is focused. Compare with the earlier [Saved capture](.output/ui-refinement-1/after/saved-320.png) and [restricted popup capture](.output/native-runs/2026-11-12T12-06-00.274Z-26664/popup-360.png).

The updated popup also has captures for a [restricted page](.output/native-runs/2026-11-15T12-06-11.213Z-11416/popup-unavailable-320.png) and a [saved tab with unconfirmed closure](.output/native-runs/2026-11-15T12-06-11.213Z-11416/popup-partial.png).

## Verification

- `npm run verify` passed with Node 22 and two Vitest workers. The full suite contains 435 tests across 31 files.
- `npm run test:integration` passed 276 tests across seven files. `npm run zip`, `npm run check:package`, and `git diff --check` passed.
- [Saved and Review](.output/popup-saved-refinement/saved-links.log) passed five groups covering responsive rows, batching, clearing a filter, settings-aware restore, the move dialog, and the empty-project shortcut. [Rendering](.output/popup-saved-refinement/rendering.log), [Search](.output/popup-saved-refinement/search.log), and [bulk restore](.output/popup-saved-refinement/bulk-restore.log) passed their targeted regression checks.
- [Navigation](.output/popup-saved-refinement/navigation.log) passed nine checks, including opening the sidebar in the active tab’s window and retrying a failed open. [Parking](.output/popup-saved-refinement/parking.log) passed four checks. The [general Chrome suite](.output/popup-saved-refinement/run.log) passed ten checks, including browser and worker lifecycle, backups, and storage recovery.
- [Popup](.output/popup-saved-refinement/popup.log) passed four groups, including default selection and fallback, note and reminder persistence, handling a real tab close and an injected close failure, result focus, and restoring a popup-saved link with a one-time load choice. [Accessibility](.output/popup-saved-refinement/accessibility.log) passed 11 scenarios, including Tab order through the new Move to project menu item.
- The [performance smoke comparison](.output/popup-saved-refinement/performance-comparison.md) completed all 41 comparable operations. Measured result counts, mounted card counts, storage calls and readbacks matched. Six median timings were flagged for review, 14 were faster and 21 fell below the tool’s threshold. Timing samples are small, and the smoke matrix covers Search and Archive rendering. The separate Saved suite checks the 25-card batch and continuation.

## Manual review

The native popup tests open the production popup document as an extension tab and simulate detection of the active tab. The selected tab and worker browser operations are real disposable Chrome tabs. Physical toolbar popup lifetime, docked sidebar gestures and screen-reader interaction remain for manual review. If Saved is already open when the popup parks a tab, reopening Saved refreshes the list.
