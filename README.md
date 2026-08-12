# LinkShelf

LinkShelf is a local-first Chrome extension for parking tabs temporarily, organizing them by project, receiving reminders, searching them alongside Chrome bookmarks, and deciding whether to restore, bookmark, archive, or remove each link.

## Development

```bash
npm install
npm run dev
```

Load `.output/chrome-mv3` as an unpacked extension from `chrome://extensions`.

## Verification and release

```bash
npm run compile
npm test
npm run build
npm run zip
```

LinkShelf uses Manifest V3, React, TypeScript, Tailwind CSS, Zod, Vitest, and WXT. It has no backend, analytics, content script, or remote data transmission.

Release materials are in [`docs/`](docs/):

- `privacy-policy.md`
- `chrome-web-store-listing.md`
- `manual-test-plan.md`
- `release-checklist.md`
