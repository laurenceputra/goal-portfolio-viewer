---
title: Goal Portfolio Viewer Agent Instructions Bridge
description: Compatibility entrypoint that points GitHub Copilot tooling to the canonical agent workflow instructions.
applies_to:
  - copilot-chat
  - copilot-cli
  - copilot-workspace
  - copilot-code-review
---

# Goal Portfolio Viewer - Copilot Instructions

> **Compatibility note**: GitHub tooling expects this filename. The canonical workflow and agent process now live in [`.agents/agent-instructions.md`](../.agents/agent-instructions.md).

## Canonical Process

- Follow [`.agents/agent-instructions.md`](../.agents/agent-instructions.md) for workflow phases, gates, required artifacts, the review-fix loop, and verification expectations.
- Treat the repository as a workspace with these primary surfaces:
  - `tampermonkey/` for the userscript
  - `workers/` for the optional sync backend
  - `demo/` for E2E/demo tooling

## Non-Negotiable Constraints

- Preserve privacy and financial-data accuracy.
- Do not introduce data egress unless it is explicitly part of the opt-in sync surface and documented.
- Run the required QA and self-review checks after every meaningful change.
- Record the required artifacts in the PR body using the repository template.

## Role Guides

- Product Manager: [`.github/agents/product-manager.md`](agents/product-manager.md)
- Staff Engineer: [`.github/agents/staff-engineer.md`](agents/staff-engineer.md)
- QA Engineer: [`.github/agents/qa-engineer.md`](agents/qa-engineer.md)
- Code Reviewer: [`.github/agents/code-reviewer.md`](agents/code-reviewer.md)
- Devil's Advocate: [`.github/agents/devils-advocate.md`](agents/devils-advocate.md)

When guidance in older docs conflicts with the canonical instructions, [`.agents/agent-instructions.md`](../.agents/agent-instructions.md) wins.
