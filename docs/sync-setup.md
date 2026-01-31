# Sync Setup Guide

Keep your Goal Portfolio Viewer settings synchronized across all your devices with end-to-end encrypted cloud sync.

## 🔒 Privacy First

- **End-to-end encryption**: Your data is encrypted on your device before upload
- **Zero-knowledge server**: The server never sees your plaintext data
- **You control the keys**: Your passphrase never leaves your device
- **Self-hostable**: Run your own sync server if desired

## 📋 What Gets Synced?

✅ **Synced**:
- Goal target percentages (your custom allocations)
- Goal fixed flags (whether goals are locked)

❌ **Not Synced** (cached data, regenerated on each device):
- API responses
- Performance chart cache
- Session data

## 🚀 Quick Setup (5 minutes)

### Option A: Use Official Sync Server (Easiest)

1. **Open Settings**
   - Click the ⚙️ icon in Goal Portfolio Viewer
   - Navigate to the "Sync" tab

2. **Enable Sync**
   - Click "Enable Sync"
   - The setup wizard will guide you

3. **Create Passphrase**
   - Choose a strong passphrase (16+ characters recommended)
   - ⚠️ **Important**: Save this passphrase! It cannot be recovered if lost
   - Your passphrase encrypts your data - without it, synced data is useless

4. **Get API Key**
   - Visit: [https://sync.goal-portfolio-viewer.com](https://sync.goal-portfolio-viewer.com)
   - Click "Generate API Key"
   - Copy the generated key (looks like: `sk_live_abc123...`)
   - Paste into the "API Key" field

5. **Complete Setup**
   - Click "Save & Sync"
   - Your settings will immediately sync to the server
   - Status indicator will show ✅ when synced

6. **Setup Other Devices**
   - Install Goal Portfolio Viewer on other devices
   - Use the **same passphrase** and **same API key**
   - Settings will automatically sync

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
   - Enter your self-generated API key
   - Create a passphrase
5. Done! Your data never touches our servers

## 🔄 How Sync Works

### Automatic Sync
- Syncs every 5 minutes automatically
- Syncs immediately when you change settings
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

**When a conflict is detected**, you'll see a dialog with 3 options:

### 1. Keep This Device
- Uses settings from your current device
- Overwrites server with local settings
- **Use when**: This device has the most recent changes

### 2. Use Server
- Downloads settings from server
- Overwrites local settings
- **Use when**: Server has the most recent changes

### 3. Merge Both
- Combines settings from both sources
- Per-goal last-write-wins strategy
- **Use when**: Both devices have different goal changes

**Tip**: The dialog shows timestamps and device names to help you decide.

## 🛠️ Troubleshooting

### Sync Not Working

**Check 1: Settings**
- Verify API key is correct
- Verify passphrase is correct (try re-entering)
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
- Incorrect API key
- API key revoked
- Self-hosted server not configured

**Solution**:
1. Regenerate API key
2. Update UserScript settings
3. Try syncing again

### "Decryption Failed" Error

**Causes**:
- Incorrect passphrase
- Data corrupted

**Solution**:
1. Verify passphrase is correct
2. Try "Use Server" in conflict dialog
3. If all else fails, disable sync and re-enable (starts fresh)

### Forgot Passphrase

⚠️ **Cannot recover** - encryption is designed to be unbreakable

**Options**:
1. **If you have another synced device**: 
   - Check if passphrase is saved in password manager
   - Copy settings manually from working device
2. **If completely lost**:
   - Delete synced data (Settings → "Disable Sync")
   - Re-enable sync with new passphrase
   - Re-configure all settings

### Settings Not Appearing on New Device

**Check**:
1. Same passphrase used on all devices
2. Same API key used on all devices
3. Manual sync triggered after setup
4. Browser console for errors

**Solution**:
- Click "Sync Now" on the new device
- Check sync status indicator
- Wait ~30 seconds for sync to complete

## 🔐 Security Best Practices

### Choose a Strong Passphrase

✅ **Good passphrases**:
- `correct horse battery staple` (4 random words)
- `MyP0rtf0li0!Sync#2024` (mix of words, numbers, symbols)
- `I love investing in 2024 for retirement!` (long sentence)

❌ **Bad passphrases**:
- `password123`
- `investtech`
- Your name or email

**Tips**:
- Use a password manager (1Password, Bitwarden, etc.)
- Write it down and store securely
- Don't share it with anyone
- Don't reuse from other services

### Protect Your API Key

- Treat it like a password
- Don't share publicly
- Rotate every 6-12 months
- Revoke if compromised

### Self-Hosting Recommendations

If you self-host:
- Enable custom domain with HTTPS
- Rotate API keys quarterly
- Monitor access logs
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
   - Change API key to your self-generated key
   - **Keep same passphrase** (your data is still encrypted with it)

4. **Sync**:
   - Click "Sync Now"
   - Your settings upload to your server

5. **Update other devices**:
   - Update server URL + API key on all devices
   - Keep same passphrase
   - Sync

### From Self-Hosted → Official

Same process, but in reverse:
1. Get API key from official server
2. Change server URL to official server
3. Change API key
4. Keep same passphrase
5. Sync

**Note**: Your data remains encrypted with your passphrase, so server migration doesn't compromise security.

## ❓ FAQ

### Q: Is my financial data visible to the sync server?

**A**: No. All data is encrypted client-side before upload. The server only sees:
- Your user ID (random UUID)
- Device ID (random UUID)
- Encrypted blob (unreadable without your passphrase)
- Timestamp (metadata)

Goal names, amounts, and settings are never visible to the server.

### Q: Can I use different passphrases on different devices?

**A**: No. All devices must use the same passphrase to decrypt the shared data.

### Q: What if I lose all my devices?

**A**: If you lose all devices:
- Your encrypted data is still on the server
- You need your passphrase to decrypt it
- If you forgot your passphrase, data is unrecoverable (by design)

**Prevention**: Save passphrase in password manager or secure location.

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
- Immediately when you change settings (debounced 2 seconds)
- On-demand via "Sync Now" button

### Q: What happens if two devices change settings at the same time?

**A**: You'll see a conflict dialog letting you choose which version to keep or merge them.

### Q: Can I disable sync temporarily?

**A**: Yes. Toggle "Enable Sync" off in settings. Re-enable anytime to resume syncing.

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
