---
name: spec-writer
description: "Write or update specification/plan documents (e.g., .spec/plan.md) with explicit tasks, file targets, acceptance criteria, verification, and commit steps; use when asked to write/update specs, plans, or requirements."
license: MIT
tags:
  - planning
  - documentation
  - specs
allowed-tools:
  - bash
  - git
  - markdown
metadata:
  author: laurenceputra
  version: 1.1.0
---

# Spec Writer

Write clear, executable specifications/plan documents that other contributors can follow without ambiguity.

## Defaults
- **Target file**: `.spec/plan.md` unless the user specifies a different path.
- **Update behavior**: Overwrite the target file by default. Append only if the user explicitly asks to “add to” or “append to” the existing plan.
- **Template**: If `.spec/plan.md` already exists, use its structure as the template and keep section ordering unless the user asks otherwise.
- **Repo scan before writing**: Read project instructions and relevant docs before drafting.

## Pre‑write Checklist
1. Read repository instructions first:
   - `AGENTS.md`
   - `.github/copilot-instructions.md`
2. Read the current plan (if present): `.spec/plan.md`.
3. Skim the most relevant docs for the request (examples: `README.md`, `docs/*`, `TECHNICAL_DESIGN.md`, `SYNC_ARCHITECTURE.md`).
4. If requirements are missing or ambiguous, ask the user focused questions before writing.

## Writing Rules
- Use precise, testable language.
- Every task must name the exact files to update.
- Include **acceptance criteria** per major task.
- Include a **verification** section (manual checks + commands if applicable).
- Include a **commit step** with a suggested concise message.
- Keep formatting consistent and scannable (headings + lists).
- Avoid implementation details that aren’t required for execution.

## Cross-Origin + Sync Spec Checklist (when relevant)
If work introduces a new frontend origin, API host, or sync surface, explicitly include:
- Which backend configs must be updated (`CORS_ORIGINS`, envs, deploy manifests).
- Origin matching policy (single-origin echo from allowlist; disallowed origin behavior).
- Required CORS response consistency (preflight + normal responses).
- Data-scope boundaries for sync payloads (what remains excluded, e.g., amounts/PII).
- Migration/backward compatibility expectations.
- Test cases that prove allowed/disallowed origin behavior.

## Required Sections (minimum)
- **Goal**
- **Work Items and Exact Changes** (with file targets)
- **Acceptance criteria** (per work item)
- **Verification**
- **Commit**
- **Completion Checklist**

## Update Behavior
- If overwriting: replace the entire file.
- If appending: add a new section clearly labeled with date or change scope.

## Output Expectations
- Keep it concise but complete. Another contributor should be able to execute without asking for clarification.
- If any dependency exists (secrets, env vars, tools), explicitly list it.
