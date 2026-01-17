# Demo Environment

This directory contains tools and files for demonstrating the Goal Portfolio Viewer with mock data.

## Contents

### Mock Data Generation
- **`generate-mock-data.py`** - Python script that generates realistic mock investment data
  - Creates 2 buckets: House Purchase (~$200k) and Retirement (~$60k)
  - House Purchase: 70% Core-Balanced, 10% Megatrends, 10% Tech, 10% China
  - Retirement: 55% Core-Aggressive, 15% Megatrends, 15% Tech, 15% China
  - Actual investments have realistic variance from targets (-8% to +10%) for realism
  - All goals under Investment type (GENERAL_WEALTH_ACCUMULATION)
  - Generates JSON file with API response format

- **`mock-data.json`** - Generated mock data (performance, investible, summary endpoints)
- **`mock-data.js`** - JavaScript version of the mock data generator
- **`BUCKET_CONFIGURATION.md`** - Documentation of bucket structure, targets, and calculated values

### Demo Pages
- **`demo-clean.html`** - Minimal demo page that works with the modified userscript
  - Sets `__GPV_DEMO_MODE__` flag to enable button in non-Endowus URLs
  - Mocks Tampermonkey API (GM_setValue, GM_getValue, etc.)
  - Loads mock data from JSON file
  - Loads modified userscript with demo mode enabled

- **`index.html`** - Full-featured demo page with info panel
- **`demo.html`** - Alternative demo page (kept for reference)

### Support Files
- **`loader.js`** - Dynamic script loader (not currently used)
- **`take-screenshots.py`** - Helper script for screenshot instructions

### Generated Files (gitignored)
- **`goal_portfolio_viewer_demo.user.js`** - Modified userscript with demo mode patch
- **`goal_portfolio_viewer.user.js`** - Copy of main userscript

## Usage

### Generate New Mock Data

```bash
python3 generate-mock-data.py
```

This creates `mock-data.json` with randomized investment amounts and returns.

### Run Demo Locally

1. Start a local web server:
   ```bash
   cd demo
   python3 -m http.server 8080
   ```

2. Open in browser:
   ```
   http://localhost:8080/demo-clean.html
   ```

3. Click the "📊 Portfolio Viewer" button that appears in the bottom-right

### Take Screenshots

Use Playwright or manual browser screenshots to capture:
- Summary view (both buckets: House Purchase and Retirement)
- House Purchase bucket detail view
- Retirement bucket detail view

## Mock Data Structure

### House Purchase Bucket (~$194k)
- House Purchase - Core - Balanced: ~$133k (70% allocation, +11.98% return)
- House Purchase - Megatrends: ~$21k (10% allocation, +11.24% return)
- House Purchase - Tech: ~$21k (10% allocation, +3.58% return)
- House Purchase - China: ~$19k (10% allocation, +0.67% return)

### Retirement Bucket (~$57k)
- Retirement - Core - Aggressive: ~$32k (55% allocation, +10.80% return)
- Retirement - Megatrends: ~$9k (15% allocation, +14.35% return)
- Retirement - Tech: ~$9k (15% allocation, +1.51% return)
- Retirement - China: ~$9k (15% allocation, +2.17% return)

All amounts are randomized with each generation while maintaining realistic proportions and return ranges.
Actual investments have realistic variance from targets (-8% to +10%) for demo realism.

## Technical Notes

### Demo Mode Patch

The demo requires a modified userscript that checks for `window.__GPV_DEMO_MODE__` in addition to the Endowus dashboard URL:

```javascript
function shouldShowButton() {
    return window.location.href === 'https://app.sg.endowus.com/dashboard' || 
           window.__GPV_DEMO_MODE__ === true;
}
```

### Mock Tampermonkey API

The demo pages provide a minimal Tampermonkey API implementation:

```javascript
const mockStorage = {};

window.GM_setValue = function(key, value) {
    mockStorage[key] = value;
};

window.GM_getValue = function(key, defaultValue) {
    return mockStorage.hasOwnProperty(key) ? mockStorage[key] : defaultValue;
};

window.GM_deleteValue = function(key) {
    delete mockStorage[key];
};
```

This allows the userscript to run without actual Tampermonkey installed.
