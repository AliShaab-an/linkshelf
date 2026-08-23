# LinkShelf v0.2 — Data Trust and Low-Memory Restoration

**Product:** LinkShelf Chrome extension  
**Version:** 0.2.0  
**Status:** Implemented for verification  
**Date:** 2026-08-22

## Summary

Version 0.2 focuses on data safety, restoring large projects without keeping every page in memory, and making the side panel efficient for daily use. It deliberately avoids a separate full-page manager, accounts, cloud synchronization, analytics, AI, collaboration, and other unrelated expansion while the product has a small early-user base.

## Backup and recovery

- Export every LinkShelf-owned project, parking session, link state, note, reminder, setting, timestamp, and metadata field in the human-readable version-2 JSON format, while accepting and migrating version-1 backups.
- Do not export or modify the user's native Chrome bookmark tree.
- Accept files up to 5 MB and validate the strict schema, version, unique IDs, Inbox/default-project rules, references, and link/session project consistency before offering import actions.
- Show the backup timestamp and counts for projects, sessions, links, notes, and reminders.
- Let the user preview either Merge or Replace before changing storage.
- Merge adds new records, skips matching IDs, preserves current settings, and blocks conflicting record relationships.
- Replace shows the exact current project, session, and link counts being replaced, imports backup settings, and requires a second destructive confirmation.
- Bind each confirmation to the current database revision. If data changes after preview, cancel the import and require another preview.
- Never write on parse, size, schema, relationship, conflict, or stale-preview failure.
- Keep a rollback snapshot and restore it when a storage write fails. Reschedule reminder alarms only after a successful import.

## Project restoration

- A project's Restore all confirmation offers **Restore normally** and **Restore unloaded**.
- Both modes create inactive tabs sequentially in one captured Chrome window.
- Sessions are restored in the order shown in the project screen, and links within a session retain their saved `originalIndex` order.
- Unloaded mode calls `chrome.tabs.discard` for every newly created tab. A discarded tab remains in the tab strip and reloads when activated.
- If Chrome cannot discard a tab, leave it open normally, continue restoring the project, and report the fallback.
- A tab-creation failure leaves that saved link parked and reports partial success.
- Preserve project and session association in parked copies and restored history.
- Apply the Settings preference consistently:
  - **Mark it restored:** successful tabs leave the active parked list.
  - **Keep it parked:** opening creates copies and does not change saved records.
- Because Chrome receives the URL before the discard call, unloaded restoration minimizes retained memory but cannot guarantee that no initial network request begins.

## Restore-list notes

- Show the effective link or shared session note immediately beneath each tab card.
- Clamp notes to two lines by default.
- Show keyboard-accessible **Show more** and **Show less** controls only when a note overflows.
- Do not repeat the same shared note in both the session header and every tab card.

## Side-panel usability

- Provide shortcuts for parking the current tab, opening or closing LinkShelf, opening Search, and opening Today.
- Route Search and Today commands to the originating Chrome window and focus Search when requested.
- Fall back to opening the panel when older Chrome versions cannot reliably report whether it is already open.
- Keep the side panel as the only manager in v0.2 and provide quick preferences in its header.
- Add a sticky project toolbar with filtering, session order, density, counts, and expand/collapse controls.
- Keep older sessions collapsed and render expanded sessions in batches of 25 links.
- Persist durable display and restore preferences in backups; persist convenience navigation state separately.

## Feedback and release validation

- Settings includes direct email feedback and GitHub issue actions.
- LinkShelf continues to send no analytics, URLs, titles, notes, or usage data to a server.
- Invite the Reddit commenter and reachable early users to test backup recovery and unloaded restoration.
- Before planning v0.3, complete at least three early-user conversations and three real-browser unloaded-restore tests.

## Acceptance criteria

- A v0.1 backup can be previewed and merged or replaced in v0.2.
- Invalid or stale imports cause zero storage writes.
- Replace cannot run without a current preview and explicit confirmation.
- A three-tab project and a 100-tab project restore in deterministic order.
- Discard failures fall back to normal tabs without losing or misreporting saved records.
- Open-copy behavior keeps cards visible in Projects, Today, Review, and Search.
- Type checking, unit tests, and the production build pass before packaging.
