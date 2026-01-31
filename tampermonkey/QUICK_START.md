# Quick Start: Integrating Sync into UserScript

This is a streamlined guide for integrating the sync functionality. For detailed explanations, see SYNC_INTEGRATION.md.

## Prerequisites

✅ Cloudflare Workers backend deployed (in /workers directory)  
✅ UserScript is at `tampermonkey/goal_portfolio_viewer.user.js`  
✅ Files ready: `sync_implementation.js` and `sync_ui.js`

## Step 1: Update UserScript Header (30 seconds)

**File**: `goal_portfolio_viewer.user.js`  
**Line**: ~11 (in the @grant section)

**Add this line:**
```javascript
// @grant        GM_listValues
```

**Result:**
```javascript
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_listValues    // ← ADD THIS
// @grant        GM_cookie
```

## Step 2: Add Sync Constants (1 minute)

**File**: `goal_portfolio_viewer.user.js`  
**Location**: After line 58 (after `const CLASS_NAMES = {...}`)

**Add this code:**
```javascript
const SYNC_STORAGE_KEYS = {
    enabled: 'sync_enabled',
    serverUrl: 'sync_server_url',
    apiKey: 'sync_api_key',
    passphrase: 'sync_passphrase',
    userId: 'sync_user_id',
    deviceId: 'sync_device_id',
    lastSync: 'sync_last_sync',
    lastSyncHash: 'sync_last_hash',
    autoSync: 'sync_auto_sync',
    syncInterval: 'sync_interval_minutes'
};

const SYNC_DEFAULTS = {
    serverUrl: 'https://goal-sync.workers.dev',
    autoSync: true,
    syncInterval: 30 // minutes
};

const SYNC_STATUS = {
    idle: 'idle',
    syncing: 'syncing',
    success: 'success',
    error: 'error',
    conflict: 'conflict'
};
```

## Step 3: Add Encryption & Sync Manager (5 minutes)

**File**: `goal_portfolio_viewer.user.js`  
**Location**: After line 1656 (after the Storage Management section ends)

**Add these sections from `sync_implementation.js`:**

1. Copy the entire `SyncEncryption` module (lines starting with `const SyncEncryption = (() => {`)
2. Copy the entire `SyncManager` module (lines starting with `const SyncManager = (() => {`)
3. Copy the test exports at the end

**Quick way:**
```bash
# Extract just the modules
sed -n '/^    const SyncEncryption/,/^    \/\/ Export for testing/p' tampermonkey/sync_implementation.js
```

## Step 4: Add Sync UI Functions (10 minutes)

**File**: `goal_portfolio_viewer.user.js`  
**Location**: In the UI section (after line 2054)

**Add these functions from `sync_ui.js`:**

1. Helper functions (escapeHtml, showNotification, etc.)
2. Settings UI (createSyncSettingsHTML, setupSyncSettingsListeners, showSyncSettings)
3. Conflict UI (createConflictDialogHTML, showConflictResolutionUI)
4. Status indicator (createSyncIndicatorHTML, updateSyncUI)

**Quick way:**
```bash
# Extract UI functions
grep -A 99999 "// CHUNK 4: SYNC SETTINGS UI" tampermonkey/sync_ui.js | grep -B 99999 "// CHUNK 8: SYNC STYLES"
```

## Step 5: Add Sync Styles (2 minutes)

**File**: `goal_portfolio_viewer.user.js`  
**Location**: In the `injectStyles()` function (around line 3137)

**Find the existing style injection:**
```javascript
function injectStyles() {
    const style = document.createElement('style');
    style.textContent = `
        /* Existing styles... */
    `;
    document.head.appendChild(style);
}
```

**Append the sync styles from `sync_ui.js`:**
```javascript
function injectStyles() {
    const style = document.createElement('style');
    style.textContent = `
        /* Existing styles... */
        
        /* Sync Styles */
        .gpv-sync-modal { max-width: 700px; max-height: 90vh; overflow-y: auto; }
        /* ... rest of SYNC_STYLES from sync_ui.js ... */
    `;
    document.head.appendChild(style);
}
```

**Quick way:**
Copy the entire `SYNC_STYLES` constant from sync_ui.js and append to existing styles.

## Step 6: Add Sync Initialization (2 minutes)

**File**: `goal_portfolio_viewer.user.js`  
**Location**: In the initialization section (around line 4234, where DOM is ready)

**Add this code:**
```javascript
// Initialize sync indicator
const syncIndicatorContainer = document.createElement('div');
syncIndicatorContainer.innerHTML = createSyncIndicatorHTML();
if (syncIndicatorContainer.firstElementChild) {
    document.body.appendChild(syncIndicatorContainer.firstElementChild);
    
    // Add click listener to show settings
    const indicator = document.getElementById('gpv-sync-indicator');
    if (indicator) {
        indicator.addEventListener('click', showSyncSettings);
    }
}

// Start sync if enabled
if (SyncManager.isEnabled() && SyncManager.isConfigured()) {
    SyncManager.startAutoSync();
    
    // Perform initial sync (download only to avoid conflicts)
    SyncManager.performSync({ direction: 'download' }).catch(error => {
        console.error('[Goal Portfolio Viewer] Initial sync failed:', error);
    });
}
```

## Step 7: Add Sync Button to Main UI (1 minute) - OPTIONAL

**File**: `goal_portfolio_viewer.user.js`  
**Location**: Where you create the main modal or menu

**Option A: Add to existing menu**
```javascript
<button onclick="showSyncSettings()">⚙️ Sync Settings</button>
```

**Option B: Create programmatically**
```javascript
const syncButton = document.createElement('button');
syncButton.textContent = '⚙️ Sync Settings';
syncButton.onclick = showSyncSettings;
// Add to your menu container
menuContainer.appendChild(syncButton);
```

## Step 8: Test the Integration (5 minutes)

### 1. Reload the UserScript
```bash
# In Tampermonkey, click on your script and reload
# Or just refresh the page where it's active
```

### 2. Check Console for Errors
```javascript
// Open browser console (F12)
// Look for any errors during initialization
```

### 3. Verify Sync Indicator
```javascript
// Look for a floating indicator in bottom-right corner
// Should show "Sync Idle" or be hidden if disabled
```

### 4. Test Settings Panel
```javascript
// Click the sync indicator (or sync button)
// Settings panel should open
// All fields should be present
```

### 5. Test Encryption
```javascript
// Open console and run:
SyncEncryption.encrypt("test", "password").then(encrypted => {
    console.log("Encrypted:", encrypted);
    return SyncEncryption.decrypt(encrypted, "password");
}).then(decrypted => {
    console.log("Decrypted:", decrypted);
});
// Should output: Decrypted: test
```

## Step 9: Configure Sync (2 minutes)

### Backend Setup
1. Deploy Cloudflare Workers (see workers/README.md)
2. Get your API key from the deployment
3. Note your server URL (e.g., https://goal-sync.yourname.workers.dev)

### UserScript Setup
1. Click sync indicator
2. Enable sync checkbox
3. Enter:
   - **Server URL**: Your Cloudflare Workers URL
   - **User ID**: Your email or unique ID
   - **API Key**: From Cloudflare Workers
   - **Passphrase**: Strong password (8+ chars)
4. Click "Save Settings"
5. Click "Test Connection" (should succeed)
6. Click "Sync Now" (should succeed)

## Step 10: Verify End-to-End Sync (5 minutes)

### Test Upload
1. Set a goal target percentage
2. Wait 5 seconds
3. Click "Sync Now"
4. Check notification: "Sync completed successfully!"

### Test Download (Different Device/Browser)
1. Install UserScript on another browser
2. Configure sync with same credentials
3. Click "Sync Now"
4. Goal targets should appear
5. Check notification: "Sync completed successfully!"

### Test Conflict Resolution
1. Disable sync on device A
2. Change a goal target on device A
3. Change a different goal target on device B
4. Enable sync on device A
5. Click "Sync Now" on device A
6. Conflict dialog should appear
7. Choose "Keep Local" or "Use Remote"
8. Changes should apply

## Troubleshooting

### Issue: GM_listValues is not defined
**Solution**: Make sure you added `// @grant GM_listValues` in step 1

### Issue: Web Crypto API not supported
**Solution**: Use a modern browser (Chrome 37+, Firefox 34+, Safari 11+)

### Issue: CORS error when connecting to backend
**Solution**: Check Cloudflare Workers CORS headers:
```javascript
'Access-Control-Allow-Origin': '*'
'Access-Control-Allow-Methods': 'GET, PUT, DELETE, OPTIONS'
'Access-Control-Allow-Headers': 'Content-Type, X-API-Key'
```

### Issue: Sync indicator not showing
**Solution**: Check console for errors, verify `createSyncIndicatorHTML()` is defined

### Issue: Settings panel won't open
**Solution**: Check console for errors, verify `showSyncSettings()` is defined

### Issue: Decryption failed
**Solution**: Check passphrase is correct, or clear sync config and reconfigure

### Issue: Auto-sync not working
**Solution**: Check sync is enabled and configured:
```javascript
console.log(SyncManager.getStatus());
```

## Verification Checklist

After integration, verify:

- [ ] No console errors on page load
- [ ] Sync indicator appears (if sync enabled) or is hidden (if disabled)
- [ ] Settings panel opens when clicking indicator
- [ ] All form fields are present and functional
- [ ] Test connection button works
- [ ] Save settings button works
- [ ] Sync now button works
- [ ] Notifications appear on success/error
- [ ] Encryption/decryption works (test in console)
- [ ] Auto-sync timer starts when enabled
- [ ] Conflict dialog appears on conflicts
- [ ] UserScript still works without sync enabled

## Performance Check

Verify performance impact:

```javascript
// Time initialization
console.time('sync-init');
// Reload page
console.timeEnd('sync-init');
// Should be < 50ms

// Time encryption
console.time('encrypt');
SyncEncryption.encrypt("test data", "password").then(() => {
    console.timeEnd('encrypt');
});
// Should be < 100ms

// Time sync operation
console.time('sync');
SyncManager.performSync({ direction: 'both' }).then(() => {
    console.timeEnd('sync');
});
// Should be < 500ms
```

## What's Next?

1. **Write user documentation** - How to set up sync
2. **Write backend deployment guide** - How to deploy Cloudflare Workers
3. **Create video tutorial** - Walkthrough of setup process
4. **Test across browsers** - Chrome, Firefox, Safari, Edge
5. **Test edge cases** - Network failures, invalid credentials, etc.
6. **Gather user feedback** - Beta testing with early adopters
7. **Plan phase 2 features** - Export/import, sync history, etc.

## Time Estimate

- **Integration**: 20-30 minutes
- **Testing**: 10-15 minutes
- **Configuration**: 5 minutes
- **Total**: ~45 minutes

## Need Help?

- **Integration Guide**: See SYNC_INTEGRATION.md for detailed explanations
- **Architecture**: See SYNC_ARCHITECTURE.md for design decisions
- **API Documentation**: See workers/README.md for backend API
- **Issues**: Create a GitHub issue with logs and error messages

---

**Ready to integrate!** Follow the steps above and you'll have a fully functional sync system.
