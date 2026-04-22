# UX Portfolio Management Spec

## Goal

Implement the approved UX plan for Endowus and FSM overlays so users can configure portfolio structure with less friction, understand what needs attention immediately, and take action through a unified planning flow.

## Scope

Included features:

1. Optimization 1 (Endowus): explicit bucket assignment layer with backward-compatible seeding from existing goal names.
2. Optimization 2: progressive readiness states with automatic overlay refresh as data arrives.
3. Optimization 3: action-oriented default overview with a "Needs Attention" strip.
4. Optimization 4: decision-first detail behavior (FSM first, plus compact Endowus detail defaults).
5. Optimization 5: simplified sync setup path with progressive disclosure for advanced settings.
6. Optimization 6: unified portfolio language across Endowus and FSM surfaces.
7. Goal health score: per-bucket/per-portfolio health state with explicit reasons.
8. Unified planning panel: target coverage + scenario contribution + rebalance summary in one place.

Out of scope:

- Executing transactions or direct broker integrations.
- Changing sync backend APIs.

## Work Items and Exact Changes

### 1) Endowus explicit bucket assignment layer (Optimization 1)

Files:

- `tampermonkey/goal_portfolio_viewer.user.js`
- `tampermonkey/__tests__/uiModels.test.js`
- `tampermonkey/__tests__/init.test.js`

Changes:

- Add storage-backed bucket assignment map keyed by Endowus `goalId`.
- Seed missing assignments from existing `"Bucket - Goal"` names for backward compatibility.
- Update merge logic to resolve bucket from explicit assignment first, then naming fallback.
- Add Endowus bucket management UI to review/update per-goal bucket assignment without renaming goals.

Acceptance criteria:

- Existing portfolios continue to render the same buckets immediately after upgrade.
- If assignment exists, changing goal name does not silently move the goal to another bucket.
- Users can update bucket assignment from overlay UI and see updated grouping without reload.

### 2) Progressive readiness + auto refresh (Optimization 2)

Files:

- `tampermonkey/goal_portfolio_viewer.user.js`
- `tampermonkey/__tests__/init.test.js`

Changes:

- Replace blocking data-loading alerts with inline readiness states in Endowus and FSM overlays.
- Show per-source readiness (e.g., goals, balances, performance, holdings).
- Register active overlay refresh hooks so intercepted data updates visible state automatically.

Acceptance criteria:

- Opening overlay before data is complete shows readiness UI instead of blocking alerts.
- Overlay transitions to normal view automatically after required data arrives.
- While overlay is open, new API data updates the rendered state without manual reopen.

### 3) Action-oriented overview (Optimization 3)

Files:

- `tampermonkey/goal_portfolio_viewer.user.js`
- `tampermonkey/__tests__/uiModels.test.js`
- `tampermonkey/__tests__/init.test.js`

Changes:

- Add `Needs Attention` strip to Endowus summary and FSM overview.
- Generate attention items from target coverage gaps, drift severity, and setup gaps.
- Wire attention item clicks to navigate to related bucket/portfolio scope.

Acceptance criteria:

- Summary/overview surfaces show at least one actionable attention row when issues exist.
- Clicking an attention item navigates to relevant bucket/portfolio detail.

### 4) Decision-first detail (Optimization 4)

Files:

- `tampermonkey/goal_portfolio_viewer.user.js`
- `tampermonkey/__tests__/init.test.js`

Changes:

- FSM detail first: default to decision-focused layout emphasizing target, drift, and assignment actions.
- Endowus detail: compact allocation-first default with analytics still accessible.
- Keep current modes available; prioritize action columns in default presentation.

Acceptance criteria:

- FSM detail opens in action-first layout without hiding critical assignment controls.
- Endowus bucket detail defaults to allocation-oriented compact view.
- Users can still access full analytics/performance views.

### 5) Sync wizard simplification (Optimization 5)

Files:

- `tampermonkey/goal_portfolio_viewer.user.js`
- `tampermonkey/__tests__/syncUi.test.js`

Changes:

- Add quick setup/wizard framing in sync settings.
- Move advanced controls under progressive disclosure.
- Keep existing authentication and sync actions functionally compatible.

Acceptance criteria:

- Basic setup path is visible and understandable without scanning all advanced options.
- Existing login/sign-up/save/sync flows continue to work.

### 6) Unified language (Optimization 6)

Files:

- `tampermonkey/goal_portfolio_viewer.user.js`
- `tampermonkey/README.md`

Changes:

- Align labels and microcopy across Endowus/FSM for consistent terms: portfolio, scope, target, drift, planning, needs attention.
- Avoid conflicting terminology where both flows expose similar concepts.

Acceptance criteria:

- Shared concepts use consistent terminology across both overlays.
- No regressions in existing controls/tests due to label updates.

### 7) Goal health score with explicit reasons

Files:

- `tampermonkey/goal_portfolio_viewer.user.js`
- `tampermonkey/__tests__/uiModels.test.js`
- `tampermonkey/__tests__/init.test.js`

Changes:

- Add health status (Healthy / Needs Review / Needs Setup) per Endowus bucket and FSM portfolio card.
- Render explicit reason text so users know what is wrong (e.g., target total != 100%, high drift).

Acceptance criteria:

- Every non-healthy status includes at least one reason.
- Health status updates when target/fixed/scenario inputs change.

### 8) Unified planning panel

Files:

- `tampermonkey/goal_portfolio_viewer.user.js`
- `tampermonkey/__tests__/uiModels.test.js`
- `tampermonkey/__tests__/init.test.js`

Changes:

- Endowus bucket detail: add planning panel with target coverage, scenario contribution, suggested allocation, and rebalance summary.
- FSM detail: add scope-aware planning panel with target coverage and rebalance actions.
- Treat target totals not equal to 100% as actionable guidance (not hard errors).

Acceptance criteria:

- Planning panel appears in Endowus and FSM detail flows.
- Target total status is explicit when not at 100%.
- Scenario/rebalance guidance is visible as actionable advisory text.

## Risks and Tradeoffs

- Single-file userscript complexity will increase; keep helper functions modular to maintain readability.
- Overlay auto-refresh can cause noisy rerenders; use guarded rerender conditions to avoid focus loss.
- New UI density can regress accessibility; preserve keyboard/focus semantics for modal and controls.
- Bucket assignment introduces another persisted layer; must preserve legacy naming behavior as fallback.

## Verification

Automated commands:

- `pnpm test`
- `pnpm run lint`
- `pnpm run test:e2e`

Manual checks:

- Endowus:
  - Open overlay before data is complete, verify readiness states and auto-transition.
  - Verify bucket manager seeds existing names and updates assignments live.
  - Verify summary attention strip, health statuses, and reasons.
  - Verify planning panel shows target coverage, scenario, and rebalance suggestions.
- FSM:
  - Open overlay before holdings response, verify readiness state and auto-transition.
  - Verify decision-first detail, health reasons, and planning panel updates by scope.
- Sync:
  - Verify simplified setup flow and advanced settings disclosure.
  - Verify login/save/sync paths still work.

## Commit Plan

Create separate commits in this order:

1. `docs(spec): add UX portfolio management implementation spec`
2. `feat(endowus): add explicit bucket assignment layer and manager`
3. `feat(ui): add progressive readiness states with live overlay refresh`
4. `feat(overview): add needs-attention strip and health reasons`
5. `feat(detail): add decision-first defaults and planning panels`
6. `feat(sync-ui): add quick setup wizard and advanced disclosure`
7. `chore(copy): unify portfolio language across overlays and docs`
8. `test: update coverage for UX planning and readiness flows`

## Completion Checklist

- [ ] All scoped features implemented.
- [ ] Tests and lint pass locally.
- [ ] PR body updated with required artifacts and spec summary.
- [ ] Review-fix loop completed against `main` with no unresolved important/blocking findings.
- [ ] PR checks all green.
