# LinkShelf release checklist

Copy this checklist for each release. Record commit, OS, Node/npm, Chrome version/channel,
extension/schema versions, tester, date and evidence. Local packaging does not authorize publication.

## Automated and build checks

- [ ] Review the intended commit; exclude experimental UI, profiles, credentials and generated output.
- [ ] With Node 22, run `npm ci`, `npm run verify`, and `git diff --check`; record test/file counts and failures/skips.
- [ ] Review the remote **Verify** Actions result for the exact commit; local validation is not a remote CI pass.
- [ ] Run `npm run zip` and `npm run check:package`; inspect the local ZIP against the current build.
- [ ] Check manifest/package versions, worker, popup, side panel, onboarding, icons and static assets.
- [ ] Confirm expected permissions, no host permissions/content scripts, source maps, secrets or development files.
- [ ] Review `npm audit` and `npm audit --omit=dev`; triage production advisories separately from tooling. Avoid automatic major upgrades.

## Functional verification

Use synthetic data in a disposable profile. See [testing.md](testing.md) and [manual-test-plan.md](manual-test-plan.md).

- [ ] Current-tab popup and shortcut save to the configured default; persistence succeeds before closure.
- [ ] Selected tabs form one session; restricted/pinned policies, changes during saving and partial close failures preserve records.
- [ ] Create, rename, move and delete projects; protect Inbox and preserve archived/restored/removed relationships and default settings.
- [ ] Restore links/sessions/projects normally and unloaded; verify order, partial progress and fallback messages.
- [ ] Keep Parked Copies works; overlapping operations from two interfaces create correct counts and release locks after failure.
- [ ] Check multiple windows, focus changes, a closed target window and worker interruption; distinguish recovery from a deliberate new action.
- [ ] Search title/URL/domain/note/project/archive and native bookmarks; bookmark opening and conversion use the chosen destination.
- [ ] Bookmark duplicate detection and partial failures preserve parked data.
- [ ] Archive, return to project, remove confirmation, oldest-first Review and lifecycle history work.
- [ ] Notes, long content and Unicode survive all workflows.
- [ ] Default project, restore behavior/mode, density, notifications, shortcuts and UI view memory persist; check two interfaces and stale settings forms.

## Data safety and reminders

- [ ] Export before update testing; never inject failures into a real profile.
- [ ] Test schema-1/2 storage and backups: stable IDs, references, notes, reminders, acknowledgment, history, preferences and native bookmarks.
- [ ] Test Merge twice, confirmed Replace, stale previews and cancellation; inspect all lifecycle states afterward.
- [ ] Reject invalid JSON, unsupported versions, duplicate IDs, broken references and files above 32 MiB before mutation.
- [ ] Exercise real Chrome quota below the file bound and injected write/readback/rollback failures; independently inspect preservation.
- [ ] Corruption opens read-only recovery and survives worker restart; diagnostics omit browsing details.
- [ ] Download and inspect raw recovery separately from standard backups; cancel, then explicitly confirm a trusted backup.
- [ ] Reject stale raw/backup tokens; never assume success or destructively retry an uncertain write.
- [ ] Test reminder move, partial restore, archive/unarchive and import; missing alarms reconcile after worker/browser startup.
- [ ] Test future/Today/overdue, notifications off and denied permissions; pending information remains and delivered occurrences do not routinely repeat.
- [ ] Verify visible OS delivery/dismissal separately from Chrome API acceptance.

## Native browser and accessibility

- [ ] Run `npm run build` then `npm run test:native -- --performance`; review generated results and limitations.
- [ ] In headed current stable Chrome, check install onboarding once, real toolbar popup, docked side panel, navigation and physical shortcuts.
- [ ] Stop/wake the worker, close/reopen Chrome and test multi-window routing in the same disposable profile.
- [ ] Update the actual previous released build in place with the same extension identity; reload-only tests do not establish signed Store update safety.
- [ ] Test keyboard-only operation, visible focus, Tab/Shift-Tab containment, Escape, return focus and screen-reader labels.
- [ ] Check loading/empty/warning/error states, 320/400px panels, 200% zoom, long names/URLs/notes, reduced motion and high contrast.
- [ ] Record focus, clipping and stale-settings issues with severity and an owner; keep the experimental redesign separate.

## Future Chrome Web Store preparation — separate authorization required

- [ ] Resolve release blockers and dependency questions; review release notes and limitations.
- [ ] Deliberately select the next version in package and manifest after review; do not accidentally ship another `0.2.0` build.
- [ ] Align listing, privacy policy (including remote favicons), permission explanations and Store Privacy answers.
- [ ] Verify hosted privacy/support pages and monitored support contact.
- [ ] Capture accurate 1280×800 or 640×400 screenshots and the 440×280 promotional tile.
- [ ] Review final ZIP hash, tested commit and distribution plan. Exclude profiles and synthetic evidence.
- [ ] Obtain explicit approval before uploading/submitting to the Store, deploying documentation, or publishing a GitHub release. This checklist performs none of those actions.
