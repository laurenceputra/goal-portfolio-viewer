---
name: ci-failure-triage
description: Required workflow for failed or inconclusive CI checks, including artifact-first diagnosis, failure classification, remediation, and check re-watch.
license: MIT
tags:
  - ci
  - debugging
  - workflow
allowed-tools:
  - bash
  - git
  - github
  - markdown
metadata:
  author: laurenceputra
  version: 1.0.0
---

# CI Failure Triage

Use this skill whenever a GitHub check fails, is cancelled unexpectedly, or is inconclusive.

## Required Triggers

- Any PR check reports `fail`, `error`, or unexpected `cancelled`.
- A required check is missing or stuck long enough to block completion.
- Local verification disagrees with CI.
- Visual regression, browser, deployment, dependency audit, lint, or worker checks fail.

## Triage Contract

1. Identify the failed check, workflow run, and job URL.
2. Inspect job logs before guessing from the check name.
3. Download and inspect artifacts when available.
4. Classify the failure.
5. Choose the remediation path.
6. Implement or document the remediation.
7. Run the relevant local verification when possible.
8. Push the fix when files changed.
9. Re-watch PR checks to completion.
10. Update the PR artifact if scope, baselines, verification, or residual risks changed.

## Failure Classes

- `product regression`: app behavior is wrong and code must be fixed.
- `test regression`: test expectation is stale or incorrect and needs a scoped update.
- `visual baseline drift`: screenshot change is intended and the baseline should be refreshed with rationale.
- `infra/environment`: host, browser dependency, network, cache, or runner issue blocks execution.
- `dependency/security`: audit or dependency policy failure requires dependency or policy review.
- `lint/format`: static check failure requires code or doc formatting correction.
- `flaky/inconclusive`: evidence supports rerun or additional stabilization work.

## Artifact-First Rule

- Download CI artifacts before making a fix when artifacts exist.
- Read summary JSON or structured reports first when available.
- Preserve actual, baseline, and diff screenshots long enough to compare them.
- Do not update a baseline until the visual change is confirmed intentional.

## Visual Regression Gate

For screenshot or E2E visual failures:

1. Compare actual, baseline, and diff artifacts.
2. Determine whether the change is intended behavior or an unintended regression.
3. If intended, refresh the baseline and record why.
4. If unintended, fix product code and keep the baseline unchanged.
5. Commit baseline refreshes separately when practical.

## Local Capability Check

Before relying on local reproduction, classify each check as:

- `runnable locally`
- `blocked by host dependencies`
- `CI-only verification required`

If local execution is blocked, record the blocking dependency and rely on CI evidence after the fix.

## PR Artifact Entry

Record material CI triage in the PR body:

```md
### CI Failure Triage

Check:
Run/Job:
Classification:
Evidence:
Remediation:
Verification:
Residual Risk:
Status:
```

## Exit Criteria

CI triage is complete only when:

- the failure is classified from logs or artifacts
- the remediation path is documented
- changed files are committed and pushed when applicable
- required checks pass, are expectedly skipped, or are explicitly waived by the user
