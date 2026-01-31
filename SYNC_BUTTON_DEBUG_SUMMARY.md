# Sync Button Debug & User Flows - Summary

## 🎯 What Was Done

### Issue Reported
User clicked sync button but got no response. Expected to see settings UI for configuring backend server and sync options.

### Changes Made

#### 1. Added Comprehensive Debug Logging
**File**: `tampermonkey/goal_portfolio_viewer.user.js`

**Changes**:
- Added console logging to trace execution flow
- Wrapped `createSyncSettingsHTML()` in try-catch with error fallback
- Wrapped `setupSyncSettingsListeners()` in try-catch
- Added error alerts for critical failures
- Added logging to sync button click handler

**Purpose**: 
To identify exactly where the code is failing when user clicks sync button.

#### 2. Created Complete User Flow Documentation
**File**: `SYNC_USER_FLOWS.md`

**Content**:
- 8 complete user flows covering all scenarios
- Visual diagrams of UI components
- Step-by-step setup instructions
- Troubleshooting guide
- Security and privacy explanations
- Quick reference guide

---

## 🔍 How to Diagnose the Issue

### For the User:

1. **Update to Latest Version**
   - Make sure you have the latest userscript
   - Version should be 2.8.0 or higher
   - Check userscript metadata: `@version 2.8.0`

2. **Open Browser Console**
   - Press **F12** to open Developer Tools
   - Click on the **Console** tab
   - Keep it open

3. **Click Sync Button**
   - Click the "⚙️ Sync" button in the Portfolio Viewer modal
   - Watch the console for messages

4. **Expected Console Output** (if working correctly):
   ```
   [Goal Portfolio Viewer] Sync button clicked
   [Goal Portfolio Viewer] typeof showSyncSettings: function
   [Goal Portfolio Viewer] Calling showSyncSettings...
   [Goal Portfolio Viewer] showSyncSettings called
   [Goal Portfolio Viewer] Creating sync settings HTML...
   [Goal Portfolio Viewer] Settings HTML created successfully
   [Goal Portfolio Viewer] Appending overlay to body...
   [Goal Portfolio Viewer] Overlay appended to body
   [Goal Portfolio Viewer] Setting up sync settings listeners...
   [Goal Portfolio Viewer] Listeners setup complete
   [Goal Portfolio Viewer] Sync settings modal shown successfully
   ```

5. **If You See Errors**:
   - Take a screenshot of the console
   - Note the exact error message
   - Report the issue with the error details

---

## 🐛 Common Issues & Solutions

### Issue 1: "Storage.get is not a function"
**Status**: ✅ FIXED in commit c5b3269

**Solution**: 
- Update to latest userscript version
- This was a forward reference error that has been resolved

### Issue 2: Modal appears but is hidden/invisible
**Possible Cause**: CSS conflict with page styles

**Solution**:
1. Open browser DevTools (F12)
2. Go to Elements tab
3. Look for element with class `gpv-modal-overlay`
4. Check if it has `display: none` or `visibility: hidden`
5. If found, there's a CSS conflict that needs fixing

### Issue 3: Function not defined
**Symptoms**: Console shows `showSyncSettings is not a function`

**Solution**:
1. Reload the page completely (Ctrl+R or Cmd+R)
2. Clear browser cache
3. Reinstall the userscript
4. Check Tampermonkey is enabled for the Endowus site

### Issue 4: Nothing happens, no console output
**Possible Causes**:
- Userscript not running
- Sync button not clickable
- JavaScript error earlier in script

**Solution**:
1. Check Tampermonkey icon - userscript should be enabled
2. Check browser console for ANY JavaScript errors
3. Try clicking other buttons in the modal to verify script is running
4. Inspect the sync button in DevTools to verify event handler is attached

---

## 📋 Debugging Checklist

Use this checklist to diagnose the issue:

- [ ] Userscript version is 2.8.0 or higher
- [ ] Tampermonkey is enabled for Endowus site
- [ ] Browser console is open (F12 → Console)
- [ ] Portfolio Viewer modal opens successfully
- [ ] Sync button (⚙️ Sync) is visible in modal header
- [ ] Clicking sync button shows console logs starting with `[Goal Portfolio Viewer]`
- [ ] No JavaScript errors appear in console
- [ ] Modal overlay element is created (check Elements tab)

---

## 📖 User Flows Reference

For complete user flow documentation, see: **[SYNC_USER_FLOWS.md](./SYNC_USER_FLOWS.md)**

### Quick Reference:

#### To Configure Sync:
1. Open Portfolio Viewer
2. Click "⚙️ Sync" button
3. Fill in configuration:
   - Server URL
   - User ID
   - API Key
   - Encryption Passphrase
4. Click "Save Settings"
5. Check "Enable Sync"
6. Click "Manual Sync"

#### To Monitor Sync:
- Status indicator appears in modal header (center)
- Icons: ⚪ Idle, 🔄 Syncing, ✅ Success, ❌ Error, ⚠️ Conflict
- Click indicator to open settings

#### To Troubleshoot:
- Always check browser console (F12)
- Look for messages starting with `[Goal Portfolio Viewer]`
- Check for red error messages
- Report with error details

---

## 🎯 Next Steps for User

### Immediate Actions:

1. **Update Userscript**
   - Ensure you have version 2.8.0+
   - Contains debug logging and bug fixes

2. **Test the Sync Button**
   - Open browser console (F12)
   - Click sync button
   - Check console output
   - Report findings

3. **If Working**:
   - Follow setup guide in SYNC_USER_FLOWS.md
   - Configure your sync settings
   - Test cross-device sync

4. **If Not Working**:
   - Take screenshot of console errors
   - Note exact error message
   - Report issue with:
     - Browser and version
     - Userscript version
     - Console output
     - Steps to reproduce

---

## 🔧 Technical Details

### Debug Logging Added

**Location**: Lines 4242-4314 in `goal_portfolio_viewer.user.js`

**What it does**:
1. Logs function entry
2. Catches errors in createSyncSettingsHTML()
3. Shows fallback error UI if HTML generation fails
4. Catches errors in setupSyncSettingsListeners()
5. Logs each step of modal creation
6. Shows alert with error details if critical error occurs

**Why it helps**:
- Identifies exact failure point
- Shows error messages
- Provides debugging information
- Helps users report issues accurately

### Button Click Handler

**Location**: Lines 5936-5947 in `goal_portfolio_viewer.user.js`

**What it does**:
1. Logs button click
2. Checks if showSyncSettings is defined
3. Logs function type
4. Calls showSyncSettings()
5. Shows error if function not available

---

## 📊 Commit History

### Recent Commits:

1. **5072b22** - debug: add comprehensive logging and error handling to sync settings modal
   - Added console logging throughout
   - Added try-catch error handling
   - Added error alerts

2. **dc5642f** - docs: add comprehensive sync user flows and troubleshooting guide
   - Created SYNC_USER_FLOWS.md
   - 8 complete user flows
   - Troubleshooting guide

3. **c5b3269** - fix: move Storage definition before SyncManager
   - Fixed "Storage.get is not a function" error
   - Resolved forward reference issue

---

## ✅ Expected Behavior

### When Sync Button is Clicked:

1. **Console shows debug messages**
2. **Sync Settings modal appears** with:
   - Title: "Sync Settings"
   - Close button (×)
   - Enable Sync checkbox
   - Server URL input
   - User ID input
   - API Key input
   - Encryption Passphrase input
   - Auto-sync interval input
   - Save, Manual Sync, and Delete buttons

3. **Modal is interactive**:
   - Can type in fields
   - Can check/uncheck Enable Sync
   - Can click buttons
   - Can close with × or clicking outside

4. **No errors in console**

---

## 🎉 Summary

The sync button has been enhanced with:
- ✅ Comprehensive debug logging
- ✅ Error handling and fallbacks
- ✅ User-friendly error messages
- ✅ Complete documentation of user flows

**What the user needs to do**:
1. Update to latest version
2. Open browser console
3. Click sync button
4. Report what happens (success or specific errors)

**Expected outcome**:
- Sync settings modal should appear
- If not, console will show exactly where and why it fails
- User can report specific error for further fixes

---

*For complete user flow documentation, see [SYNC_USER_FLOWS.md](./SYNC_USER_FLOWS.md)*
