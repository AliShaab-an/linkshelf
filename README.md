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
npm run verify
npm run test:integration
npm run zip
npm run check:package
```

Run `npm run test:native` after building to test Chrome behavior with disposable profiles. Packaging creates a local ZIP in `.output/`.

LinkShelf uses Manifest V3, React, TypeScript, Tailwind CSS, Zod, Vitest, and WXT. It has no backend, analytics, or content script. Saved-link favicons can load from their original image hosts. [Privacy policy](docs/privacy-policy.html) · [Support](docs/support.html)
