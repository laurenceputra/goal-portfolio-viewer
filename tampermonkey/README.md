# Goal Portfolio Viewer - Tampermonkey Script

A modern Tampermonkey userscript that provides an enhanced portfolio viewing experience for investors using the Endowus (Singapore) platform. This script allows you to organize and visualize your portfolio by custom buckets with a beautiful, modern interface.

## The Problem

Managing multiple financial goals on the platform can be overwhelming when you have different investment strategies across various life objectives. Whether you're saving for retirement, your children's education, or an emergency fund, tracking performance across these different "buckets" requires manually calculating totals and returns.

## The Solution

This Tampermonkey script automatically organizes your portfolio into custom buckets, providing instant insights into:
- Ending balance per bucket
- Cumulative returns and growth percentages
- Detailed breakdowns by goal type (Investment, Cash, etc.), with an **Unknown** fallback if a goal type is missing
- Individual goal performance within each bucket

Perfect for investors using strategies like Core + Satellite across multiple life goals.

## Features

### 🎯 Core Functionality
- **Portfolio Bucket Organization**: Group your goals by buckets (e.g., "Retirement", "Education", "Emergency")
- **Real-time Data Interception**: Automatically captures portfolio data using monkey patching techniques
- **Comprehensive Analytics**: View ending balances, cumulative returns, and growth percentages
- **Multi-level Views**: Toggle between summary view and detailed bucket views
- **Performance Insights**: Per goal-type charts with responsive sizing (including dynamic height), recent return windows, and key metrics (including Total Return % with weighting context and Simple Return %)
- **Declutter Controls**: Expand/shrink the overlay, switch between Allocation/Performance modes, and collapse heavy panels

### 🎨 Modern UX Design
- **Beautiful Gradient UI**: Modern purple gradient theme with smooth animations
- **Responsive Design**: Adapts to different screen sizes
- **Interactive Elements**: Hover effects, smooth transitions, and intuitive controls
- **Clean Typography**: Uses system fonts for optimal readability
- **Color-coded Returns**: Positive returns in green, negative in red for quick insights

### 🔧 Technical Features
- **API Interception**: Monkey patches both `fetch` and `XMLHttpRequest` to capture API responses
- **Non-blocking**: Runs seamlessly alongside the platform's native functionality
- **Efficient Data Processing**: Merges data from multiple API endpoints intelligently
- **Auto-updates**: Configured to check for script updates automatically

### ☁️ Sync Feature (Optional)
- **Cross-device Sync**: Sync your goal configurations across multiple devices
- **End-to-End Encryption**: Client-side AES-GCM 256-bit encryption before data leaves your browser
- **Privacy-First**: Server never sees your plaintext data
- **Self-Hostable**: Run your own sync server using Cloudflare Workers
- **Conflict Resolution**: Visual interface for resolving sync conflicts
- **Auto-sync**: Automatic background synchronization (enabled by default after activation) with configurable interval
- **Zero-Knowledge**: You control all encryption keys

## Installation

### Prerequisites
- A userscript manager extension installed in your browser:
  - [Tampermonkey](https://www.tampermonkey.net/) (Chrome, Firefox, Safari, Edge, Edge Mobile, Opera)
  - [Violentmonkey](https://violentmonkey.github.io/) (Chrome, Firefox, Edge)
  - [Greasemonkey](https://www.greasespot.net/) (Firefox only)

### Installation Steps

1. **Install a Userscript Manager**
   - Install Tampermonkey (recommended) from your browser's extension store
   
2. **Install the Script**
   - Option A: Click [here](https://raw.githubusercontent.com/laurenceputra/goal-portfolio-viewer/main/tampermonkey/goal_portfolio_viewer.user.js) to install directly
   - Option B: 
     1. Open Tampermonkey dashboard
     2. Click "Create a new script"
     3. Copy the contents of `goal_portfolio_viewer.user.js`
     4. Paste into the editor
     5. Save (Ctrl+S or Cmd+S)

3. **Verify Installation**
   - Navigate to [https://app.sg.endowus.com/](https://app.sg.endowus.com/)
   - You should see a "📊 Portfolio Viewer" button in the bottom-right corner

## Usage

### Basic Usage

1. **Log into Endowus**: Navigate to your Endowus portfolio at https://app.sg.endowus.com/
2. **Wait for Data**: Allow the page to fully load (the script will automatically intercept API calls)
3. **Open Portfolio Viewer**: Click the "📊 Portfolio Viewer" button in the bottom-right corner
4. **Explore Your Portfolio**: 
   - View the summary to see all buckets at a glance
   - Select individual buckets from the dropdown to see detailed breakdowns

### Goal Naming Convention

To use the bucket feature, name your goals following this format:

```
<Bucket Name> - <Goal Description>
```

**Examples:**
- `Retirement - Core Portfolio`
- `Retirement - Satellite Growth`
- `Education - Child University Fund`
- `Emergency - 6 Month Reserve`

The script will automatically group all goals starting with the same bucket name.

### Understanding the Views

#### Summary View
- Shows all buckets with their totals, returns, and growth percentages
- Displays breakdown by goal type (Investment, Cash, etc.) within each bucket, using **Unknown** when a type is missing
- Perfect for a quick overview of your entire portfolio
- Click any bucket card to jump directly to its detail view (syncs the dropdown selection)

#### Bucket Detail View
- Select a specific bucket from the dropdown (or click a bucket card in the summary view)
- See detailed information about each goal within that bucket
- View individual goal performance metrics
- See a secondary per-goal TWR window row (1M/6M/YTD/1Y/3Y); missing windows show `-` until performance data is cached and refresh automatically once data loads in the current session
- Use `Allocation` mode for planning fields (Fixed/Target/Diff) and `Performance` mode for return-focused views
- Mode selection persists between sessions for quick switching
- Collapse the performance chart/metrics and projection sections per goal type (collapsed by default, remembered per section); switching to Performance mode auto-expands performance panels for visibility
- Use the header `Expand` button to temporarily grow the overlay (resets to default size each time you reopen it)
- Compare goals within the same bucket
- Use per-goal fixed toggles to lock a goal's amount and auto-sync its target %
- Track remaining unassigned target % for each goal type, with visual flagging when it exceeds 2%

### Data Displayed

For each bucket/goal, you'll see:
- **Ending Balance**: Your current balance for the goal/bucket
- **Cumulative Return**: Total profit or loss
- **Growth %**: Percentage return on investment (cumulative return ÷ total invested)
- **Goal Breakdown**: Individual goals with their specific metrics
- **% of Goal Type**: What percentage each goal represents within its type
- **TWR Windows**: Per-goal 1M/6M/YTD/1Y/3Y time-weighted return windows shown under each goal row (falls back to `-` when unavailable)

### Sync Setup (Optional)

If you want to sync your goal configurations across devices:

1. **Deploy Backend** (one-time setup):
   - See `../workers/README.md` for Cloudflare Workers deployment instructions
   - Or use the default public server: `https://goal-portfolio-sync.laurenceputra.workers.dev`

2. **Configure Sync**:
    - Click the sync indicator (bottom-right) or "Sync Settings" button
    - Enable sync
    - Enter your server URL, user ID, and password
    - Click "Login" to obtain session tokens
    - Click "Save Settings" then "Sync Now"

3. **Use on Other Devices**:
   - Install the UserScript on other devices
   - Configure sync with the same credentials
   - Your goal targets and settings will sync automatically

**Important**: 
- Your password is used to encrypt data before it leaves your device and is not stored locally unless you opt to remember the encryption key
- If you lose your password, your synced data cannot be recovered
- You can optionally remember the encryption key on trusted devices to keep sync unlocked across sessions
- The sync server never sees your unencrypted data
- Only encrypted goal targets + fixed flags are synced; holdings, balances, and transactions never leave your browser
- Auto-sync is enabled by default after activation; you can disable it or tune the interval in Sync Settings
- Conflict dialogs include a goal-level diff preview to help choose Local vs Remote
- Choosing "Keep This Device" forces the local config to overwrite the server, even if the server timestamp is newer

For detailed sync setup instructions, see `QUICK_START.md`.

## How It Works

### API Interception

The script uses monkey patching to intercept API responses from the Endowus platform:

1. **Fetch API Patching**: Wraps the native `fetch` function to capture responses
2. **XMLHttpRequest Patching**: Intercepts XHR requests for compatibility
3. **Data Capture**: Automatically stores data from three key endpoints:
   - `/v1/goals/performance` - Performance metrics
   - `/v2/goals/investible` - Investment details
   - `/v1/goals` - Goal summaries

### Data Processing

1. **Merging**: Combines data from all three endpoints based on goal IDs
2. **Bucket Extraction**: Parses goal names to determine bucket grouping
3. **Aggregation**: Calculates ending balances, returns, and percentages for each bucket
4. **Rendering**: Displays data in an organized, visually appealing format

**Note:** The investible API field `totalInvestmentAmount` is misnamed and represents ending balance. The script maps it internally to avoid confusing it with principal invested.

### Modern UI Components

- **Gradient Headers**: Eye-catching purple gradients for visual hierarchy
- **Card-based Layout**: Clean cards for bucket information
- **Interactive Tables**: Sortable, hoverable table rows
- **Smooth Animations**: Fade-in effects and smooth transitions
- **Responsive Controls**: Dropdown selector for easy navigation

## Troubleshooting

### Button Not Appearing
- Ensure Tampermonkey is enabled
- Check that the script is enabled in Tampermonkey dashboard
- Refresh the platform page
- Check browser console for errors (F12)

### No Data / Alert Message
- Wait for the platform page to fully load
- Navigate through your portfolio sections to trigger API calls
- Check that you're logged into Endowus
- Verify that your goals follow the naming convention

### Styling Issues
- Clear browser cache
- Disable other extensions that might conflict
- Try a different browser

### Performance Data Refresh
- Performance data is cached for up to 7 days
- Use the “Clear cache & refresh” button in the performance section to refresh data
- Refresh is available once every 24 hours
- Per-goal TWR windows in bucket detail view appear after performance data is available (otherwise `-` is shown)

### Script Not Running
- Verify script is installed correctly in Tampermonkey
- Check that the match pattern includes the platform URL (https://app.sg.endowus.com/)
- Ensure Tampermonkey has permissions for the platform domain

## Development

### File Structure
```
tampermonkey/
├── goal_portfolio_viewer.user.js  # Main script file
├── sync_implementation.js         # Sync core logic (for integration)
├── sync_ui.js                     # Sync UI components (for integration)
├── sync_complete.js               # Quick reference
├── README.md                      # This file
├── QUICK_START.md                 # Quick integration guide
├── SYNC_INTEGRATION.md            # Detailed integration guide
└── SYNC_IMPLEMENTATION_SUMMARY.md # Implementation summary
```

### Modifying the Script

To modify the script for your needs:

1. Open Tampermonkey dashboard
2. Click on the script name to edit
3. Make your changes
4. Save (Ctrl+S or Cmd+S)
5. Refresh the platform page to see changes

### Key Functions

- `buildMergedInvestmentData()`: Merges API data into bucket map
- `buildSummaryViewModel()`: Builds summary view data for rendering
- `buildBucketDetailViewModel()`: Builds bucket detail view data for rendering
- `renderSummaryView()`: Renders the summary view from view-model data
- `renderBucketView()`: Renders detailed bucket view from view-model data
- `injectStyles()`: Adds modern CSS styling
- `showOverlay()`: Creates and displays the modal

## Privacy & Security

- **Local Processing**: All data processing happens in your browser
- **No External Calls**: The script doesn't send data to any external servers
- **Read-only**: Script only reads API responses, doesn't modify requests
- **No Credentials**: Script doesn't access or store login credentials
- **Open Source**: Source code is fully transparent and auditable

## Updates

The script is configured with auto-update URLs. When a new version is released:
1. Tampermonkey will detect it automatically
2. You'll be prompted to update
3. Click "Update" to install the latest version

Alternatively, check for updates manually:
1. Open Tampermonkey dashboard
2. Click "Last updated" column
3. Click "Check for updates"

## License

This project is licensed under the MIT License - see the LICENSE file in the repository for details.

## Support

If you encounter issues or have suggestions:
1. Check the Troubleshooting section above
2. Review existing issues on GitHub
3. Open a new issue with detailed information about your problem

## Contributing

Contributions are welcome! To contribute:
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## Changelog

### Version 2.14.0
- Forced local conflict resolution now overwrites the server on request

### Version 2.13.2
- Hardened sync error handling and performance request timeouts
- Refactored bucket and FSM overlays for easier maintenance

### Version 2.11.1
- Reduced false multi-device sync conflicts by reconciling identical payloads via content hash and aligning persisted sync timestamps with authoritative source timestamps

### Version 2.11.0
- Added per-goal TWR window rows (1M/6M/YTD/1Y/3Y) in bucket detail view with `-` fallback when data is missing

### Version 2.9.3
- Rendered sync conflict resolution inside the sync settings overlay
- Stopped syncing target percentages for fixed goals to avoid unnecessary conflicts

### Version 2.9.2
- Updated allocation drift calculations to use target amounts as the denominator
- Included zero-balance goals with positive targets in allocation drift reporting

### Version 2.9.1
- Applied remaining target percentage to missing-target goal diffs without auto-filling targets
- Added Allocation Drift per goal type in summary and detail views with a target-allocation hint

### Version 2.6.7
- Sort goals alphabetically within each goal type in the bucket detail view

### Version 2.6.3
- Corrected growth percentage calculations to use cumulative return over total invested
- Clarified growth percentage definition in documentation

### Version 2.6.2
- Highlight remaining target percentages above 2% in the bucket detail view

### Version 2.6.1
- Derived bucket names using the `"Bucket Name - Goal Description"` separator to preserve multi-word bucket labels
- Separated numeric allocation calculations from display formatting for easier testing and maintenance
- Added time-series fallbacks when performance windows are missing from the returns table
- Gated debug logging behind a dedicated flag to reduce noisy console output

### Version 2.6.0
- Added per-goal fixed toggles to lock target percentages to current goal allocations
- Displayed remaining unassigned target percentage per goal type in bucket detail view
- Refined fixed toggle styling and header layout for clearer target allocation visibility
- Simplified fixed toggle rows for a cleaner detail table
- Fixed goal name header alignment with table content
- Centralized goal type allocation calculations to reduce duplicated logic

### Version 2.4.0
- Refactored UI rendering to use view-model builders for better testability
- Added unit tests and fixtures for UI view models and calculation helpers

### Version 2.0.0
- Initial Tampermonkey release
- Modern UI with gradient design
- Cross-browser compatibility via monkey patching
- Enhanced animations and transitions
- Improved data visualization
- Auto-update functionality

## Acknowledgments

- Inspired by modern web design principles
- Built for goal-based investors
