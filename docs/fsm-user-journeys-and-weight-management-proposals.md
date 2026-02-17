# FSM Overlay: User Journeys + Portfolio Weight Management Proposals

## Goal

Define FSM-specific user journeys for the new overlay and present product proposals that improve how users manage portfolio weights.

This proposal explicitly includes:
- visibility of `productType` in FSM tables, and
- an option for users to group assets into multiple user-defined portfolios inside the FSM view.

## Constraints

- Data source is FSM holdings interception (`find-holdings-with-pnl`) with existing filtered rows.
- Current FSM overlay is intentionally minimal and does not yet mirror all Endowus analytics.
- Sync remains configuration-only; amount-bearing holdings data remains local-only.
- No backend contract change required for UI-only FSM enhancements.

## User Journeys (FSM)

### Journey 1: Quick Check (single account, single portfolio)
1. User visits FSM holdings page.
2. User clicks **Portfolio Viewer**.
3. User sees holdings table with: `code`, `name`, `productType`, `currentValueLcy`.
4. User immediately spots concentration issues by sorting/filtering by value and product type.
5. User updates target weights and reviews drift summary + buy/sell suggestion amounts.

**Success signal:** user can answer “what is overweight/underweight now?” in under 60 seconds.

### Journey 2: Rebalancing Plan (single portfolio with targets)
1. User opens FSM overlay and sets target weights per instrument.
2. Overlay computes actual weight, drift, and estimated buy/sell amount.
3. User marks specific instruments as fixed (optional) and adjusts the rest.
4. User exports/notes rebalance actions and closes overlay.

**Success signal:** user can produce a clear rebalance plan without external spreadsheets.

### Journey 3: Strategy Segmentation (multiple portfolios in one account)
1. User creates user-defined portfolios (e.g., `Core`, `Income`, `High-Risk`).
2. User assigns instruments to a portfolio group.
3. User toggles between group-level and all-holdings view.
4. Each portfolio has independent targets and drift summary.
5. User rebalances per strategy bucket, not only whole-account.

**Success signal:** user can manage multiple strategies independently while using one FSM account.

## Proposal A — “Guided Weights Table” (Low-to-Medium Complexity)

### Overview
Enhance the current FSM table into a guided weight-management grid.

### Key UX additions
- Add visible `productType` column in main holdings table.
- Add computed columns:
  - Actual Weight %
  - Target Weight %
  - Drift %
  - Suggested Action Amount (SGD)
- Add quick filters:
  - by `productType`
  - by overweight/underweight status
- Add sort presets:
  - largest holding
  - largest drift

### Portfolio grouping support
- Add optional `Portfolio` column with dropdown assignment.
- Default group: `Unassigned`.
- Top tabs/chips: `All`, plus each user-defined portfolio.
- Group-specific totals and drift summary shown when a portfolio is selected.

### Why this helps
- Keeps interaction close to current 3-column model.
- Fast path for most users.
- Minimal conceptual overhead while still introducing portfolio segmentation.

## Proposal B — “Portfolio Buckets + Rebalance Workspace” (Medium-to-High Complexity)

### Overview
Introduce a two-level FSM workspace: portfolio list (left/top) + detailed rebalance panel.

### Key UX additions
- Portfolio manager:
  - create/rename/archive portfolio groups
  - assign assets by bulk action or per-row assignment
- Portfolio detail panel includes:
  - productType breakdown (allocation by productType)
  - target vs actual chart/table
  - rebalance list (buy/sell amount per instrument)
- “Unassigned assets” queue for new holdings to force explicit group assignment.

### Portfolio grouping support
- Independent target models per portfolio.
- Optional shared/global drift thresholds with per-portfolio override.
- Portfolio-level summary rollup in `All portfolios` mode.

### Why this helps
- Best for users managing multiple strategy sleeves.
- Makes prioritization and execution planning clearer.
- Reduces confusion when one account contains mixed objectives.

## Tradeoffs

### Proposal A
- **Pros:** faster to ship, lower learning curve, easier migration from current view.
- **Cons:** less opinionated workflow; complex multi-strategy users may still want deeper tooling.

### Proposal B
- **Pros:** strongest support for multi-strategy portfolio management and rebalancing workflows.
- **Cons:** higher implementation and UX complexity; requires stronger onboarding and more test surface.

## Recommendation

Ship **Proposal A first** as v1.5 enhancement, then evolve to selected parts of Proposal B once adoption data validates demand for advanced portfolio segmentation.

Rationale:
- Immediate value with lower risk.
- Directly addresses current user feedback (weights + productType + grouping) without a full UI redesign.
- Preserves a clean path to a richer workspace model later.

## Work Items and Exact Changes (for follow-up implementation)

1. Add `productType` column and computed weight/drift columns in FSM overlay table.
   - File: `tampermonkey/goal_portfolio_viewer.user.js`
2. Add portfolio grouping model and local storage keys for assignment.
   - File: `tampermonkey/goal_portfolio_viewer.user.js`
3. Extend sync config namespace for FSM group metadata (config-only).
   - File: `tampermonkey/goal_portfolio_viewer.user.js`
4. Add tests for grouping, productType rendering, and per-portfolio drift calculations.
   - Files:
     - `tampermonkey/__tests__/init.test.js`
     - `tampermonkey/__tests__/syncManager.test.js`
     - `tampermonkey/__tests__/utils.test.js`

## Acceptance Criteria

- FSM overlay visibly includes `productType` per holding row.
- Users can create and assign holdings to at least two custom portfolios.
- Overlay supports `All portfolios` and per-portfolio views.
- Weight/drift calculations can be viewed at both global and selected-portfolio scope.
- Sync payload remains config-only and excludes amount-bearing holdings values.

## Verification

- `pnpm --filter ./tampermonkey test`
- Manual FSM checks:
  - open FSM overlay
  - confirm `productType` display
  - create groups and assign holdings
  - verify per-group summaries update

## Commit

Suggested commit message for implementation phase:
- `feat(fsm): add productType and portfolio grouping for weight management`

## Completion Checklist

- [ ] User journeys validated against live FSM holdings behavior.
- [ ] At least two proposal paths documented with tradeoffs.
- [ ] Grouped portfolio option included.
- [ ] `productType` requirement included.
