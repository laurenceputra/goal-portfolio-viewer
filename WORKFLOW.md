# Goal Portfolio Viewer Workflow

## Goal

Make the project easier to validate by turning the repeated review findings into a small, repo-local harness.

This harness is intentionally project-specific. It focuses on the failure modes that kept showing up in this codebase:
- readiness vs loaded state
- Endowus vs FSM route behavior
- compare and discovery stale state
- sync apply cleanup
- timer and teardown leaks
- version and changelog drift

## Work Items and Exact Changes

### 1. Add release metadata checks
Create a repo-local guard that verifies the release metadata stays aligned:
- root `package.json`
- `tampermonkey/package.json`
- userscript `@version`
- `tampermonkey/README.md` changelog heading

**File targets**
- `scripts/check-release-metadata.js`
- `package.json`

### 2. Add open-handle validation
Expose a stable command for detecting timer / teardown leaks in the userscript test suite.

**File targets**
- `package.json`

### 3. Document the workflow
Add a short project-local workflow guide that tells contributors what to run and what to watch for.

**File targets**
- `WORKFLOW.md`
- `README.md`

## Acceptance Criteria

### Release metadata check
- Fails when any version string is out of sync.
- Fails when the README changelog does not contain the current version heading.
- Passes when the versions and changelog are aligned.

### Open-handle validation
- There is a documented command for running Jest with open-handle detection.
- The command can be invoked from the repo root.

### Workflow documentation
- The workflow doc lists the canonical validation order.
- The workflow doc calls out route-aware smoke checks and release hygiene.
- The workflow doc points contributors to the right commands without requiring them to guess.

## Verification

Run these from the repo root:

```bash
COREPACK_HOME=/home/node/.cache/corepack pnpm run lint
COREPACK_HOME=/home/node/.cache/corepack pnpm test
COREPACK_HOME=/home/node/.cache/corepack pnpm run check:release-metadata
COREPACK_HOME=/home/node/.cache/corepack pnpm run check:open-handles
```

If Playwright is installed on the host, also run:

```bash
COREPACK_HOME=/home/node/.cache/corepack pnpm test:e2e
```

## Commit

Suggested commit message:

```text
Add project-local harness checks and workflow guide
```

## Completion Checklist

- [ ] Release metadata check added and wired into package scripts
- [ ] Open-handle validation command added and documented
- [ ] Workflow guide added with route-aware smoke and validation steps
- [ ] README points contributors to the workflow guide
- [ ] Commands run and pass locally
