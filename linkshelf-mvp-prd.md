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

### P0 — required for release

1. Park the current tab.
2. Park selected tabs from the current window.
3. Park all eligible tabs in the current window.
4. Create, rename, and delete projects.
5. Assign parked tabs to a project.
6. Add an optional note to a parked item or parking session.
7. Add an optional reminder date and time.
8. Display reminders inside the extension and through a Chrome notification.
9. Restore one parked tab.
10. Restore all parked tabs in a project or parking session.
11. Search parked tabs by title, URL, domain, note, and project.
12. Search native Chrome bookmarks by title and URL in the same search screen.
13. Detect exact duplicate normalized URLs among parked links and bookmarks.
14. Convert a parked link into a native Chrome bookmark.
15. Archive and unarchive parked links.
16. Remove parked links with confirmation.
17. Export all LinkShelf data as JSON.
18. Import a valid LinkShelf JSON backup.
19. Store LinkShelf data locally without an account.
20. Explain permissions and local-data behavior during onboarding.

### P1 — include only if P0 is stable

- Keyboard shortcut to park the current tab.
- Right-click a page or link and park it.
- Preserve and restore Chrome tab-group name and color when possible.
- Snooze a due reminder.
- Bulk actions in the review screen.
- Undo the most recent destructive LinkShelf action during the current session.

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

- The extension must never attempt to park restricted Chrome pages that extensions cannot manage.
- Pinned tabs must be excluded from **Park all** by default.
- The user may explicitly include pinned tabs through a selection screen.
- The active LinkShelf UI tab, if any, must not be closed by a bulk action.
- Tabs must only close after their data has been successfully persisted.
- Before closing a group of tabs, the UI must warn that unsaved page state cannot be restored.
- Failed items must stay open and be reported to the user.

### 10.2 Projects

- Every parked item belongs to one project.
- A default **Inbox** project must always exist and cannot be deleted.
- A project contains a name, optional description, color, created date, and updated date.
- Deleting a non-empty project must require the user to move its items to Inbox or confirm item removal.

### 10.3 Parking sessions

- Tabs parked in one operation should share a session record.
- A session stores the project, timestamp, optional note, optional reminder, and source window.
- Users can restore an entire session even when the project contains links from several sessions.

### 10.4 Reminders

- A reminder may belong to a parked item or parking session.
- The service worker must schedule reminders with `chrome.alarms`.
- A due reminder must create a Chrome notification when notification permission is granted.
- Missed reminders must appear as overdue the next time the extension starts.
- Dismissing a notification must not delete or archive the link.

### 10.5 Search

- Search should be case-insensitive.
- Search fields: title, full URL, hostname/domain, note, and project name.
- Results must indicate **Parked**, **Archived**, or **Bookmark**.
- The first MVP may use simple substring and token matching; fuzzy or semantic search is not required.
- Search results should update within 200 ms for a collection of up to 5,000 locally indexed links on a typical desktop.

### 10.6 Duplicate detection

- Normalize URLs before comparison.
- At minimum, normalization should remove fragments, normalize trailing slashes, normalize hostname casing, and remove known tracking parameters such as `utm_*`.
- LinkShelf must not silently remove duplicates.
- Duplicate results must show both locations and let the user choose what to keep.

### 10.7 Archive and removal

- Archived items remain searchable but are hidden from active project counts by default.
- Removing one or more items requires confirmation.
- No scheduled process may permanently delete user data in the MVP.

### 10.8 Export and import

- Export must produce a human-readable JSON file containing schema version, export timestamp, settings, projects, sessions, links, reminders, and metadata owned by LinkShelf.
- The extension must not export the user's entire bookmark tree unless explicitly selected in a future feature.
- Import must validate the schema before changing local data.
- Before import, the extension must create an in-memory or local rollback snapshot.
- The user must choose between merging imported data and replacing LinkShelf data.
- Import must never modify native Chrome bookmarks automatically.

## 11. Information architecture

### Side panel navigation

1. **Today** — due and overdue links
2. **Projects** — Inbox and user-created projects
3. **Search** — unified parked/archive/bookmark search
4. **Review** — parked links needing a decision
5. **Archive** — inactive saved links
6. **Settings** — permissions, export/import, defaults, privacy, and about

### Popup

The toolbar popup should remain small and action-focused:

- Park current tab
- Park selected tabs
- Park current window
- Choose project
- Add note
- Set reminder
- Open side panel

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

- Schema validation
- Schema migrations
- Atomic-style update helpers
- Backup/export
- Test substitution
- Consistent timestamps and IDs

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

- A normal webpage can be parked, persisted, and closed.
- If persistence fails, its tab remains open.
- Multiple selected tabs can be parked into one session and project.
- Pinned tabs are excluded from bulk parking by default.
- A parked item and a complete session can be restored.
- Restricted browser pages are skipped with a clear message.

### Organization

- Users can create, edit, and delete projects safely.
- Inbox always exists.
- Users can move items between projects.
- Archived items are hidden from active lists and remain searchable.

### Search and bookmarks

- One query returns matching parked, archived, and native bookmark results.
- Results show their source/status.
- A parked item can become a native bookmark after duplicate checking.
- Exact normalized duplicates are identified without automatic deletion.

### Reminders

- A reminder survives browser restart.
- A due reminder appears in Today.
- A Chrome notification is shown when permission/settings allow it.
- Dismissing the notification does not delete the link.

### Data safety

- A complete LinkShelf JSON backup can be exported.
- A valid backup can be merged or restored.
- An invalid backup is rejected without changing existing data.
- No user data is sent over the network.

### Quality

- Core domain functions have unit tests.
- Main flows have manual test cases and pass in the current stable Chrome release.
- The extension contains no known data-loss bug.
- Store listing, permission explanations, and privacy policy match actual behavior.

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

- Project setup and Manifest V3 build
- Storage schema and migration system
- Service worker and message contracts
- Popup and side-panel shell
- Inbox project creation

### Milestone 2 — core parking

- Park current tab
- Multi-tab selection
- Park current window
- Sessions, projects, notes, and safe closing
- Restore one or all

### Milestone 3 — lifecycle

- Archive and remove
- Convert to bookmark
- Unified search
- Duplicate normalization and detection

### Milestone 4 — reminders and safety

- Alarms and notifications
- Today/review screen
- Export/import
- Error handling and recovery

### Milestone 5 — release readiness

- Accessibility review
- Performance testing with 5,000 records and 100 open tabs
- Permission and privacy audit
- Store assets, description, onboarding, and privacy policy
- Closed beta with 10–20 users
- Chrome Web Store submission

## 19. Testing strategy

### Unit tests

- URL normalization
- Duplicate detection
- Search matching
- Link state transitions
- Project deletion rules
- Storage migrations
- Import validation and merge behavior
- Reminder calculations

### Integration tests

- Park only after successful persistence
- Bulk park with partial failure
- Restore a session
- Create a native bookmark
- Alarm-to-notification flow
- Service-worker restart and state recovery

### Manual scenarios

- Normal HTTP/HTTPS tabs
- Pinned, audible, discarded, and grouped tabs
- Incognito behavior according to user-granted extension access
- Restricted Chrome pages
- Duplicate URLs with tracking parameters and fragments
- Browser restart before and after a reminder
- Thousands of stored links
- Corrupt and oversized import files
- Arabic titles, mixed Arabic/English titles, emoji, and long URLs

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

These decisions should be tested during implementation or beta:

1. Should restoring remove the parked item by default, or open a copy and keep it parked?
2. Should notes belong primarily to individual links, sessions, or both?
3. Should a reminder notify once, or remain in Today until resolved?
4. Should archived items remain indefinitely, or should the product later offer an optional cleanup review?
5. Should the popup include multi-tab selection, or should that always open the side panel?

### Recommended defaults for the MVP

- Restore and remove from Parked, while keeping a lightweight activity record.
- Support session notes and optional per-link notes.
- Keep reminders in Today until the user takes an action.
- Never auto-delete archived items.
- Use the popup for the current tab; use the side panel for multi-tab selection.

## 23. Definition of done

The LinkShelf MVP is done when a user can install it, understand its permissions, safely park and close tabs, organize them by project, receive reminders, search parked links alongside bookmarks, move links through their lifecycle, and export/restore their data—entirely locally and without an account.

