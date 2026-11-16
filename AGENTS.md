# LinkShelf repository instructions

LinkShelf is a local-first Chrome MV3 extension (WXT, React, TypeScript, Zod). `v0.3` is the integration branch. Work on a new branch from the latest accepted `v0.3` for each approved phase; never edit `main`, `v0.2`, `v0.3`, or `experiment/ui-redesign` directly. Inspect Git status before switching branches and preserve unrelated changes.

For any LinkShelf phase implementation, review, regression fix, or PR preparation, use the `$linkshelf-phase-workflow` skill. Consult the Phase 3 roadmap and past reports in Git history when relevant. The `0.3.0` release merge commit `49ccf52` contains those documents.

Product decisions: keep the sidebar independently usable. Do not adopt or copy implementation/styling from the declined `experiment/ui-redesign` branch. A Manager page is not approved. Build changes on current stable components and contracts.

Protect existing behavior: local-only data; validated storage writes, rollback and recovery; safe tab selection and save-before-close; truthful partial outcomes; worker-owned browser operations and target-window coordination; reminder reconciliation; Search cursors and independent 25-record categories; bounded Archive/Search DOM; two-candidate verified restoration checkpoints. Do not casually change schemas, permissions, backups, extension version, or dependencies.

Use synthetic fixtures and disposable Chrome profiles for tests. Do not use real browsing data, publish the extension, or claim unperformed manual verification.

Default authorization for a phase request is **implement, verify, and report locally**. Do not commit, push, create a PR, merge, or publish unless the user explicitly asks for that action. If asked to finalize a phase, commit/push/create its PR but do not merge without separate approval.
