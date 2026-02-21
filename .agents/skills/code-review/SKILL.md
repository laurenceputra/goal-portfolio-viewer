---
name: code-review
description: Expert code reviewer with deep knowledge of software engineering best practices, design patterns, and code quality standards. Use this skill when reviewing code changes, pull requests, or conducting code quality assessments.
license: MIT
tags:
  - code-review
  - quality
  - best-practices
allowed-tools:
  - bash
  - git
  - markdown
metadata:
  author: laurenceputra
  version: 1.0.0
---

# Code Review

Provide structured, actionable review feedback focused on correctness, security, performance, and maintainability.

## Workflow
1. Read the change and understand intent.
2. Review for correctness, edge cases, and regressions.
3. Check repo-specific constraints and testing coverage.
4. Summarize findings using the output template.

## Easy-Fix Guardrail Review (Review Owner)

Use this gate to prevent symptom-only fixes and require evidence-backed closure.

### Review Checks
1. Confirm a causality statement exists from `debugging-assistant`.
2. Confirm a QA verification matrix exists from `qa-testing` and maps failures to tests and outcomes.
3. Verify fix locality:
   - implementation changed when implementation was at fault
   - test or config-only changes are justified and scoped
4. Block anti-patterns unless explicitly justified:
   - `eslint-disable` added for convenience
   - skipped or softened tests to force green
   - broad rule or config relaxations for isolated issues

### Blocking Conditions
Mark as blocking if:
- correctness is still ambiguous
- evidence does not prove root-cause closure
- financial or privacy-sensitive behavior changed without explicit verification

When blocked for ambiguity, require a human decision record only when ambiguity remains after applying the spec-clarity gate.

Reference: `debugging-assistant` escalation policy and `qa-testing` verification matrix.

## Repo-Specific Review Risks
- **Single-file userscript constraint**: no module imports, no build steps, no file splitting, keep all helpers inside the IIFE.
- **Financial calculations**: guard zero division, use `Number.isFinite()`, preserve null vs 0, round only at display.
- **API interception safety**: clone responses before reading, match URLs precisely, avoid blocking the native response, prevent fetch/XHR loops.
- **XSS prevention**: never render user data via `innerHTML`, avoid inline event handlers, use `textContent` or DOM nodes.
- **Storage key compatibility**: keep key formats stable, encode separators, add migrations if any key shape changes.
- **Sync/security boundaries**: no data egress by default, encryption/auth flows unchanged unless explicitly intended and verified.

## Output Format
- Summary
- Critical Issues
- Suggestions
- Testing

## References
- [Review guidelines and checklist](references/review-guidelines.md)
