# LinkShelf Privacy Policy

Effective date: August 11, 2026

LinkShelf is a local-first Chrome extension whose single purpose is to help users park, organize, revisit, search, and manage the lifecycle of links they choose.

## Data LinkShelf handles

LinkShelf processes the following information only to provide its visible features:

- Titles, URLs, favicons, pin state, and original position of tabs the user chooses to park.
- Project names, notes, reminder dates, and settings entered by the user.
- Titles and URLs from the user's Chrome bookmarks for local search, duplicate detection, and bookmark creation requested by the user.
- Local lifecycle records describing whether a saved link was parked, restored, bookmarked, archived, or removed.

This information may constitute browsing activity and user-generated content under Chrome Web Store policy.

## Local storage and transmission

LinkShelf stores its own data in `chrome.storage.local` on the user's device. LinkShelf does not operate a server and does not transmit browsing activity, bookmarks, notes, reminders, settings, analytics, or other user data to the developer or third parties.

LinkShelf does not sell data, use data for advertising, allow humans to read user data, or use user data for creditworthiness or lending purposes. Its use of information obtained from Chrome APIs complies with the Chrome Web Store User Data Policy, including the Limited Use requirements.

## Chrome permissions

- **Tabs:** read tabs selected by the user, close them after successful storage, and restore them later.
- **Bookmarks:** search bookmark titles and URLs and create a bookmark when explicitly requested.
- **Storage:** keep LinkShelf projects, links, sessions, reminders, settings, and lifecycle history locally.
- **Alarms and notifications:** schedule and display reminders created by the user.
- **Side panel and active tab:** provide the extension interface and current-tab parking workflow.

LinkShelf does not request broad website host access and does not inject scripts into webpages.

## Export, import, retention, and deletion

Users can export LinkShelf-owned data to a JSON file. Exported files may contain sensitive URLs and notes and are controlled by the user after download. Import reads only a file explicitly selected by the user, validates it before writing, and never modifies native Chrome bookmarks.

Data remains on the device until the user changes or removes records, replaces data through a confirmed import, clears the extension's storage, or uninstalls the extension. Removed links retain a lightweight local lifecycle record; users can clear all extension data through Chrome's extension controls.

## Security

LinkShelf validates stored and imported data against a strict schema. Tabs close only after successful persistence. Import uses validation and rollback protection. Because LinkShelf sends no user data over a network, there is no extension-operated data transmission to encrypt.

## Changes

Material changes to these practices will be disclosed in the extension and this policy before updated data handling begins.

## Contact

For privacy questions, support requests, or data-handling concerns, contact **ali.shaaban2002@gmail.com**.
