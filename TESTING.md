# Testing Guide

## Overview

This document explains the testing infrastructure for the Goal Portfolio Viewer project. The project uses Jest for testing with **zero code duplication** - all logic lives in one place.

## Architecture

### Single Source of Truth Pattern

The project uses a unique pattern to enable testing without code duplication:

1. **The Userscript** (`tampermonkey/goal_portfolio_viewer.user.js`):
   - Single self-contained file with ALL logic
   - Pure functions defined at the top
   - Browser-specific code wrapped in `if (typeof window !== 'undefined')`
   - Conditional exports at the bottom: `if (typeof module !== 'undefined' && module.exports)`
   - Works standalone in browser, exports functions in Node.js for testing

2. **Tests** (`tampermonkey/__tests__/utils.test.js`):
   - Import pure functions directly from the userscript
   - Test the REAL implementation, not a duplicate
   - No synchronization needed between files

**Key Insight**: The userscript detects its environment (browser vs Node.js) and behaves accordingly:
- In browser: Functions are internal to the IIFE, browser code runs normally
- In Node.js: Browser code is skipped, functions are exported for testing

**IMPORTANT**: Changes to logic are made in ONE place:
- Update function in `tampermonkey/goal_portfolio_viewer.user.js`
- Add function to exports section if it's new
- Add/update tests in `tampermonkey/__tests__/utils.test.js`

### Test Hooks and Conditional Exports

- `window.__GPV_DISABLE_AUTO_INIT`: set this to `true` before loading the userscript in Jest/jsdom to prevent DOM auto-init during tests. Keep it undocumented in runtime behavior but noted here for contributors.
- UI/browser-only helpers are conditionally exported. Tests that import them **must guard** for `undefined` and skip gracefully when absent to avoid brittle failures.

## Running Tests

### Install Dependencies (Node 20.x)

Run tests on Node 20.x to match CI and avoid environment drift.

```bash
pnpm install
```

### Run Tests

```bash
# Run all tests once
pnpm test

# Run tests in watch mode (auto-rerun on changes)
pnpm run test:watch

# Run tests with coverage report
pnpm run test:coverage

# Run documentation drift detector tests
pnpm run test:docs

# Verify markdown links, documented commands, and version touchpoints
pnpm run doc:drift
```

### Test Output

When tests pass, you'll see:
```
Test Suites: 1 passed, 1 total
Tests:       42 passed, 42 total
Snapshots:   0 total
Time:        0.444 s
```

Coverage report shows:
```
----------|---------|----------|---------|---------|-------------------
File      | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s 
----------|---------|----------|---------|---------|-------------------
All files |     100 |    94.73 |     100 |     100 |                   
 utils.js |     100 |    94.73 |     100 |     100 | 118-119,166       
----------|---------|----------|---------|---------|-------------------
```

## Test Structure

### Test Files

- `tampermonkey/__tests__/utils.test.js` - Unit tests for all pure functions

### Tested Functions

1. **`getGoalTargetKey(goalId)`**
   - Generates storage keys for goal target percentages
   - Tests: normal input, empty string, special characters

2. **`getProjectedInvestmentKey(bucket, goalType)`**
   - Generates keys for projected investments
   - Tests: normal input, empty strings, special characters

3. **`getDisplayGoalType(goalType)`**
   - Converts internal goal types to display names
   - Tests: all known types, unknown types, empty string

4. **`sortGoalTypes(goalTypeKeys)`**
   - Sorts goal types in preferred order
   - Tests: full set, partial set, mixed, empty array, immutability

5. **`formatMoney(val)`**
   - Formats numbers as currency strings
   - Tests: positive, negative, zero, decimals, invalid inputs, large numbers

6. **`formatGrowthPercentFromEndingBalance(totalReturn, endingBalance)`**
   - Calculates and formats growth percentage
   - Tests: positive/negative returns, zero, division by zero, invalid inputs

7. **`buildMergedInvestmentData(performanceData, investibleData, summaryData)`**
   - Core function: merges data from 3 API endpoints
   - Tests: null inputs, invalid types, single goal, multiple goals, multiple buckets, missing fields, empty arrays

## Writing New Tests

### Test Structure Pattern

```javascript
describe('functionName', () => {
    test('should handle normal case', () => {
        const result = functionName(input);
        expect(result).toBe(expected);
    });

    test('should handle edge case', () => {
        const result = functionName(edgeInput);
        expect(result).toBe(expectedEdge);
    });

    test('should handle error case', () => {
        const result = functionName(invalidInput);
        expect(result).toBe(errorExpected);
    });
});
```

### Best Practices

1. **Test both happy path and edge cases**
   - Normal inputs
   - Empty/null/undefined
   - Invalid types
   - Boundary values
   - Error conditions

2. **Use descriptive test names**
   ```javascript
   // Good
   test('should return "Uncategorized" for empty goal name', () => { ... });
   
   // Bad
   test('test 1', () => { ... });
   ```

3. **Keep tests isolated**
   - Each test should be independent
   - Don't rely on test execution order
   - Clean up any state changes

4. **Test one thing per test**
   ```javascript
   // Good - single assertion
   test('should format positive numbers', () => {
       expect(formatMoney(1000)).toBe('$1,000.00');
   });
   
   // Bad - multiple unrelated assertions
   test('should format money', () => {
       expect(formatMoney(1000)).toBe('$1,000.00');
       expect(formatMoney(-500)).toBe('$-500.00');
       expect(formatMoney(null)).toBe('-');
   });
   ```

5. **Add tests for financial calculations**
   - Financial accuracy is critical
   - Test with real-world values
   - Verify rounding behavior
   - Test edge cases (very large/small numbers)
6. **Cover new UI/rendering utilities early**
   - Add minimal jsdom-based tests when introducing renderers/charts/caches
   - Guard conditional exports so browser-only helpers don’t break Node test runs

## Continuous Integration

### GitHub Actions Workflow

The CI workflow (`.github/workflows/ci.yml`) runs on:
- Every push to `main` branch
- Pull request events targeting `main` (`opened`, `synchronize`, `reopened`, `ready_for_review`)

Draft pull requests are intentionally skipped by job conditions. When a draft PR is marked **Ready for review**, jobs can run on the `ready_for_review` trigger (or on the next commit).

### CI Steps

1. Checkout code
2. Setup Node.js (20.x)
3. Install dependencies (`pnpm install`)
4. Run affected jobs based on changed paths (lint, userscript tests, doc drift, worker unit tests, e2e)
5. Post coverage/comments and upload artifacts for relevant jobs

### CI Requirements

- All tests must pass
- No test failures allowed
- Draft PRs should show CI jobs as skipped
- Ready/non-draft PRs should run eligible jobs based on path filters
- Documentation changes should trigger the doc drift job when relevant files change

### Viewing CI Results

1. Go to the Pull Request page
2. Check the "Checks" tab
3. Confirm whether jobs are skipped (draft PR) or executed (ready/non-draft PR)
4. Click on failed tests to see details

## Common Issues

### Tests Fail Locally But Pass in CI

- Ensure you have the correct Node.js version
- Delete `node_modules` and `pnpm-lock.yaml`, then `pnpm install`
- Check for environment-specific code

### Tests Pass But Coverage is Low

- Add tests for uncovered branches
- Test error handling paths
- Test all function inputs/outputs

### Locale-Dependent Tests

`formatMoney()` uses `toLocaleString()` which can vary by system locale. If tests fail:

```javascript
// Instead of exact match
expect(formatMoney(1000)).toBe('$1,000.00');

// Use regex or partial match
expect(formatMoney(1000)).toMatch(/^\$1,000\.00$/);
```

## Maintenance

### Keeping Tests in Sync

When updating the userscript:

1. ✅ Update function in `tampermonkey/goal_portfolio_viewer.user.js`
2. ✅ If adding a new testable function, add it to the conditional exports section
3. ✅ Update or add tests in `tampermonkey/__tests__/utils.test.js`
4. ✅ Run tests locally
5. ✅ Commit all changes together

**No duplication!** There's only ONE copy of each function - in the userscript itself.

### Test Coverage Goals

- **Pure Logic Functions**: 100% coverage for exported functions
- **Overall File**: Lower percentage is expected (includes browser-only code)

Current coverage for tested functions: 100% statements, 94.73% branches, 100% functions

## Resources

- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [Jest Matchers](https://jestjs.io/docs/expect)
- [Testing Best Practices](https://github.com/goldbergyoni/javascript-testing-best-practices)
- [GitHub Actions Documentation](https://docs.github.com/en/actions)

## Worker Test Coverage Plan (Track A: Unit Tests Only)

### Goal

Create initial automated test coverage for the Cloudflare Worker backend using **unit tests only** for Track A. Integration tests are explicitly out of scope for this track.

### Scope and Non-Goals

- **In scope (Track A)**
  - Unit tests for worker modules with mocked dependencies.
  - CI gating so worker unit tests run only when corresponding worker files change.
- **Out of scope (Track A)**
  - Integration tests against a live Wrangler dev server or real KV.
  - End-to-end auth/sync flow tests spanning multiple modules through deployed endpoints.

### Work Items and Exact Changes

1. **Add worker unit test harness and scripts**
   - Files:
     - `workers/package.json`
     - `workers/src/**/*.js` (only if needed for test-friendly exports)
     - `workers/__tests__/` (new unit test files)
   - Changes:
      - Use the dedicated `test:unit` script for workers.
     - Add unit tests for pure/mostly-pure behavior with mocked `env`, `Request`, and KV methods.

2. **Unit test coverage for high-risk worker modules**
   - Files:
     - `workers/src/cors.js`
     - `workers/src/ratelimit.js`
     - `workers/src/storage.js`
     - `workers/src/auth.js`
     - `workers/src/handlers.js`
     - `workers/src/index.js` (route-level unit tests with mocked collaborators)
   - Changes:
     - Add test cases for success, validation failures, authorization failures, and boundary conditions.
     - Keep test isolation by mocking cross-module calls where route logic is under test.

3. **Run only corresponding tests when files change**
   - Files:
     - `.github/workflows/ci.yml`
   - Changes:
     - Add path filtering/conditional job execution so:
       - Worker unit test job runs for changes under `workers/**` and related workflow/test config files.
       - Existing userscript unit tests run for `tampermonkey/**` or root JS test config changes.
     - Ensure skipped jobs do not block PRs.

### Acceptance Criteria

1. **Worker unit test foundation**
   - A worker test command exists and runs locally from repository scripts.
   - Worker unit tests do not require network or deployed infrastructure.

2. **Coverage quality (Track A)**
   - New unit tests cover key branches for auth validation, CORS header behavior, rate limit decision points, and request routing guards.
   - At least one regression-style test per critical error path (e.g., bad JSON, unauthorized request, rate limited request).

3. **Selective CI execution**
   - Worker unit tests are skipped automatically when only non-worker files change.
   - Userscript tests are skipped automatically when only worker files change.
   - CI still executes all applicable jobs when shared configuration files change.

4. **Scope control**
   - No integration test harness is added in Track A.
   - No requirement for Wrangler local server in CI for Track A.

### Verification

- Local verification commands (during implementation):
  - `pnpm run test`
  - `pnpm run test:coverage`
  - `pnpm --filter ./workers test:unit`
  - `pnpm run test:docs`
  - `pnpm run doc:drift`
- CI verification:
  - Open one PR that changes only `workers/src/**` and confirm only worker unit test path executes.
  - Open one PR that changes only `tampermonkey/**` and confirm worker unit test path is skipped.

### Commit

Suggested commit message after implementing Track A:

`test(workers): add unit test baseline and path-scoped CI execution`

### Completion Checklist

- [ ] Worker unit test command added and documented.
- [ ] Unit tests added for worker core modules.
- [ ] CI path filters/conditions implemented.
- [ ] Selective execution behavior validated on PR.
- [ ] Integration tests intentionally deferred to a future track.
