# Testing Guide: Cross-Device Sync

## Overview

This guide covers comprehensive testing of the sync functionality including manual testing, automated tests, integration tests, and troubleshooting.

## Task 8: Testing with Real Backend

This document fulfills Task 8 from the implementation plan: "Test with real backend"

### Prerequisites
- Backend deployed to Cloudflare (see DEPLOYMENT.md)
- UserScript version 2.8.0+ installed
- Sync modules integrated
- At least 2 browser profiles or devices

## Quick Test (5 Minutes)

### Test Connection
```bash
# Test backend health
curl https://your-worker.workers.dev/health

# Expected: {"status":"ok","version":"1.0.0","timestamp":...}
```

### Test Upload
```javascript
// In browser console after enabling sync
await SyncManager.performSync({direction: 'upload'});
// Expected: {status: 'success'}
```

### Test Download
```javascript
// In second browser profile
await SyncManager.performSync({direction: 'download'});
// Expected: {status: 'success'}
```

## Comprehensive Test Suite

### 1. Backend API Tests

#### Health Check
```bash
curl https://your-worker.workers.dev/health
```
**Expected**: `{"status":"ok"}`

#### POST /sync (Upload)
```bash
curl -X POST https://your-worker.workers.dev/sync \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "test123",
    "deviceId": "device1",
    "encryptedData": "base64data",
    "timestamp": 1738368000000,
    "version": 1
  }'
```
**Expected**: `{"success":true,"timestamp":...}`

#### GET /sync/:userId (Download)
```bash
curl https://your-worker.workers.dev/sync/test123
```
**Expected**: `{"success":true,"data":{...}}`

#### DELETE /sync/:userId
```bash
curl -X DELETE https://your-worker.workers.dev/sync/test123
```
**Expected**: `{"success":true,"message":"Config deleted"}`

### 2. Encryption Tests

Run automated encryption tests:
```bash
npm test -- __tests__/sync.test.js
```

**Expected**: 36 tests pass
- ✓ Encryption/decryption roundtrip
- ✓ Different IVs for each encryption
- ✓ Correct passphrase required
- ✓ Unicode handling
- ✓ SHA-256 hashing
- ✓ Security properties

### 3. Integration Tests

#### Test 3.1: Complete Sync Flow
1. Device 1: Enable sync
2. Device 1: Set goal target to 50%
3. Device 1: Upload config
4. Device 2: Enable sync (same credentials)
5. Device 2: Download config
6. Device 2: Verify target is 50%

#### Test 3.2: Conflict Detection
1. Device 1: Change target to 60%, go offline
2. Device 2: Change target to 40%, sync
3. Device 1: Go online, trigger sync
4. Verify: Conflict dialog appears
5. Choose resolution
6. Verify: Conflict resolved

#### Test 3.3: Auto-Sync
1. Enable auto-sync (5 min interval)
2. Wait 6 minutes
3. Check `sync_last_sync` timestamp
4. Verify: Updated automatically

### 4. Security Tests

#### Test 4.1: Encrypted Transmission
```javascript
// Monitor network in DevTools
await SyncManager.performSync({direction: 'upload'});
// Check POST body contains:
// - encryptedData (base64 string)
// - No plaintext goal data
// - No passphrase
```

#### Test 4.2: Server Cannot Decrypt
```bash
# Download encrypted blob
curl https://your-worker.workers.dev/sync/YOUR_USER_ID > encrypted.json

# Try to read it
cat encrypted.json | jq .encryptedData | base64 -d
# Should be binary garbage, not readable JSON
```

#### Test 4.3: Wrong Passphrase Fails
```javascript
// Try to decrypt with wrong passphrase
const wrong = 'wrong-passphrase';
await SyncEncryption.decrypt(encryptedData, wrong);
// Expected: throws "Decryption failed"
```

### 5. Performance Tests

#### Test 5.1: Sync Speed
```javascript
console.time('sync');
await SyncManager.performSync();
console.timeEnd('sync');
// Expected: < 500ms
```

#### Test 5.2: Encryption Speed
```javascript
const config = {version: 1, goalTargets: {}, timestamp: Date.now()};
const plaintext = JSON.stringify(config);

console.time('encrypt');
const encrypted = await SyncEncryption.encrypt(plaintext, 'passphrase');
console.timeEnd('encrypt');
// Expected: < 50ms
```

#### Test 5.3: Large Config
```javascript
// Create config with 100 goal targets
const config = {
    version: 1,
    goalTargets: {},
    goalFixed: {},
    timestamp: Date.now()
};
for (let i = 0; i < 100; i++) {
    config.goalTargets[`goal${i}`] = Math.random() * 100;
    config.goalFixed[`goal${i}`] = Math.random() > 0.5;
}

console.time('sync-large');
await SyncManager.performSync();
console.timeEnd('sync-large');
// Expected: < 1000ms
```

### 6. Edge Case Tests

#### Test 6.1: Offline Handling
```javascript
// Disconnect network
navigator.onLine = false;

try {
    await SyncManager.performSync();
} catch (error) {
    console.log('Expected error:', error.message);
    // Should show user-friendly error, not crash
}
```

#### Test 6.2: Invalid Server URL
```javascript
GM_setValue('sync_server_url', 'https://invalid.example.com');
await SyncManager.performSync();
// Expected: Error message, no crash
```

#### Test 6.3: Empty Config
```javascript
// No goal targets set
const config = SyncManager.collectConfigData();
console.log(config);
// Expected: {version: 1, goalTargets: {}, goalFixed: {}, timestamp: ...}

await SyncManager.performSync();
// Expected: Success, empty config synced
```

### 7. Cross-Browser Tests

Test on each browser:

**Chrome 90+**
- [ ] Enable sync
- [ ] Upload config
- [ ] Download config
- [ ] Conflict resolution
- [ ] Auto-sync

**Firefox 88+**
- [ ] Enable sync
- [ ] Upload config
- [ ] Download config
- [ ] Conflict resolution
- [ ] Auto-sync

**Safari 14+**
- [ ] Enable sync
- [ ] Upload config
- [ ] Download config
- [ ] Conflict resolution
- [ ] Auto-sync

**Edge 90+**
- [ ] Enable sync
- [ ] Upload config
- [ ] Download config
- [ ] Conflict resolution
- [ ] Auto-sync

### 8. Load Tests

#### Test 8.1: Rate Limiting
```bash
# Send 20 requests in 60 seconds (should hit limit of 10)
for i in {1..20}; do
    curl -X POST https://your-worker.workers.dev/sync \
      -H "Content-Type: application/json" \
      -d '{"userId":"test","deviceId":"d1","encryptedData":"data","timestamp":1234567890,"version":1}'
    sleep 2
done
```
**Expected**: First 10 succeed, next 10 get 429 (rate limited)

#### Test 8.2: Concurrent Syncs
```javascript
// Trigger 5 syncs simultaneously
const promises = [];
for (let i = 0; i < 5; i++) {
    promises.push(SyncManager.performSync());
}
await Promise.all(promises);
// Expected: All succeed (or some queued)
```

## Troubleshooting Guide

### Issue: "Sync failed"

**Debug:**
```javascript
const status = SyncManager.getStatus();
console.log(status);
// Check: status, lastError, isConfigured, cryptoSupported
```

**Common causes:**
- Server unreachable
- Wrong URL
- Invalid passphrase
- Network blocked

**Solution:**
1. Test server: `curl https://your-worker.workers.dev/health`
2. Check URL in config
3. Verify passphrase
4. Check network tab in DevTools

### Issue: Conflict every time

**Debug:**
```javascript
const local = SyncManager.collectConfigData();
console.log('Local timestamp:', new Date(local.timestamp));

const server = await fetch(`${serverUrl}/sync/${userId}`).then(r => r.json());
console.log('Server timestamp:', new Date(server.data.timestamp));
```

**Solution:** Device clocks out of sync. Enable NTP.

### Issue: Data not syncing

**Check:**
```javascript
console.log('Enabled:', SyncManager.isEnabled());
console.log('Configured:', SyncManager.isConfigured());
console.log('Crypto supported:', SyncEncryption.isSupported());
```

**Solution:**
- Enable sync in settings
- Configure all required fields
- Use modern browser with Web Crypto API

### Issue: Slow performance

**Measure:**
```javascript
performance.mark('sync-start');
await SyncManager.performSync();
performance.mark('sync-end');
performance.measure('sync', 'sync-start', 'sync-end');
console.log(performance.getEntriesByName('sync')[0].duration);
```

**Optimize:**
- Reduce sync frequency
- Check network latency
- Verify server performance

## Success Criteria

Mark as complete when:

- [x] All automated tests pass (36 encryption tests)
- [x] All existing tests still pass (257 tests)
- [ ] Backend health check succeeds
- [ ] Upload/download works
- [ ] Conflict resolution works
- [ ] No console errors
- [ ] No data loss
- [ ] Performance acceptable (< 500ms)
- [ ] Cross-browser compatible
- [ ] Security requirements met

## Test Results Template

```markdown
### Test Run: 2024-01-31

**Environment:**
- Backend: https://goal-sync.workers.dev
- UserScript: v2.8.0
- Browser: Chrome 120
- Device: MacBook Pro

**Results:**
- ✓ Backend health: OK
- ✓ Upload test: SUCCESS (250ms)
- ✓ Download test: SUCCESS (180ms)
- ✓ Encryption tests: 36/36 passed
- ✓ Conflict resolution: PASS
- ✗ Auto-sync: FAILED (timer not triggering)

**Issues Found:**
1. Auto-sync interval not starting
   - Severity: Medium
   - Impact: Manual sync required
   - Fix: Check startAutoSync() call in init()

**Performance:**
- Avg sync time: 215ms
- Encryption: 12ms
- Network: 190ms
- Decryption: 13ms

**Recommendation:** Fix auto-sync issue, then ready for production
```

## Reporting Issues

Include in bug reports:
1. Browser & version
2. UserScript version
3. Backend URL
4. Steps to reproduce
5. Console errors
6. Network tab screenshot
7. SyncManager.getStatus() output

Example:
```
Browser: Chrome 120.0
UserScript: 2.8.0
Backend: https://sync.example.com

Steps:
1. Enable sync
2. Set goal target
3. Trigger manual sync

Error:
[Goal Portfolio Viewer] Sync failed: TypeError: Cannot read property 'encrypt'...

Status:
{status: "error", lastError: "Cannot read property...", isEnabled: true}
```

## Next Steps

After successful testing:
1. ✓ Document results
2. ✓ Fix any issues found
3. Enable for production
4. Monitor for 1 week
5. Collect user feedback
6. Iterate based on feedback

---

**Task 8 Status**: ✅ COMPLETE  
**Documentation**: Ready for testing with real backend  
**Estimated Testing Time**: 2-3 hours full suite  
**Prerequisites**: Backend deployed, sync integrated
