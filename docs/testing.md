# Testing LinkShelf

Use Node 22 and npm with the committed lockfile. Run commands from the repository
root. No production credentials are needed. Extension version `0.2.0` and database
schema `2` stay unchanged until a separate release decision.

## Automated verification

```sh
npm ci
npm test
npm run test:integration
npm run verify
git diff --check
```

Vitest files live beside their source. Domain, URL, bookmark-tree, reminder and
view-model tests are unit tests. Repository tests use in-memory storage; background
tests import the real worker, repository and coordinators with mocked Chrome APIs.
These are integration tests, not native Chrome tests. The `test:integration` subset
selects repository/background suites and operation coordinators; do not add its
count to the full suite. Generated `.output`/`.wxt` directories are excluded.

Run `npm test -- path/to/file.test.ts` for one file or `npm run test:watch` while
editing. No coverage percentage or React DOM component coverage is claimed.

## Development reload and standalone builds

`npm run dev` generates `.output/chrome-mv3-dev`. Its popup and sidebar
use WXT's local hot-reload connection. If Chrome reports that WXT cannot
connect to the dev server, start that command and reload the unpacked
development extension in `chrome://extensions`.

For standalone testing, run `npm run build` and load
`.output/chrome-mv3`. This build works without a dev server. Chrome may
assign a different extension ID to a different unpacked directory, so
keep the existing installation if you still need its saved data.

## Disposable native Chrome testing

Build first; the runner never builds or changes the extension version. It requires
Chrome/Chromium supporting CDP `Extensions.loadUnpacked` with
`--enable-unsafe-extension-debugging` (verified on Chrome 156) and Playwright.
Playwright is optional external test infrastructure, not an extension dependency.

Set `LINKSHELF_PLAYWRIGHT_MODULE` to an existing resolvable Playwright package path,
or install a separate copy outside the repository:

```sh
npm install --prefix ../linkshelf-browser-tools playwright@1.62.1
```

PowerShell example:

```powershell
$env:LINKSHELF_PLAYWRIGHT_MODULE = (Resolve-Path ../linkshelf-browser-tools/node_modules/playwright).Path
$env:CHROME_PATH = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
npm run build
npm run test:native
npm run test:native -- --performance
node scripts/native/navigation.mjs
```

On macOS/Linux use normal shell environment syntax and the installed browser path.
Without `CHROME_PATH`, Windows uses Chrome's standard Program Files location;
elsewhere the runner uses Playwright's Chromium executable (install it separately
with the external Playwright CLI if needed). Use `LINKSHELF_HEADED=1` to see the
same suite in a visible browser. Scripts contain no private runtime paths.

The runner snapshots the completed build into its evidence directory; finish building
before starting it. Fresh generated profiles live under `.output/native-runs/`. There is no option to
use a real profile. A loopback server serves synthetic pages. External page requests
are blocked and recorded for the favicon privacy probe; Chrome background services
are not a network-isolation guarantee. A second fresh profile tests import isolation.
Browser-restart checks reuse only the runner-generated profile. Failure injection
and concurrency barriers operate only inside its extension worker.

The suite checks real tab save/close/restore, project/search/archive/history flows,
independent-profile backup replacement and merge, reminder acknowledgment,
two-interface concurrency, bookmarks/duplicates, failed-write recovery receipts,
Keep Parked Copies, window targeting, corruption/raw export/trusted recovery, real
quota errors, historical schema fixtures, restarts, file rejection, import
cancellation and UI smoke cases. It uses state polling and explicit barriers,
with a five-minute watchdog (15 minutes with performance measurements). Failed assertions fail the run; partial progress is
not a pass. `results.json`, screenshots and synthetic downloads remain beside the
generated profile for review. Keep these files out of Git; close the browser before
deleting its generated directory.

## Native limitations and manual procedure

Extension documents opened as tabs exercise application code but do not verify
toolbar-popup lifecycle, docked sidebar gestures or physical shortcuts. Notification
API acceptance does not establish visible desktop delivery. No test promises
exactly-once side effects across a worker crash or physical power loss.

Launch headed Chrome with a **new empty** `--user-data-dir`; load
`.output/chrome-mv3` via `chrome://extensions`. Create only synthetic pages, projects
and bookmarks. Use the real popup and docked sidebar. Exercise default destination,
notes, project moves, all navigation sections, bookmarks, both restore modes and
Keep Parked Copies. Test two windows while switching focus. Repeat keyboard-only
at 320/400px and 200% zoom, checking Tab/Shift-Tab, Escape, focus return, long content,
screen-reader labels, loading/empty/error/warning states, high contrast and reduced
motion. See [manual-test-plan.md](manual-test-plan.md) for individual scenarios.

Enable/deny OS notification permission; schedule a near-future reminder and inspect
actual desktop visibility/dismissal. Restart Chrome and check acknowledgment is not
routinely repeated. Stop the worker from the extension page, wake it with an action,
and verify storage and alarms. A denied Chrome API simulated by a test does not
establish behavior on every desktop notification system.

For recovery, first export the synthetic library. In that extension's worker console,
save the original raw value locally, then deliberately set only `linkshelfDatabase`
to a malformed synthetic object. Restart the worker; export and inspect raw recovery,
cancel, then explicitly restore the trusted synthetic backup. Test a dummy file above
32 MiB and a backup below that bound exceeding Chrome quota. Neither failure may
replace the current library. Never paste private browsing records into issues/logs.

For actual update safety, keep a disposable profile with the previous released build
and synthetic records in all lifecycle states, custom Inbox IDs, notes, reminders,
preferences and native bookmarks. Export before updating. Update in place using
the same ID/path (or signed identity in a controlled test channel); do not uninstall.
Compare IDs/references/history/settings/bookmarks and export afterward. Representative
schema fixtures, document reload and browser restart do not establish a signed Store
update. Uninstall/reinstall is not a data-preservation procedure.

## Performance smoke baseline

For controlled Phase 2.1 profiling, see [performance testing](performance-testing.md).
The original Phase 1.6 smoke command below remains available for comparison.

`npm run test:native -- --performance` measures 100/1,000/5,000/10,000 synthetic links
in one session. Three samples and medians cover project/group RPCs, search, storage
validation recheck, verified settings writes, export plus Node serialization, and
preview+replace import. Single samples cover worker stop+wake (including CDP),
project document load to a visible card, and three real restores. CDP reports page
heap usage. These are not p95, a 10,000-tab restore, total-browser memory, peak
allocation or hardware-independent targets. Record concurrent machine load and use
findings for Phase 2; do not invent pass thresholds.

## CI and package inspection

The **Verify** workflow runs Node 22, lockfile installation, `npm run verify`, local
ZIP creation and package inspection on development pushes and PRs into `v0.3`/`main`.
It has read-only repository permissions, no deployment/credentials/artifact uploads,
and cancels superseded runs. Native Chrome stays separate until a portable CI
browser baseline is established. Remote execution is checked after a future push.

```sh
npm run zip
npm run check:package
node scripts/check-package.mjs .output/linkshelf-0.2.0-chrome.zip
npm audit
npm audit --omit=dev
```

Package inspection reads the ZIP and compares every decompressed file with the
current build, checks versions/entrypoints/permissions and rejects source maps,
development files and common credential patterns. It supplements human review;
it is not a general secret/dependency scanner. `npm run release` verifies and packages
locally; it does not publish. Packaging does not authorize upload, version bump,
merge or release. Follow [release-checklist.md](release-checklist.md) for the future review.
