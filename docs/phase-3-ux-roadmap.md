# LinkShelf v0.3 UX roadmap

Use [the Phase 3.1 audit](../PHASE_3_1_UX_AUDIT_REPORT.md) for evidence, the comparison with `experiment/ui-redesign`, and product decisions. Implement each phase as a separate reviewable PR from the current stable `v0.3` after the previous phase is accepted.

Sidebar-first is approved. Keep the sidebar independently usable. A Manager is outside Phases 3.2–3.6 and can be reconsidered only in a separately approved future project with a concrete user task.

Stable `v0.3` is authoritative. The experimental redesign was evaluated and declined. Its branch is historical research and its code, styling, and overall layout are excluded from production implementation. Merging or cherry-picking experimental commits is outside scope. Evaluate concepts such as visible parking actions, clearer confirmation, a saved-session handoff, discoverable destinations, and clearer action labels individually. Design approved concepts using stable components and contracts. Proposed implementations in this roadmap are candidates for review within their respective phases.

Throughout Phase 3, preserve the Phase 1 and 2 operation contracts and local-only data model. Keep browser mutations in their existing worker paths, including safe parking and closure, operation coordination, and truthful partial results. Preserve validation, verified writes and recovery, reminder reconciliation, search pagination and cursor invalidation, bounded Archive and Search rendering, and verified restoration checkpoints. Use the [native test instructions](testing.md) and [performance procedure](performance-testing.md). Test with disposable profiles and synthetic fixtures.

## Phase 3.2 · Accessibility and interaction foundations

| Field | Scope |
| --- | --- |
| Goal and user problem | Keep keyboard users in the active dialog and make completion, cancellation and partial results easy to distinguish. Addresses UX-01, UX-09 and UX-13. |
| Included | Shared Modal, Remove/Move/Bookmark dialogs, affected focus callers, card action keyboard behavior and feedback. Audit inline backup and project confirmations for correct semantics. |
| Proposed implementation | Evaluate native modal semantics and browser-managed inertness. Verify containment, intentional initial focus, one active dialog, controlled Escape and backdrop behavior, and logical return focus after list changes. Use a correctly labeled disclosure or implement menu keyboard behavior for card overflow. Make pending, success, partial completion and failure accessible. Review inline project and backup confirmation semantics. |
| Exclusions | Navigation, Manager, parking steps, worker behavior, and broad visual restyling. |
| Acceptance | Tab and Shift+Tab stay in the active dialog; background cannot be acted on; cancellation, Escape and success return focus logically; disconnected, hidden and disabled controls are handled; operation warnings remain actionable. |
| Required tests | Chrome keyboard boundaries, no eligible controls, pending states, outside clicks, two open attempts, unmount, focus after row removal, scroll/zoom and accessible names. Include screen-reader and docked checks. Run existing Search, Archive, backup and recovery tests for any affected caller. |
| Dependencies and risks | Stable v0.3 and Phase 3.1 review. Shared primitive affects multiple flows and focus behavior under async updates. |

## Phase 3.3 · Navigation and workspace architecture

| Field | Scope |
| --- | --- |
| Goal and user problem | Make common destinations discoverable at narrow widths and preserve task context. Addresses UX-03, UX-06 and UX-08. |
| Included | App shell, section navigation, Quick settings entry, UI state, popup/sidebar handoff, and window-scoped keyboard intents. |
| Proposed implementation | Evaluate direct access to Park, Search, and saved projects, plus a visible due affordance and labeled access to secondary sections. Keep existing section IDs compatible and define focus on entry and return. Decide navigation labels, first-launch behavior, and whether Search state persists across navigation before implementation. |
| Exclusions | Rewriting Projects, Search, or Archive. Manager design and implementation. |
| Acceptance | Primary actions are visible and keyboard reachable at 320 px and zoom. Secondary features remain reachable. Reopen retains supported state, stale intents cannot hijack another window, and command Search focuses the input. |
| Required tests | Fresh/existing/malformed UI state, window-scoped intents and command entry, section focus order, multiple windows, widths 320/400/600/800, 200% zoom, and recovery gate. |
| Dependencies and risks | Phase 3.2 focus foundations and approval of labels/defaults. Shared local preference patches can race across documents, while changing section IDs can orphan persisted preferences. |

## Phase 3.4 · Tab parking experience

| Field | Scope |
| --- | --- |
| Goal and user problem | Make selecting and parking a few tabs obvious even in a crowded window. Addresses UX-02 and UX-05. |
| Included | ParkTabsSection, visible selection and action footer, review, optional note/reminder, and post-save session handoff. |
| Proposed implementation | Keep the selected count and next action visible. Show destination and consequences before the save-and-close commit. Allow going back without losing inputs. After confirmed persistence, offer the resulting session and report closures separately. |
| Exclusions | Popup redesign, new parking modes, relaxed eligibility, closing before persistence, or automatic retry of uncertain closures. |
| Acceptance | At 320 px with a long list, choose exactly three, enter optional details, review and confirm without hunting for the next action. Cancel safely. On partial closure, communicate saved and closure outcomes distinctly and leave changed/unreadable tabs alone. |
| Required tests | Fresh and multi-project fixtures, selection keyboard flow, review Back, disabled/restricted/pinned tabs, source window, write and close failure, reminders/time conversion, result focus and saved-session lookup. Run native general and operation integration suites. |
| Dependencies and risks | Phase 3.2 feedback and Phase 3.3 destination routing. Sticky controls may hide content at zoom, and stale selection may target the wrong tab if stable identity checks are bypassed. |

## Phase 3.5 · Saved links experience

| Field | Scope |
| --- | --- |
| Goal and user problem | Reduce scanning and make per-link and collection actions consistent in large libraries. Addresses UX-04, UX-06, UX-07 and UX-10. |
| Included | Projects/session presentation, SavedLinkCard, Search and Archive action language, Review and Today card consistency where needed. |
| Proposed implementation | Separate browsing controls from project edits. Show effective restoration scope and preferences. Distinguish bookmarked, archived and parked results. Reuse existing bounded list controls and stable IDs. Profile Review and Projects before expanding their rendering scope. |
| Exclusions | Search ranking/index, backup or schema changes, worker restoration changes, and silently introducing a new per-operation restore preference. |
| Acceptance | Users can find and act on each record with consistent labels and scope. Project deletion preserves Inbox semantics. Search and Archive retain independent counts, bounded mounts, complete reachability, focus and invalidation behavior. |
| Required tests | Native Search, Rendering, and Bulk Restoration suites, project management, stale/expired cursor, all continuation records, duplicate URLs, long titles and notes, partially opened/restored collections, and multi-document refresh. |
| Dependencies and risks | Approved navigation and action vocabulary. Large mounts and accidental changes to search/restore semantics are high-risk. |

## Phase 3.6 · Responsive polish and release verification

| Field | Scope |
| --- | --- |
| Goal and user problem | Make the shipped surfaces consistent, readable and resilient across narrow and wide layouts. Addresses UX-11, UX-14 and outstanding accessibility checks. |
| Included | Spacing, typography, state hierarchy, action labels, long content, responsive layouts and end-to-end regression verification. |
| Proposed implementation | Tune density using actual tasks and keep visible focus, status and action hierarchy. Review contrast and reduced motion, repeat docked and assistive-technology checks, and compare performance with a compatible Phase 2 baseline. |
| Exclusions | New features, premium/backend work, unbounded rendering, fixed timing CI gates, or publication. |
| Acceptance | Core flows remain usable at 320/400/600/800 and 200% zoom. Confirm operation invariants and review compatible timing deviations alongside deterministic counts. |
| Required tests | `npm run verify`, integration, four native suites, docked and screen-reader walkthrough, package checks, and smoke/full benchmark comparison as appropriate. |
| Dependencies and risks | Phases 3.2–3.5 accepted. Cosmetic changes can reduce contrast, hide focus or shift layout. Benchmark clocks and environment must be compatible before interpreting timing deltas. |
