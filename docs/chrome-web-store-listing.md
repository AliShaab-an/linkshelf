# Chrome Web Store listing draft

## Name

LinkShelf

## Summary

Park tabs temporarily, organize them by project, set reminders, and search them alongside Chrome bookmarks.

## Category

Productivity

## Support contact

ali.shaaban2002@gmail.com

## Detailed description

LinkShelf helps you close tabs without losing why they mattered. Park one tab or a selected group, add project context and an optional reminder, then return when the work is relevant again.

Main features:

- Park and safely close the current tab or selected tabs.
- Park the current tab instantly with a customizable keyboard shortcut.
- Organize parked links into projects and parking sessions.
- Add notes and optional reminder dates.
- Restore one link, an entire session, or a complete project.
- Search parked and archived links together with native Chrome bookmarks.
- Convert a parked link into a Chrome bookmark with duplicate protection.
- Review old links and choose to restore, move, bookmark, archive, or remove them.
- Export, validate, merge, and restore local JSON backups.

LinkShelf is local-first. It has no account, advertising, analytics, or remote server. It does not inject scripts into webpages. Your LinkShelf data stays in Chrome storage on your device unless you explicitly export a backup file.

## Single purpose declaration

LinkShelf's single purpose is to help users locally park, organize, revisit, search, and manage the lifecycle of web links they choose.

## Permission justifications

- `tabs`: list user-selected tabs, close them only after safe storage, and restore them later.
- `storage`: persist LinkShelf projects, sessions, links, notes, reminders, settings, and lifecycle state locally.
- `bookmarks`: search native bookmark titles/URLs and create bookmarks explicitly requested by the user.
- `alarms`: schedule user-created reminders in a suspension-safe Manifest V3 service worker.
- `notifications`: display user-created reminders when notification access is granted.
- `sidePanel`: provide the primary LinkShelf management interface.

## Privacy dashboard answers

- Handles web browsing activity: **Yes** — tab and bookmark titles/URLs selected or searched by the user, solely for visible LinkShelf features.
- Handles user-generated content: **Yes** — project names, notes, reminders, and settings stored locally.
- Data sold or transferred: **No**.
- Data used for advertising, creditworthiness, or unrelated purposes: **No**.
- Data transmitted off device: **No**.
- Remote code: **No**.

Keep these answers synchronized with the hosted privacy policy and actual extension behavior.

## Required graphic assets

- Existing 128×128 store icon: `public/icon/128.png`.
- At least one current 1280×800 or 640×400 screenshot. Recommended: popup parking, Projects/sessions, unified Search, Review, and Settings/backup.
- Required 440×280 small promotional tile.
- Optional 1400×560 marquee promotional image.

Use real current UI, avoid unsupported claims, and keep branding consistent.
