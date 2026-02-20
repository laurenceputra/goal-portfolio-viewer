# AGENTS

> **Note:** This file provides a quick reference. For comprehensive guidance, see [`.github/copilot-instructions.md`](.github/copilot-instructions.md) (single source of truth, GitHub standard filename).

## Quick Start

This repository uses a multi-agent workflow for development. Each agent has specific responsibilities:

### Agent Roles

| Agent | Role | Documentation |
|-------|------|---------------|
| **Product Manager** | Requirements framing, scope, user impact | [`.github/agents/product-manager.md`](.github/agents/product-manager.md) |
| **Staff Engineer** | Architecture, implementation, technical decisions | [`.github/agents/staff-engineer.md`](.github/agents/staff-engineer.md) |
| **QA Engineer** | Testing strategy, quality assurance | [`.github/agents/qa-engineer.md`](.github/agents/qa-engineer.md) |
| **Code Reviewer** | Final review, quality gates | [`.github/agents/code-reviewer.md`](.github/agents/code-reviewer.md) |
| **Devil's Advocate** | Risk surfacing, blind spots | [`.github/agents/devils-advocate.md`](.github/agents/devils-advocate.md) |

### Merged Responsibilities (No New Roles)
- **Security/Privacy** → Staff Engineer + Code Reviewer
- **UX/Accessibility** → Product Manager + QA Engineer
- **Release/Docs** → Staff Engineer + Code Reviewer

### Trigger Rules
For trigger rules and detailed enforcement, see [`.github/copilot-instructions.md`](.github/copilot-instructions.md).

### Workflow Overview
For workflow phases, key principles, definition of done, and testing commands, see the [Comprehensive Development Guide](.github/copilot-instructions.md).

## Further Reading

- [Comprehensive Development Guide](.github/copilot-instructions.md)
- [Technical Design](TECHNICAL_DESIGN.md)
- [Testing Guide](TESTING.md)

## Repository Hygiene

- The `.spec/` directory is ignored via `.gitignore` and should not be committed.

## Skills
A skill is a set of local instructions to follow that is stored in a `SKILL.md` file. Below is the list of skills that can be used. Each entry includes a name, description, and file path so you can open the source for full instructions when using a specific skill.
### Available skills
| Skill | Description | File |
| --- | --- | --- |
| code-review | Expert code reviewer with deep knowledge of software engineering best practices, design patterns, and code quality standards. Use this skill when reviewing code changes, pull requests, or conducting code quality assessments. | [.agents/skills/code-review/SKILL.md](.agents/skills/code-review/SKILL.md) |
| debugging-assistant | Expert debugger with deep knowledge of debugging methodologies, tools, and problem-solving techniques. Use this skill when diagnosing issues, analyzing bugs, or conducting root cause analysis. | [.agents/skills/debugging-assistant/SKILL.md](.agents/skills/debugging-assistant/SKILL.md) |
| documentation | Technical writer with expertise in creating clear, comprehensive, and user-friendly documentation. Use this skill when writing or reviewing documentation, creating README files, or documenting APIs and code. | [.agents/skills/documentation/SKILL.md](.agents/skills/documentation/SKILL.md) |
| network-resilience | Improve reliability for network calls, sync, or remote endpoints with timeouts, retries, offline handling, and user feedback. | [.agents/skills/network-resilience/SKILL.md](.agents/skills/network-resilience/SKILL.md) |
| performance-optimization | Performance engineering expert with deep knowledge of optimization techniques, profiling, and performance best practices. Use this skill when analyzing performance issues, optimizing code, or improving system efficiency. | [.agents/skills/performance-optimization/SKILL.md](.agents/skills/performance-optimization/SKILL.md) |
| qa-testing | QA engineer with expertise in software testing methodologies, test design, and quality assurance practices. Use this skill when planning tests, writing test cases, or improving test coverage and quality. | [.agents/skills/qa-testing/SKILL.md](.agents/skills/qa-testing/SKILL.md) |
| refactoring-expert | Software refactoring expert with deep knowledge of code improvement techniques, design patterns, and clean code principles. Use this skill when improving code structure, eliminating code smells, or applying design patterns. | [.agents/skills/refactoring-expert/SKILL.md](.agents/skills/refactoring-expert/SKILL.md) |
| release-management | Release engineer with expertise in software deployment, versioning, and release processes. Use this skill when planning releases, managing versions, creating changelogs, or coordinating deployments. | [.agents/skills/release-management/SKILL.md](.agents/skills/release-management/SKILL.md) |
| requirements-researcher | Feasibility and requirements clarification for software/infra/product work; use when asked what is possible, to assess constraints/tradeoffs, or to clarify user flows and turn ambiguous requests into actionable questions before handing off to spec-writer. | [.agents/skills/requirements-researcher/SKILL.md](.agents/skills/requirements-researcher/SKILL.md) |
| security-risk | Combine security scanning and threat modeling for changes involving data handling, API interception, sync, storage, authentication, or encryption. | [.agents/skills/security-risk/SKILL.md](.agents/skills/security-risk/SKILL.md) |
| spec-writer | Write or update specification/plan documents (e.g., .spec/plan.md) with explicit tasks, file targets, acceptance criteria, verification, and commit steps; use when asked to write/update specs, plans, or requirements. | [.agents/skills/spec-writer/SKILL.md](.agents/skills/spec-writer/SKILL.md) |
| ux-accessibility | Review or implement UI/visual changes with accessibility checks (keyboard, focus, contrast, ARIA, motion). Use for any new UI elements or visual updates. | [.agents/skills/ux-accessibility/SKILL.md](.agents/skills/ux-accessibility/SKILL.md) |
