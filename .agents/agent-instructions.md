# Goal Portfolio Viewer Agent Instructions

This document is the canonical workflow and coordination guide for contributors and agents working in this repository.

## Repository Model

Treat this repository as a workspace with multiple linked surfaces:

- `tampermonkey/`: primary userscript product
- `workers/`: optional Cloudflare Workers sync backend
- `demo/`: mock server, demo pages, and E2E flows
- `.github/workflows/`: CI, preview deploy, and production deploy automation
- `docs/`, `README.md`, `TECHNICAL_DESIGN.md`, `TESTING.md`, `DEPLOYMENT.md`, `SYNC_ARCHITECTURE.md`: supporting docs

The userscript remains single-file for distribution, but the repository is not userscript-only.

## Workflow Contract

Use the full high-ceremony workflow for every change, including small fixes and documentation updates.

### Workflow Phases

`PLANNING -> DESIGN -> RISK -> IMPLEMENT -> QA -> SELF-REVIEW -> REVIEW -> FIX -> QA -> SELF-REVIEW -> REVIEW -> MERGE`

Owners:

- `PLANNING`: Product Manager
- `DESIGN`: Staff Engineer
- `RISK`: Devil's Advocate
- `IMPLEMENT`: Staff Engineer
- `QA`: QA Engineer
- `SELF-REVIEW`: Staff Engineer
- `REVIEW`: Code Reviewer
- `FIX`: Staff Engineer

### Phase Gates

1. `PLANNING`
- Problem, user impact, constraints, and acceptance criteria are explicit.
- The PR body includes a Change Brief draft.

2. `DESIGN`
- Proposed approach fits the relevant repo surface.
- Risks and tradeoffs are documented.

3. `RISK`
- At least 3 concrete risks or counterpoints are captured.
- Blocking concerns are resolved or explicitly escalated.

4. `IMPLEMENT`
- Changes are made in the correct surface.
- Required tests/checks are selected and prepared.

5. `QA`
- A verification matrix maps acceptance criteria to tests or manual checks.
- Residual risks and gaps are documented.

6. `SELF-REVIEW`
- Staff Engineer inspects the diff, reruns the relevant checks, and records evidence.

7. `REVIEW`
- Code Reviewer returns one of:
  - `approved`
  - `approved with non-blocking suggestions`
  - `changes requested`

8. `FIX`
- Required whenever review returns any `important` or `blocking` finding.
- Every finding receives a disposition in the Review Response Matrix.

9. `MERGE`
- Allowed only when the latest review has no unresolved `important` or `blocking` findings.
- QA evidence and self-review evidence must be newer than the latest fix.

### Review-Fix Loop

The review-fix loop is mandatory whenever review produces any `important` or `blocking` feedback.

Loop contract:

1. `REVIEW` returns `changes requested`.
2. `FIX` updates code, docs, tests, or config as needed.
3. Update the Review Response Matrix with one of:
   - `fixed`
   - `deferred`
   - `declined with rationale`
4. Re-run `QA`.
5. Re-run `SELF-REVIEW`.
6. Re-run `REVIEW`.

Non-blocking suggestions may be addressed in the loop or explicitly deferred.

## Spec-Clarity Gate

Use this gate before implementation and again before any behavior-changing fix when correctness is unclear.

The gate passes only when all of the following are true:

- Acceptance criteria are explicit and testable.
- Scope, constraints, and non-goals are clear.
- Risks and tradeoffs are documented with a chosen direction.
- Implementation and verification steps are concrete.
- No unresolved blocking questions remain.

If the gate passes:

- Continue without waiting for human approval.
- Record `Spec-Clarity Gate: pass` in the PR body.
- Record `Open questions: none` or list only minor non-blocking assumptions.

If the gate fails:

- Pause implementation.
- Request a human decision in the PR.
- Resume only after the ambiguity is resolved.

## Spec Policy

- High ceremony still applies to all changes.
- A working spec may be created locally as `spec/plan.md` or another temporary file if useful.
- The durable, approved spec record must live in the PR body, not in committed `spec/` files.
- The PR body must be updated before implementation proceeds if the Spec-Clarity Gate fails, and before merge for all changes.

## Required PR Artifacts

Every PR or change record must include these sections:

1. Change Brief
2. Risks & Tradeoffs
3. Acceptance Criteria
4. Verification Matrix
5. Self-Review Evidence
6. Skill Alignment Notes

If a review-fix loop occurred, also include:

7. Review Response Matrix

### Artifact Expectations

#### Change Brief
- Problem
- Goal
- Change type
- Affected repo surfaces

#### Risks & Tradeoffs
- Privacy/security risks
- Data accuracy or behavior risks
- Chosen direction and rejected alternatives when relevant

#### Acceptance Criteria
- Explicit and testable
- Written from externally visible behavior or verifiable technical outcome

#### Verification Matrix
- Each acceptance criterion mapped to:
  - automated test
  - manual check
  - command or evidence

#### Self-Review Evidence
- Diff inspected
- Commands run
- Outcome of each command/check
- Follow-up notes if anything was intentionally deferred

#### Skill Alignment Notes
- List relevant skills used or intentionally skipped
- Note why each skill applied

#### Review Response Matrix
- Finding
- Severity
- Disposition
- Fix location
- Verification evidence

## Agent Interaction Model

1. Product Manager frames the problem, impact, and acceptance criteria.
2. Staff Engineer chooses the implementation direction and owns the code changes.
3. Devil's Advocate surfaces blind spots, especially around privacy, financial correctness, sync, and regressions.
4. QA Engineer defines and executes verification depth.
5. Code Reviewer decides whether review passes or enters the fix loop.

## Trigger Rules

### Product Manager
Use when:

- scope is unclear
- UX or user impact is changing
- acceptance criteria need refinement

### Staff Engineer
Use when:

- implementation or architecture changes are required
- repo-surface boundaries matter
- privacy, security, or technical tradeoffs must be decided

### Devil's Advocate
Use when:

- assumptions need to be challenged
- behavior changes touch sync, storage, auth, interception, or calculations
- post-review fixes may have created new risks

### QA Engineer
Use when:

- a verification matrix is needed
- edge cases or regression coverage must be defined
- review fixes need re-validation

### Code Reviewer
Use when:

- a review gate is needed
- release readiness is being assessed
- evidence from QA and self-review must be evaluated

## Skill Alignment

When a phase starts, align on the relevant local skills and record them in the PR body.
Skills live in `.agents/skills/*`.

Recommended mapping:

| Phase | Primary Skills |
| --- | --- |
| Planning | `documentation`, `security-risk`, `requirements-researcher` |
| Design | `refactoring-expert`, `performance-optimization` |
| Risk | `security-risk` |
| Implementation | `debugging-assistant`, `refactoring-expert` |
| QA | `qa-testing`, `ux-accessibility`, `network-resilience` |
| Review | `code-review`, `security-risk` |
| Release/Docs | `release-management`, `documentation` |

If no matching skill exists, note the gap in the PR body and continue.

## Surface-Specific Expectations

### Userscript (`tampermonkey/`)

- Preserve privacy and interception safety.
- Keep the distributed script single-file unless the product model explicitly changes.
- Use `Number.isFinite()` for financial calculations where coercion would be unsafe.
- Prevent XSS by treating user data as text, not HTML.

### Workers (`workers/`)

- Treat sync as opt-in and encrypted.
- Document any new auth, CORS, storage, or data-retention changes.
- Update deploy guidance and environment assumptions when backend behavior changes.

### Demo (`demo/`)

- Keep mock flows representative of production behavior.
- Update screenshot/E2E guidance when UI or flow behavior changes.

### CI and Deploy (`.github/workflows/`)

- Keep workflow docs aligned with actual workflow files.
- Prefer `pnpm` commands in examples.
- If deploy behavior changes, update both deployment docs and PR artifacts.

## Verification Requirements

Pick checks based on the touched surface and change type.

### Documentation-only
- Verify links, references, and commands.

### Userscript logic or UI
- Run relevant lint/tests.
- Run smoke or E2E checks if user-visible flows changed.

### Workers/backend
- Run worker unit tests and any relevant deploy/config verification.

### Workflow/docs/process changes
- Check markdown references and template consistency.
- Confirm PR template and canonical docs agree.

## Command Conventions

- Use `pnpm`, not `npm`, in repository examples unless a subproject explicitly requires otherwise.
- Prefer workspace-aware commands from the repo root when possible.

## Documentation Precedence

If documents conflict, use this order:

1. `.agents/agent-instructions.md`
2. `.github/copilot-instructions.md`
3. `AGENTS.md`
4. surface-specific docs such as `TESTING.md`, `TECHNICAL_DESIGN.md`, `DEPLOYMENT.md`, `workers/README.md`, `demo/README.md`

## Definition Of Done

A change is done only when:

- Required artifacts are present in the PR body.
- The relevant QA checks have run.
- Self-review evidence is recorded.
- Review has no unresolved `important` or `blocking` findings.
- Docs and commands match the actual repo shape.
