# FSM Portfolio B Implementation Spec (1 Row => 1 Portfolio)

## Goal

Implement **Proposal B (Portfolio Buckets + Rebalance Workspace)** for FSM, starting with a strict assignment model:

- one holdings row/instrument (`code`) maps to exactly one portfolio group, and
- unassigned holdings are explicitly tracked as `Unassigned`.

This phase focuses on portfolio grouping + weight management UX, including required `productType` visibility.

---

## Scope

### In Scope

1. Portfolio manager for FSM overlay:
   - create/rename/archive portfolio groups
   - assign holdings rows to a portfolio group
2. Holdings table enhancement with required columns:
   - `code`, `name`, `productType`, `currentValueLcy`
   - assignment column (`Portfolio`)
3. Portfolio-level views:
   - `All`, each user-defined portfolio, `Unassigned`
4. Portfolio-level target/drift calculations and rebalance suggestions
5. Config-only persistence + sync of grouping metadata under FSM namespace
6. Regression tests for grouping behaviors and orphan handling

### Out of Scope

- Partial split assignment of one row across multiple portfolios (units/percent splits)
- Transaction/lot-level accounting
- Backend schema change
- Non-FSM platforms

---

## Confirmed Decisions

1. **Assignment model:** `1 row => 1 portfolio`.
2. **Identity key:** `code` (row-level primary identity for FSM settings).
3. **Portfolio limits:** no hard limit on number of portfolios.
4. **Portfolio naming:** max 64 characters per portfolio name.
5. **Archive behavior:** archive always force-reassigns member holdings to `Unassigned`.
6. **Target scope for `All`:** derived from portfolio targets.
7. **Unassigned behavior:** `Unassigned` is a first-class default portfolio.
8. **Migration default:** existing holdings default to `Unassigned`; provide optional checkbox-driven mass assignment helper.
9. **Display requirement:** `productType` shown as raw API value (no label mapping in this phase).
10. **Portfolio ID rule:** slug from portfolio name with collision suffix (e.g., `core`, `core-2`).
11. **Bulk assignment UX:** include per-row checkboxes and a header-level `Select all` checkbox.
12. **Conflict UX rollout:** ship Proposal B multi-step wizard immediately (no interim Proposal A rollout).
13. **Privacy:** sync only config metadata; no amount-bearing holdings sync.

---

## Functional Requirements

## FR-1 Portfolio manager
- User can create custom portfolios with no hard limit.
- Portfolio name length is limited to 64 characters.
- Portfolio IDs are slug-based and collision-safe (`name`, `name-2`, ...).
- User can rename and archive portfolios.
- Archiving a portfolio force-reassigns its holdings to `Unassigned`.

## FR-2 Assignment behavior
- Each holdings row has one `portfolioId` assignment.
- Valid assignments: user-defined portfolio IDs or `unassigned`.
- Reassignment is last-write-wins locally.

## FR-3 Portfolio views
- Overlay provides tabs/chips/select:
  - `All`
  - each active portfolio
  - `Unassigned`
- `All` shows all holdings and full-account summary.
- Portfolio-specific view filters to assigned rows only.
- `Unassigned` view shows orphan holdings and a clear assignment CTA.
- `Unassigned` is treated as a normal/default portfolio for filtering and calculations.

## FR-4 Weight management and rebalance outputs
- For the selected view scope (All or specific portfolio):
  - actual weight %
  - target weight %
  - drift %
  - suggested trade amount (SGD)
- Drift and recommendations use existing FSM amount source (`currentValueLcy`).

## FR-5 Required table columns
- FSM table must include:
  - `code`
  - `name`
  - `productType`
  - `currentValueLcy` (formatted)
  - `Portfolio` assignment

## FR-6 Sync and storage model
- Add FSM grouping config to sync v2 namespace (config-only):
  - portfolio definitions (id/name/status)
  - per-code assignment map (`assignmentByCode`)
- No holdings values/PII in sync payload.

## FR-7 Migration and bulk assignment
- On rollout, holdings without assignment default to `unassigned`.
- Provide a bulk-assignment helper with checkbox row selection and target portfolio picker.
- Include a header-level `Select all` checkbox and support applying to all currently filtered rows.

---

## UX Requirements

- If there are orphan holdings (`Unassigned` count > 0), show a visible badge/chip count.
- Empty portfolio view shows informative empty state with action to assign holdings.
- Assignment changes should be immediate in UI and reflected in summary calculations without full reload.
- Bulk assignment flow includes checkbox selection + clear confirmation of number of rows affected.
- `productType` is displayed as-is from FSM payload in holdings tables.

---

## Conflict UX (Confirmed): Multi-step Wizard (Ship Immediately)

Use a 5-step wizard for assignment-related conflicts:
1. Step 1: high-level summary (counts by change category).
2. Step 2: portfolio definition changes (create/rename/archive).
3. Step 3: assignment changes (`code -> portfolioId`) with search/filter.
4. Step 4: target/drift setting changes by portfolio.
5. Step 5: final decision (Keep Local / Use Remote) with impact summary.

UX rationale:
- Improves scanability for high-volume assignment diffs.
- Reduces accidental destructive resolution by staged review.
- Maintains explainability parity with conflict detection scope.

---

## Data Model (Proposed)

Inside `platforms.fsm`:

```json
{
  "portfolios": [
    { "id": "core", "name": "Core", "archived": false },
    { "id": "income", "name": "Income", "archived": false }
  ],
  "assignmentByCode": {
    "AAPL": "core",
    "SCHD": "income",
    "QQQ": "unassigned"
  }
}
```

Notes:
- `unassigned` is a reserved logical bucket (can be implicit default).
- Missing `assignmentByCode[code]` defaults to `unassigned`.

---

## Work Items and Exact Changes

1. FSM overlay workspace and portfolio manager UI
   - File: `tampermonkey/goal_portfolio_viewer.user.js`
2. FSM grouping storage/sync integration
   - File: `tampermonkey/goal_portfolio_viewer.user.js`
3. FSM table additions (`productType`, `Portfolio` assignment)
   - File: `tampermonkey/goal_portfolio_viewer.user.js`
4. Tests for assignment, orphan behavior, and scoped calculations
   - Files:
     - `tampermonkey/__tests__/init.test.js`
     - `tampermonkey/__tests__/syncManager.test.js`
     - `tampermonkey/__tests__/utils.test.js`
     - `tampermonkey/__tests__/interception.test.js`

---

## Acceptance Criteria

1. User can create at least 2 custom portfolios and assign holdings rows to one portfolio each.
2. `productType` is visible in FSM holdings table.
3. `Unassigned` holdings are always visible and countable; no silent data loss.
4. Portfolio-level weight/drift/rebalance outputs update based on selected scope.
5. Sync roundtrip preserves portfolio definitions + row assignments.
6. Sync payload remains config-only and excludes holdings values.

---

## Verification

- `pnpm --filter ./tampermonkey test`
- Targeted manual checks on FSM holdings page:
  - Create portfolios
  - Assign/reassign holdings
  - Confirm `Unassigned` count behavior
  - Confirm `productType` visibility
  - Confirm scoped drift/rebalance updates
  - Confirm sync upload/download preserves assignments

---

## Commit

Suggested implementation commit:
- `feat(fsm): add portfolio buckets workspace with row-level assignment`

---

## Spec Gaps

### Blocking product spec gaps
None. Your latest decisions are sufficient to start implementation.

### UX/Product review: non-blocking gaps worth closing early
From a product design + UX perspective, these are still open quality decisions (not blockers, but high impact):

1. **Wizard navigation safeguards**
   - Can users go back without losing staged selections/scroll positions?
   - Should there be an explicit "Review all changes" step before final submit?

2. **Bulk assignment safety messaging**
   - Confirm copy for `Select all` action on filtered rows (e.g., “Apply to 128 filtered holdings”).
   - Decide whether to require confirmation for large-batch apply actions.

3. **Accessibility details for new controls**
   - Keyboard flow for row checkboxes + header `Select all` checkbox.
   - Screen-reader labels for portfolio selector, wizard steps, and conflict counts.

4. **Empty/error states for wizard steps**
   - Explicit copy for “no changes in this category” steps.
   - Recovery behavior if data changes mid-resolution (e.g., new sync fetch).

5. **Portfolio slug transparency**
   - Decide whether slug/ID is user-visible anywhere or internal-only.

---

## Completion Checklist

- [ ] Confirm non-blocking UX copy/accessibility details before release hardening.
- [ ] UI + sync behavior finalized for row-level assignment model.
- [ ] Tests cover assignment and orphan edge cases.
- [ ] Rollout notes prepared for FSM users.
