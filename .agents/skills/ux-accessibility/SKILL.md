---
name: ux-accessibility
description: "Review or implement UI/visual changes with accessibility checks (keyboard, focus, contrast, ARIA, motion). Use for any new UI elements or visual updates."
license: MIT
tags:
  - accessibility
  - ux
  - ui
allowed-tools:
  - markdown
metadata:
  author: laurenceputra
  version: 1.0.0
---

# UX Accessibility

Review UI changes for accessibility and inclusive design.

## Workflow
1. Verify keyboard and focus behavior.
2. Check contrast and semantics.
3. Confirm motion settings.

## Modal & Keyboard Checklist (Repo)
- **Focus management**: trap focus within modal, set initial focus, restore focus on close, allow Escape to close when permitted.
- **ARIA dialog semantics**: `role="dialog"`, `aria-modal="true"`, `aria-labelledby` for titles, `aria-describedby` for helper text or errors.
- **Keyboard activation**: all custom controls respond to Enter/Space, visible focus styles on all interactive elements.
- **Live feedback**: use `role="status"`/`aria-live` for updates and `role="alert"` for errors.

## Output Format
- Findings
- Recommendations

## References
- [Accessibility checklist](references/a11y-checklist.md)
