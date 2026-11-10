# LinkShelf Privacy Policy

Effective date: November 10, 2026

LinkShelf is a local-first Chrome extension whose single purpose is to help users park, organize, revisit, search, and manage the lifecycle of links they choose.

## Data LinkShelf handles

LinkShelf processes the following information only to provide its visible features:

- Titles, URLs, favicons, pin state, and original position of tabs the user chooses to park.
- Project names, notes, reminder dates, and settings entered by the user.
- Titles and URLs from the user's Chrome bookmarks for local search, duplicate detection, and bookmark creation requested by the user.
- Local lifecycle records describing whether a saved link was parked, restored, bookmarked, archived, or removed.

This information may constitute browsing activity and user-generated content under Chrome Web Store policy.

## Local storage and transmission

LinkShelf stores its own database in `chrome.storage.local` on the user's device. LinkShelf has no developer-operated backend, telemetry, analytics, or remote logging, and does not upload the database to the developer.

Saved-link cards can load the favicon URL captured from a parked tab or included in an imported backup. When that URL points to a remote image host, the browser requests the image from that host, which receives the requested URL, IP address, and ordinary network metadata. Opening a saved link also contacts its website at the user's request. These requests are separate from local database storage.

LinkShelf does not sell data, use data for advertising, allow humans to read user data, or use user data for creditworthiness or lending purposes. Its use of information obtained from Chrome APIs complies with the Chrome Web Store User Data Policy, including the Limited Use requirements.

## Chrome permissions

- **Tabs:** read tabs selected by the user, close them after successful storage, and restore them later.
- **Bookmarks:** search bookmark titles and URLs and create a bookmark when explicitly requested.
- **Storage:** keep LinkShelf projects, links, sessions, reminders, settings, and lifecycle history locally.
- **Alarms and notifications:** schedule and display reminders created by the user.
- **Side panel:** provide the extension interface. Current-tab parking uses the existing Tabs permission; LinkShelf does not request `activeTab`.

LinkShelf does not request broad website host access and does not inject scripts into webpages.

## Export, import, retention, and deletion

Users can export LinkShelf-owned data to a JSON file. Exported files may contain sensitive URLs and notes and are controlled by the user after download. Import reads only a file explicitly selected by the user, validates it before writing, and never modifies native Chrome bookmarks.

Data remains on the device until the user changes or removes records, replaces data through a confirmed import, clears the extension's storage, or uninstalls the extension. Removed links retain a lightweight local lifecycle record; users can clear all extension data through Chrome's extension controls.

## Security

LinkShelf validates stored and imported data against a strict schema. Tabs close only after successful persistence. Import uses validation and rollback protection. The local database is not encrypted by LinkShelf. Exported backups and raw recovery files can contain sensitive browsing information and should be stored securely.

## Changes

Material changes to these practices will be disclosed in the extension and this policy before updated data handling begins.

## Contact

For privacy questions, support requests, or data-handling concerns, contact **ali.shaaban2002@gmail.com**.
