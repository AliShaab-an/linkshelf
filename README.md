# LinkShelf

LinkShelf is a local-first Chrome extension for parking tabs temporarily, organizing them by project, receiving reminders, searching them alongside Chrome bookmarks, and deciding whether to restore, bookmark, archive, or remove each link.

## Development

```bash
npm install
npm run dev
```

Load `.output/chrome-mv3` as an unpacked extension from `chrome://extensions`.

### Account features with a local backend

Accounts are hidden unless the build knows the backend address.

1. Copy `.env.example` to `.env.development` (ignored by Git). It points at `https://linkshelf-backend.test`.
2. Run `npm run dev`, or `npm run build:dev` and load `.output/chrome-mv3-dev` unpacked.
3. Open the Manager › Settings › Account.

Development builds use a fixed key, so their ID is always `chlfgppaffnmojfjkdaidgoicejmfhmi`; the backend must allow `chrome-extension://chlfgppaffnmojfjkdaidgoicejmfhmi` in `LINKSHELF_EXTENSION_ORIGINS`. Release builds (`npm run build`, `npm run zip`) contain neither the key nor a backend address.

## Verification and release

```bash
npm run verify
npm run test:integration
npm run zip
npm run check:package
```

Run `npm run test:native` after building to test Chrome behavior with disposable profiles. Packaging creates a local ZIP in `.output/`.

LinkShelf uses Manifest V3, React, TypeScript, Tailwind CSS, Zod, Vitest, and WXT. It has no backend, analytics, or content script. Saved-link favicons can load from their original image hosts. [Privacy policy](docs/privacy-policy.html) · [Support](docs/support.html)
