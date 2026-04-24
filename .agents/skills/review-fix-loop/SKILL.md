---
name: review-fix-loop
description: Required workflow for handling review findings with classification, focused fixes, verification, fresh-context subagent review, and PR artifact updates.
license: MIT
tags:
  - review
  - quality
  - workflow
allowed-tools:
  - bash
  - git
  - markdown
metadata:
  author: laurenceputra
  version: 1.0.0
---

# Review-Fix Loop

Use this skill whenever review produces a finding that may require code, docs, test, or workflow changes.

## Required Triggers

- A reviewer reports a `blocking` or `important` finding.
- A review comment identifies a correctness, security, privacy, sync, financial-calculation, CI, or regression risk.
- A previously applied fix receives follow-up review feedback.
- A finding is being declined or marked invalid and the decision needs fresh-context validation.

Minor findings may be batched, but each must still receive a disposition before PR completion.

## Loop Contract

Run this sequence for each `blocking` or `important` finding:

1. Capture the finding.
2. Classify severity and disposition.
3. Request fresh-context subagent assessment when required.
4. Implement the smallest correct fix.
5. Run focused QA.
6. Run broader affected-surface QA.
7. Request fresh-context post-fix review when required.
8. Perform main-agent self-review.
9. Update the PR artifact.
10. Push and watch checks when the loop affects CI-covered behavior or is the final loop.

All required loop steps, including PR artifact updates, must be complete before the final push and PR completion gate.

## Severity Routing

- `blocking`: fresh assessment subagent and post-fix review subagent are required.
- `important`: post-fix review subagent is required; fresh assessment subagent is recommended.
- `minor`: main-agent self-review is sufficient unless the change is risky or cross-surface.
- `invalid` or `declined`: fresh assessment subagent is recommended before closing the finding.
- `duplicate`: link to the existing loop item and inherit its verification evidence.

## Subagent Responsibilities

Subagents provide independent assessment and review. The main agent remains responsible for edits, commits, PR artifact updates, and check watching.

Fresh assessment prompt shape:

```md
Review this finding with fresh context. Do not edit files.
Return:
- whether the finding is valid
- affected files and surfaces
- likely root cause
- smallest safe fix direction
- tests that should be run or added
- risks or adjacent cases likely to be missed
```

Post-fix review prompt shape:

```md
Review the implemented fix with fresh context. Do not edit files.
Return findings only:
- blocking, important, or minor issues
- file and line references
- missing tests
- residual risks
- whether the review-fix loop can close
```

## QA Expectations

- Focused QA should target the changed behavior first.
- Broad QA should cover the affected repo surface before the loop closes.
- If a check cannot run locally, record why and identify the CI check or manual evidence that covers the gap.
- Never soften, skip, or delete tests to force a green result unless the review finding is specifically about an invalid test and the rationale is recorded.

## Required PR Artifact Entry

Add or update the Review Response Matrix for each finding that entered a review-fix loop or was explicitly deferred or declined:

```md
| Finding | Severity | Disposition | Fix Location | Verification Evidence | Residual Risk |
| --- | --- | --- | --- | --- | --- |
|  |  |  |  |  |  |
```

Verification evidence should include focused QA, broader affected-surface QA, main-agent self-review, and required fresh-context subagent review when applicable.

## Exit Criteria

A loop is closed only when all are true:

- The finding has a disposition: `fixed`, `deferred`, `declined with rationale`, `duplicate`, or `invalid with rationale`.
- Code or docs changes are committed and pushed when applicable.
- Focused QA passed or is explicitly blocked with rationale.
- Broad QA passed or is explicitly blocked with rationale.
- Required fresh-context subagent review has completed.
- Main-agent self-review found no new `blocking` or `important` issues.
- The PR artifact records the finding, fix, evidence, and residual risk.
