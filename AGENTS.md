# AGENTS

> **Note:** This file is a quick reference. The canonical workflow and process live in [`.agents/agent-instructions.md`](.agents/agent-instructions.md). GitHub tooling compatibility guidance lives in [`.github/copilot-instructions.md`](.github/copilot-instructions.md).

## Quick Start

This repository uses a high-ceremony multi-agent workflow for every change, including small fixes and documentation updates.

### Agent Roles

| Agent | Role | Documentation |
|-------|------|---------------|
| **Product Manager** | Requirements framing, scope, user impact | [`.github/agents/product-manager.md`](.github/agents/product-manager.md) |
| **Staff Engineer** | Architecture, implementation, technical decisions | [`.github/agents/staff-engineer.md`](.github/agents/staff-engineer.md) |
| **QA Engineer** | Testing strategy, verification, quality assurance | [`.github/agents/qa-engineer.md`](.github/agents/qa-engineer.md) |
| **Code Reviewer** | Review gate, approval decisions, quality gates | [`.github/agents/code-reviewer.md`](.github/agents/code-reviewer.md) |
| **Devil's Advocate** | Risk surfacing, blind spots, mitigation pressure | [`.github/agents/devils-advocate.md`](.github/agents/devils-advocate.md) |

### Merged Responsibilities

- **Security/Privacy** -> Staff Engineer + Code Reviewer
- **UX/Accessibility** -> Product Manager + QA Engineer
- **Release/Docs** -> Staff Engineer + Code Reviewer

### Workflow Overview

Canonical workflow:

`PLANNING -> DESIGN -> RISK -> IMPLEMENT -> QA -> SELF-REVIEW -> REVIEW -> REVIEW-FIX LOOP -> PR COMPLETION -> MERGE`

Notes:

- `REVIEW-FIX LOOP` is entered whenever review produces an `important` or `blocking` finding.
- Review is not complete until post-fix QA, self-review, and required fresh-context subagent review have rerun.
- `CI Failure Triage` is required whenever a GitHub check fails, is unexpectedly cancelled, is inconclusive, or local verification disagrees with CI.
- `PR Completion` is required before a PR is declared ready, complete, mergeable, or finished.
- Final readiness requires required checks to pass, be expectedly skipped with rationale, or be explicitly waived.
- The durable spec and artifact record lives in the PR body.

### Required Artifacts

Every PR or change record must include:

- Change Brief
- Risks & Tradeoffs
- Acceptance Criteria
- Verification Matrix
- Self-Review Evidence
- Skill Alignment Notes
- Review Response Matrix when a review-fix loop occurs
- CI Failure Triage when a check failure, inconclusive check, unexpected cancellation, or local/CI disagreement is investigated
- Final PR Completion before readiness is claimed

### Repository Model

Treat the repo as a workspace with multiple surfaces:

- `tampermonkey/`
- `workers/`
- `demo/`
- `.github/workflows/`
- repository docs and architecture guides

## Further Reading

- [Canonical Agent Instructions](.agents/agent-instructions.md)
- [GitHub Compatibility Instructions](.github/copilot-instructions.md)
- [Technical Design](TECHNICAL_DESIGN.md)
- [Testing Guide](TESTING.md)
- [Deployment Guide](DEPLOYMENT.md)

## Repository Hygiene

- `spec/` remains gitignored. Working specs may exist locally, but the durable approved spec must be captured in the PR body.

## Skills

A skill is a set of local instructions stored in a `SKILL.md` file under `.agents/skills/`.

### Available Skills

| Skill | Description | File |
| --- | --- | --- |
| ci-failure-triage | Required workflow for failed or inconclusive CI checks, including artifact-first diagnosis, failure classification, remediation, and check re-watch. | [.agents/skills/ci-failure-triage/SKILL.md](.agents/skills/ci-failure-triage/SKILL.md) |
| code-review | Expert code reviewer with deep knowledge of software engineering best practices, design patterns, and code quality standards. Use this skill when reviewing code changes, pull requests, or conducting code quality assessments. | [.agents/skills/code-review/SKILL.md](.agents/skills/code-review/SKILL.md) |
| debugging-assistant | Expert debugger with deep knowledge of debugging methodologies, tools, and problem-solving techniques. Use this skill when diagnosing issues, analyzing bugs, or conducting root cause analysis. | [.agents/skills/debugging-assistant/SKILL.md](.agents/skills/debugging-assistant/SKILL.md) |
| documentation | Technical writer with expertise in creating clear, comprehensive, and user-friendly documentation. Use this skill when writing or reviewing documentation, creating README files, or documenting APIs and code. | [.agents/skills/documentation/SKILL.md](.agents/skills/documentation/SKILL.md) |
| network-resilience | Improve reliability for network calls, sync, or remote endpoints with timeouts, retries, offline handling, and user feedback. | [.agents/skills/network-resilience/SKILL.md](.agents/skills/network-resilience/SKILL.md) |
| performance-optimization | Performance engineering expert with deep knowledge of optimization techniques, profiling, and performance best practices. Use this skill when analyzing performance issues, optimizing code, or improving system efficiency. | [.agents/skills/performance-optimization/SKILL.md](.agents/skills/performance-optimization/SKILL.md) |
| pr-completion | Required finalization workflow before declaring a PR ready, including artifact currency, closed review-fix loops, pushed commits, green checks, and final status reporting. | [.agents/skills/pr-completion/SKILL.md](.agents/skills/pr-completion/SKILL.md) |
| qa-testing | QA engineer with expertise in software testing methodologies, test design, and quality assurance practices. Use this skill when planning tests, writing test cases, or improving test coverage and quality. | [.agents/skills/qa-testing/SKILL.md](.agents/skills/qa-testing/SKILL.md) |
| refactoring-expert | Software refactoring expert with deep knowledge of code improvement techniques, design patterns, and clean code principles. Use this skill when improving code structure, eliminating code smells, or applying design patterns. | [.agents/skills/refactoring-expert/SKILL.md](.agents/skills/refactoring-expert/SKILL.md) |
| release-management | Release engineer with expertise in software deployment, versioning, and release processes. Use this skill when planning releases, managing versions, creating changelogs, or coordinating deployments. | [.agents/skills/release-management/SKILL.md](.agents/skills/release-management/SKILL.md) |
| requirements-researcher | Feasibility and requirements clarification for software/infra/product work; use when asked what is possible, to assess constraints/tradeoffs, or to clarify user flows and turn ambiguous requests into actionable questions before handing off to spec-writer. | [.agents/skills/requirements-researcher/SKILL.md](.agents/skills/requirements-researcher/SKILL.md) |
| review-fix-loop | Required workflow for handling review findings with classification, focused fixes, verification, fresh-context subagent review, and PR artifact updates. | [.agents/skills/review-fix-loop/SKILL.md](.agents/skills/review-fix-loop/SKILL.md) |
| security-risk | Combine security scanning and threat modeling for changes involving data handling, API interception, sync, storage, authentication, or encryption. | [.agents/skills/security-risk/SKILL.md](.agents/skills/security-risk/SKILL.md) |
| spec-writer | Write or update specification/plan documents for local working use, with the approved summary copied into the PR body for the durable record. | [.agents/skills/spec-writer/SKILL.md](.agents/skills/spec-writer/SKILL.md) |
| ux-accessibility | Review or implement UI/visual changes with accessibility checks (keyboard, focus, contrast, ARIA, motion). Use for any new UI elements or visual updates. | [.agents/skills/ux-accessibility/SKILL.md](.agents/skills/ux-accessibility/SKILL.md) |
