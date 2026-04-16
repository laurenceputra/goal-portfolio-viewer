# Goal Portfolio Viewer Improvement Spec

## Summary

This spec defines the next version of Goal Portfolio Viewer as a single product shell with clearer onboarding, better discovery, explicit bucket mapping, stronger freshness and sync status, and a compare layer that helps the user decide what to do next.

The current app already captures portfolio data, shows Endowus bucket views, supports FSM holdings management, and syncs settings across devices. The main problem is that the flow assumes too much context. Users have to already know where data comes from, what is loaded, how buckets are inferred, and which controls matter first. This spec turns the tool from a powerful viewer into a clearer workflow.

## Product goals

1. Make the first run understandable without hidden knowledge.
2. Make it obvious what data is loaded, what is stale, and what needs attention.
3. Make discovery fast through search, filters, and quick jump behavior.
4. Replace brittle bucket inference with explicit, reviewable mappings.
5. Present Endowus and FSM as two data sources inside one product, not two disconnected modes.
6. Add a compare and decision layer so the app helps the user act, not just inspect.
7. Make sync and persistence legible enough that the user can tell what is local, what is synced, and what is pending.
8. Reduce alert-driven interruptions and replace them with inline states.
9. Improve internal structure so future features do not keep stretching the monolith.

## Non-goals

- Do not replace the userscript distribution model.
- Do not redesign the finance logic, calculation formulas, or performance math unless a bug is found.
- Do not move the entire project into a framework app.
- Do not introduce a cloud backend dependency for core local functionality.
- Do not remove support for the current Endowus and FSM flows.
- Do not require the user to manually configure mappings before the app can be used.

## Current problems to solve

### 1. Onboarding is implicit
The current viewer is useful only after data capture succeeds. When data is missing, the user gets blocking alerts. There is no explanatory shell, no readiness summary, and no guidance on what to do next.

### 2. Discovery is weak
The Endowus view is structured around bucket cards and dropdown selection. FSM has a holdings filter, but there is no product-wide search or unified find experience. If the portfolio is large, navigation becomes manual scrolling.

### 3. Bucket grouping is brittle
Current Endowus grouping depends heavily on goal names that look like `Bucket Name - Goal Details`. That is convenient as a bootstrap rule, but it should not be the only source of truth.

### 4. The product has split mental models
Endowus uses goals and buckets. FSM uses portfolios, holdings, tags, and assignments. The sync layer already spans both, but the UI does not present them as one coherent product.

### 5. Freshness is not legible enough
The app caches data, but the user cannot easily tell whether the source capture is recent, whether performance values are fresh, and whether sync is current.

### 6. Error handling is too interruptive
Important failure paths still use browser alerts. Those are low context and break the flow.

### 7. Sync is capable but too technical
Sync settings expose advanced configuration before the user has a strong mental model of what is happening. Conflicts, lock state, refresh state, and unsynced changes need to be visible earlier and in simpler language.

### 8. There is no compare or decision layer
The user can inspect data, but the tool does not help answer practical questions like which bucket needs attention first or which items are likely duplicates or misassigned.

### 9. Internal structure is too coupled
The userscript is a monolith. It is still acceptable as a delivery artifact, but it needs stronger internal boundaries to support new screens without increasing fragility.

## Target user flow

### First run
1. The user clicks the portfolio viewer button.
2. Instead of a blocking error, the app opens a shell with a readiness home.
3. The home explains which sources are available, which data is present, which data is missing, and what the next step is.
4. If this is the first successful capture, the app suggests bucket mappings derived from naming conventions and asks the user to review them.
5. The user can still explore any partial data that is already available.

### Returning visit
1. The user opens the shell into the Overview tab.
2. The app shows a portfolio summary, freshness badges, sync state, and actionable issues.
3. The user can search globally, jump directly to an entity, or go to compare.
4. The user can review mapping issues, stale data, drift outliers, or unsynced changes without opening developer tools.

### Endowus flow
1. The user can browse buckets from Overview or Search.
2. The user can open a bucket detail view.
3. The user can edit target percentages, fixed flags, and projected amounts.
4. The user can inspect performance windows and chart data.
5. The user can compare buckets or goals side by side.

### FSM flow
1. The user can browse holdings, portfolios, tags, and assignments from the same shell.
2. The user can filter and bulk edit holdings.
3. The user can manage portfolios, assignments, tags, and drift settings.
4. The user can see whether an item is assigned, unassigned, or ambiguous.

### Sync flow
1. The user can see sync state from the shell before entering settings.
2. The app clearly shows whether the device is locked, connected, syncing, conflicted, or errored.
3. The app explains what is synced and what is local.
4. The user can resolve conflicts in-context.

## Information architecture

The main shell should support these top-level views:

- **Overview**: summary, freshness, issues, and recent activity
- **Explore**: search, filters, and entity browsing
- **Compare**: side-by-side comparisons for selected items
- **Mappings**: bucket and assignment review
- **Settings**: sync, advanced preferences, and reset actions

The exact tab names can change, but the product must have a clear separation between inspection, discovery, comparison, mapping, and settings.

## Functional requirements

### A. Readiness and onboarding

1. The viewer must show a non-blocking readiness state when required data is missing.
2. The readiness state must identify each source separately.
3. For each source, the UI must show:
   - whether the route is supported
   - whether capture data exists
   - last capture time
   - whether the view is usable right now
4. If data is missing, the UI must explain what to do next in plain language.
5. The readiness state must be dismissible once the user understands it.
6. On first successful load, the app must offer to review imported mappings.
7. The onboarding copy must explain the main product model in one screen, not through hidden tooltips.

### B. Global shell and navigation

1. The viewer must open into a shell rather than directly into a deep view.
2. The shell must keep the user inside the same modal or panel structure used today.
3. Navigation must be available without requiring the user to return to a start screen every time.
4. The shell must preserve the current source context when navigating to a detail view.
5. Navigation state should be stable enough that switching views does not lose the user’s current search, compare selection, or scroll position unless the user explicitly resets it.

### C. Search and discovery

1. The app must expose a global search input at the shell level.
2. Search must work locally against all loaded data.
3. Search must support at least:
   - bucket name
   - goal name
   - goal type
   - holding name
   - holding code or ticker
   - portfolio name
   - tag
   - issue state such as unmapped, stale, fixed, missing target, or high drift
4. Search results must be grouped by entity type.
5. Search results must be clickable and keyboard accessible.
6. Search must support filters for source and issue state.
7. The last selected filter set should persist for the session and may persist across sessions if that fits current storage patterns.

### D. Explicit bucket mapping

1. Bucket grouping must move from heuristic-only inference to explicit mapping storage.
2. The system must still support import from goal name parsing as a bootstrap step.
3. Every mapped entity must have an assignment record.
4. Assignment records must include provenance, such as imported, manual, or synced.
5. Unmapped entities must remain visible and actionable.
6. Ambiguous or conflicting assignments must be surfaced for review.
7. The mapping editor must allow the user to:
   - accept imported suggestions
   - remap an entity
   - create a new bucket
   - leave an entity unassigned
   - re-derive suggestions from naming rules
8. The app must not silently change mappings after the user has manually edited them.

### E. Overview and action cards

1. The Overview view must summarize the portfolio at a glance.
2. It must show counts or badges for:
   - loaded sources
   - stale items
   - unmapped items
   - high drift items
   - sync issues
   - fixed items that hide target controls
3. It must show freshness timestamps in human-friendly form.
4. It must show a clear next-best-action section.
5. The next-best-action section should prioritize items that are stale, unmapped, out of sync, or beyond drift thresholds.
6. The user must be able to click summary cards to drill into details.

### F. Endowus detail flow

1. The Endowus detail view must preserve the existing allocation and performance modes.
2. The view must add clearer labels for what is editable and what is derived.
3. The detail view must support compare, either from selected items or from a dedicated compare screen.
4. Target editing must still clamp values and visually reflect clamping.
5. Fixed items must be visibly locked and excluded from target editing.
6. Performance panels must show load state, freshness state, and cache age.
7. The performance cache refresh restriction must stay, but the UI must make the restriction understandable.
8. If performance data is unavailable, the panel must show inline fallback state instead of a blocking alert.

### G. FSM detail flow

1. FSM must keep support for holdings table, bulk assignment, portfolio management, tags, and drift settings.
2. The app must make it clear which holdings are assigned, unassigned, or mapped to a portfolio.
3. Search and filters must work on FSM holdings.
4. Bulk operations must retain current safety behavior and should make the target scope obvious before applying changes.
5. FSM settings must remain available, but advanced controls should be visually secondary to core assignment actions.

### H. Compare and decision layer

1. The app must support selecting two or more entities for comparison.
2. Comparison must work across entities of the same kind, and where useful, across related kinds.
3. The compare view must present at least:
   - name
   - source
   - bucket or portfolio
   - current value
   - target or assigned state
   - drift or allocation variance
   - freshness
   - last sync impact if relevant
4. The compare view must help the user answer what needs action first.
5. The compare view should call out likely issues such as:
   - unmapped entity
   - duplicate exposure
   - stale data
   - missing target
   - high drift
6. The compare view should not require the user to understand internal storage keys or endpoint names.

### I. Freshness, sync, and persistence legibility

1. The shell must show whether data came from live capture, cache, local state, or sync.
2. Sync status must be visible before the user opens settings.
3. The app must show last sync time and last local change time when available.
4. The app must show whether the current device is locked or unlocked for sync editing.
5. The app must show a pending-change indicator when local edits have not been synced yet.
6. The app must show conflict state as a reviewable condition, not an unexplained error.
7. The meaning of local-only vs synced data must be explained in settings and in condensed form in the shell.

### J. Error handling

1. The app must minimize use of browser alerts for normal recoverable failures.
2. Errors should be rendered inline in the affected view when possible.
3. Error UI must include:
   - what happened
   - what was affected
   - what the user can do next
4. Fatal setup issues may still use an explicit blocking message, but only when no meaningful fallback exists.
5. Console logging can remain for debugging, but the user-facing message must not depend on the console.

### K. Internal architecture

1. The userscript may remain a single distributable file, but internal code must be split into clearer logical modules or sections.
2. Data capture, normalized state, rendering, sync, and source-specific behaviors should have explicit boundaries.
3. Shared state should be centralized where possible.
4. Rendering functions should depend on prepared view models, not on raw network payloads.
5. Source-specific logic should not leak into shared UI code more than necessary.
6. Test coverage must be updated to match new flows and any moved state model.

## Data and state model changes

### 1. Shell state
Add state for:
- active top-level view
- active source filter
- current search query
- current compare selection
- dismissed onboarding flag
- selected issue filters
- last visited entity, optional

### 2. Assignment state
Add explicit assignment records for mappings such as:
- Endowus goal to bucket
- FSM holding to portfolio or bucket

Each assignment should support:
- source
- entity id
- destination bucket or portfolio id
- provenance
- timestamp
- optional note or review status

### 3. Freshness state
Track per source:
- capture timestamp
- cache timestamp
- last rendered timestamp
- sync timestamp
- stale flag or calculated staleness age

### 4. Compare state
Track a selection list and compare mode for selected entities. The compare list should be stable enough to persist during a session.

### 5. Issue state
Maintain derived flags for:
- unmapped
- stale
- missing target
- fixed
- high drift
- sync conflict
- pending sync

### 6. Sync state
Expose top-level sync status as a normalized model, not as scattered booleans.

## UX details

### Readability requirements
- Use clear labels, not internal jargon.
- Prefer human-friendly age values like `5m ago`, `Today`, or `3d old`.
- Prefer action-oriented copy like `Review mappings` or `Resolve conflict`.
- Avoid dense technical text in the shell unless the user opens advanced settings.

### Empty states
Each empty state must answer three questions:
1. What is missing?
2. Why does it matter?
3. What should the user do now?

### Inline status badges
Badges should be used for:
- fresh
- stale
- synced
- unsynced
- locked
- conflict
- unmapped
- high drift
- fixed

### Mobile and compact view behavior
The overlay should remain usable in narrower layouts. Search and primary navigation should remain available without requiring horizontal overflow.

## Rollout plan

### Phase 1, shell and readiness
- Add the unified shell.
- Replace blocking alerts with readiness and inline states.
- Expose freshness and sync status.

### Phase 2, search and mapping
- Add global search and filters.
- Add explicit assignment records and mapping review screens.
- Import suggested mappings from existing naming rules.

### Phase 3, compare and decision support
- Add compare selection and compare view.
- Add issue ranking or attention summaries.
- Add action recommendations on Overview.

### Phase 4, polish and architecture
- Split internal code paths more cleanly.
- Tighten tests.
- Reduce view coupling.
- Improve sync settings legibility.

## Acceptance criteria

The work is complete when all of the following are true:

1. A first-time user can open the viewer and understand what is missing without a blocking alert.
2. A returning user can immediately see freshness, sync state, and the main items needing attention.
3. Search can locate buckets, goals, holdings, portfolios, and issues from one input.
4. Bucket assignment is explicit and editable, not only inferred from naming conventions.
5. Endowus and FSM feel like two sources inside one product shell.
6. Compare view exists and can highlight differences that matter.
7. Sync status is visible at the shell level and conflicts are actionable.
8. Recoverable errors are shown inline instead of through `alert()` where practical.
9. Tests cover the new shell state, mapping behavior, search, compare, and sync state surfaces.
10. The userscript still ships as a working standalone artifact.

## Out of scope for this iteration

- Rewriting the backend sync server from scratch.
- Replacing Tampermonkey with a browser extension.
- Introducing server-side portfolio analytics beyond the current sync backend.
- Designing a full multi-user collaboration model.
- Building an external dashboard outside the userscript.

## Implementation notes

- Keep the current single-file distribution as the final artifact, but move logic into clearer internal sections or helper groups.
- Preserve current storage keys where possible. Add new keys only for new concepts like assignment provenance, compare selection, and dismissed onboarding state.
- Preserve compatibility with existing cached data and sync payloads.
- Prefer additive migration over destructive migration.
- If a new mapping model is introduced, provide a conversion path from existing goal-name-derived buckets.
- New UI should be introduced behind a feature flag if needed for safe rollout.

## Open questions

1. Should the Overview default to Endowus, FSM, or a mixed source-neutral summary?
2. Should compare be limited to same-source comparisons in v1, or allow cross-source comparison when entities are semantically related?
3. Should bucket mappings be source-specific or shared across all sources that support the same bucket name?
4. Should onboarding dismissal persist forever or only until the next major version?

## Definition of done

The product is done when a new user can open it, understand the state of the data, search for entities, review mappings, compare options, and sync settings without needing external explanation, and when the implementation remains maintainable enough to support future changes without growing further chaos.
