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
10. **Privacy:** sync only config metadata; no amount-bearing holdings sync.

---

## Functional Requirements

## FR-1 Portfolio manager
- User can create custom portfolios with no hard limit.
- Portfolio name length is limited to 64 characters.
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
- Bulk assignment must support applying to all currently filtered rows.

---

## UX Requirements

- If there are orphan holdings (`Unassigned` count > 0), show a visible badge/chip count.
- Empty portfolio view shows informative empty state with action to assign holdings.
- Assignment changes should be immediate in UI and reflected in summary calculations without full reload.
- Bulk assignment flow includes checkbox selection + clear confirmation of number of rows affected.
- `productType` is displayed as-is from FSM payload in holdings tables.

---

## Conflict UX Proposals for Assignment Changes

### Proposal A: Single-screen grouped diff
- One modal with sectioned diff blocks:
  - Portfolio definitions (create/rename/archive)
  - Assignment changes (code -> portfolioId)
  - Target changes per portfolio
- Pros: fast, fewer clicks.
- Cons: can be dense with many rows.

### Proposal B: Multi-step conflict wizard (**recommended**)
1. Step 1: high-level conflict summary (counts per category).
2. Step 2: portfolio definitions changes.
3. Step 3: assignment changes (search/filter by code and portfolio).
4. Step 4: target/drift setting changes.
5. Step 5: final decision (Keep Local / Use Remote).

Why multi-step works here:
- Better readability at scale when assignments are numerous.
- Lower risk of accidental overwrite because user sees categories separately.
- Aligns with current concern about diff explainability parity.

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

Based on your latest decisions, **no blocking product spec gaps remain** for Proposal B core behavior.

### Non-blocking implementation clarifications (can be finalized during build)
1. **Portfolio ID generation rule**
   - e.g., slug from name with collision suffix (`core`, `core-2`) vs UUID.
2. **Bulk assignment max batch UX**
   - whether to show soft warning for large selections (e.g., >200 rows).
3. **Conflict UX rollout strategy**
   - whether to ship Proposal A first and upgrade to multi-step wizard later, or ship wizard immediately.

---

## Completion Checklist

- [ ] Product decisions above are encoded in implementation tasks.
- [ ] UI + sync behavior finalized for row-level assignment model.
- [ ] Tests cover assignment and orphan edge cases.
- [ ] Rollout notes prepared for FSM users.
