# LinkShelf v0.3 UX audit and design direction

## 1. Executive summary

The immediate opportunity is to make the next action visible. Stable Park renders selection, details, and confirmation in one long document. On a narrow sidebar with many tabs, the action that advances the workflow can sit well below the visible area. The horizontal section rail also makes Search and Settings depend on available width.

The approved direction is sidebar-first. The sidebar must remain independently usable, and a Manager is outside Phases 3.2–3.6. The experimental redesign was evaluated and declined. Future work starts from the latest stable `v0.3`, which remains authoritative for components, contracts, and behavior. The comparison below preserves the original design research.

The first implementation PR should address modal keyboard containment and action feedback. The next PR should improve navigation. The parking flow should then receive a focused redesign with a visible next action, a clear save-and-close confirmation, and a direct route to the resulting session.

## 2. Current v0.3 interface inventory

| Surface | Responsibilities | Preserve |
| --- | --- | --- |
| Sidebar shell | Sticky branded header with Quick settings and Park. Horizontal rail for Today, Projects, Review, Search, Archive, and Settings. Only the active section renders. | Persistent access to Park, active-section state, recovery gate, and window-specific command intents. |
| Park | Current-window candidates, eligibility and exclusion labels, selection, shared project/note/reminder, inline review, save and close, closure results. | Explicit selection, save before close, changed or unreadable tabs left alone, separate saved and closure counts. |
| Projects | Project selector, session sort and filter, density, project creation and rename, move to Inbox on project deletion, session expansion, session/project restore, and per-link actions. | Stable session and record identity, Inbox protection, previews and operation outcomes, bounded initial per-session presentation. |
| Today and Review | Today lists due and overdue parked links even with Chrome notifications disabled. Review is an oldest-first decision queue with restore, bookmark, move, archive, and remove. | Reminder reconciliation, pending reminders, duplicate bookmark handling, and each action’s existing meaning. |
| Search and Archive | Search combines LinkShelf records and native bookmarks in separately counted categories. Archive has range controls, Return to project, remove, and focus fallback. | Cursor safety, stale reply rejection, complete ordering, no duplicate results, separate bookmark actions, and capped mounted cards. |
| Settings and recovery | Quick settings exposes common preferences. Settings has explicit save, parking and restoration defaults, notifications, export/import, and privacy. Recovery replaces ordinary content when storage is unhealthy. | Local-only data, read-only recovery, raw export, validated trusted-backup replacement, distinct Merge/Replace and revision checks. |
| Shared UI | SavedLinkCard exposes a primary action, an overflow disclosure and expandable notes. Shared dialogs handle move/bookmark/remove. Feedback includes skeletons, errors, and separate operation warnings. | Semantic buttons, labeled inputs and dialogs, cancellation, stable keys, and current successful-removal fallback where implemented. |
| Popup and onboarding | Popup parks the current tab and can open the sidebar. Onboarding explains parking, permission uses, and local storage. | Fast single-tab workflow, explicit user initiation, and accurate privacy copy. |

The shell stores the last section, selected project, session order, and expanded session IDs in `linkshelfUiState`. Search commands use a window-keyed session intent with a request ID and optional query focus. The sidebar consumes the matching request. Search query, range, and unfinished section forms are component state. The persisted UI state is a shared local read/merge/write preference, so simultaneous documents can overwrite independent patches if opened as a second workspace. This is a source-based risk, not a reproduced data loss.

Source paths include [the sidebar shell](entrypoints/sidepanel/App.tsx), [section rail](entrypoints/sidepanel/components/SidePanelNavigation.tsx), [UI state](entrypoints/sidepanel/ui-state.ts), [command routing](features/commands/side-panel-commands.ts), [popup](entrypoints/popup/App.tsx), and [onboarding](entrypoints/onboarding/App.tsx).

## 3. Experimental interface inventory

The reference at `943f1ff` has Park tabs and Saved in the sidebar, a Manager entry, and a standalone `manager.html` rendering the shared App in Manager mode. Saved embeds Search above a projects or due-today view. Manager adds Saved, Review, Archive, and Settings & backup. The park flow has Choose, Confirm, and Saved states, a fixed action footer, and a handoff to the destination project. Manager opening passes section and project in the URL and creates an active browser tab. Its modal includes a basic Tab and Shift+Tab loop.

The experiment was inspected from Git objects and an isolated source snapshot. It is a design reference. Relative to the stable base it lacks the present recovery gate, search cursor service, Archive/Search range code, safe-close validation, restoration coordinator/checkpoints, and portions of backup, reminder and browser-operation handling. Source evidence includes `entrypoints/manager/main.tsx`, `features/navigation/open-manager.ts`, `SavedSection.tsx`, `ParkTabsSection.tsx`, and `components/ui/Modal.tsx` at that ref.

## 4. Stable versus experimental

| Difference | User benefit and drawback | Accessibility | Compatibility, performance and maintenance | Disposition |
| --- | --- | --- | --- | --- |
| Six scrollable destinations versus two sidebar destinations | Two primary views are easy to scan. Secondary tasks become dependent on knowing where Manager lives. | Less rail clipping. Explicit accessible names and visible focus still matter. | Shell change is moderate. Existing persisted IDs and commands require compatibility. No reason to mount two destinations at once. | Rebuild a compact stable shell with direct shortcuts and a labeled secondary destination control. |
| One surface versus full-page Manager | Space for a project list alongside sessions, broader settings, and long metadata. A new tab interrupts the browsing task and creates a return path. | More width helps reflow. New document focus and predictable keyboard return need testing. | High cost if both surfaces can mutate. Shared contracts, explicit window targeting, state ownership, and listener deduplication would be necessary. The old App and opener are outdated. | Sidebar-first approved. Manager excluded from Phase 3. |
| Stacked Park versus two steps and result | A visible Continue and explicit Save & close clarify the next action. Mandatory steps can slow short lists, and the old choose step can still be dense. | Footer should stay visible without covering focused controls at zoom. Focus the new step heading and restore logical focus on Back. | Medium implementation with existing RPC. The legacy handler and success path are unsuitable for current safe-close and warning contracts. | Rebuild action placement, step boundaries and result handoff on stable. |
| Separate Projects, Search, Today versus unified Saved | Persistent Search and a due count improve discoverability. Switching between query results and browse state can obscure what the list represents. | Explicit labels, headings and result announcements are necessary. | Keep independently bounded categories and cancellation. Avoid duplicate reminder polling or keeping heavy views mounted. Old embedded Search is pre-pagination. | Reuse the discoverability concept. Retain distinct view state and stable data paths. |
| Project/session layouts and link actions | A wider project list and consistent card actions can reduce scanning. Hidden actions and large expansions can add work. | Preserve named actions, focus after removal and long-text reflow. | Medium to high. Avoid unbounded expansions, remounting all records, or changing the worker’s restore scope. | Evaluate clearer action labels independently in the stable layout, using representative large fixtures. |
| Shared modal with basic wrap attempt | Wrap helps common keyboard cases. Selector misses several controls and handles little beyond boundary keystrokes. | The experiment leaves outside content interactive and misses focus already outside, disabled/hidden and nested cases. | Medium effort to fix once across callers. Stable caller-specific fallback must remain. | Rebuild and test a shared primitive. |
| Settings, popup and onboarding hierarchy | “Settings & backup” and action-oriented labels set better expectations. An extra settings surface can make saving and state ownership ambiguous. | Verify landmarks, button names, live status and Escape behavior in each surface. | Low copy/layout cost, higher if duplicate settings views can write. Stable verified write and recovery paths are mandatory. | Borrow plain labels. Keep popup fast and distinguish backup from recovery. |

## 5. Core journeys

### A. Save three selected tabs

Open the sidebar and choose Park in the header. Select individual eligible tabs. Parking details appears after the entire tab list with project, shared note and shared reminder. Submit Review, then confirm the inline summary below the form. The review warns that unsaved page form data cannot be restored. Results appear near the top with saved/closure outcomes. Finding the session again requires navigating to Projects and selecting the destination. Give selection a visible count and next action, move optional details into a compact review step, and offer View saved session only after confirmed persistence. A closure warning must remain visible and identify what the user should inspect.

### B. Restore a session

Select the project, locate a dated group using filter/order and notes, and activate Restore session. That path submits immediately. Project-level Restore all instead previews scope, offers normal or unloaded restoration, and warns for large projects. Keep it parked is a Settings preference separate from normal/unloaded behavior. Session results distinguish opened, failed and parked copies, with warnings when the list cannot refresh. A confirmation decision for large sessions should be explicit, and any UI should summarize the effective copy preference and never imply all opened records were committed when persistence only partly succeeded. Keep current worker contracts and retry behavior.

### C. Find one saved link

Enter Search through the rail or the window-scoped keyboard command. The input autofocuses on mount. Search accepts a project name as query text, while Projects has a separate title/URL/domain/note filter scoped to the selected project. There is no explicit project selector in Search. Saved and native bookmark results have distinct headings and load controls. Archive items stay searchable and have distinct state/actions. Switching sections unmounts Search, so its query and ranges are not restored by persisted UI state. Preserve local query matching, cursor invalidation and correct record identity. Consider a session-local return state only if back-navigation is a clear user need.

### D. Organize projects

Use the project selector, the inline name-and-Add form, and selected-project Rename/Delete controls. The filter, sort, expansion and per-session batches help long lists. Move is offered on relevant link cards rather than as a project-level action. Deletion clearly offers to move records to Inbox and prevents deleting Inbox itself. A denser layout or explicitly labeled management group can distinguish navigation from edits while preserving scope and the deletion result.

### E. Reminders

Set a shared reminder while parking and find due and overdue links in Today. Chrome notifications can be disabled without clearing Today; due and notified are separate states. Today offers restore and the broader Review/Projects surfaces offer organization. Surface a due indicator near the navigation, with a semantic accessible label and no unnecessary duplicate polling. Keep local time conversion and worker reconciliation intact.

### F. Backup and recovery

In Settings, use Backup and privacy, export JSON, or choose a file. The file summary and mode preview show counts. Merge preserves current settings and skips matches; Replace describes replacement of records and settings. Conflicts block confirmation. Recovery is reached via the storage health gate, with separate diagnostics, raw export and trusted-backup acknowledgment. Reorganize discovery and confirmation focus while retaining privacy copy, validated previews, tokens, and raw preservation.

## 6. Usability categories

| Category | Verified behavior | Interpretation to validate |
| --- | --- | --- |
| Information architecture | Rail labels map to distinct mounted sections. Park is in the header. Quick settings and Settings coexist. | “Saved” may be a better broad term than “Projects.” Review vs parking review can sound related even though they are separate. |
| Interaction | Park appends controls inline. Restore session and Restore all use different interaction paths. Backup has a separate preview and commit. | Visible progress and consistent outcomes should reduce backtracking. Confirm with first-time and repeat users before choosing shortcuts or extra steps. |
| Visual hierarchy | Header, rail, cards, counts, warnings, and status banners compete for vertical space. Cards use styled badges, clamped titles and expandable notes. | Reduce secondary framing and decoration while retaining state text. Validate scan order and spacing at narrow widths. |
| Accessibility | Native inputs/buttons, dialog names, status/error roles in several views, and list focus fallbacks exist. Shared modal does not contain Tab focus. | Screen reader output and theme contrast need hands-on evaluation. Avoid treating code inspection as an accessibility conformance result. |
| Responsive behavior | Horizontal rail and stable max-width content, with stacked details in narrow layouts. | A compact primary navigation and persistent Park action should make better use of the first screen. |
| Feature integrity | Worker operations supply authoritative outcomes. Some successes and secondary warnings are displayed in separate places. | Near-action feedback may make partial results clearer, provided warning and error distinctions survive. |

## 7. Accessibility and dialog design

Stable Modal focuses the first matching button, select or input, listens for Escape on the document, and calls focus on the element captured before mounting when it unmounts. The first match can be disabled or hidden. A modal role and label expose semantics but do not inert the underlying UI. The backdrop intercepts pointer interaction and dismisses on a backdrop press when the caller permits it. Stable provides no forward or reverse Tab guard. Multiple mounted instances would each receive Escape. Some callers prevent close while saving; Archive and Search have additional action-specific fallback logic when the initiating row is removed. The restore-project and backup panels are inline `alertdialog` regions and need an explicit design choice between true modal interaction and accessible inline disclosure.

The experimental selector adds eligible buttons, selects, inputs, textareas and links to a boundary loop. It omits visibility, inert ancestors, arbitrary tabbable controls and proper no-control focus. It does not return escaped or programmatic focus, distinguish the active dialog, prevent background interaction, or guarantee focus restoration after the original row disappears. The old loop is useful evidence of intent, not a complete implementation.

Phase 3.2 should prototype native `dialog.showModal()` in Chrome with a single top-level owner and browser-managed inertness. Verify initial placement, Tab and Shift+Tab containment in the extension surface, Escape on the topmost dialog, cancellation, pending and disabled states, no-control fallback, scrolling and unmount cleanup. Choose the least destructive action initially for short destructive prompts and a focusable heading when context needs to be read first. Give each dialog a name and concise description where useful. Restore focus to the invoking control when it remains connected, or to the nearest valid action or section heading after removal, range change, or navigation. Use explicit Escape/backdrop policy per flow and keep in-flight operations authoritative. Exercise two simultaneous open attempts, screen reader announcements, and real docked behavior before final approval. [W3C modal dialog pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/)

The card overflow declares a menu and menu items, but the source uses ordinary tab stops and has no menu focus entry, arrow navigation, or Escape handling. Either use a labeled disclosure with ordinary buttons and a clear close action or implement menu keyboard behavior. The sidebar stylesheet already includes focus-visible outlines and a reduced-motion rule. Verify these across controls, themes and zoom in Phase 3.6. [SavedLinkCard](entrypoints/sidepanel/components/SavedLinkCard.tsx) · [Sidebar styles](entrypoints/sidepanel/style.css) · [W3C menu button pattern](https://www.w3.org/WAI/ARIA/apg/patterns/menu-button/)

The stable Projects card timestamp rendered with an estimated contrast ratio of 2.63:1 against white, using the browser-computed foreground converted to sRGB. It is normal-size text that communicates when a link was parked. Use a stronger token and verify other informative metadata, control labels, and status colors against their actual backgrounds. This was a targeted sample. [W3C minimum contrast](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)

## 8. Responsive and native evidence

Headless Chrome 157.0.8103.39 ran both builds. The stable viewport sweep used a 760 CSS-pixel height and widths of 320, 400, 600, and 800. Document width matched each viewport. The narrower widths still clipped the horizontal navigation rail.

| Width | Stable destinations fully visible before horizontal scrolling |
| --- | --- |
| 320 px | Today, Projects, Review |
| 400 px | Today, Projects, Review, Search |
| 600 px | All six |
| 800 px | All six |

- **Park.** With 12 synthetic web tabs open and three selected at 320 × 760, the top of Review was at viewport y=1,629 after selecting the three tabs. After activating Review, the top of Confirm was at y=936. The walk used the real selection and confirmation controls and verified three records, zero of the selected tabs still open, and a persisted note and reminder. The status read “Saved and closed 3 tabs in one parking session.” [Selected tabs capture](.output/native-runs/2026-11-12T12-06-00.274Z-26664/park-selected-320.png) · [Stable walkthrough data](.output/native-runs/2026-11-12T12-06-00.274Z-26664/ux-walkthrough.json)
- **Library states.** An empty Inbox showed the empty-state guidance. The 1,000-link fixture contained 12 projects and 199 sessions. Search displayed 25 of 858 LinkShelf results and one native bookmark, and Archive mounted 25 cards. A due link remained visible with notifications disabled. [Empty Projects](.output/native-runs/2026-11-12T12-06-00.274Z-26664/empty-320.png) · [Mixed Search](.output/native-runs/2026-11-12T12-06-00.274Z-26664/mixed-search-320.png) · [Today](.output/native-runs/2026-11-12T12-06-00.274Z-26664/due-320.png)
- **Keyboard.** Remove initially focused Cancel. Shift+Tab moved to the background Settings button. Tab from the final Remove link button moved to background Previous page. Escape dismissed the dialog and restored focus to the initiating Archive row in the cancellation scenario. The Rendering suite also passed focus fallback after successful removal. [Archive dialog capture](.output/native-runs/2026-11-12T12-06-00.274Z-26664/archive-remove-modal-320.png)
- **Zoom and backup.** The general suite exercised 200% Chrome zoom. Its effective 400 px viewport had no page-width overflow and both header controls fit. The Rendering suite exercised long expanded notes at all four widths and zoom. General also tested real JSON export, invalid/large-file rejection, cancellation of Merge and Replace previews, and raw recovery download. [200% zoom](.output/native-runs/2026-11-12T12-03-22.258Z-3520/projects-zoom-200.png) · [Settings](.output/native-runs/2026-11-12T12-06-00.274Z-26664/settings-320.png) · [Popup document](.output/native-runs/2026-11-12T12-06-00.274Z-26664/popup-360.png)

Stable production build passed. The focused Vitest run passed 13 tests across four files for sidepanel, commands, and search. The four native suites passed 10 general scenarios, eight Search checks, six Rendering checks, and nine Bulk Restoration cases. The general suite records the existing modal containment failure as an observation while asserting successful initial focus and dismissal. Native Bulk verified five checkpoints for ten successful restores, 13 for 25, and no lifecycle writes when keeping copies.

The supplemental Projects walkthrough created and renamed a project through its UI, filtered and expanded a session, restored two tabs from the session button, and verified that deletion moved a parked record to Inbox. The 200% zoom observation above used an effective width of 400 px. The sidebar stylesheet sets a 300 px body minimum, so reflow below that effective width remains a design and verification target. [Projects walkthrough data](.output/native-runs/2026-11-12T12-15-54.461Z-5856/projects-walkthrough.json)

The archived experiment built successfully with its own lockfile and ran in a separate profile. Park tabs and Saved both fit at all four tested widths. Continue and Save & close each started at y=708 in the 760 px viewport with the same synthetic tab count. Three selected tabs were saved and closed, and View saved tabs returned to Saved. Clicking Open Manager opened the full-page surface with Saved, Review, Archive, and Settings & backup. The 1,100 px capture shows more space but still places global Search immediately above a separate project filter. In the experimental Archive Remove dialog, Shift+Tab from Cancel reached Remove link, Tab returned to Cancel, and Escape closed it. That verifies the basic two-control loop only. [Experimental parking](.output/ux-audit/experiment-943f1ff/.output/native-runs/2026-11-12T12-16-02.028Z-3428/park-selected-320.png) · [Manager](.output/ux-audit/experiment-943f1ff/.output/native-runs/2026-11-12T12-16-02.028Z-3428/manager-saved.png) · [Experiment walkthrough data](.output/ux-audit/experiment-943f1ff/.output/native-runs/2026-11-12T12-16-02.028Z-3428/ux-walkthrough.json)

All browser measurements here use extension HTML documents in disposable Chrome profiles. A popup document in a tab does not reproduce popup dismissal. A sidebar document at a synthetic viewport does not measure docking, browser chrome, OS focus transfer, or screen-reader behavior. No real browsing data was used.

## 9. Approved navigation decision

**Option A, the independently usable sidebar, is approved.** Option B, a sidebar plus Manager, is deferred outside Phase 3. A separate future project would require approval and a concrete user task that benefits from more space. The table preserves the original tradeoff analysis. Park and Search are plausible frequent actions because they are the entry and retrieval paths. Today depends on whether a person creates reminders. Archive, project maintenance, backup and configuration are likely more episodic. These are task-based assumptions. The audit contains no usage telemetry or research sample.

| Decision | Sidebar-first | Sidebar plus Manager |
| --- | --- | --- |
| Task continuity | Keeps the browsing task and the existing window-scoped keyboard commands in one surface. | A wider layout helps comparing projects and inspecting long sessions. A new active tab can interrupt browsing and introduces a return action. |
| Task access | Evaluate direct Park, Search and saved-project access, a due affordance, and a labeled route to secondary sections. Keep backup and archive available within the sidebar. | A second surface would require an explicit handoff and careful treatment of any context passed in its URL. |
| Window and state | Keep window-keyed intents and existing preferences. Decide which view state is transient per sidebar. | Specify open/reuse policy per Chrome window and a return path that keeps the prior browsing tab and sidebar selection intact. Establish explicit sender-window behavior for restore, deduplicate listeners, isolate transient view state, and share validated data through the existing worker. |
| Implementation | Moderate shell work and focused regression surface. Narrow-space tradeoffs remain. | Higher cost for shell, synchronization, deep links, navigation focus and multi-document race tests. The experimental Manager opens an active tab without explicit source window or reuse. Its shared App does not supply current safety guarantees. |

Chrome’s APIs support a browser side panel and extension tabs. A second surface is a product decision with state and window ownership requirements. [Chrome Side Panel API](https://developer.chrome.com/docs/extensions/reference/api/sidePanel) · [Chrome Tabs API](https://developer.chrome.com/docs/extensions/reference/api/tabs)

## 10. Concepts eligible for future evaluation

- A visible tab selection count and primary parking action, a clear review and confirmation, and direct navigation to a successfully saved session.
- More discoverable Park, Search, and saved-project destinations.
- Clearer labels for opening a bookmark, restoring a parked link, and keeping a copy.

Evaluate each idea in its corresponding phase. Design approved ideas independently using stable components and contracts. The experiment remains historical research.

## 11. Ideas to redesign or exclude

- The experimental branch, implementation, styling, and overall layout are excluded from production work. Keep its commits separate and preserve the stable worker, storage, restoration, search, and backup behavior.
- Manager design and implementation are outside Phases 3.2–3.6.
- Avoid presenting both a “Review” destination and a parking review action as if they do the same work. Keep queue terminology distinct from confirmation.
- Preserve explicit operations and partial outcomes. Avoid a generic “Saved” completion state when saving succeeded and some tab closures could not be confirmed.

## 12. Technical risks and regression gates

| Area | Required protections and tests |
| --- | --- |
| Parking | Verify ID selection and current-window ownership, ineligible tabs, save-before-close, write failure, changed/unreadable tab preservation, cancellation and saved-versus-closed counts. Run background parking tests and a multi-window native pass. |
| Search | Keep independent 25-record initial pages and continuation counts, stale reply rejection, cursor expiry/restart, invalidation and stable ordering. Use existing search-page unit tests and native traversal against saved and bookmark fixtures. |
| Rendering | Assert at most 25 mounted Archive cards and 25 per Search category, complete reachability, stable identity and focus after paging/removal. Check large/many-session fixtures, long titles, keyboard, widths and Chrome zoom. Keep Projects Show All a deliberate action and profile its cost. |
| Restoration | Preserve two-candidate verified checkpoints, reservations, sender-window queues, safe retry, and opened/restored distinctions. Run operations integration and native bulk cases, including copies, failures and worker stop. Confirm unloaded fallback language. |
| Storage and reminders | Keep no-op writes, schema and relation validation, readback/rollback, recovery gate, raw export, token checks, and reminder reconciliation. Run integration and native backup/recovery cases including quota and cancellation. |
| Multiple surfaces | Keep the existing multi-window and cross-document regression coverage. The risks of adding a Manager are retained as historical analysis outside the Phase 3 roadmap. |

## 13. Prioritized findings matrix

Severity is an audit judgment. P0 prevents a critical task or risks a destructive misunderstanding, P1 is significant accessibility or usability, P2 is noticeable friction, and P3 is polish. No P0 was verified. Impact statements infer user consequences from the observed behavior. Frequencies and terminology preference require user feedback.

| ID | Surface | Current behavior and impact | Evidence and confidence | Severity | Improvement | Complexity / risk | Phase |
| --- | --- | --- | --- | --- | --- | --- | --- |
| UX-01 | Shared modal | Tab can leave the dialog; a keyboard user can lose context or act on the background. | Modal source and keyboard boundary walkthrough. | P1 | Modal containment, controlled dismissal and focus fallback. | Medium / high across callers | 3.2 |
| UX-02 | Park | The list precedes details and review. The next action can be below the viewport, with no persistent way to advance. | Park source, many-tab walkthrough and reported workflow concern. | P1 | Visible primary footer, focused review and explicit closure outcomes. | Medium / high around safe closing | 3.4 |
| UX-03 | Navigation | Horizontal overflow can hide Search and Settings; Park occupies a separate header action. | Rail source and viewport measurements. | P1 | Compact visible primary destinations with labeled secondary navigation. | Medium / medium around intents | 3.3 |
| UX-04 | Restore session | Session action submits directly; project restore has separate mode confirmation. Copy behavior comes from Settings. | Projects and Settings source. User expectation is a hypothesis. | P2 | Explain active preference and scope; decide large-session confirmation. | Medium / high around restore | 3.5 |
| UX-05 | Park completion | Success is above the workflow and has no destination action. | Park source and three-tab walkthrough. | P2 | Confirmed session handoff plus separate closure warnings. | Medium / medium | 3.4 |
| UX-06 | Search | Global input autofocuses and has separate category counts. Project filtering and query return state are not explicit. | Search/App source and mixed-results walkthrough. | P2 | Direct access and explicit scope; validate transient return state. | Medium / high around cursors | 3.3–3.5 |
| UX-07 | Projects | Selector, sort, density, filter and management compete for space; Add has little standalone context. | Projects source. Impact is a reasoned UX hypothesis. | P2 | Group browse and manage actions; use clear labels and preserve Inbox semantics. | Medium / medium | 3.5 |
| UX-08 | Reminders | Due items appear in Today; the stable nav has no count. Notifications setting lives separately. | Today, Settings and rail source; due fixture. | P2 | Accessible due affordance and clear distinction from notification preference. | Medium / medium | 3.3 |
| UX-09 | Backup and project confirmations | Inline alertdialog regions do not share modal focus management. Settings and Quick settings have different save styles. | Settings, Projects and Quick settings source; backup walkthrough. | P2 | Review inline confirmation semantics, preview consequences and save status. | Medium / high around Replace | 3.2 |
| UX-10 | Review / Projects scale | Review maps the queue; Projects expands sessions and permits Show All. | Source. Large-layout cost is a hypothesis beyond the existing Phase 2 measurements. | P2 | Profile representative paths before introducing broad workspaces. | Medium / medium | 3.5 |
| UX-11 | Labels and visual density | Several surfaces repeat section framing, and Park and Review have different meanings in context. | Source and captures. Terminology requires feedback. | P3 | Clarify task language and tighten spacing after navigation is approved. | Low / low | 3.6 |
| UX-12 | Manager state | Experiment opens a new active tab, seeds project from shared UI state, and shares older views. | Experimental source. A sync failure is a reasoned risk. | P2 | Keep sidebar first. Retain the risk for any separately approved future project. | High / high | Outside Phase 3 |
| UX-13 | Card actions | Overflow declares a menu without matching focus entry, arrow navigation or Escape handling. | Verified through SavedLinkCard source. | P2 | Use an accessible disclosure or implement menu keyboard behavior. | Low–medium / medium | 3.2 |
| UX-14 | Card metadata | The sampled Parked timestamp has about 2.63:1 contrast on white, making useful date context harder to read. | Verified through Chrome computed color in a Projects card. | P2 | Use a stronger text token and check other informative metadata. | Low / low | 3.6 |

## 14. Phase 3 roadmap

The [working roadmap](docs/phase-3-ux-roadmap.md) defines scope, exclusions, tests and acceptance criteria per PR. Phase 3.2 covers shared modal correctness, keyboard containment, logical focus restoration, controlled Escape and backdrop behavior, card overflow semantics, accessible pending/success/partial/failure feedback, and review of inline project and backup confirmations. Navigation redesign, parking redesign, and Manager work are outside Phase 3.2. Later phases cover navigation, parking, saved links, and final verification.

## 15. Open product decisions

1. Which two or three destinations should stay visible at 320 px, and should “Saved” replace “Projects” in navigation while preserving project terminology inside the view?
2. Should first launch still land on Projects, or should an empty library open Park while returning users keep their last section?
3. Should the parking review show project and optional metadata together, and what term best explains that parking saves and then closes tabs?
4. At what session size, if any, should Restore session prompt before opening tabs? Should copy behavior be shown as a read-only preference or become a per-operation choice in a separately approved change?
5. Should Search query and range persist across section changes within one sidebar session? What should happen when the stored dataset invalidates that state?

## 16. Files and Git status

The deliverables are this report and [the roadmap](docs/phase-3-ux-roadmap.md). Branch `ux/phase-3-audit` starts at `44caa1ad72fafb1a69dd350f731ed94321c4c781`, the Phase 2.6 merge. The experimental ref remained `943f1ff` and was inspected separately. Existing historical reports remain outside the change set. Audit scripts, build snapshots and screenshots live under ignored `.output/`. Phase 3.1 changes only documentation.
