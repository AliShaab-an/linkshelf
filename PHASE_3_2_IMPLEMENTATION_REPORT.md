# LinkShelf v0.3 · Phase 3.2 accessibility and interaction foundations

## 1. Executive summary

Remove, Move, and Bookmark now use a shared native modal. The active
dialog contains keyboard focus and makes the document behind it inert.
Saved link actions use a disclosure with ordinary buttons. Project and
backup confirmations are named inline regions. Operation feedback
distinguishes pending work, confirmed results, warnings and errors.

## 2. Root cause

The old overlay announced a modal while leaving the surrounding document
interactive. Its initial-focus selector ignored control eligibility, and
cleanup could focus a disappearing record. Card actions used menu roles
without the corresponding keyboard pattern. Inline project and backup
panels used alert-dialog semantics despite following normal document tab
order. Outcome messages and warnings used inconsistent live-region
placement.

## 3. Modal architecture

Use `showModal()` in a React layout effect, with the existing visual
treatment retained in CSS. The browser supplies the top layer and inertness.
A dialog-local Tab handler wraps the current eligible controls to keep
keyboard focus within the extension document. A document-level Escape
listener is unnecessary because the native cancel event represents the
dismissal request. This avoids manually managing inert background elements
and modal stacking. [HTML dialog](https://html.spec.whatwg.org/multipage/interactive-elements.html#the-dialog-element)

The three consumers of the shared primitive are RemoveLinkDialog
(Projects, Review, Search and Archive), MoveLinkDialog (Review), and
BookmarkLinkDialog (Review and Search).

## 4. Focus management

- Remove starts on Cancel. Move starts on the eligible destination
  selector. Bookmark starts on the heading while folder state is loaded.
- If the explicit target is hidden, inert, disabled or absent, focus
  starts on the labeled heading. A dialog-local observer returns focus to
  a valid target when asynchronous changes remove or disable the active
  control. Loading completion does not steal valid focus.
- The primitive restores focus after React commits the dismissal. The
  caller supplies the fallback. Projects, Review and Archive use their
  heading when the invoker is gone. Search returns to the query on a
  successful removal or conversion and uses it when the invoking result
  disappears. Existing nonmodal range and removal focus handling remains
  in the sections.
- Cleanup leaves focus with an unrelated control if the view has already
  moved on. The sidebar checks window-scoped intents against the latest
  request before applying them. An intent received while a modal is open,
  or checked while one is open, is consumed without changing sections.
  A repeated delivery of the most recently consumed request in the
  mounted sidebar is discarded. Chrome verified that discarding and
  replaying a request did not change sections or remove a synthetic
  second window's entry. Search and Today command handling remains
  separate from the worker's tab-parking path.

## 5. Modal lifecycle and dismissal

Opening is guarded against a second active LinkShelf modal. Review and
Search render one candidate per section. Cleanup closes the native
dialog and disconnects the observer. Deferred focus restoration checks
for a reopened dialog, so React development effect replay does not steal
focus. Callback updates do not reopen the dialog.

Idle dialogs accept Cancel, Escape, and a click that starts and ends on
the backdrop. An inside-to-outside drag is ignored. Pending mutations
disable confirmation and Cancel and block Escape and backdrop dismissal.
Dialog pending state is independent of card progress, so another card's
earlier response cannot unlock a pending dialog. Cancelling a folder
lookup invalidates that UI request before it can populate another dialog.

## 6. Card actions

More link actions controls a labeled group of ordinary buttons with
`aria-expanded` and `aria-controls`. Enter and Space open the group,
and Tab and Shift+Tab follow document order. Escape closes the group and
returns focus to its trigger. An outside pointer press or focus move
closes the group without consuming the outside action. Choosing an
action collapses the group and places focus on its trigger before a
dialog takes ownership. Listeners are installed only while a group is
open and are removed on closure or unmount. Closed groups have no action
buttons mounted.

## 7. Operation feedback

Affected sections use a shared, persistent polite status region and a
separate assertive error region. Pending work replaces the previous
completion message. Warnings retain the worker's wording and are grouped
with the outcome in the polite region. Partial collection outcomes use
the returned counts and warning styling. Errors appear without implying
that the operation succeeded. When a modal is active its feedback is
inside the modal, and the section's live regions remain empty. Ordinary
success does not move focus to the announcement.

## 8. Inline confirmations

Project Restore all, Delete and Rename, backup Merge and Replace, and
trusted-backup recovery remain inline. Each has a labeled region and
focusable heading, normal Tab order, and a logical return target.
Cancellation returns to the invoking control. If it disappears on
success, project deletion uses the selected-project heading and regular
import uses the file input. Commit controls are protected while pending.
The merge/replace consequences, validation, revision tokens, raw
recovery export and trusted backup acknowledgment remain in their
existing paths.

The old custom dialog role was confined to the shared primitive. The
three old alert-dialog patterns were project Restore all/Delete,
ordinary backup preview, and recovery preview. Existing error alerts
and search/range/parking status regions continue to represent error
and progress text. Those search/range status regions describe their
respective controls, independently of operation feedback.

## 9. Automated tests

The preliminary Phase 2.6 count was 412. Phase 2.6 finalization added
one comparator regression for reports that share invalid compatibility
metadata, bringing the merged baseline to 413 tests across 27 files.
Phase 3.1 was documentation-only. Five Phase 3.2 semantic tests cover
the native dialog markup, named inline regions,
pending replacement, grouped partial warnings, and error/success roles.
The real browser behavior is tested separately.

Final `npm run verify` passed TypeScript, 418 tests across 28 files,
and the production build. `npm run test:integration` passed 275 tests
across seven files.

## 10. Native Chrome

`node scripts/native/accessibility.mjs` uses the existing disposable
Chrome harness and a temporary development React fixture compiled into
the test snapshot. It exercises actual key and pointer events, inert
background controls, open attempts, dynamic focus targets, Strict Mode
cleanup, and real Projects, Archive, Search, Review and Settings actions.
The pending, error and secondary-warning scenarios use a page-local
response fixture. On its warning path the real worker mutation runs.
The test fixture and response instrumentation live outside the shipped
extension.

The nine final accessibility scenarios passed in Chrome 157.0.8103.39.
They verified forward and reverse wrap, real pointer backdrop
behavior including a drag, keyboard activation and disclosure
traversal, pending cancellation and repeat protection, named inline
previews, focus after removal or a disappearing invoker, and
bookmark duplicate handling. The long-title dialog fit at 320,
400, 600, and 800 px and scrolled at the short narrow viewport.
The native Chrome 200% zoom check used an 800 px outer viewport.
Opening Remove produced no runtime messages. The project confirmation
scenario verified that the project toolbar and Cancel could not switch
the confirmation during a pending delete. [Accessibility run](.output/native-runs/2026-11-12T14-19-49.218Z-18168/accessibility-results.json)

The existing Chrome suites passed 10 general scenarios, eight Search
checks, six Rendering checks, and nine Bulk Restoration cases. The
general suite's oversized-upload fixture initially timed out during
Playwright's in-memory transfer. Its rerun used a local file of exactly
32 MiB plus one byte and verified rejection with the original database
intact. The Search and Rendering suites also verified pagination,
invalidation, range navigation, and focus after removal. Bulk
Restoration confirmed five verified checkpoints for ten links, thirteen
for 25, and zero lifecycle writes when keeping copies.

## 11. Accessibility limitations and manual checks

The native runs use extension HTML documents in Chrome. Docked Chrome
sidebar behavior and screen-reader speech output remain unverified.
Use a disposable profile with the packaged build for the following
manual checks:

1. Open the docked sidebar via the extension toolbar. Resize it and try
   200% zoom where Chrome permits it. Open a long-title Remove dialog.
   Confirm focus rings, title wrapping, internal scroll, and reachable
   Cancel and Remove actions without horizontal clipping.
2. With NVDA or another supported screen reader, verify the dialog name,
   initial focus, forward and reverse Tab containment, and return focus
   after Cancel and after removing the final visible item.
3. Verify Move and Bookmark announce their labels and results. Try a
   duplicate, a pending operation, a failure and a secondary warning.
   Check that completion and warnings are spoken once in context.
4. Open card actions with Enter and Space, Tab through the action
   buttons, and Escape back to the trigger. Open Merge and Replace
   previews, verify that their headings are announced, and cancel each.
5. While a dialog is open, try the sidebar Search and Today commands.
   Check that they leave the current dialog in place. Chrome-level
   commands such as parking the current browser tab and closing the
   panel are owned by the browser and worker. This change gates
   document-level interaction and section intents.

## 12. Performance and compatibility

The bounded Archive and Search lists and their existing cursor and
refresh paths remain in place. Dialogs add local focus work and no
new persistence calls. Closed disclosure groups contain no mounted
commands, and the new feedback has no storage or browser listeners.
Worker operations, data formats, permissions, dependencies, and the
extension version are unchanged.

The unpacked production build went from 627,426 to 631,432 bytes
(+4,006 bytes, about 0.64%). The sidebar JavaScript went from 181,431 to
187,121 bytes. The built worker and manifest match the stable audit
build byte for byte. `npm run zip` and `npm run check:package` passed
for the 185,376-byte ZIP. The package contains 17 files. The
development fixture and benchmark instrumentation are absent from the
production build.

All five smoke benchmark suites completed before the final intent and
pending-control fixes. The comparator found 41
compatible measurements against the Phase 2.6 smoke reference, with
18 in the no-meaningful-change band, 17 observed improvements, and six
timing deviations for review. With two or three samples per operation,
these categories describe the observations. Archive retained 25 mounted
cards in the 1,000-link fixture and Search retained a combined 50 when
both categories were full. Rendering element counts changed with the
new disclosure and feedback markup. The deterministic storage, search,
rendering and restore assertions passed. [Phase 3.2 smoke report](.output/performance-baselines/2026-11-12T13-36-21.342Z-19808/baseline.json)

## 13. Modified files

- Sidebar shell and CSS under `entrypoints/sidepanel/`.
- Section callers under `entrypoints/sidepanel/components/`: Archive,
  Projects, Review, Search, Settings, StorageRecovery, and Today.
- RemoveLinkDialog, MoveLinkDialog, BookmarkLinkDialog, and SavedLinkCard.
- Shared UI: Modal, InlineConfirmation, OperationFeedback,
  OperationWarnings, and `interaction.test.tsx`.
- Native tests: `scripts/native/accessibility.mjs`,
  `accessibility-fixture.tsx`, `run.mjs`, `rendering.mjs`, and `search.mjs`.
- This implementation report.

## 14. Remaining risks

Assistive technology may announce live-region changes differently across
Chrome and screen-reader versions. Native testing verifies the DOM and
actual focus behavior. The manual checks above cover speech and docked
integration. Browser-global shortcut behavior remains in the worker.
No Phase 3.3 navigation or parking changes are part of this implementation.

## 15. Git status

Branch `ux/accessibility-foundations` is based on the merged Phase 3.1
revision `41f44112c1f1581e5be6fae5197f8bd6eb6a44f8`. The change set
contains the files listed above. Existing historical reports remain
outside it, and browser artifacts are ignored. `git diff --check` passed.
