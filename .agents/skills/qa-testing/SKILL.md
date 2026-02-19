---
name: qa-testing
description: QA engineer with expertise in software testing methodologies, test design, and quality assurance practices. Use this skill when planning tests, writing test cases, or improving test coverage and quality.
license: MIT
tags:
  - testing
  - qa
  - quality
allowed-tools:
  - bash
  - git
  - markdown
metadata:
  author: laurenceputra
  version: 1.1.0
---

# QA Testing

Design test plans and cases that cover happy paths, edge cases, and regressions.

## Workflow
1. Identify risk areas and critical paths.
2. Build a test matrix with coverage categories.
3. Define expected outcomes and data.
4. Ensure negative/security-path tests are included for config and boundary conditions.
5. Report results and gaps.

## Root-Cause Verification Matrix (QA Owner)

Consume the causality statement from `debugging-assistant` and verify the proposed fix closes the real defect.

### QA Responsibilities
1. Build a verification matrix mapping each original failure to:
   - root cause
   - fix location
   - regression test(s)
   - edge-case test(s)
2. Require at least one regression test that fails before and passes after.
3. Run layered verification:
   - targeted check first
   - full lint and test suite after targeted checks pass
4. Report coverage gaps and residual risk for `code-review`.

### Ambiguity Handling
If expected behavior is unclear during test design, mark it as blocking and route to human verification (do not infer by convenience).

Reference: `debugging-assistant` -> Human Verification Escalation (Blocking).

## CORS + Sync Regression Cases (when relevant)
Include targeted tests for:
- Allowed origin preflight success (`OPTIONS`) with expected allow-origin header.
- Disallowed origin preflight behavior (no allow-origin).
- Normal JSON/error responses carrying consistent CORS headers.
- Config parsing edge cases (comma-separated allowlist with spaces/empty values).
- Backward compatibility for sync payload migrations (v1 read + v2 write/normalize).

## Output Format
- Test plan
- Coverage gaps
- Recommendations

## References
- [Test plan templates](references/test-plan.md)
