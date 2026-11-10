# LinkShelf release manual test plan

Record Chrome version, operating system, build version, date, tester, and pass/fail evidence.

## Installation and disclosure

- Fresh install opens onboarding once; extension update/reload does not reopen it.
- Disclosure accurately explains local tab, bookmark, note, reminder, and permission handling.
- Onboarding button opens the side panel; toolbar popup remains usable.

## Parking safety

- Use the assigned keyboard shortcut (`Alt+Shift+P` by default; `Command+Shift+P` on macOS) on a normal tab; verify it parks into the configured default project, closes only after storage succeeds, and shows confirmation.
- Change or remove the shortcut at `chrome://extensions/shortcuts`; verify Settings displays the assigned value or “Not assigned”.
- Park a normal HTTP and HTTPS tab; verify storage succeeds before the tab closes.
- Park selected tabs and all eligible tabs into one session.
- Verify pinned and restricted `chrome://` tabs remain open and are clearly reported.
- Test audible, discarded, grouped, long-title, emoji, Arabic, and mixed Arabic/English tabs.
- Confirm the bulk warning explains that live form/page state is not preserved.

## Projects and restoration

- Create and rename a project; duplicate names are rejected.
- Delete a non-empty project; records move safely to Inbox and Inbox cannot be deleted.
- Move one parked link between projects without moving the rest of its original session.
- Restore one link, a complete parking session, and a complete project.

## Lifecycle, search, and bookmarks

- Archive, unarchive, and remove with confirmation.
- Review queue is oldest-first and each successful decision updates immediately.
- Search title, URL, domain, note, project, archived items, and Chrome bookmarks.
- Convert a parked link to a selected bookmark folder.
- Confirm tracking parameters, fragments, hostname casing, and trailing slashes trigger duplicate protection.

## Reminders and restart recovery

- Create a future reminder; restart Chrome; verify the alarm survives.
- Verify due and missed reminders appear in Today.
- Verify Chrome notification behavior with notifications enabled and disabled.
- Dismiss a notification and confirm the link is not deleted or archived.

## Backup and recovery

- Export and inspect readable JSON; confirm Chrome's complete bookmark tree is absent.
- Reject malformed JSON, unsupported schema versions, missing references, and a file above 32 MiB without changing data. Files below this safety bound must still fit Chrome's available storage quota.
- Reject duplicate IDs and inconsistent link/session project relationships without changing data.
- Preview Merge and verify the exact add/skip counts before confirmation; current settings must remain unchanged.
- Preview Replace and verify the dialog shows the exact current project, session, and link counts being replaced.
- Change LinkShelf data after opening a preview; confirmation must be rejected as stale without overwriting the newer data.
- Merge a backup twice; matching IDs are skipped and current records remain unchanged.
- Replace current data only after explicit confirmation.
- After merge/replace, verify projects, search, review, reminders, and settings reload correctly.

## v0.2 restoration

- Restore a three-tab project normally and verify the visible restore-list order is preserved in one Chrome window.
- Restore a project unloaded and verify successfully discarded tabs remain visible, report `discarded`, and reload when activated.
- Exercise or simulate one discard failure and verify that tab stays open normally while the rest continue restoring.
- Exercise one tab-creation failure and verify its saved record remains parked.
- Restore at least 100 saved tabs in both modes and verify ordering, completion messaging, and side-panel responsiveness.
- Select **Keep it parked**, then restore from Projects, Today, Review, and Search; opened copies must not remove their cards.
- Select **Mark it restored** and verify successful restores leave the active parked list while failed opens stay parked.
- Verify long notes show two lines with accessible Show more/Show less controls and shared notes are not duplicated in session headers.

## v0.2 shortcuts and large-project UI

- Verify `Alt+Shift+L` opens LinkShelf, closes it after Chrome reports it open, and safely opens it after restarting the service worker.
- Verify `Alt+Shift+F` opens Search in the originating Chrome window and focuses the query field.
- Verify `Alt+Shift+T` opens Today in the originating Chrome window.
- Open LinkShelf in two windows and verify a Search or Today command changes only the originating window.
- Confirm Settings lists all four assigned shortcuts and opens `chrome://extensions/shortcuts`.
- Verify the last side-panel section, selected project, session order, and expanded sessions survive closing and reopening the panel.
- Verify project filtering matches titles, URLs, domains, link notes, and shared session notes without changing saved records.
- Verify the newest session starts expanded, older sessions start collapsed, and collapsed sessions do not create tab cards.
- Expand a 60-tab session and verify it shows 25, then 50, then all 60 links in original order.
- Switch between comfortable and compact density from both Quick settings and the project toolbar.
- Test the sticky toolbar, controls, counts, and restoration dialog in a narrow panel and at 200% zoom.
- Load a version 1 stored database and version 1 backup; verify both migrate to schema version 2 with comfortable density and normal restoration defaults.

## Scale and service worker

- Search a fixture containing 5,000 locally stored links and verify responsive updates.
- Park a test window approaching 100 tabs and verify the UI does not freeze.
- Stop the service worker from `chrome://extensions`, then reopen LinkShelf and repeat parking, search, restoration, and reminders.

## Accessibility

- Complete core flows with keyboard only.
- Verify visible focus, logical tab order, form labels, status text, and confirmation dialogs.
- Check 200% zoom, narrow side panel, reduced motion, and high-contrast mode.
