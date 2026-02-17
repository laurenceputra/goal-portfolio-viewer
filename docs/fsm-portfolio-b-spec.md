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
3. **Orphan handling:** holdings without explicit assignment remain in `Unassigned`; never hidden.
4. **Display requirement:** `productType` must be shown in FSM holdings views.
5. **Privacy:** sync only config metadata; no amount-bearing holdings sync.

---

## Functional Requirements

## FR-1 Portfolio manager
- User can create custom portfolios (minimum 2 supported, no hard max in UI unless constrained by UX decision).
- User can rename and archive portfolios.
- Archiving a portfolio reassigns its holdings to `Unassigned`.

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

---

## UX Requirements

- If there are orphan holdings (`Unassigned` count > 0), show a visible badge/chip count.
- Empty portfolio view shows informative empty state with action to assign holdings.
- Assignment changes should be immediate in UI and reflected in summary calculations without full reload.

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

The following items still need explicit product decisions before implementation starts:

1. **Portfolio lifecycle limits**
   - Max number of portfolios?
   - Name length/character rules?

2. **Archived portfolio behavior**
   - Should archived portfolios be hidden entirely or visible in a separate section?
   - Must archive always force reassignment to `Unassigned`, or allow deferred migration?

3. **Target model scope default**
   - When user is in `All`, should targets be global-only or derived/aggregated from portfolio targets?
   - Should each portfolio have independent target sets by default?

4. **Unassigned policy strictness**
   - Is rebalancing allowed when unassigned holdings exist, or should there be a warning/block?

5. **Conflict UX for assignment changes**
   - In sync conflict dialog, how should portfolio/assignment diffs be grouped and labeled for readability at scale?

6. **Migration strategy for existing FSM users**
   - On first rollout, should every holding default to `Unassigned` or offer a one-time quick assignment wizard?

7. **ProductType normalization**
   - Should raw API `productType` values be shown as-is, or mapped to user-friendly labels?

---

## Completion Checklist

- [ ] Product confirms spec gap decisions.
- [ ] UI + sync behavior finalized for row-level assignment model.
- [ ] Tests cover assignment and orphan edge cases.
- [ ] Rollout notes prepared for FSM users.
