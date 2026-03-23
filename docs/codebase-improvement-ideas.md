# Codebase Improvement Ideas

This document is a documentation-first audit for maintainers. It turns the current repository shape into a prioritized backlog of follow-up work without changing product behavior in this PR.

## Scope and assumptions

- Reviewed surfaces:
  - `tampermonkey/goal_portfolio_viewer.user.js`
  - `tampermonkey/__tests__/`
  - `workers/src/`
  - `README.md`
  - `TECHNICAL_DESIGN.md`
  - `TESTING.md`
  - `SYNC_ARCHITECTURE.md`
  - `tampermonkey/README.md`
  - `tampermonkey/QUICK_START.md`
  - `workers/README.md`
  - `docs/sync-setup.md`
  - `.github/workflows/ci.yml`
- This is a focused audit, not an exhaustive line-by-line review of every file.
- Recommendations are prioritized for maintainer leverage, privacy accuracy, and future implementation safety.

## Baseline verification

| Command | Outcome | Notes |
| --- | --- | --- |
| `pnpm lint` | Failed in this environment | Root script shells out to `pnpm`, but `pnpm` was not on `PATH`. |
| `pnpm test` | Failed in this environment | Same `pnpm` wrapper issue as `pnpm lint`. |
| `corepack pnpm --filter ./tampermonkey lint` | Passed | Useful environment-safe equivalent for the userscript workspace. |
| `corepack pnpm --filter ./tampermonkey test` | Passed | `11` suites / `364` tests passed, but Jest reported a forced worker exit warning that suggests open handles or timer cleanup debt. |
| `corepack pnpm --filter ./workers test` | Passed | `46` worker tests passed. |

## Observed hotspots

1. **The userscript is the main maintenance bottleneck.** `tampermonkey/goal_portfolio_viewer.user.js` is ~10.7k lines and mixes API interception, sync, crypto, rendering, storage, and test exports.
2. **Sync behavior is implemented across several coupled seams.** `SyncManager` currently owns transport fallback, token refresh, status state, conflict detection, conflict resolution, and timer scheduling inside the monolith.
3. **There is already a known sync UX debt marker in code.** `tampermonkey/goal_portfolio_viewer.user.js` includes a TODO to improve sync auth error handling and user-visible feedback.
4. **Contributor-facing docs have drifted.**
   - `TESTING.md` still describes a much smaller test surface than the current `11` Tampermonkey suites.
   - `tampermonkey/README.md` and `tampermonkey/QUICK_START.md` still reference integration files that are not present.
   - `docs/sync-setup.md` contradicts the current auto-sync default by saying both that background auto-sync is the default and that auto-sync is disabled by default.
5. **Self-hosted sync support needs validation against the actual userscript permissions model.** The userscript metadata currently whitelists `goal-portfolio-sync.laurenceputra.workers.dev`, `localhost`, and `127.0.0.1` via `@connect`, while docs describe arbitrary self-hosted Workers URLs.
6. **Docs-only PRs can avoid meaningful verification.** `.github/workflows/ci.yml` path filters are code-centric, so prose changes about setup, privacy, or sync behavior can bypass the checks that would validate those claims.

## Prioritized backlog

Unless the project intentionally changes its distribution model first, userscript recommendations below should preserve the current single-file `.user.js` delivery model and avoid introducing a required build step.

### 1. Extract the sync subsystem behind internal module boundaries

- **Category:** Architecture / refactoring
- **Why now:** The monolithic userscript is the largest source of maintenance risk. `SyncManager` is the clearest extraction seam because it already clusters auth, transport, conflict logic, and timer scheduling.
- **Likely file targets:**
  - `tampermonkey/goal_portfolio_viewer.user.js`
  - `tampermonkey/__tests__/syncManager.test.js`
  - `tampermonkey/__tests__/sync.test.js`
- **Expected value:** Smaller blast radius for sync changes, easier debugging, safer future refactors, and better test isolation.
- **Risk if ignored:** Every sync or auth change continues to touch shared state inside the 10k-line file, raising regression risk.
- **Rough effort:** Large
- **Suggested first step:** Create clearer in-file boundaries and shared helper sections for transport/auth/token management versus conflict/state orchestration, while keeping the shipped userscript as a single file.

### 2. Centralize sync auth/network/parse error handling and user guidance

- **Category:** Sync reliability and error UX
- **Why now:** The code already carries a TODO to improve sync auth error handling. Current logic spans request wrappers, response parsing, sync status state, and UI messaging.
- **Likely file targets:**
  - `tampermonkey/goal_portfolio_viewer.user.js`
  - `tampermonkey/__tests__/syncManager.test.js`
  - `tampermonkey/__tests__/syncUi.test.js`
  - `tampermonkey/__tests__/handlers.test.js`
- **Expected value:** Clearer user-visible recovery steps, fewer duplicated error branches, and safer handling of non-JSON, timeout, and rate-limit failures.
- **Risk if ignored:** Sync failures remain harder to diagnose and can drift into inconsistent behavior across login, upload, download, and conflict flows.
- **Rough effort:** Medium
- **Suggested first step:** Define one sync error contract for auth, network, parse, rate-limit, and crypto-locked cases, then route UI messaging through it.

### 3. Reconcile self-hosting claims, privacy wording, and local-storage reality

- **Category:** Privacy / security hardening
- **Why now:** The repo correctly emphasizes encrypted sync, but docs can over-simplify the local threat surface. The userscript stores cached API data, sync tokens, and optionally a remembered master key. Self-hosting docs also need to be verified against the current `@connect` allowlist and `GM_xmlhttpRequest` behavior.
- **Likely file targets:**
  - `tampermonkey/goal_portfolio_viewer.user.js`
  - `README.md`
  - `docs/sync-setup.md`
  - `tampermonkey/README.md`
  - `workers/README.md`
  - `SYNC_ARCHITECTURE.md`
  - `workers/src/auth.js`
- **Expected value:** More accurate privacy documentation, fewer support surprises for self-hosters, and a clearer security posture for contributors and users.
- **Risk if ignored:** Maintainers may overstate privacy guarantees or self-host support, and users may assume weaker local exposure than the code actually provides.
- **Rough effort:** Medium
- **Suggested first step:** Publish a doc/code truth table for auto-sync defaults, remembered keys, local cache persistence, token lifecycle, and self-hosted server compatibility.

### 4. Build a shared Tampermonkey test harness and fix cleanup leaks

- **Category:** Test coverage and maintainability
- **Why now:** The userscript tests are valuable, but they repeatedly recreate DOM, storage, fetch, and XHR mocks while importing the entire userscript for narrow assertions. The current Jest run also ends with a forced worker exit warning.
- **Likely file targets:**
  - `tampermonkey/__tests__/setup.js`
  - new shared helpers under `tampermonkey/__tests__/helpers/`
  - `tampermonkey/__tests__/syncManager.test.js`
  - `tampermonkey/__tests__/handlers.test.js`
  - `tampermonkey/__tests__/interception.test.js`
  - `tampermonkey/__tests__/syncUi.test.js`
- **Expected value:** Lower test maintenance cost, easier refactors, and better confidence in async teardown/timer behavior.
- **Risk if ignored:** Test duplication will keep growing with the product, and cleanup leaks may mask real regressions or make CI noisier.
- **Rough effort:** Medium
- **Suggested first step:** Extract a single helper for GM storage + transport mocks and run Jest with open-handle detection until the warning is eliminated.

### 5. Replace stale sync integration docs with a current-state maintainer map

- **Category:** Documentation / tooling
- **Why now:** Several docs still read like implementation-era guides instead of current repository documentation. `tampermonkey/README.md` references files that no longer exist, `tampermonkey/QUICK_START.md` describes manual integration steps for sync files that are already merged, and `TESTING.md` under-describes the real test surface.
- **Likely file targets:**
  - `tampermonkey/README.md`
  - `tampermonkey/QUICK_START.md`
  - `TESTING.md`
  - `TECHNICAL_DESIGN.md`
  - `SYNC_ARCHITECTURE.md`
- **Expected value:** Faster contributor onboarding, fewer conflicting setup instructions, and less documentation drift during future changes.
- **Risk if ignored:** New contributors will keep starting from outdated assumptions about file layout, setup flow, and testing coverage.
- **Rough effort:** Small to medium
- **Suggested first step:** Define a single-source-of-truth doc map: root README for navigation, userscript README for user usage, workers README for self-hosting, and technical docs for current implementation details.

### 6. Make repository commands and docs-consistency checks more robust

- **Category:** Tooling / developer experience
- **Why now:** The baseline exposed a real workflow issue: root `pnpm` scripts are brittle when only `corepack pnpm` is available. At the same time, docs-only changes can bypass CI even when they alter behavior-sensitive instructions.
- **Likely file targets:**
  - `package.json`
  - `.github/workflows/ci.yml`
  - `TESTING.md`
  - `README.md`
  - potential new docs-consistency script under `tampermonkey/scripts/` or a repo-level `scripts/` directory
- **Expected value:** Better local reproducibility, fewer “works in CI only” surprises, and automated detection of stale file references or contradictory defaults.
- **Risk if ignored:** Maintainers keep losing time to environment-specific command failures and doc drift lands without guardrails.
- **Rough effort:** Small to medium
- **Suggested first step:** Normalize contributor commands around `corepack pnpm` and add a lightweight docs-consistency check for referenced files, commands, and default-setting claims.

### 7. Profile startup/render overhead and make interception more registry-driven

- **Category:** Performance
- **Why now:** The product depends on global `fetch`/XHR monkey patching and a large amount of rendering logic inside one file. Performance work should be evidence-driven, but the current structure makes that hard to measure and optimize safely.
- **Likely file targets:**
  - `tampermonkey/goal_portfolio_viewer.user.js`
  - `demo/`
  - `TECHNICAL_DESIGN.md`
- **Expected value:** Safer future endpoint additions, more predictable startup behavior, and clearer boundaries between interception, caching, and rendering work.
- **Risk if ignored:** Performance fixes will stay coupled to broad refactors, and regressions from new interception or rendering features will be harder to localize.
- **Rough effort:** Medium
- **Suggested first step:** Introduce an endpoint-handler registry around the existing interception hooks and add a simple profiling checklist for startup, modal open, and sync-triggered UI updates.

### 8. Split worker middleware before the backend grows further

- **Category:** Architecture / maintainability
- **Why now:** `workers/src/index.js` is still manageable, but it is already accumulating env resolution, payload streaming, auth, rate limiting, dispatch, and response shaping. It is the main backend hotspot if new routes are added.
- **Likely file targets:**
  - `workers/src/index.js`
  - new middleware helpers under `workers/src/`
  - `workers/test/api.test.js`
  - `workers/test/auth.test.js`
  - `workers/README.md`
- **Expected value:** Cleaner route additions, easier worker testing, and clearer documentation of payload limits and auth behavior.
- **Risk if ignored:** The backend inherits the same “single entrypoint for everything” pressure already visible in the userscript.
- **Rough effort:** Medium
- **Suggested first step:** Extract body parsing/payload enforcement and auth/rate-limit middleware before any new sync endpoints or payload shapes are introduced.

## Recommended next 3 follow-up tickets

1. **`refactor(sync): separate transport/auth/state/conflict seams within SyncManager`**
   - Highest long-term leverage because it reduces change risk across the biggest hotspot in the repo.
2. **`docs(sync): reconcile auto-sync defaults, self-host support, and local-storage/privacy claims`**
   - Highest trust/value doc fix because several current docs disagree with each other or with the userscript metadata.
3. **`test(harness): centralize Tampermonkey mocks and fix Jest open-handle leakage`**
   - Best QA multiplier because it reduces future test friction while addressing a concrete signal from the current baseline.

## Assumptions and minor gaps

- The self-hosting `@connect` concern is treated as a high-priority validation item because the metadata currently lists only the hosted sync service plus local development hosts. This should be confirmed in a live Tampermonkey run before any definitive support promise is made.
- The recommendations intentionally avoid product changes and focus on maintainability, correctness of documentation, and future implementation safety.
- Some performance and security ideas need live browser validation in addition to the current unit-test evidence.
