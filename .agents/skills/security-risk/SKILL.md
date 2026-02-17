---
name: security-risk
description: "Combine security scanning and threat modeling for changes involving data handling, API interception, sync, storage, authentication, or encryption."
license: MIT
tags:
  - security
  - privacy
  - threat-modeling
allowed-tools:
  - bash
  - git
  - markdown
metadata:
  author: laurenceputra
  version: 1.1.0
---

# Security Risk

Identify security and privacy risks and propose mitigations.

## Workflow
1. Review data flows and trust boundaries.
2. Scan for injection, logging, auth, and cross-origin risks.
3. Validate privacy boundaries (what is and is not synced/stored/transmitted).
4. Summarize risks and mitigations.

## Cross-Origin Security Checks
For backend APIs called from browsers:
- Treat CORS as an explicit allowlist decision per origin.
- Verify `Access-Control-Allow-Origin` is echoed from a vetted allowlist (no wildcard for credentialed/sensitive flows).
- Ensure disallowed origins receive no allow-origin header.
- Add `Vary: Origin` when origin-based responses differ.
- Confirm preflight and non-preflight responses enforce consistent origin policy.
- Confirm config docs and runtime env origins are aligned to avoid accidental exposure or outages.

## Sync Privacy Checks
For encrypted sync payload systems:
- Verify server treats encrypted payload as opaque unless schema parsing is explicitly required.
- Confirm migrations do not broaden synced data classes (e.g., no amounts/PII unless approved).
- Confirm logs/telemetry do not include sensitive payload content.

## Output Format
- Risks identified
- Mitigations
- Residual risk

## References
- [Threat modeling worksheet](references/threat-model.md)
