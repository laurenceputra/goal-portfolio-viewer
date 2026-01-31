# Deployment and Testing Guide: Sync Backend

This guide covers Tasks 7 & 8: deploying the Cloudflare Workers sync backend and testing with a real backend.

## Task 7: Deploy Backend to Cloudflare Workers

### Quick Start (5 minutes)

```bash
# 1. Install dependencies
cd workers
npm install

# 2. Login to Cloudflare
npx wrangler login

# 3. Create KV namespace
npx wrangler kv:namespace create "SYNC_KV"
# Copy the ID and update wrangler.toml

# 4. Deploy
npx wrangler deploy

# 5. Test
curl https://your-worker.workers.dev/health
```

For detailed deployment instructions, see `/workers/README.md`.

## Task 8: Testing with Real Backend

### Prerequisites

- Backend deployed to Cloudflare Workers
- UserScript installed in browser with Tampermonkey
- Browser developer console open (F12)

### Test Scenario 1: Basic Sync

**Goal**: Upload and download configuration

```javascript
// 1. Enable sync
SyncManager.enable({
    serverUrl: 'https://your-worker.workers.dev',
    passphrase: 'my-secure-passphrase-123',
    userId: 'user-' + Date.now(),
    autoSync: false
});

// 2. Verify enabled
console.log('Enabled:', SyncManager.isEnabled());
console.log('Configured:', SyncManager.isConfigured());
console.log('Status:', SyncManager.getStatus());

// 3. Upload current config
await SyncManager.performSync({ direction: 'upload' });
console.log('✅ Uploaded');

// 4. Download config
await SyncManager.performSync({ direction: 'download' });
console.log('✅ Downloaded');
```

**Expected Results**:
- No errors in console
- Sync status shows "success"
- Config data matches between upload and download

### Test Scenario 2: Cross-Device Sync

**Goal**: Verify sync works across two devices/browsers

**Device 1**:
```javascript
// Make some changes to goals
// Then upload
const userId = 'shared-user-' + Date.now();
SyncManager.enable({
    serverUrl: 'https://your-worker.workers.dev',
    passphrase: 'shared-passphrase',
    userId: userId,
    autoSync: false
});

console.log('User ID:', userId);  // Note this for Device 2
await SyncManager.performSync({ direction: 'upload' });
```

**Device 2** (use same userId and passphrase):
```javascript
SyncManager.enable({
    serverUrl: 'https://your-worker.workers.dev',
    passphrase: 'shared-passphrase',
    userId: 'shared-user-1234567890',  // Use ID from Device 1
    autoSync: false
});

await SyncManager.performSync({ direction: 'download' });
// Config should now match Device 1
```

**Expected Results**:
- Device 2 receives the same config as Device 1
- Goal targets and fixed states match

### Test Scenario 3: Conflict Detection

**Goal**: Verify conflict resolution works

1. **Device 1**: Make changes, stay online, upload
2. **Device 2**: Make DIFFERENT changes, stay online, upload
3. **Device 1**: Try to sync
4. **Expected**: Conflict dialog appears with options

Test each resolution:
- "Keep Local" - keeps Device 1's changes
- "Use Remote" - adopts Device 2's changes

### Test Scenario 4: Auto-Sync

**Goal**: Verify automatic syncing works

```javascript
SyncManager.enable({
    serverUrl: 'https://your-worker.workers.dev',
    passphrase: 'test-pass',
    userId: 'user-123',
    autoSync: true,
    syncInterval: 1  // 1 minute for testing
});

// Watch console - should see sync activity every minute
// Make a change on another device and wait for auto-sync
```

**Expected Results**:
- Sync happens automatically every 1 minute
- Console shows sync activity
- Changes from other devices are pulled automatically

### Test Scenario 5: Error Handling

**Goal**: Verify graceful error handling

**Wrong Passphrase**:
```javascript
// Upload with one passphrase
SyncManager.enable({
    serverUrl: 'https://your-worker.workers.dev',
    passphrase: 'correct-pass',
    userId: 'user-123'
});
await SyncManager.performSync({ direction: 'upload' });

// Try to download with different passphrase
SyncManager.enable({
    serverUrl: 'https://your-worker.workers.dev',
    passphrase: 'wrong-pass',
    userId: 'user-123'
});
await SyncManager.performSync({ direction: 'download' });
```

**Expected**: Decryption error, friendly error message

**Offline Test**:
```javascript
// Disconnect network, then try to sync
await SyncManager.performSync({ direction: 'upload' });
```

**Expected**: Network error, retry suggested

**Invalid Server**:
```javascript
SyncManager.enable({
    serverUrl: 'https://invalid-server-that-does-not-exist.com',
    passphrase: 'test',
    userId: 'user-123'
});
await SyncManager.performSync({ direction: 'upload' });
```

**Expected**: Connection error

### Monitoring and Debugging

**View Current Config**:
```javascript
const config = SyncManager.collectConfigData();
console.log('Current config:', config);
console.log('Goal targets:', Object.keys(config.goalTargets).length);
console.log('Fixed states:', Object.keys(config.goalFixed).length);
```

**Check Sync Status**:
```javascript
const status = SyncManager.getStatus();
console.log('Status:', status);
// Shows: status, lastError, lastSync, isEnabled, isConfigured, cryptoSupported
```

**Clear Configuration**:
```javascript
SyncManager.clearConfig();
console.log('Config cleared');
```

**Disable Sync**:
```javascript
SyncManager.disable();
console.log('Sync disabled');
```

### Server-Side Verification

**Check KV Storage**:
```bash
# List all configs
npx wrangler kv:key list --namespace-id=YOUR_KV_ID

# Get a specific config (encrypted)
npx wrangler kv:key get "sync_user:user-123" --namespace-id=YOUR_KV_ID

# Delete a config
npx wrangler kv:key delete "sync_user:user-123" --namespace-id=YOUR_KV_ID
```

**View Logs**:
```bash
# Real-time logs
npx wrangler tail

# Filter for errors
npx wrangler tail | grep ERROR
```

### Test Checklist

#### Functional Tests
- [ ] Enable/disable sync works
- [ ] Upload config succeeds
- [ ] Download config succeeds  
- [ ] Cross-device sync works
- [ ] Auto-sync triggers correctly
- [ ] Manual sync works
- [ ] Config data is encrypted on server
- [ ] Decryption works with correct passphrase
- [ ] Decryption fails with wrong passphrase

#### Conflict Resolution
- [ ] Conflict detected when timestamps differ
- [ ] Conflict dialog appears
- [ ] "Keep Local" option works
- [ ] "Use Remote" option works
- [ ] Conflict resolution updates UI

#### Error Handling
- [ ] Wrong passphrase shows error
- [ ] Offline mode shows error
- [ ] Invalid server URL shows error
- [ ] Network errors are caught
- [ ] Errors don't break the app

#### Performance
- [ ] Sync completes in < 1 second
- [ ] Encryption/decryption is fast (< 100ms)
- [ ] No memory leaks
- [ ] Multiple syncs don't slow down

#### Security
- [ ] Data encrypted before transmission
- [ ] Passphrase never transmitted
- [ ] Server cannot decrypt data
- [ ] HTTPS enforced
- [ ] No sensitive data in console logs

### Performance Testing

**Measure Sync Speed**:
```javascript
console.time('sync');
await SyncManager.performSync({ direction: 'both' });
console.timeEnd('sync');
// Should be < 1000ms
```

**Measure Encryption**:
```javascript
const config = SyncManager.collectConfigData();
const plaintext = JSON.stringify(config);

console.time('encrypt');
const encrypted = await SyncEncryption.encrypt(plaintext, 'test-pass');
console.timeEnd('encrypt');
// Should be < 50ms

console.time('decrypt');
const decrypted = await SyncEncryption.decrypt(encrypted, 'test-pass');
console.timeEnd('decrypt');
// Should be < 50ms
```

### Load Testing

**Simulate Multiple Devices**:
```javascript
// Upload from multiple "devices" rapidly
for (let i = 0; i < 10; i++) {
    const config = SyncManager.collectConfigData();
    await SyncManager.performSync({ direction: 'upload' });
    console.log(`Device ${i} synced`);
    await new Promise(r => setTimeout(r, 100));  // Wait 100ms between syncs
}
```

**Test Rate Limiting**:
```javascript
// Make many requests rapidly
const promises = [];
for (let i = 0; i < 20; i++) {
    promises.push(
        SyncManager.performSync({ direction: 'upload' })
            .catch(err => console.log(`Request ${i} failed:`, err.message))
    );
}
await Promise.all(promises);
// Some requests should fail with "rate limit exceeded"
```

## Troubleshooting Common Issues

### Issue: Sync not working

**Check**:
1. Is sync enabled? `SyncManager.isEnabled()`
2. Is it configured? `SyncManager.isConfigured()`
3. Is Web Crypto supported? `SyncEncryption.isSupported()`
4. Any errors? `SyncManager.getStatus().lastError`

### Issue: Decryption fails

**Causes**:
- Different passphrase on different devices
- Corrupted data during transmission
- Wrong user ID

**Solution**: Verify passphrase and userId match exactly

### Issue: High latency

**Causes**:
- Network slow
- Server overloaded
- Large config data

**Solution**: 
- Check network connection
- Verify server health: `curl https://your-worker.workers.dev/health`
- Consider increasing sync interval

### Issue: Conflicts happening frequently

**Causes**:
- Multiple devices editing simultaneously
- Auto-sync interval too long

**Solution**:
- Decrease sync interval (e.g., 5 minutes instead of 30)
- Manually sync before making changes
- Use consistent workflow (sync before editing)

## Next Steps

After successful testing:

1. **Update Documentation**: Add sync instructions to user guide
2. **Announce Feature**: Update README with sync capability
3. **Monitor Usage**: Watch Cloudflare metrics
4. **Gather Feedback**: Create GitHub issue for user feedback
5. **Iterate**: Improve based on real usage patterns

## References

- **Architecture**: `/SYNC_ARCHITECTURE.md`
- **User Guide**: `/docs/sync-setup.md`
- **Backend README**: `/workers/README.md`
- **Integration Guide**: `/tampermonkey/QUICK_START.md`
