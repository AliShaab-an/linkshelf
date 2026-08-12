# LinkShelf release checklist

## Blocking before submission

- [x] Add a monitored support contact to the privacy policy: `ali.shaaban2002@gmail.com`.
- [ ] Host the privacy policy at a stable public HTTPS URL and enter it in the Developer Dashboard.
- [ ] Complete every scenario in `manual-test-plan.md` on the current stable Chrome release.
- [ ] Capture at least one accurate 1280×800 or 640×400 screenshot; five are recommended.
- [ ] Create the required 440×280 small promotional tile.
- [ ] Ensure Store Privacy answers exactly match `privacy-policy.md` and extension behavior.
- [ ] Create the release ZIP with `npm run zip` and verify `manifest.json` is at its root.
- [ ] Upload first as Private/Trusted testers or Unlisted for a 10–20 person closed beta.

## Package review

- [ ] Manifest name, description, version, icons, permissions, action, side panel, and service worker are correct.
- [ ] No content script, broad host permission, remote code, analytics, secret, source map, or development-only file ships.
- [ ] `npm run compile`, `npm test`, `npm run build`, and `npm run zip` pass from a clean installation.
- [ ] The extension has one clear purpose and every requested permission supports a currently shipped feature.

## Developer Dashboard

- [ ] Register and verify the publisher account.
- [ ] Upload the ZIP and complete Listing, Privacy, Distribution, and Test Instructions tabs.
- [ ] Paste the reviewed listing copy and permission justifications.
- [ ] Provide support and privacy URLs.
- [ ] Choose deferred publishing for the first review so final smoke testing can happen before public release.
