---
name: pr-completion
description: Required finalization workflow before declaring a PR ready, including artifact currency, closed review-fix loops, pushed commits, green checks, and final status reporting.
license: MIT
tags:
  - pull-request
  - release
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

# PR Completion

Use this skill before declaring a pull request ready, complete, mergeable, or finished.

## Required Triggers

- A PR is created or updated after commits.
- The user asks to finish, ship, update, or get checks green.
- Review-fix loops have completed.
- CI failures have been remediated.
- Final status is being reported to a user.

## Completion Contract

1. Confirm the intended branch and PR number.
2. Confirm all relevant commits are pushed.
3. Confirm unrelated dirty or untracked files were not committed.
4. Confirm required PR artifacts are current.
5. Confirm all review-fix loops are closed or explicitly waived.
6. Confirm CI-failure triage loops are closed.
7. Watch required PR checks to completion.
8. Explain expected skipped checks.
9. Report final ready/not-ready status with evidence.

## Required PR Artifact Checks

The PR body must include or intentionally waive:

- Change Brief
- Risks & Tradeoffs
- Acceptance Criteria
- Verification Matrix
- Self-Review Evidence
- Skill Alignment Notes
- Review Response Matrix when review-fix loops occurred or findings were explicitly deferred or declined
- CI Failure Triage entries when checks failed, were unexpectedly cancelled, were inconclusive, or local verification disagreed with CI
- Final PR Completion before readiness is claimed

Final PR Completion must record:

- latest pushed commit
- required check status after the final push
- expected skipped checks and rationale
- local verification evidence
- open review-fix or CI-triage loops
- final status: `ready`, `not ready`, or `blocked`

## Green-Checks Rule

Do not describe a PR as complete or ready unless one of the following is true:

- all required checks pass
- non-required checks fail but the residual risk is documented
- checks are expectedly skipped and the reason is documented
- the user explicitly waives the check requirement

When checks fail, switch to `ci-failure-triage` before continuing completion.

## Final Status Template

Use this shape for final user updates:

```md
PR:
Latest Commit:
Checks:
Local Verification:
Review-Fix Loops:
CI Triage:
Residual Risks:
Unrelated Worktree Items:
Status:
```

## Exit Criteria

PR completion is closed only when:

- branch and PR are identified
- latest commit hash is reported
- required checks have been watched after the final push
- PR artifacts are current
- all open review and CI loops are resolved or explicitly waived
- final status is unambiguous: `ready`, `not ready`, or `blocked`
