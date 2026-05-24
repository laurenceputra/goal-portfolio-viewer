# Sync Setup Guide

Keep your Goal Portfolio Viewer settings synchronized across all your devices with end-to-end encrypted cloud sync.

## 🔒 Privacy First

- **End-to-end encryption**: Your data is encrypted on your device before upload
- **Zero-knowledge server**: The server never sees your plaintext data
- **You control the keys**: Your password is used for encryption and is never stored locally
- **Self-hostable**: Run your own sync server if desired

## 📋 What Gets Synced?

✅ **Synced**:
- Goal target percentages (your custom allocations)
- Goal fixed flags (whether goals are locked)
- OCBC allocation configuration (allocation buckets, sub-portfolios, assignments/order, scope targets, and `fixedByScope` keep-current-allocation state)

❌ **Not Synced** (cached data, regenerated on each device):
- API responses (including OCBC holdings payloads)
- Performance chart cache
- Session data

## 🚀 Quick Setup (5 minutes)

### Option A: Use Official Sync Server (Easiest)

Default server URL: `https://goal-portfolio-sync.laurenceputra.workers.dev`

1. **Open Settings**
   - Click the ⚙️ icon in Goal Portfolio Viewer
   - Navigate to the "Sync" tab

2. **Activate Sync**
   - Click "Activate Sync"
   - The setup wizard will guide you

3. **Create Password**
   - Choose a strong password (12+ characters recommended)
   - ⚠️ **Important**: Save this password! It cannot be recovered if lost
   - Your password encrypts your data - without it, synced data is useless
   - Optional: Enable **"Remember encryption key on this device"** to keep sync unlocked across browser sessions (trusted devices only)
   - Encrypted sync covers configuration (goal targets/fixed flags and OCBC allocation setup); holdings, balances, raw API responses, and transactions never leave your browser

4. **Create Account**
   - Click "Sign Up" to register
   - Click "Login" to obtain session tokens

5. **Complete Setup**
   - Click "Save Settings"
   - Auto-sync runs in the background (default); use "Sync Now" for an immediate sync
   - Status indicator will show ✅ when synced

6. **Setup Other Devices**
   - Install Goal Portfolio Viewer on other devices
   - Use the **same password** and **same user ID**
   - Login and sync

### Option B: Self-Host Your Sync Server (Advanced)

For complete control over your data, you can run your own sync server.

**Prerequisites**:
- Cloudflare account (free tier works)
- Basic command-line knowledge
- ~15 minutes

**Steps**:
1. Follow the [Self-Hosting Guide](../workers/README.md)
2. Deploy your Workers instance
3. Get your custom server URL (e.g., `https://sync.yourdomain.com`)
4. In UserScript settings:
   - Enter your custom server URL
   - Enter your user ID
   - Create a password
   - Click "Login" to obtain session tokens
5. Done! Your data never touches our servers

## 🔄 How Sync Works

### Automatic Sync
- Disabled by default; enable in Sync Settings
- Runs on the configured interval (default: 30 minutes, min: 5)
- Only syncs when online (gracefully handles offline mode)

### Manual Sync
- Click the 🔄 icon in the header anytime
- Or use "Sync Now" button in settings
- Useful to force an immediate sync

### Sync Indicator

| Icon | Meaning |
|------|---------|
| ✅ | Synced successfully |
| 🔄 | Syncing in progress... |
| ⚠️ | Sync error (check console) |
| 🔒 | Sync disabled |

## ⚠️ Handling Conflicts

Conflicts occur when settings differ between devices. This happens when:
- You change settings offline on multiple devices
- Sync fails temporarily and changes diverge

**When a conflict is detected**, you'll see a dialog with 2 options and a goal-level diff preview:

### 1. Keep This Device
- Uses settings from your current device
- Overwrites server with local settings
- **Use when**: This device has the most recent changes

### 2. Use Server
- Downloads settings from server
- Overwrites local settings
- **Use when**: Server has the most recent changes

**Tip**: The dialog shows timestamps and device names to help you decide.

## 🛠️ Troubleshooting

### Sync Not Working

**Check 1: Settings**
- Verify user ID is correct
- Verify password is correct (try re-entering)
- Check server URL (if self-hosting)

**Check 2: Network**
- Ensure you're online
- Check browser console for errors (F12 → Console)
- Try manual sync

**Check 3: Rate Limits**
- Wait 60 seconds and try again
- Official server limits: 10 uploads/minute, 60 downloads/minute

### "Unauthorized" Error

**Causes**:
- Incorrect login credentials
- Session expired (tokens revoked)
- Self-hosted server not configured

**Solution**:
1. Login again to refresh tokens
2. Verify server URL + user ID
3. Try syncing again

### "Decryption Failed" Error

**Causes**:
- Incorrect password
- Data corrupted

**Solution**:
1. Verify password is correct
2. Try "Use Server" in conflict dialog
3. If all else fails, disable sync and re-enable (starts fresh)

### Forgot Password

⚠️ **Cannot recover** - encryption is designed to be unbreakable

**Options**:
1. **If you have another synced device**: 
   - Check if password is saved in password manager
   - Copy settings manually from working device
2. **If completely lost**:
   - Delete synced data (Settings → "Disable Sync")
   - Re-enable sync with new password
   - Re-configure all settings

### Settings Not Appearing on New Device

**Check**:
1. Same password used on all devices
2. Same user ID used on all devices
3. Manual sync triggered after setup
4. Browser console for errors

**Solution**:
- Click "Sync Now" on the new device
- Check sync status indicator
- Wait ~30 seconds for sync to complete

## 🔐 Security Best Practices

### Choose a Strong Password

✅ **Good passwords**:
- `correct horse battery staple` (4 random words)
- `MyP0rtf0li0!Sync#2024` (mix of words, numbers, symbols)
- `I love investing in 2024 for retirement!` (long sentence)

❌ **Bad passwords**:
- `password123`
- `investtech`
- Your name or email

**Tips**:
- Use a password manager (1Password, Bitwarden, etc.)
- Write it down and store securely
- Don't share it with anyone
- Don't reuse from other services

### Protect Your Account

- Treat your password like any other sensitive credential
- Don't share it publicly
- Use a password manager

### Self-Hosting Recommendations

If you self-host:
- Enable custom domain with HTTPS
- Rotate `JWT_SECRET` quarterly
- Monitor access logs
- Use a unique `JWT_SECRET` per environment
- Keep Wrangler updated
- Set up Cloudflare alerts

## 🔄 Migrating Between Sync Servers

### From Official → Self-Hosted

1. **Export current settings**:
   - No export needed - they're already in UserScript storage

2. **Setup self-hosted server**:
   - Follow self-hosting guide
   - Deploy your Workers instance

3. **Update UserScript**:
   - Change server URL to your server
   - Login with the same user ID + password
   - **Keep the same password** (your data is still encrypted with it)

4. **Sync**:
   - Click "Sync Now"
   - Your settings upload to your server

5. **Update other devices**:
   - Update server URL on all devices
   - Login with the same user ID + password
   - Sync

### From Self-Hosted → Official

Same process, but in reverse:
1. Change server URL to official server
2. Login with the same user ID + password
3. Keep the same password
4. Sync

**Note**: Your data remains encrypted with your password, so server migration doesn't compromise security.

## ❓ FAQ

### Q: Is my financial data visible to the sync server?

**A**: No. All data is encrypted client-side before upload. The server only sees:
- Your user ID (random UUID)
- Device ID (random UUID)
- Encrypted blob (unreadable without your password)
- Timestamp (metadata)

Goal names, amounts, and settings are never visible to the server.

### Q: Can I use different passwords on different devices?

**A**: No. All devices must use the same password to decrypt the shared data.

### Q: What if I lose all my devices?

**A**: If you lose all devices:
- Your encrypted data is still on the server
- You need your password to decrypt it
- If you forgot your password, data is unrecoverable (by design)

**Prevention**: Save password in password manager or secure location.

### Q: How much does sync cost?

**A**: 
- **Official server**: Free (supported by donations)
- **Self-hosted**: ~$0-2/month on Cloudflare (free tier covers most users)

### Q: Can I sync between browsers (Chrome, Firefox, Safari)?

**A**: Yes! Sync works across all browsers with Tampermonkey/Greasemonkey support.

### Q: Can I sync between desktop and mobile?

**A**: Yes, if you use Tampermonkey on mobile browsers (Kiwi Browser on Android, Safari on iOS with Userscripts app).

### Q: How often does it sync?

**A**: 
- Automatically every 5 minutes (configurable)
- Automatically after you change settings (batched within ~15 seconds)
- On-demand via "Sync Now" button

### Q: What happens if two devices change settings at the same time?

**A**: You'll see a conflict dialog letting you choose which version to keep or merge them.

### Q: Can I disable sync temporarily?

**A**: Yes. Toggle "Activate Sync" off in settings. Re-enable anytime to resume syncing.

### Q: Can I delete my synced data?

**A**: Yes. Click "Disable Sync" → "Delete server data". This removes all your data from the sync server.

### Q: Is this GDPR compliant?

**A**: For self-hosting, you control compliance. For official server:
- Data is encrypted (GDPR compliant)
- You can delete data anytime (right to be forgotten)
- No personal data collected (random IDs only)

### Q: Can I export my settings?

**A**: Currently, settings are stored locally in Tampermonkey. Future versions may add export/import.

## 🆘 Support

- **Issues**: [GitHub Issues](https://github.com/laurenceputra/goal-portfolio-viewer/issues)
- **Discussions**: [GitHub Discussions](https://github.com/laurenceputra/goal-portfolio-viewer/discussions)
- **Security**: [security@example.com](mailto:security@example.com)

## 📚 Technical Details

For developers and curious users:

- **Encryption**: AES-GCM 256-bit
- **Key Derivation**: PBKDF2 with 100,000 iterations
- **Protocol**: HTTPS + E2EE
- **Server**: Cloudflare Workers (serverless)
- **Storage**: Cloudflare KV (encrypted at rest)
- **Rate Limits**: 10 uploads/min, 60 downloads/min

See [SYNC_ARCHITECTURE.md](../SYNC_ARCHITECTURE.md) for full technical details.

---

**Last Updated**: December 2024  
**Version**: 1.0
