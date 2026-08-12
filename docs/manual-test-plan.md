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
- Reject malformed JSON, wrong schema version, missing references, and a file above 5 MB without changing data.
- Merge a backup twice; matching IDs are skipped and current records remain unchanged.
- Replace current data only after explicit confirmation.
- After merge/replace, verify projects, search, review, reminders, and settings reload correctly.

## Scale and service worker

- Search a fixture containing 5,000 locally stored links and verify responsive updates.
- Park a test window approaching 100 tabs and verify the UI does not freeze.
- Stop the service worker from `chrome://extensions`, then reopen LinkShelf and repeat parking, search, restoration, and reminders.

## Accessibility

- Complete core flows with keyboard only.
- Verify visible focus, logical tab order, form labels, status text, and confirmation dialogs.
- Check 200% zoom, narrow side panel, reduced motion, and high-contrast mode.
