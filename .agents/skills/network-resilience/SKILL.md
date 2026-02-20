---
name: network-resilience
description: "Improve reliability for network calls, sync, or remote endpoints with timeouts, retries, offline handling, and user feedback."
license: MIT
tags:
  - networking
  - resilience
  - reliability
allowed-tools:
  - bash
  - git
  - markdown
metadata:
  author: laurenceputra
  version: 1.1.0
---

# Network Resilience

Recommend improvements for timeout, retry, and offline behavior in networked code.

## Workflow
1. Identify network touchpoints.
2. Evaluate timeout/retry/offline handling.
3. Verify cross-origin requirements and API boundary assumptions.
4. Propose fixes and user messaging.

## Multi-Origin CORS Checklist (Sync / Browser Clients)
When traffic can originate from multiple frontends (e.g., multiple app domains), verify:
- Allowlist parsing supports configured multi-origin values (commonly comma-separated env var).
- Response returns **one** `Access-Control-Allow-Origin` value (matched request origin), never a comma-separated list.
- Disallowed origins do not receive `Access-Control-Allow-Origin`.
- `Vary: Origin` is present when origin-based branching is used.
- Preflight (`OPTIONS`) and normal JSON/error responses both apply equivalent CORS policy.
- Deployment config (`wrangler.toml`, env vars, infra config) includes all intended origins.

## Output Format
- Resilience gaps
- Recommended improvements
- CORS compatibility notes (if browser-based)

## References
- [Network resilience guides](references/network-guides.md)
