# FSM Issue Investigation + Remediation Spec (Portfolio UX, Asset Targets, Sync CSP)

## Goal

Investigate and specify fixes for three reported FSM issues:
1. Portfolio name management is too clunky and consumes too much space.
2. No way to assign target allocation per asset in FSM workspace.
3. `Sync now` triggers CSP `connect-src` blocking in console.

This spec documents root cause, proposed fix, and why each fix will work.

---

## Scope

### In scope
- FSM overlay UX/layout refinements for portfolio management controls.
- FSM per-asset target input UX and persistence wiring.
- Sync transport changes needed to avoid page-level CSP `connect-src` blocking.
- Tests required for regression and behavior verification.

### Out of scope
- Worker backend schema changes.
- Endowus overlay redesign.
- New data classes in sync payload (still config-only for FSM).

---

## Investigation Findings

## Issue 1 — Portfolio name management is clunky and takes too much space

### Observed behavior
- Portfolio management UI is always rendered as a full-width block above the table.
- Each portfolio row permanently shows inline rename/archive buttons.
- Creating/renaming is done via top-row controls and browser prompt, which fragments flow and wastes vertical space.

### Root cause
- Current FSM overlay renders an always-visible manager section (`.gpv-fsm-manager`) with row-per-portfolio actions and no compact/collapsible mode.
- Rename action uses `window.prompt(...)`, creating a modal interruption instead of inline editable state.

### Code evidence
- Always-on manager area and list rendering: `gpv-fsm-manager`, `gpv-fsm-portfolio-list`, per-row actions.【F:tampermonkey/goal_portfolio_viewer.user.js†L8945-L8986】
- Prompt-based rename flow: `window.prompt('Rename portfolio', item.name)`.【F:tampermonkey/goal_portfolio_viewer.user.js†L8958-L8967】
- CSS keeps manager/rows as full visible flex rows, adding persistent vertical space usage.【F:tampermonkey/goal_portfolio_viewer.user.js†L8546-L8577】

### Proposed fix
- Replace always-expanded portfolio manager with a compact “Manage portfolios” disclosure panel/drawer.
- Default state collapsed; show only summary chip row in main toolbar (portfolio count + unassigned count + manage button).
- Inside manager panel:
  - inline editable rename (no browser prompt),
  - overflow menu per portfolio (`Rename`, `Archive`) instead of always-visible action buttons,
  - sticky compact create row at top.
- Add keyboard/ARIA semantics for disclosure and menu controls.

### Why this fix will work
- Collapsing non-primary controls frees vertical space for holdings table (core task area).
- Replacing prompt with inline edit reduces context switching and makes state changes clearer.
- Overflow actions reduce visual noise while keeping full capability.

---

## Issue 2 — No way to assign target allocation per asset

### Observed behavior
- FSM rows read target values from storage and include them in summary drift math, but no editable target input is rendered in table rows.
- Users cannot set/update per-asset targets from FSM overlay.

### Root cause
- `buildFsmRowsWithAssignment` pulls `targetPercent` from storage, but table columns do not include target input/edit controls.
- Current table includes Ticker/Name/Product Type/Value/Portfolio only.

### Code evidence
- Row model contains `targetPercent` sourced from FSM storage keys.【F:tampermonkey/goal_portfolio_viewer.user.js†L8798-L8823】
- Summary computation uses row `targetPercent` for target/drift displays.【F:tampermonkey/goal_portfolio_viewer.user.js†L8825-L8845】
- Rendered FSM table omits target input column (only ticker/name/type/value/portfolio).【F:tampermonkey/goal_portfolio_viewer.user.js†L9064-L9117】

### Proposed fix
- Add `Target %` column to FSM table with per-row numeric input (0–100, 2 decimals).
- Persist edits to `storageKeys.fsmTarget(code)`; empty input clears target for that code.
- Add optional `Fixed` checkbox column per row mapped to `storageKeys.fsmFixed(code)`:
  - when fixed=true, disable target input and clear target key (consistent with existing sync/filter logic).
- Add validation and feedback:
  - client-side numeric bounds,
  - non-blocking row-level error text,
  - recalc summary/drift immediately after valid updates.

### Why this fix will work
- It exposes an existing data model path already used in calculations/sync, so functionality becomes user-operable without schema expansion.
- Reusing established storage keys preserves backward compatibility and sync parity.

---

## Issue 3 — Sync now fails with CSP `connect-src` block

### Observed behavior
- Triggering sync from FSM route causes console CSP errors about blocked `connect-src`.
- Sync logic currently uses browser `fetch` for cross-origin sync server calls.

### Root cause
- Userscript metadata does not declare `@connect` allowlist entries for sync endpoint.
- Script does not grant/use Tampermonkey cross-origin request API (`GM_xmlhttpRequest`), so requests rely on page-context `fetch`, which is constrained by host page CSP.

### Code evidence
- Metadata has no `@connect` directives and no `GM_xmlhttpRequest` grant declaration.【F:tampermonkey/goal_portfolio_viewer.user.js†L1-L17】
- Sync/auth/health paths use cross-origin `fetch(...)` to configured sync server URL.【F:tampermonkey/goal_portfolio_viewer.user.js†L2241-L2250】【F:tampermonkey/goal_portfolio_viewer.user.js†L2711-L2749】【F:tampermonkey/goal_portfolio_viewer.user.js†L3215-L3254】【F:tampermonkey/goal_portfolio_viewer.user.js†L6463-L6468】

### Proposed fix
- Introduce `requestJson` transport wrapper:
  - use `GM_xmlhttpRequest` when available (Tampermonkey privileged context, not bound by page CSP),
  - fallback to `fetch` for test/runtime compatibility.
- Add metadata:
  - `@grant GM_xmlhttpRequest`
  - `@connect goal-portfolio-sync.laurenceputra.workers.dev`
  - `@connect localhost` and `@connect 127.0.0.1` for local self-hosted testing (optional but recommended).
- Route all sync/auth/health requests through `requestJson` wrapper.

### Why this fix will work
- Tampermonkey privileged requests are evaluated against userscript `@connect` policy instead of page `connect-src`, bypassing host-page CSP restrictions for approved hosts.
- Centralizing transport avoids inconsistent behavior and simplifies retry/error handling.

---

## Work Items and Exact Changes

1. **Compact portfolio management UX**
   - File: `tampermonkey/goal_portfolio_viewer.user.js`
   - Replace always-visible manager block with collapsible panel + inline rename states + overflow actions.

2. **Per-asset target allocation editing**
   - File: `tampermonkey/goal_portfolio_viewer.user.js`
   - Add `Target %` (and optional `Fixed`) columns with persistence + validation + instant summary refresh.

3. **CSP-safe sync transport**
   - File: `tampermonkey/goal_portfolio_viewer.user.js`
   - Add userscript grants/connect metadata and introduce request wrapper using `GM_xmlhttpRequest`.
   - Replace direct sync/auth/health `fetch` paths with wrapper.

4. **Test coverage updates**
   - Files:
     - `tampermonkey/__tests__/init.test.js`
     - `tampermonkey/__tests__/syncManager.test.js`
     - `tampermonkey/__tests__/interception.test.js` (if transport mocks need extension)
   - Add tests for compact manager behavior, target input persistence/validation, and CSP-safe request path abstraction.

---

## Acceptance Criteria

### AC-1 Portfolio UX compactness
- Manager is collapsed by default.
- Holdings table remains visible without manager controls consuming primary vertical area.
- Rename and archive are accessible via compact controls and keyboard operable.

### AC-2 Asset target allocation editing
- User can set, update, and clear target per asset from FSM table.
- Summary target/drift recomputes immediately after edit.
- Fixed rows behave consistently (target excluded when fixed=true).

### AC-3 Sync works under host CSP
- `Sync now` succeeds on FSM route without CSP `connect-src` console block for configured sync host.
- Sync/auth/health requests use centralized transport wrapper.
- Existing sync payload privacy boundaries remain unchanged (config-only).

### AC-4 Regression safety
- Existing tampermonkey suite passes.
- New tests validate all three issue fixes.

---

## Verification

### Automated
- `pnpm --filter ./tampermonkey test`
- `pnpm --filter ./tampermonkey test -- init.test.js`
- `pnpm --filter ./tampermonkey test -- syncManager.test.js`

### Manual
1. Open FSM holdings route.
2. Confirm portfolio manager is compact/collapsible by default.
3. Edit target % for an asset and verify immediate summary/drift refresh.
4. Toggle fixed state and verify target behavior consistency.
5. Trigger `Sync now`; confirm no CSP `connect-src` block in console and sync completes.

---

## Risks and Mitigations

- **Risk:** `GM_xmlhttpRequest` differences vs `fetch` response handling.
  - **Mitigation:** normalize response parsing in transport wrapper; keep fallback path and comprehensive unit tests.

- **Risk:** Inline rename/edit state complexity introduces UI regressions.
  - **Mitigation:** add deterministic state tests and keyboard interaction checks.

- **Risk:** Target-input validation edge cases (empty, NaN, >100).
  - **Mitigation:** explicit parser + row-level validation tests.

---

## Commit

Suggested implementation commit after coding this spec:
- `feat(fsm): compact portfolio manager, asset target inputs, and CSP-safe sync transport`

---

## Completion Checklist

- [ ] Implement compact portfolio manager UX.
- [ ] Implement per-asset target allocation input/editing.
- [ ] Implement CSP-safe sync request transport using Tampermonkey grant/connect allowlist.
- [ ] Add/update tests for all three fixes.
- [ ] Run tampermonkey test suite and verify manual sync on FSM route.
