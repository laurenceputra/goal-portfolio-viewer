# Sync Feature - User Flows

## Overview

The Goal Portfolio Viewer now includes optional cross-device sync functionality that allows you to synchronize your portfolio configuration across multiple devices with end-to-end encryption.

---

## 🚀 User Flow 1: Initial Setup (First-Time User)

### Step 1: Open Portfolio Viewer
1. Navigate to Endowus investment platform
2. Click the "View Portfolio" button/trigger (added by this userscript)
3. Portfolio modal opens showing your investment goals

### Step 2: Access Sync Settings
1. Look at the modal header (top-right area)
2. Click the **"⚙️ Sync"** button
3. Sync Settings modal opens

### Step 3: Configure Sync
The Sync Settings modal shows:

```
╔═══════════════════════════════════════════════════╗
║  Sync Settings                              ✕     ║
╠═══════════════════════════════════════════════════╣
║                                                   ║
║  □ Enable Sync                                    ║
║                                                   ║
║  Server URL:                                      ║
║  [https://goal-sync.your-domain.workers.dev]     ║
║                                                   ║
║  User ID:                                         ║
║  [your-unique-user-id]                           ║
║                                                   ║
║  API Key:                                         ║
║  [your-api-key]                                  ║
║                                                   ║
║  Encryption Passphrase:                           ║
║  [****************]                               ║
║                                                   ║
║  Auto-sync interval: [30] minutes                ║
║                                                   ║
║  [Save Settings]  [Manual Sync]  [Delete Data]   ║
║                                                   ║
╚═══════════════════════════════════════════════════╝
```

4. **Fill in the configuration:**
   - **Server URL**: Your Cloudflare Workers backend URL (see deployment guide)
     - Default: `https://goal-sync.your-domain.workers.dev`
     - Or use self-hosted URL
   - **User ID**: A unique identifier for your account (e.g., email, username)
   - **API Key**: The API key configured in your Cloudflare Workers backend
   - **Encryption Passphrase**: A strong password to encrypt your data
     - ⚠️ **IMPORTANT**: If you lose this passphrase, you cannot recover your synced data!
     - Choose a memorable but strong passphrase
     - Server never sees this passphrase (zero-knowledge encryption)
   - **Auto-sync interval**: How often to automatically sync (default: 30 minutes)

5. Click **"Save Settings"**
   - Settings are saved locally to browser storage
   - A success notification appears

6. Check **"Enable Sync"** checkbox
   - This activates the sync functionality
   - A sync status indicator appears in the main modal header

7. Click **"Manual Sync"** to perform your first sync
   - Your configuration is encrypted with your passphrase
   - Encrypted data is uploaded to the server
   - Success notification shows when complete

---

## 🔄 User Flow 2: Syncing to Another Device

### Prerequisites
- You've already configured sync on Device A (see Flow 1)
- You have your Server URL, User ID, API Key, and Passphrase

### Step 1: Install Userscript on Device B
1. Install Tampermonkey/Greasemonkey on Device B
2. Install the Goal Portfolio Viewer userscript

### Step 2: Configure Sync on Device B
1. Open Portfolio Viewer on Device B
2. Click the **"⚙️ Sync"** button
3. Enter **THE SAME** configuration as Device A:
   - Server URL (same)
   - User ID (same)
   - API Key (same)
   - Encryption Passphrase (same - must be identical!)
4. Click "Save Settings"
5. Check "Enable Sync"

### Step 3: Download Configuration
1. Click **"Manual Sync"** button
2. Userscript downloads encrypted data from server
3. Decrypts it using your passphrase
4. Applies configuration to Device B
5. Success notification appears

✅ **Device B now has the same configuration as Device A!**

---

## 🔄 User Flow 3: Making Changes and Syncing

### Scenario: Update bucket names or settings on one device

#### On Device A:
1. Make changes to your portfolio configuration
   - Example: Rename a goal, add new goal, change bucket structure
2. These changes are saved locally automatically
3. If auto-sync is enabled:
   - Changes automatically sync within the configured interval (e.g., 30 minutes)
   - Status indicator shows "🔄 Syncing..." then "✅ Synced"
4. If auto-sync is disabled:
   - Open sync settings
   - Click **"Manual Sync"**
   - Status indicator confirms sync

#### On Device B:
1. Wait for auto-sync interval OR
2. Click sync button and click "Manual Sync"
3. Device B downloads latest configuration
4. Changes from Device A are now on Device B

---

## ⚠️ User Flow 4: Handling Conflicts

### What is a Conflict?

A conflict occurs when:
- Device A makes changes and uploads
- Device B makes **different** changes before downloading from server
- Both devices have different configurations

### When Conflict is Detected:

The **Conflict Resolution Dialog** appears:

```
╔═══════════════════════════════════════════════════╗
║  Sync Conflict Detected!                    ✕     ║
╠═══════════════════════════════════════════════════╣
║                                                   ║
║  Your local configuration differs from the        ║
║  server version. Which would you like to keep?    ║
║                                                   ║
║  ┌─────────────────────────────────────────────┐ ║
║  │ LOCAL (Your Device)                         │ ║
║  │ Last modified: 2024-01-31 08:45:00         │ ║
║  │                                             │ ║
║  │ • Retirement bucket: 3 goals               │ ║
║  │ • Education bucket: 2 goals                │ ║
║  │ • Emergency bucket: 1 goal                 │ ║
║  │                                             │ ║
║  │         [Keep Local Version]               │ ║
║  └─────────────────────────────────────────────┘ ║
║                                                   ║
║  ┌─────────────────────────────────────────────┐ ║
║  │ SERVER (Other Device)                       │ ║
║  │ Last modified: 2024-01-31 08:50:00         │ ║
║  │                                             │ ║
║  │ • Retirement bucket: 3 goals               │ ║
║  │ • Education bucket: 3 goals (NEW!)         │ ║
║  │ • Emergency bucket: 1 goal                 │ ║
║  │                                             │ ║
║  │         [Keep Server Version]              │ ║
║  └─────────────────────────────────────────────┘ ║
║                                                   ║
║                    [Cancel]                       ║
║                                                   ║
╚═══════════════════════════════════════════════════╝
```

### Resolution Options:

1. **Keep Local Version**
   - Your current device's configuration is uploaded to server
   - Overwrites server version
   - Other devices will get this version on next sync

2. **Keep Server Version**
   - Downloads configuration from server
   - Overwrites your local version
   - Your local changes are lost

3. **Cancel**
   - No changes made
   - Sync is aborted
   - You can resolve manually by editing configuration

### Best Practice:
- Review both versions carefully
- Choose the one with the most important/recent changes
- Consider manually merging if both have important changes

---

## 📊 User Flow 5: Monitoring Sync Status

### Status Indicator

When sync is enabled, a status indicator appears in the main Portfolio Viewer modal header (center, between title and buttons):

**Status Icons:**
- ⚪ **Idle** - "Ready to sync"
  - Sync is enabled but no activity
  - Ready to sync when needed
  
- 🔄 **Syncing** - "Syncing..."
  - Currently uploading or downloading data
  - Wait for completion
  
- ✅ **Success** - "Synced at 08:45"
  - Last sync completed successfully
  - Shows timestamp of last sync
  
- ❌ **Error** - "Sync failed"
  - Sync encountered an error
  - Click indicator to open settings and retry
  - Check console for error details
  
- ⚠️ **Conflict** - "Conflict detected"
  - Conflict needs resolution
  - Click to open conflict resolution dialog

### Accessing Status Details:
1. Click the status indicator
2. Opens Sync Settings modal
3. View detailed sync history and logs

---

## 🔒 User Flow 6: Security & Privacy

### Zero-Knowledge Architecture

**What happens to your data:**

1. **On Your Device (Encryption):**
   ```
   Your Config → Encryption (with your passphrase) → Encrypted Blob
   ```

2. **On The Server:**
   ```
   Encrypted Blob stored in Cloudflare KV
   (Server CANNOT read your data - it's encrypted!)
   ```

3. **On Another Device (Decryption):**
   ```
   Encrypted Blob → Decryption (with your passphrase) → Your Config
   ```

### Key Security Features:
- ✅ **End-to-end encryption** (AES-GCM 256-bit)
- ✅ **Server never sees your passphrase** (zero-knowledge)
- ✅ **Server never sees your unencrypted data**
- ✅ **HTTPS only** (TLS 1.3)
- ✅ **Rate limiting** to prevent abuse
- ✅ **API key authentication**

### Important Security Notes:

1. **Passphrase Security:**
   - Choose a strong, unique passphrase
   - Store it securely (password manager recommended)
   - **If you lose it, your data is UNRECOVERABLE**
   - Never share your passphrase

2. **API Key Security:**
   - Don't share your API key
   - If compromised, rotate it on the backend
   - Update all devices with new key

3. **User ID:**
   - Can be any unique identifier
   - Not sensitive (it's metadata)
   - Use email or username

---

## 🛠️ User Flow 7: Troubleshooting

### Problem: Sync button doesn't respond

**Solution:**
1. Open browser console (F12 → Console tab)
2. Click sync button
3. Check for error messages like:
   - `Storage.get is not a function` → Update userscript to latest version
   - `showSyncSettings is not a function` → Reload page
   - Other errors → Report to developer with error message

### Problem: "Sync failed" error

**Common causes:**
1. **Wrong Server URL**
   - Verify URL is correct
   - Must start with `https://`
   - Check for typos

2. **Wrong API Key**
   - Verify API key matches backend configuration
   - Check for extra spaces

3. **Network error**
   - Check internet connection
   - Check if server is accessible
   - Try in browser: `https://your-server.workers.dev/health`

4. **Server error**
   - Check backend logs in Cloudflare dashboard
   - Verify KV namespace is configured

### Problem: Can't decrypt data on new device

**Cause:** Wrong passphrase

**Solution:**
1. Double-check passphrase (case-sensitive!)
2. Try copying from password manager
3. If passphrase is truly lost, data cannot be recovered
4. Delete server data and start fresh

### Problem: Conflict appears every time

**Cause:** Two devices making changes simultaneously

**Solution:**
1. Disable auto-sync on one device temporarily
2. Sync one device fully
3. Then sync the other device
4. Re-enable auto-sync on both
5. Avoid making changes on both devices between syncs

---

## 🎯 User Flow 8: Disabling Sync

### Temporary Disable:
1. Open Sync Settings
2. Uncheck "Enable Sync"
3. Click "Save Settings"
- Keeps all configuration but stops syncing
- Can re-enable later

### Complete Removal:
1. Open Sync Settings
2. Click **"Delete Data"** button
3. Confirm deletion
- Deletes data from server
- Clears local configuration
- Sync disabled

---

## 📝 Quick Reference

### Essential Information to Remember:
- ✅ Server URL
- ✅ User ID
- ✅ API Key
- ✅ **Encryption Passphrase** (most important!)

### Quick Actions:
- **Open sync settings:** Click "⚙️ Sync" button in modal header
- **Manual sync:** Sync Settings → "Manual Sync" button
- **Check status:** Look at status indicator in modal header (center)
- **Resolve conflict:** Click status indicator when it shows ⚠️

---

## 🎓 Best Practices

1. **Setup:**
   - Choose a strong, memorable passphrase
   - Store passphrase in password manager
   - Test sync on second device before relying on it

2. **Daily Use:**
   - Enable auto-sync for convenience
   - Check status indicator occasionally
   - Resolve conflicts promptly

3. **Security:**
   - Never share passphrase or API key
   - Use HTTPS server only
   - Self-host backend if possible for maximum privacy

4. **Troubleshooting:**
   - Always check browser console for errors
   - Keep userscript updated to latest version
   - Test backend health endpoint regularly

---

## 📞 Getting Help

### Debug Mode:
All sync operations log to browser console. To view:
1. Press F12 to open Developer Tools
2. Go to Console tab
3. Click sync button or perform sync operation
4. Look for messages starting with `[Goal Portfolio Viewer]`

### Common Log Messages:
```
[Goal Portfolio Viewer] Sync button clicked
[Goal Portfolio Viewer] showSyncSettings called
[Goal Portfolio Viewer] Creating sync settings HTML...
[Goal Portfolio Viewer] Settings HTML created successfully
[Goal Portfolio Viewer] Sync settings modal shown successfully
```

### Reporting Issues:
When reporting issues, include:
1. Browser and version
2. Userscript version
3. Console error messages
4. Steps to reproduce
5. Expected vs actual behavior

---

## 🎉 Summary

The sync feature provides a seamless way to keep your portfolio configuration synchronized across all your devices with military-grade encryption. The user interface makes it easy to configure, monitor, and troubleshoot sync operations without needing any technical knowledge or console commands.

**Key Takeaway:** Click "⚙️ Sync" button → Configure once → Enjoy automatic syncing across all devices! 🚀
