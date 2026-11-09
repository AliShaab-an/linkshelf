# LinkShelf MVP — Product Requirements Document

**Working title:** LinkShelf  
**Product type:** Chrome extension (Manifest V3)  
**Document status:** Ready for implementation  
**Version:** 1.0  
**Date:** 2026-08-08  
**Owner:** Ali / G++

## 1. Product summary

LinkShelf is a local-first Chrome extension that helps people manage the lifecycle of web links.

Instead of leaving dozens of tabs open or saving everything permanently as a bookmark, users can park tabs temporarily, group them by project, choose when to revisit them, and later decide whether to restore, bookmark, archive, or remove them.

The MVP combines tab parking and bookmark discovery in one searchable interface, without requiring an account, server, payment, or AI.

### Core promise

> Save every link for the right amount of time—not forever.

## 2. Problem statement

People commonly keep many tabs open because:

- They need the pages later but do not want to bookmark them permanently.
- They are afraid they will forget why a page was useful.
- Existing bookmarks are already disorganized and difficult to search.
- Saved-tab tools often turn open-tab clutter into a second, forgotten list.
- It is difficult to distinguish active work, temporary references, permanent resources, and obsolete links.

The result is browser clutter, wasted memory, repeated searching, lost context, and large collections of links that are never reviewed.

## 3. Product vision

LinkShelf gives every useful link a clear state:

1. **Open:** being used now.
2. **Parked:** needed later or awaiting review.
3. **Bookmarked:** worth keeping as a permanent reference.
4. **Archived:** retained for search but hidden from active work.
5. **Removed:** no longer useful.

The MVP focuses primarily on moving links between Open, Parked, Bookmarked, and Archived. Removal must always require deliberate user action.

## 4. Goals

### Product goals

- Allow a user to reduce tab clutter without losing useful links or context.
- Make parked tabs easy to retrieve through projects, search, and reminders.
- Help users decide what to do with saved links instead of accumulating them indefinitely.
- Search parked links and native Chrome bookmarks from one interface.
- Build user trust through local storage, clear permissions, backup, and recovery.
- Validate whether users return weekly and repeatedly use the park/review workflow.

### Business goals

- Publish a useful free extension and gain the first 100–500 users.
- Learn which workflows users repeat before building paid features.
- Create a foundation for future cloud synchronization, backup, automation, and team workspaces.

## 5. Non-goals for the MVP

The following are deliberately excluded:

- User accounts or authentication
- Laravel backend or any server-side database
- Cloud synchronization between browsers or devices
- Payments, subscriptions, or usage limits
- AI categorization or recommendations
- Shared/team workspaces
- Browser support beyond Google Chrome
- Full bookmark-folder reorganization
- Broken-link checking
- Automatic deletion of saved links
- Saving live page state, form data, video position, or JavaScript memory
- Mobile application
- Web dashboard

## 6. Target users

### Primary user: multi-project knowledge worker

A developer, designer, researcher, student, founder, or marketer who regularly opens many tabs across several projects and needs a reliable way to pause and resume work.

### Initial niche

Developers and designers who:

- Work across multiple client and personal projects.
- Frequently open documentation, tutorials, inspiration, dashboards, and research.
- Already use browser bookmarks but find them difficult to organize.
- Understand the difference between a temporary work link and a permanent reference.

## 7. Jobs to be done

- When I have too many tabs open, I want to save and close selected tabs so I can focus without losing them.
- When I park tabs, I want to record their project and purpose so I understand them later.
- When a saved link becomes relevant, I want LinkShelf to remind me so it does not disappear into a forgotten list.
- When I resume a project, I want to restore its related tabs quickly.
- When I search for a resource, I want to search parked links and Chrome bookmarks together.
- When I review an old parked link, I want to restore, bookmark, archive, or remove it.
- When the extension changes or loses data, I want a backup I can import.

## 8. MVP scope

**Implementation audit — 2026-08-22:** `[x]` is implemented in the current v0.2 branch. `[ ]` is incomplete, only partially implemented, or still needs verification. Product and growth goals are not treated as implementation checkboxes.

### P0 — required for release

1. [x] Park the current tab.
2. [x] Park selected tabs from the current window.
3. [x] Park all eligible tabs in the current window through **Select all eligible**.
4. [x] Create, rename, and delete projects.
5. [x] Assign and move parked tabs to a project.
6. [x] Add an optional note to a parked item or parking session.
7. [x] Add an optional reminder date and time.
8. [x] Display reminders inside the extension and through a Chrome notification.
9. [x] Restore one parked tab.
10. [x] Restore all parked tabs in a project or parking session, including v0.2 unloaded project restoration.
11. [x] Search parked tabs by title, URL, domain, note, and project.
12. [x] Search native Chrome bookmarks by title and URL in the same search screen.
13. [ ] Detect exact duplicate normalized URLs among parked links and bookmarks. **Partial:** bookmark conversion detects normalized Chrome-bookmark collisions; general parked-link duplicate detection and presentation are not implemented.
14. [x] Convert a parked link into a native Chrome bookmark.
15. [x] Archive and unarchive parked links.
16. [x] Remove individual parked or archived links with confirmation and retain removed-state history.
17. [x] Export all LinkShelf data as versioned, human-readable JSON.
18. [x] Preview, validate, merge, or replace from a valid LinkShelf JSON backup with rollback protection.
19. [x] Store LinkShelf data locally without an account.
20. [x] Explain permissions and local-data behavior during onboarding.

### P1 — include only if P0 is stable

- [x] Keyboard shortcut to park the current tab.
- [ ] Right-click a page or link and park it.
- [ ] Preserve and restore Chrome tab-group name and color when possible. The data model has optional group metadata, but parking and restoration do not capture or recreate groups.
- [ ] Snooze a due reminder.
- [ ] Bulk actions in the review screen.
- [ ] Undo the most recent destructive LinkShelf action during the current session.

## 9. Key user flows

### 9.1 Park the current tab

1. User clicks the extension icon or keyboard shortcut.
2. A quick-save interface shows the current page title and domain.
3. User optionally selects a project, adds a note, and chooses a reminder.
4. User clicks **Park and close**.
5. LinkShelf saves the item locally.
6. Only after a successful save, LinkShelf closes the original tab.
7. A confirmation appears with an Undo option when technically possible.

### 9.2 Park multiple tabs

1. User opens the side panel and selects **Park tabs**.
2. LinkShelf lists eligible tabs in the current window.
3. User selects individual tabs or chooses all.
4. User assigns the selection to an existing or new project.
5. User optionally adds a shared note and reminder.
6. LinkShelf saves every selected tab, verifies the write, then closes them.
7. Tabs that cannot be closed or saved are reported clearly.

### 9.3 Resume a project

1. User opens the side panel.
2. User selects a project.
3. User restores one link or selects **Restore all**.
4. LinkShelf opens the links in the current window.
5. Restored links leave the Parked state and are recorded in recent activity.
6. If the user wants to keep them parked, they can choose **Open a copy** instead.

### 9.4 Review due and old links

1. Chrome triggers a LinkShelf reminder at the selected time.
2. User opens the review screen.
3. Each item offers: **Restore**, **Snooze**, **Bookmark**, **Archive**, or **Remove**.
4. LinkShelf updates the item state and keeps the rest of the queue unchanged.

### 9.5 Search everything

1. User enters a query in the side panel.
2. LinkShelf searches parked, archived, and native bookmark records.
3. Results show their source and status.
4. User can open, restore, bookmark, archive, or reveal a result in its project.

### 9.6 Convert to bookmark

1. User selects **Keep permanently** on a parked item.
2. LinkShelf asks for the destination bookmark folder.
3. LinkShelf detects whether the normalized URL is already bookmarked.
4. If it is a duplicate, LinkShelf offers to open the existing bookmark or keep the parked item.
5. Otherwise, LinkShelf creates the native bookmark and updates/removes the parked record according to the user's choice.

## 10. Functional requirements

### 10.1 Tab eligibility and safety

- [x] The extension must never attempt to park restricted Chrome pages that extensions cannot manage.
- [x] Pinned tabs must be excluded from **Park all** by default.
- [ ] The user may explicitly include pinned tabs through a selection screen. Pinned tabs are currently shown but disabled.
- [x] The active LinkShelf UI tab, if any, must not be closed by a bulk action.
- [x] Tabs must only close after their data has been successfully persisted.
- [x] Before closing a group of tabs, the UI must warn that unsaved page state cannot be restored.
- [x] Failed items must stay open and be reported to the user.

### 10.2 Projects

- [x] Every parked item belongs to one project.
- [x] A default **Inbox** project must always exist and cannot be deleted.
- [ ] A project contains a name, optional description, color, created date, and updated date. **Partial:** the schema supports every field, but the UI only creates and edits project names.
- [x] Deleting a non-empty project requires confirmation and moves its items and sessions to Inbox without deleting them.

### 10.3 Parking sessions

- [x] Tabs parked in one operation share a session record.
- [x] A session stores the project, timestamp, optional note, optional reminder, and source window.
- [x] Users can restore an entire session even when the project contains links from several sessions.

### 10.4 Reminders

- [x] A reminder may belong to a parked item or parking session.
- [x] The service worker schedules reminders with `chrome.alarms`.
- [x] A due reminder creates a Chrome notification when notification permission is granted and notifications are enabled.
- [x] Missed reminders appear as overdue the next time the extension starts.
- [x] Dismissing a notification does not delete or archive the link.

### 10.5 Search

- [x] Search is case-insensitive.
- [x] Search fields include title, full URL, hostname/domain, note, and project name.
- [x] Results indicate **Parked**, **Archived**, or **Bookmark**.
- [x] Search uses substring and token matching without fuzzy or semantic search.
- [x] Repository search stays within the 200 ms budget for a 5,000-link test fixture; the UI uses a 150 ms debounce.

### 10.6 Duplicate detection

- [x] Normalize URLs before comparison.
- [x] Normalization removes fragments, normalizes trailing slashes and hostname casing, and removes configured tracking parameters including `utm_*`.
- [x] LinkShelf does not silently remove duplicates.
- [ ] Duplicate results must show both locations and let the user choose what to keep. **Partial:** bookmark conversion shows and opens an existing Chrome bookmark, but parked-to-parked duplicate review is missing.

### 10.7 Archive and removal

- [x] Archived items remain searchable but are hidden from active project counts by default.
- [ ] Removing one or more items requires confirmation. **Partial:** individual removal is confirmed; bulk removal is not implemented.
- [x] No scheduled process permanently deletes user data in the MVP.

### 10.8 Export and import

- [x] Export produces a human-readable JSON file containing schema version, export timestamp, settings, projects, sessions, links, reminders, and metadata owned by LinkShelf.
- [x] The extension does not export the user's Chrome bookmark tree.
- [x] Import validates size, schema, IDs, relationships, and preview revision before changing local data.
- [x] Import creates a rollback snapshot before writing.
- [x] The user chooses between merging imported data and replacing LinkShelf data after reviewing an impact summary.
- [x] Import never modifies native Chrome bookmarks automatically.

## 11. Information architecture

### Side panel navigation

1. [x] **Today** — due and overdue links
2. [x] **Projects** — Inbox and user-created projects
3. [x] **Search** — unified parked/archive/bookmark search
4. [x] **Review** — parked links needing a decision
5. [x] **Archive** — inactive saved links
6. [x] **Settings** — permissions, export/import, defaults, privacy, and about/feedback

### Popup

The toolbar popup should remain small and action-focused:

- [x] Park current tab
- [ ] Park selected tabs directly in the popup; the popup currently opens the side panel for multi-tab work.
- [ ] Park the current window directly in the popup; **Select all eligible** is available in the side panel.
- [x] Choose project
- [x] Add note
- [x] Set reminder
- [x] Open side panel

The side panel is the primary management interface.

## 12. Data model

All LinkShelf-owned data is stored locally using `chrome.storage.local`. Native bookmarks remain managed by Chrome and are accessed through the Bookmarks API.

### Project

```ts
interface Project {
  id: string;
  name: string;
  description?: string;
  color?: string;
  isInbox: boolean;
  createdAt: string;
  updatedAt: string;
}
```

### Parking session

```ts
interface ParkingSession {
  id: string;
  projectId: string;
  note?: string;
  reminderAt?: string;
  sourceWindowId?: number;
  createdAt: string;
  updatedAt: string;
}
```

### Saved link

```ts
type LinkStatus = "parked" | "archived" | "restored" | "removed";

interface SavedLink {
  id: string;
  sessionId: string;
  projectId: string;
  title: string;
  url: string;
  normalizedUrl: string;
  domain: string;
  faviconUrl?: string;
  note?: string;
  status: LinkStatus;
  pinnedBeforeParking: boolean;
  originalIndex?: number;
  originalGroup?: {
    title?: string;
    color?: string;
  };
  reminderAt?: string;
  createdAt: string;
  updatedAt: string;
  restoredAt?: string;
  archivedAt?: string;
  removedAt?: string;
}
```

### Settings

```ts
interface Settings {
  schemaVersion: number;
  defaultProjectId: string;
  includePinnedTabsByDefault: boolean;
  confirmBeforeBulkClose: boolean;
  notificationsEnabled: boolean;
  defaultRestoreBehavior: "restore-and-remove" | "open-copy";
  trackingParamsToRemove: string[];
}
```

### Storage services

UI components and event handlers must not write directly to `chrome.storage.local`. Use a storage/repository layer that supports:

- [x] Schema validation
- [ ] Schema migrations; schema versioning and limited repair exist, but no general migration pipeline is implemented.
- [x] Atomic-style queued update helpers
- [x] Backup/export/import and rollback
- [x] Test substitution through the storage adapter
- [x] Consistent timestamps and IDs

## 13. Technical requirements

### Recommended implementation stack

- Chrome Extension Manifest V3
- TypeScript
- React for popup and side-panel interfaces
- Vite with a Chrome-extension-compatible build setup
- Tailwind CSS for styling
- Zod or an equivalent schema validator for stored and imported data
- Vitest for unit tests
- Playwright for essential extension flows where practical

The exact framework is not a product requirement. Type safety, maintainability, and a reproducible build are required.

### Extension components

- `manifest.json` — permissions, action, side panel, commands, background worker
- Service worker — alarms, notifications, context menus, commands, tab operations, migrations
- Popup — fast parking actions
- Side panel — projects, search, review, archive, settings
- Shared domain layer — link normalization, duplicate detection, state transitions
- Storage layer — persistent local records and schema migrations

### Initial permissions

Use only permissions needed by implemented features:

- `tabs`
- `storage`
- `bookmarks`
- `alarms`
- `notifications`
- `sidePanel`
- `contextMenus` only if the P1 context-menu feature ships

Avoid broad host permissions in the MVP. The extension does not need to read webpage content.

### Performance and limits

- Parking up to 100 tabs should complete without freezing the UI.
- Project and search screens should remain usable with at least 5,000 saved records.
- Heavy indexing and normalization should not run on every render.
- Service-worker logic must tolerate suspension and must not rely on long-lived global state.
- All timestamps must be stored as ISO 8601 UTC strings and displayed in the user's local timezone.

## 14. Privacy and security requirements

- LinkShelf data remains on the user's device in the MVP.
- No analytics, URLs, titles, notes, bookmarks, or usage data may be sent to a remote server.
- The extension must not inject scripts into webpages.
- The onboarding and privacy policy must explain why tab and bookmark permissions are needed.
- Exported backups may contain sensitive URLs and notes; the export screen must warn the user to store them safely.
- User-entered titles and notes must be rendered as text, never unsanitized HTML.
- Imported files must be size-limited and schema-validated.
- The extension must never execute code contained in imported data.

## 15. UX requirements

- Parking the current tab should take no more than two clicks when using defaults.
- The user should always know whether an item is parked, archived, or a native bookmark.
- Destructive actions must be visually distinct and require confirmation for bulk operations.
- Empty states must explain the next useful action.
- Errors must name what failed and what remained safe/open.
- The interface must support keyboard navigation and visible focus states.
- Color must not be the only way status is communicated.
- The layout must support both left-to-right and right-to-left text content, even if the first interface language is English.

## 16. Acceptance criteria

The MVP is release-ready when all of the following are true:

### Parking and restoration

- [x] A normal webpage can be parked, persisted, and closed.
- [x] If persistence fails, its tab remains open.
- [x] Multiple selected tabs can be parked into one session and project.
- [x] Pinned tabs are excluded from bulk parking by default.
- [x] A parked item, a complete session, and a complete project can be restored.
- [x] Restricted browser pages are skipped with a clear message.

### Organization

- [x] Users can create, rename, and delete projects safely.
- [x] Inbox always exists.
- [x] Users can move items between projects.
- [x] Archived items are hidden from active lists and remain searchable.

### Search and bookmarks

- [x] One query returns matching parked, archived, and native bookmark results.
- [x] Results show their source/status.
- [x] A parked item can become a native bookmark after Chrome-bookmark duplicate checking.
- [ ] Exact normalized duplicates are identified without automatic deletion. **Partial:** Chrome-bookmark collisions are covered; a general parked-link duplicate view is not.

### Reminders

- [x] Reminder records persist locally and future alarms are reconciled after service-worker/browser startup.
- [x] A due reminder appears in Today.
- [x] A Chrome notification is shown when permission/settings allow it.
- [x] Dismissing the notification does not delete the link.

### Data safety

- [x] A complete LinkShelf JSON backup can be exported.
- [x] A valid backup can be previewed, merged, or used to replace LinkShelf data.
- [x] An invalid, conflicting, oversized, or stale-preview backup is rejected without changing existing data.
- [x] No user data is sent over the network.

### Quality

- [x] Core domain and feature functions have unit tests; the current suite has 95 passing tests.
- [ ] Main flows have manual test cases and pass in the current stable Chrome release. The cases are documented, but this PRD does not contain recorded v0.2 pass evidence.
- [ ] The extension contains no known data-loss bug. Automated failure-path coverage passes, but this remains a release verification statement rather than a permanently complete feature.
- [ ] Store listing, permission explanations, and privacy policy match actual behavior. Re-audit the published materials for the v0.2 backup and unloaded-restoration changes before release.

## 17. Success metrics

Because the MVP has no backend, metrics should initially be gathered through opt-in user feedback, Chrome Web Store data, and local diagnostics shown to the user. Do not add remote analytics before a clear consent and privacy design exists.

### Validation metrics

- 100–500 installs during the initial validation period
- At least 30% of installed users still active after four weeks
- At least 40% of active users park tabs weekly
- At least 25% of parked sessions are restored, bookmarked, or archived within 30 days
- Fewer than 2% of reviews mention lost tabs or unreliable restoration
- At least 10 meaningful user interviews or feedback responses

### Key qualitative questions

- Do users understand the difference between Parked and Bookmarked?
- Do reminders help, or do users ignore them?
- Do users organize by project or prefer automatic groupings?
- Which feature would users pay for: sync, backup, automation, history, or collaboration?

## 18. Release plan

### Milestone 1 — foundation

- [x] Project setup and Manifest V3 build
- [ ] Storage schema and migration system. **Partial:** strict versioned schemas and repair logic exist, but there is no general sequential migration runner for future schema versions.
- [x] Service worker and message contracts
- [x] Popup and side-panel shell
- [x] Inbox project creation

### Milestone 2 — core parking

- [x] Park current tab
- [x] Multi-tab selection
- [x] Park all eligible tabs in the current window
- [x] Sessions, projects, notes, and safe closing
- [x] Restore one link, a session, or a project

### Milestone 3 — lifecycle

- [x] Archive, unarchive, and individual remove
- [x] Convert to bookmark
- [x] Unified search
- [ ] Duplicate normalization and detection. **Partial:** normalization and Chrome-bookmark collision detection are complete; general parked-link duplicate review is missing.

### Milestone 4 — reminders and safety

- [x] Alarms and notifications
- [x] Today/review screen
- [x] Versioned export plus previewed Merge/Replace import
- [x] Error handling, import rollback, and partial restoration recovery

### Milestone 5 — release readiness

- [ ] Accessibility review. Keyboard/focus support is implemented in core components, but the full manual accessibility checklist is not recorded as passed.
- [ ] Performance testing with 5,000 records and 100 open tabs. **Partial:** automated 5,000-link search and 100-link restoration tests pass; real-Chrome 100-tab parking/restoration remains manual.
- [ ] Permission and privacy audit for v0.2.
- [x] Store assets, description, onboarding, support pages, and privacy policy were created for the published MVP; update listing copy for v0.2 before submission.
- [ ] Closed beta with 10–20 users.
- [x] Chrome Web Store submission and initial public release, confirmed by the owner.

## 19. Testing strategy

### Unit tests

- [x] URL normalization
- [x] Chrome-bookmark duplicate detection
- [x] Search matching and 5,000-link performance
- [x] Link state transitions
- [x] Project deletion rules
- [ ] Storage migrations; there is no general migration runner yet.
- [x] Import validation, preview, merge, replace, conflict, stale-preview, size-limit, and rollback behavior
- [x] Reminder calculations and alarm reconciliation

### Integration tests

- [x] Park only after successful persistence
- [x] Bulk park with persistence and close failures
- [x] Restore a link, session, small project, and 100-link project
- [x] Create a native bookmark
- [ ] Complete alarm-to-Chrome-notification integration test; scheduling logic is unit tested and the background handler is implemented.
- [ ] Automated service-worker restart and state-recovery test; recovery logic is implemented and covered by the manual plan.

### Manual scenarios

- [ ] Normal HTTP/HTTPS tabs
- [ ] Pinned, audible, discarded, and grouped tabs
- [ ] Incognito behavior according to user-granted extension access
- [ ] Restricted Chrome pages
- [ ] Duplicate URLs with tracking parameters and fragments
- [ ] Browser restart before and after a reminder
- [ ] Thousands of stored links
- [ ] Corrupt and oversized import files
- [ ] Arabic titles, mixed Arabic/English titles, emoji, and long URLs

These scenarios are documented in `docs/manual-test-plan.md`; check them here only after recording real-Chrome pass evidence for the release candidate.

## 20. Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| User loses unsaved page state | High | Warn clearly; never claim to preserve live state; close only after persistence |
| Local extension data is cleared | High | Prominent JSON export/import; later add paid cloud backup |
| Users see it as another OneTab clone | High | Emphasize lifecycle, reminders, review decisions, and unified bookmark search |
| Too many permissions reduce trust | High | Request only required permissions and explain each one |
| Reminders become noisy | Medium | Make reminders optional, user-created, and easy to snooze/disable |
| Saved list becomes new clutter | High | Today and Review queues; archive; lifecycle actions |
| Bookmark access feels sensitive | High | Local-only architecture, clear privacy copy, no remote analytics |
| Service worker is suspended | Medium | Persist state; use alarms/events; do not depend on global memory |
| Scope becomes too large | High | Complete P0 before P1; exclude AI, cloud, teams, and full bookmark cleanup |

## 21. Future roadmap after validation

Future work is not part of the MVP and must be prioritized using real usage and feedback.

### Possible V1.1

- Keyboard shortcuts and context menus
- Better tab-group restoration
- Weekly review summary
- Custom parking presets such as Tomorrow, Next Monday, and In 7 days
- Omnibox search

### Possible paid version

- Account and encrypted cloud backup
- Synchronization across devices
- Unlimited history and recovery
- Advanced reminder and automation rules
- Smart organization suggestions
- Shared team/project workspaces

### Possible later intelligence

- Local or privacy-conscious AI classification
- Suggested project based on domain and title
- Stale-link review suggestions
- Natural-language search

## 22. Open product decisions

These decisions were resolved in the current implementation. They should still be validated with early users:

1. [x] Restoring defaults to marking the item restored; Settings can switch to opening a copy and keeping it parked.
2. [x] Notes are supported on both sessions and saved links; shared notes are displayed beneath their tab cards.
3. [x] A reminder notification is sent once per saved reminder state, while the item remains in Today until resolved.
4. [x] Archived items remain indefinitely; there is no automatic deletion.
5. [x] The popup handles the current tab, while multi-tab selection opens in the side panel.

### Recommended defaults for the MVP

- Restore and remove from Parked, while keeping a lightweight activity record.
- Support session notes and optional per-link notes.
- Keep reminders in Today until the user takes an action.
- Never auto-delete archived items.
- Use the popup for the current tab; use the side panel for multi-tab selection.

## 23. Definition of done

The LinkShelf MVP is done when a user can install it, understand its permissions, safely park and close tabs, organize them by project, receive reminders, search parked links alongside bookmarks, move links through their lifecycle, and export/restore their data—entirely locally and without an account.
