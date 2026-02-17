# FSM Overlay + Sync Conflict UX Remediation Spec

## Goal

Fix two regressions introduced during FSM rollout:

1. On FSM holdings route, clicking **Portfolio Viewer** should render FSM-based content instead of waiting for Endowus API triplet or showing stale Endowus cache.
2. When a sync conflict is triggered by FSM-only changes, conflict UI must show meaningful FSM differences (not an empty "Changed Goals" block).

This spec also adds a preventive process guardrail so future multi-platform changes must prove **trigger-path parity** and **conflict-diff parity** before merge.

---

## Problem Summary + Why It Happens

### Issue A: FSM trigger leads to Endowus-only overlay path

- The trigger button is visible on FSM investments route.
- `showOverlay()` still requires `buildMergedInvestmentData(performance, investible, summary)` and bails if missing.
- FSM data (`fsmHoldings`) is intercepted and cached, but not used by the overlay build/render pipeline.
- Result:
  - Fresh FSM session: repeated "Please wait for portfolio data".
  - FSM session with cached Endowus data: stale/unrelated Endowus content displayed.

### Issue B: Conflict detection includes FSM, diff UI does not

- Conflict detection hashes the normalized full config payload (`version: 2`, including `platforms.fsm`).
- Conflict dialog diff builder only compares Endowus `goalTargets`/`goalFixed`.
- Result: FSM-only conflicts can trigger modal, but "Changed Goals" may show no actionable differences.

---

## Scope

### In scope

- Route-aware overlay data source selection and rendering for Endowus vs FSM.
- Conflict diff model and UI updates to represent both Endowus and FSM changes.
- Unit tests and integration-like tests for the two regressions.
- Process guardrail update in skills/agent guidance to prevent recurrence.

### Out of scope

- Redesign of portfolio math model for FSM.
- New backend sync API schema changes.
- New sync conflict resolution policy (keep local/use remote remains unchanged).

---

## Work Items and Exact Changes

## 1) Introduce platform-aware overlay entry and data source gating

### Files
- `tampermonkey/goal_portfolio_viewer.user.js`
- `tampermonkey/__tests__/init.test.js`
- `tampermonkey/__tests__/interception.test.js`

### Changes
- Add a platform context resolver at click time (Endowus dashboard vs FSM investments route).
- Split overlay preconditions:
  - Endowus mode: current `buildMergedInvestmentData(...)` precondition remains.
  - FSM mode: require `state.apiData.fsmHoldings` (or cached `STORAGE_KEYS.fsmHoldings`) and do **not** block on Endowus datasets.
- Route overlay rendering through a platform-specific adapter:
  - Endowus: existing summary/bucket renderer path.
  - FSM: existing/new FSM renderer path using holdings rows (or an explicit temporary FSM-only view model if full renderer already exists elsewhere).
- Ensure old Endowus cache cannot become implicit fallback when active route is FSM.

### Acceptance criteria
- On FSM investments route, button opens FSM view when FSM holdings exist.
- On FSM investments route with no holdings yet, message references FSM holdings loading (not generic Endowus portfolio data dependency).
- On FSM route, stale Endowus cache is not rendered.

---

## 2) Add platform-aware sync conflict diff model + UI sections

### Files
- `tampermonkey/goal_portfolio_viewer.user.js`
- `tampermonkey/__tests__/conflictDiff.test.js`
- `tampermonkey/__tests__/syncManager.test.js`

### Changes
- Extend conflict diff builder to generate structured diff sections:
  - `endowus` diffs (`goalTargets`, `goalFixed`)
  - `fsm` diffs (`targetsByCode`, `fixedByCode`, `tagsByCode`, `tagCatalog`, `driftSettings`)
- Update conflict dialog rendering:
  - Rename "Changed Goals" to "Changed Settings" (or sectioned labels).
  - Render Endowus and FSM subsections with empty-state messaging per subsection.
- Preserve existing conflict decision actions, but improve user clarity on what will be overwritten.

### Acceptance criteria
- FSM-only divergent payload shows at least one populated FSM diff row/section.
- Endowus-only divergent payload still shows current goal-level differences.
- Mixed divergence shows both sections.
- No-conflict/equal payloads do not show conflict dialog.

---

## 3) Regression tests for trigger-path parity + conflict-diff parity

### Files
- `tampermonkey/__tests__/init.test.js`
- `tampermonkey/__tests__/interception.test.js`
- `tampermonkey/__tests__/conflictDiff.test.js`
- `tampermonkey/__tests__/syncManager.test.js`

### Test additions
- FSM route + FSM holdings present -> overlay renders FSM content path.
- FSM route + only Endowus cached data -> FSM path does not render Endowus content.
- FSM route + no FSM holdings -> explicit FSM loading feedback.
- Conflict diff:
  - FSM-only changes produce non-empty diff output.
  - Endowus-only changes unchanged.
  - Mixed changes produce both sections.

### Acceptance criteria
- New tests fail on current buggy behavior and pass after fix.
- Existing suites remain green.

---

## 4) Preventive guardrail (future catch)

### Option selected: Skills update (preferred over AGENTS global churn)

### Files
- `.agents/skills/spec-writer/SKILL.md`
- `.agents/skills/qa-testing/SKILL.md`

### Required additions
- **Spec-writer**: add mandatory "Trigger-path parity" and "Conflict-diff parity" checklist when a feature adds a new platform/route/namespace.
- **QA-testing**: add required regression matrix row for:
  - "entrypoint enabled on route" **and**
  - "render path is platform-correct" **and**
  - "conflict explanation covers all fields used in conflict detection."

### Acceptance criteria
- Future specs for multi-platform work must explicitly include both parity checks.
- Future test plans must include coverage for detection-vs-explanation parity.

---

## Reasoning for Design Choices

1. **Route-aware gating avoids implicit stale fallback**: if the button is route-enabled, the render path must be route-compatible; otherwise UI is misleading.
2. **Conflict explanation must match conflict trigger domain**: users can only make a safe overwrite decision if diff UI spans every namespace that participates in conflict detection.
3. **Guardrails in skills are low-friction and reusable**: adding parity checks where specs/tests are authored prevents this class of mismatch from recurring without expanding runtime complexity.

---

## Verification

- Run targeted unit tests:
  - `pnpm --filter ./tampermonkey test -- init.test.js`
  - `pnpm --filter ./tampermonkey test -- conflictDiff.test.js`
  - `pnpm --filter ./tampermonkey test -- syncManager.test.js`
- Run full Tampermonkey tests:
  - `pnpm --filter ./tampermonkey test`

---

## Commit

Suggested commit for the implementation PR (when executed):

- `fix(fsm+sync): align overlay and conflict diff with platform-aware v2 config`

Suggested commit for guardrail update (if split PR):

- `docs(skills): add trigger-path and conflict-diff parity checklist`

---

## Completion Checklist

- [ ] FSM route opens FSM data path, not Endowus-only path.
- [ ] FSM-only conflicts show meaningful FSM diff in UI.
- [ ] Regression tests cover both bug classes.
- [ ] Skills include parity checks to prevent recurrence.
- [ ] Existing test suite passes.
