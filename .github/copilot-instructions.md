---
title: Goal Portfolio Viewer Development Guide
description: Comprehensive instructions for GitHub Copilot when working on the Goal Portfolio Viewer Tampermonkey userscript
applies_to:
  - copilot-chat
  - copilot-cli
  - copilot-workspace
  - copilot-code-review
---

# Goal Portfolio Viewer - Development Guide

> **Filename standard**: This guidance follows GitHub's recommended `copilot-instructions.md` filename.

## Project Overview

**Type**: Browser Extension (Tampermonkey Userscript)  
**Purpose**: Enhance the Endowus (Singapore) investment platform with custom portfolio visualization  
**Architecture**: Single-file JavaScript with API interception  
**Key Feature**: Organize investment goals into custom "buckets" for better portfolio management

### Core Technologies
- **Runtime**: Browser (Tampermonkey/Greasemonkey/Violentmonkey)
- **Language**: Vanilla JavaScript (ES6+)
- **API Interception**: Monkey patching of fetch() and XMLHttpRequest
- **UI**: Injected CSS via `injectStyles()` with a modern gradient design system
- **Data Flow**: Intercept → Process → Aggregate → Visualize

### Critical Context
- **Privacy-First**: ALL processing happens client-side. Never send data externally.
- **Financial Data**: Handles sensitive investment information requiring accuracy and security
- **Single-File**: Entire application in one `.user.js` file for easy distribution
- **No Dependencies (Userscript Only)**: Pure vanilla JS for the userscript - no build process, no external libraries

---

## Workflow Contract (Required)

Use this compact workflow for all changes. Keep detailed role guidance in `.github/agents/*.md` and avoid duplicating it here.

### Pre-Execution Spec Gate (Hard Requirement)
- Do not proceed to implementation or execute changes until all of the following are true:
  - A spec has been created.
  - There are no remaining spec gaps.
  - A human has reviewed and approved the plan.
- The spec must be created using the `spec-writer` skill.
- Default spec location is `spec/plan.md` unless a different path is explicitly requested.

### Required Artifacts
- **Change Brief**: Problem, goal, and acceptance criteria (include change type and required steps).
- **Risks & Tradeoffs**: Short note, especially for data accuracy, privacy, or API interception changes.
- **Test Plan**: Jest coverage and any manual checks needed.
- **Verification**: Commands run and outcomes.
- **Verification Matrix**: Map each acceptance criterion to a test or manual check.

### Change Type → Required Steps

| Change Type | Required Steps |
| --- | --- |
| Pure logic | Jest tests with edge cases + lint; update docs if behavior changes |
| UI/visual | Jest (if logic touched) + lint + screenshot + smoke check |
| Behavior change | Jest + lint + update TECHNICAL_DESIGN.md and README references |
| Performance | Jest + lint + perf check and reasoning about impact |
| Documentation-only | Lint not required unless code changes; no tests required unless logic changed |

### Trigger Rules for Merged Responsibilities
- **Security/Privacy**: Required for API interception changes, storage changes, or data handling logic.
- **UX/Accessibility**: Required for UI/visual changes and any new user interactions.
- **Release/Docs**: Required for behavior changes, version bumps, and user-facing updates.

### Role Guides (Single Source of Detail)
- **Product**: `.github/agents/product-manager.md` (requirements framing)
- **Architecture/Risks**: `.github/agents/staff-engineer.md`
- **QA/Test Depth**: `.github/agents/qa-engineer.md`
- **Review Gates**: `.github/agents/code-reviewer.md`
- **Devil's Advocate**: `.github/agents/devils-advocate.md` (blind spots)

### Role Extensions (Merged Responsibilities)
- **Security/Privacy** → Staff Engineer + Code Reviewer
- **UX/Accessibility** → Product Manager + QA Engineer
- **Release/Docs** → Staff Engineer + Code Reviewer

### Skill Alignment (Required)
When a workflow phase starts, align on the relevant skills and record them in your working notes (see `.codex/skills/*`):

| Phase | Primary Skills |
| --- | --- |
| Planning (PM) | `documentation`, `security-risk` |
| Design (SE) | `refactoring-expert`, `performance-optimization` |
| Risk (DA) | `security-risk` |
| Implementation (SE) | `debugging-assistant`, `refactoring-expert` |
| QA | `qa-testing`, `ux-accessibility`, `network-resilience` |
| Review | `code-review`, `security-risk` |
| Release/Docs | `release-management`, `documentation` |

**Precedence**: Workflow gates override skill guidance if they conflict.

**Exception**: If no matching skill exists, proceed with the agent phase and note the gap in your working notes or PR description.

**Using skills outside the workflow**: You may invoke any relevant skill even when you are not actively progressing through workflow phases (for example, ad-hoc analysis, documentation updates, or pre-work discovery). When you do, note the skill usage and rationale in your working notes or PR description.

### Agent Interaction Model (Required)
1. **Product**: Frame the problem, user impact, and acceptance criteria.
2. **Staff Engineer**: Confirm architecture fit, call out risks/tradeoffs, and own implementation.
3. **Devil's Advocate**: Surface blind spots, assumptions, and risk gaps.
4. **QA**: Define test depth, edge cases, and verification steps.
5. **Code Reviewer**: Apply review gates before final approval.

### Stage Alignment Gates (Required)
Only move to the next stage when all required agents are aligned.
- **Alignment artifact**: 1-3 bullets per stage capturing agreement.
- **Blocking rule**: Any blocking concern stops progression until resolved.
- **Loopback rule**: If QA or Code Review fails, return to Stage 3 (Staff Engineer implementation), then re-run QA and Code Review.
- **Iteration rule**: When any agent surfaces a blocking issue, re-enter the prior stage and iterate within the same agent group until the blocking issue is resolved and re-validated.

### Workflow Templates
Capture the required artifacts and gate alignment bullets in your working notes or PR description as needed.

#### Stage Gates
1. **Product Gate**: Product owns scope; Staff Engineer and QA confirm acceptance criteria are testable.
2. **Staff Engineer Gate**: Risks/tradeoffs documented; Product and QA agree on scope impact.
3. **Devil's Advocate Gate**: Risks/assumptions addressed or explicitly accepted.
4. **QA Gate**: Test plan covers change type requirements; Staff Engineer agrees to fix gaps.
5. **Code Review Gate**: Reviewer approves or blocks; QA must re-verify after any changes.

### Versioning & Docs
- If behavior changes, update TECHNICAL_DESIGN.md and any related README references.
- Behavior changes require a version bump in the userscript and package files.

---

## Code Style & Standards

### JavaScript Style

```javascript
// ✅ Preferred
const goals = apiData.performance.map(goal => ({
  ...goal,
  bucket: extractBucket(goal.name)
}));

// ❌ Avoid
var goals = [];
for (var i = 0; i < apiData.performance.length; i++) {
  goals[i] = apiData.performance[i];
  goals[i].bucket = extractBucket(goals[i].name);
}
```

**Guidelines**:
- Prefer `const` over `let`, never use `var`
- Use arrow functions for callbacks
- Use template literals for strings with variables
- Use destructuring for objects and arrays
- 4-space indentation (no tabs)
- Always include semicolons
- Prefer single quotes for strings

### Naming Conventions

| Type | Convention | Example |
|------|-----------|---------|
| Functions | camelCase with verb | `extractBucket()`, `renderSummaryView()` |
| Constants | UPPER_SNAKE_CASE | `API_ENDPOINTS`, `DEBUG` |
| Variables | camelCase | `apiData`, `bucketName`, `totalInvestment` |
| CSS Classes | kebab-case with `gpv-` prefix | `gpv-trigger-btn`, `gpv-container` |
| Event Handlers | `on` + Event | `onButtonClick()`, `onModalClose()` |

### File Structure Pattern

The userscript follows this structure (order matters):
1. Userscript metadata block (`// ==UserScript==`)
2. IIFE wrapper (`(function() { 'use strict';`)
3. Data storage objects
4. API interception (monkey patching)
5. Data processing functions
6. UI rendering functions
7. Styling injection via `injectStyles()`
8. Initialization

---

## Security & Privacy Requirements

### Critical Rules (NEVER violate these)

1. **No External API Calls**: Data must stay in browser
   ```javascript
   // ❌ NEVER do this
   fetch('https://external-api.com/log', { body: userData });
   
   // ✅ Only intercept, never initiate
   window.fetch = async function(...args) {
     const response = await originalFetch.apply(this, args);
     // Process locally only
   };
   ```

2. **XSS Prevention**: Always sanitize user input
   ```javascript
   // ❌ Vulnerable to XSS
   element.innerHTML = `<div>${goalName}</div>`;
   
   // ✅ Safe
   const div = document.createElement('div');
   div.textContent = goalName;
   element.appendChild(div);
   ```

3. **No eval()**: Never use `eval()` or `Function()` constructor

4. **Sensitive Data Logging**: Never log financial data in production
   ```javascript
   const DEBUG = false; // Must be false for releases
   
   function debug(message, data) {
     if (DEBUG) {
       // Redact sensitive fields
       const safe = { ...data };
       delete safe.investment;
       delete safe.cumulativeReturn;
       console.log(message, safe);
     }
   }
   ```

### Data Validation Pattern

Always validate data before processing:

```javascript
function validateGoalData(goal) {
  return {
    id: String(goal?.id || ''),
    name: String(goal?.name || 'Unnamed Goal'),
    investment: Number(goal?.investment) || 0,
    cumulativeReturn: Number(goal?.cumulativeReturn) || 0,
    growthPercentage: Number(goal?.growthPercentage) || 0,
    goalType: String(goal?.goalType || 'Unknown')
  };
}
```

---

## API Interception Architecture

### Critical Endpoints

| Endpoint | Data Provided | Usage |
|----------|--------------|-------|
| `/v1/goals/performance` | Returns, growth %, current value | Performance metrics |
| `/v2/goals/investible` | Investment amounts, goal types | Investment details |
| `/v1/goals` | Goal names, IDs, descriptions | Goal metadata |

### Interception Pattern

```javascript
// Pattern for fetch interception
const originalFetch = window.fetch;
window.fetch = async function(...args) {
  const response = await originalFetch.apply(this, args);
  const url = args[0];
  
  if (typeof url === 'string' && url.includes('/specific/endpoint')) {
    const clone = response.clone(); // ALWAYS clone before reading
    try {
      const data = await clone.json();
      processData(data); // Process asynchronously
      GM_setValue('cache_key', JSON.stringify(data)); // Cache in Tampermonkey storage
    } catch (error) {
      console.error('[Goal Portfolio Viewer] Error:', error);
      // Don't break original flow
    }
  }
  
  return response; // ALWAYS return original response
};
```

### URL Matching Best Practices

```javascript
// ❌ Too broad - matches unwanted endpoints
if (url.includes('/v1/goals')) { }

// ✅ Specific - exact match
if (url.includes('/v1/goals/performance')) { }

// ✅ Specific - regex with boundary
if (url.match(/\/v1\/goals(?:[?#]|$)/)) { }
```

---

## Data Processing Patterns

### Financial Calculations (Critical Accuracy)

```javascript
// Always handle division by zero
function calculateGrowthPercentage(investment, returns) {
  if (!investment || investment === 0) return 0;
  // Round to 2 decimal places for display
  return Math.round((returns / investment) * 10000) / 100;
}

// Money formatting
function formatMoney(amount) {
  return new Intl.NumberFormat('en-SG', {
    style: 'currency',
    currency: 'SGD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount);
}

// Percentage formatting
function formatPercentage(value) {
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}
```

### Bucket Extraction Logic

The app organizes goals by "buckets" using naming convention: `"Bucket Name - Goal Description"`

```javascript
function extractBucket(goalName) {
  if (!goalName || typeof goalName !== 'string') {
    return 'Uncategorized';
  }
  
  const separatorIndex = goalName.indexOf(' - ');
  return separatorIndex === -1 
    ? goalName.trim() 
    : goalName.substring(0, separatorIndex).trim();
}

// Examples:
// "Retirement - Core Portfolio" → "Retirement"
// "Education - University Fund" → "Education"
// "Emergency Fund" → "Emergency Fund"
// "" → "Uncategorized"
```

### Data Aggregation Pattern

```javascript
function aggregateBucket(goals) {
  const totalInvestment = goals.reduce((sum, g) => sum + (g.investment || 0), 0);
  const totalReturn = goals.reduce((sum, g) => sum + (g.cumulativeReturn || 0), 0);
  const growthPercentage = calculateGrowthPercentage(totalInvestment, totalReturn);
  
  // Group by goal type (Investment, Cash, SRS, etc.)
  const byType = goals.reduce((acc, goal) => {
    const type = goal.goalType || 'Unknown';
    if (!acc[type]) {
      acc[type] = { goals: [], totalInvestment: 0, totalReturn: 0 };
    }
    acc[type].goals.push(goal);
    acc[type].totalInvestment += goal.investment || 0;
    acc[type].totalReturn += goal.cumulativeReturn || 0;
    return acc;
  }, {});
  
  return { totalInvestment, totalReturn, growthPercentage, byType };
}
```

---

## UI/UX Guidelines

### Design System

**Color Palette**:
- Primary Gradient: `linear-gradient(135deg, #667eea 0%, #764ba2 100%)`
- Positive Returns: `#10b981` (green)
- Negative Returns: `#ef4444` (red)
- Background: `rgba(0, 0, 0, 0.5)` with `backdrop-filter: blur(10px)`
- Text: `#1f2937` (dark), `#ffffff` (light)

**Animations**:
```css
@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes slideUp {
  from { 
    opacity: 0;
    transform: translateY(20px);
  }
  to { 
    opacity: 1;
    transform: translateY(0);
  }
}
```

**Transition Speed**: 300ms for all interactive elements

### DOM Manipulation Best Practices

```javascript
// ❌ Bad - Multiple reflows
goals.forEach(goal => {
  container.innerHTML += renderGoalRow(goal);
});

// ✅ Good - Single reflow
const html = goals.map(goal => renderGoalRow(goal)).join('');
container.innerHTML = html;

// ✅ Better - Use DocumentFragment for complex insertions
const fragment = document.createDocumentFragment();
goals.forEach(goal => {
  const row = createGoalRow(goal);
  fragment.appendChild(row);
});
container.appendChild(fragment);
```

### Rendering Pattern

```javascript
function renderComponent(data) {
  // Validate data first
  if (!data || !Array.isArray(data.goals)) {
    return '<div class="error">No data available</div>';
  }
  
  // Build HTML in memory
  const rows = data.goals.map(goal => `
    <tr>
      <td>${escapeHtml(goal.name)}</td>
      <td>${formatMoney(goal.investment)}</td>
      <td style="color: ${goal.cumulativeReturn >= 0 ? '#10b981' : '#ef4444'}">
        ${formatMoney(goal.cumulativeReturn)}
      </td>
      <td>${formatPercentage(goal.growthPercentage)}</td>
    </tr>
  `).join('');
  
  return `
    <table class="gpv-table">
      <thead>
        <tr>
          <th>Goal</th>
          <th>Investment</th>
          <th>Return</th>
          <th>Growth</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
```

---

## Testing Guidelines

### Automated Testing (Required)

- Run Jest for every change.
- Run ESLint for every change that touches code.
- Add or update tests for new logic, regressions, and edge cases.

### Manual/Exploratory Testing (When Applicable)

- UI or behavior changes require a smoke check and financial accuracy spot checks.
- For full checklists, edge cases, and cross-browser expectations, follow `.github/agents/qa-engineer.md`.

---

## Performance Optimization

### Key Metrics

- Button injection: < 100ms
- API interception setup: < 50ms
- Modal open: < 500ms
- View switch: < 300ms
- No memory leaks (use Chrome DevTools Memory profiler)

### Optimization Techniques

```javascript
// 1. Debounce expensive operations
let renderTimer;
function scheduleRender() {
  clearTimeout(renderTimer);
  renderTimer = setTimeout(() => {
    renderPortfolioView();
  }, 300);
}

// 2. Cache computed values
let cachedBuckets = null;
function getBuckets(goals) {
  if (cachedBuckets && !dataChanged) return cachedBuckets;
  cachedBuckets = computeBuckets(goals);
  return cachedBuckets;
}

// 3. Lazy load details
const detailCache = {};
function showBucketDetail(bucketName) {
  if (!detailCache[bucketName]) {
    detailCache[bucketName] = renderBucketDetail(bucketName);
  }
  displayContent(detailCache[bucketName]);
}

// 4. Use event delegation
modalContainer.addEventListener('click', (event) => {
  if (event.target.matches('.close-button')) {
    closeModal();
  } else if (event.target.matches('.gpv-bucket-card')) {
    showBucketDetail(event.target.dataset.bucket);
  }
});
```

---

## Common Tasks

### Adding a New Calculated Field

1. **Add to data processing**:
   ```javascript
   function processGoal(goal) {
     return {
       ...goal,
       myNewField: calculateMyField(goal)
     };
   }
   ```

2. **Update rendering**:
   ```javascript
   <td>${formatMyField(goal.myNewField)}</td>
   ```

3. **Add formatter if needed**:
   ```javascript
   function formatMyField(value) {
     // Format logic
   }
   ```

4. **Add tests** for edge cases

### Modifying Bucket Logic

⚠️ **Warning**: Changes affect all existing users!

1. Document old behavior
2. Ensure backward compatibility
3. Add migration logic if needed
4. Update TECHNICAL_DESIGN.md
5. Bump version number (MAJOR if breaking)

### Adding New API Endpoint

1. **Add to interception**:
   ```javascript
   if (url.includes('/v1/your/new/endpoint')) {
     const clone = response.clone();
     const data = await clone.json();
     apiData.newEndpoint = data;
     GM_setValue('api_newEndpoint', JSON.stringify(data));
   }
   ```

2. **Update merge logic** to include new data
3. **Update data model** if needed
4. **Test thoroughly** - API changes are risky

---

## Debugging

### Enable Debug Mode

```javascript
const DEBUG = true; // At top of file

// Add logging throughout
debug('API Response:', responseData);
debug('Merged Data:', mergedData);
debug('Bucket Aggregation:', bucketData);
```

### Debug Object (Add to window for console access)

```javascript
if (DEBUG) {
  window.portfolioViewerDebug = {
    apiData,
    mergedData,
    buckets: () => groupByBucket(mergedData),
    recalculate: () => recalculateAll(),
    clearCache: () => {
      GM_deleteValue('api_performance');
      GM_deleteValue('api_investible');
      GM_deleteValue('api_summary');
    }
  };
}
```

### Common Issues

1. **API not intercepted**: Check `@run-at document-start` in metadata
2. **Data not merging**: Verify all 3 endpoints have been called
3. **UI not updating**: Check for JavaScript errors in console
4. **Calculations wrong**: Verify input data, check for division by zero
5. **Button not appearing**: Check CSS conflicts with platform styles

---

## Version Management

### Semantic Versioning

- **MAJOR** (x.0.0): Breaking changes (API, data format, bucket logic)
- **MINOR** (0.x.0): New features (new views, new calculations)
- **PATCH** (0.0.x): Bug fixes, performance improvements

### Release Checklist

- [ ] Update version in userscript metadata
- [ ] Update CHANGELOG.md
- [ ] Full test suite passed
- [ ] Financial calculations verified
- [ ] Cross-browser tested
- [ ] Debug mode set to `false`
- [ ] Documentation updated
- [ ] Git tag created: `git tag -a v2.1.2 -m "Release 2.1.2"`

---

## Documentation

### When to Update Docs

- **README.md**: User-facing features, installation, usage
- **TECHNICAL_DESIGN.md**: Architecture, API details, developer guide
- **Inline comments**: Complex algorithms, financial calculations
- **Commit messages**: Follow conventional commits

### Commit Message Format

```
<type>(<scope>): <subject>

<body>

<footer>
```

**Types**: feat, fix, docs, style, refactor, perf, test, chore

**Examples**:
```
feat(ui): add export to CSV functionality

Allow users to export their portfolio data to CSV format for
external analysis. Includes proper escaping of special characters.

Closes #42
```

```
fix(calculation): correct growth percentage for negative returns

When cumulative return is negative, growth percentage was showing
incorrect sign. Fixed calculation to properly handle negative values.

Fixes #38
```

---

## Important Constraints

### DO NOT

- ❌ Send data to external servers
- ❌ Modify platform API requests (only intercept responses)
- ❌ Use external libraries (keep it vanilla JS)
- ❌ Add build process (must work as single file)
- ❌ Break bucket naming convention without migration
- ❌ Log sensitive data in production
- ❌ Use localStorage (use GM_setValue/GM_getValue instead)

### ALWAYS

- ✅ Validate all data before processing
- ✅ Clone responses before reading
- ✅ Handle errors gracefully
- ✅ Test financial calculations manually
- ✅ Consider backward compatibility
- ✅ Update version number
- ✅ Check console for errors
- ✅ Test in multiple browsers

---

## Resources

- **Tampermonkey API**: https://www.tampermonkey.net/documentation.php
- **Userscript Best Practices**: https://wiki.greasespot.net/Code_Patterns
- **MDN Web Docs**: https://developer.mozilla.org/en-US/docs/Web/API
- **OWASP XSS Prevention**: https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html

---

## Quick Reference

### File Structure
```
goal-portfolio-viewer/
├── .github/
│   └── copilot-instructions.md (this file)
├── tampermonkey/
│   ├── goal_portfolio_viewer.user.js (main script)
│   └── README.md
├── README.md (user guide)
├── TECHNICAL_DESIGN.md (technical details)
└── LICENSE
```

### Key Functions
- `extractBucket(goalName)` - Parse bucket from goal name
- `mergeAPIResponses()` - Combine data from 3 endpoints
- `aggregateBucket(goals)` - Calculate bucket totals
- `renderSummaryView()` - Show all buckets
- `renderBucketView(bucket)` - Show goals in bucket
- `formatMoney(amount)` - Format currency
- `calculateGrowthPercentage(inv, ret)` - Calculate growth %

### CSS Classes
- `.gpv-trigger-btn` - Trigger button
- `.gpv-overlay` - Modal overlay
- `.gpv-container` - Modal content
- `.gpv-bucket-card` - Bucket summary card
- `.gpv-table` - Goals table

---

*This guide is maintained alongside the codebase. When in doubt, prioritize user privacy and financial data accuracy.*

---

## Agent Orchestration & Coordination

### Workflow Phases
```
PLANNING → DESIGN → RISK → IMPLEMENT → QA → REVIEW → MERGE
   (PM)      (SE)    (DA)       (SE)     (QA)   (CR)
```

**Phase Gates**:
1. **Planning**: PM defines requirements → Gate: Testable acceptance criteria
2. **Design**: SE proposes solution → Gate: Risks/tradeoffs documented  
3. **Risk**: DA challenges assumptions → Gate: Mitigations accepted
4. **Implementation**: SE codes → Gate: Tests pass
5. **QA**: QA verifies → Gate: Acceptance criteria met
6. **Review**: CR approves → Gate: No blocking issues

**Loopback**: Failed gate returns to appropriate phase for rework.

### Handoff Protocols

**PM → SE**: Problem statement, acceptance criteria, constraints  
**SE → DA**: Proposed solution, assumptions, known risks, tradeoffs  
**DA → SE**: Risk assessment, blocking risks, required mitigations  
**SE → QA**: Implementation summary, test hooks, edge cases  
**QA → CR**: Test results, bugs fixed, verification checklist  

### Conflict Resolution

**PM vs SE (Scope)**: PM states value, SE states cost/risk, DA surfaces tradeoffs → Decision: Split or accept larger PR  
**SE vs QA (Coverage)**: QA states requirements, SE states feasibility, DA assesses risk → Decision: Balance coverage with effort  
**QA vs CR (Standards)**: CR states concern, QA explains rationale, DA assesses risk → Decision: Add tests or accept  

**Escalation**: DA mediates → SE technical call → PM product call → Document and move forward

### Agent Capabilities

| Agent | Requirements | Design | Implementation | Testing | Review | Risk |
|-------|--------------|--------|----------------|---------|--------|------|
| Product Manager | ✅ Owner | 🤝 Input | ❌ | 🤝 Input | 🤝 Input | 🤝 |
| Staff Engineer | 🤝 Input | ✅ Owner | ✅ Owner | 🤝 Support | 🤝 Input | 🤝 |
| QA Engineer | 🤝 Input | 🤝 Input | ❌ | ✅ Owner | 🤝 Input | 🤝 |
| Code Reviewer | ❌ | � Input | ❌ | 🤝 Verify | ✅ Owner | 🤝 |
| Devil's Advocate | 🤝 Challenge | 🤝 Challenge | ❌ | 🤝 Challenge | ❌ | ✅ Owner |

**Legend**: ✅ Owner | 🤝 Input/Support | ❌ Not involved

### Quick Reference

**When to invoke**:
- Requirements/scope → Product Manager
- Technical design/implementation → Staff Engineer
- Challenge assumptions → Devil's Advocate
- Test strategy/execution → QA Engineer
- Code review → Code Reviewer

**Common scenarios**:
- **Bug fix**: PM clarify → SE fix → QA verify → CR review
- **Feature**: PM define → SE design → DA challenge → SE implement → QA test → CR review
- **Uncertain approach**: SE evaluate options → DA assess risks → PM decide value

**Definition of Done per phase**:
- **Planning→Design**: Testable criteria
- **Design→Risk**: Risks identified
- **Risk→Implement**: Mitigations planned
- **Implement→QA**: Tests pass
- **QA→Review**: Criteria met
- **Review→Merge**: No blockers

---
