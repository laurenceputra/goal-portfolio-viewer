# Sync Service Architecture
**Version**: 1.0  
**Status**: Implemented  
**Author**: Staff Engineer  
**Date**: December 2024

---

## Executive Summary

This document provides the complete technical architecture for adding optional, privacy-first cross-device sync to the Goal Portfolio Viewer using Cloudflare Workers with client-side encryption.

### Key Design Principles

1. **Privacy First**: End-to-end AES-GCM 256-bit encryption, server never sees plaintext
2. **Opt-In**: Completely optional feature, existing users unaffected
3. **Graceful Degradation**: Full offline support, sync failures don't break functionality
4. **Self-Hostable**: Open source backend, users can run their own instance
5. **Zero Build**: UserScript remains single-file, vanilla JS
6. **Minimal Footprint**: ~1KB config data, negligible bandwidth/storage

---

## Table of Contents

1. [Technical Architecture](#technical-architecture)
2. [Repository Structure](#repository-structure)
3. [API Design](#api-design)
4. [Encryption Implementation](#encryption-implementation)
5. [UserScript Integration](#userscript-integration)
6. [Migration Strategy](#migration-strategy)
7. [Security Analysis](#security-analysis)
8. [Risks and Tradeoffs](#risks-and-tradeoffs)
9. [Implementation Plan](#implementation-plan)

---

## Technical Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                         Browser                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │         Tampermonkey UserScript                        │ │
│  │                                                         │ │
│  │  ┌──────────────┐      ┌──────────────────────────┐   │ │
│  │  │   Storage    │◄─────│   Sync Manager           │   │ │
│  │  │  (GM_*)      │      │   - Encrypt/Decrypt       │   │ │
│  │  │              │      │   - Upload/Download       │   │ │
│  │  └──────────────┘      │   - Conflict Resolution   │   │ │
│  │         ▲              └────────────┬──────────────┘   │ │
│  │         │                           │                   │ │
│  │         │                           │ HTTPS + E2EE      │ │
│  │         │                           ▼                   │ │
│  │         │              ┌──────────────────────────┐    │ │
│  │         └──────────────│   Web Crypto API          │    │ │
│  │                        │   - AES-GCM 256           │    │ │
│  │                        │   - PBKDF2 Key Derive     │    │ │
│  │                        └──────────────────────────┘    │ │
│  └────────────────────────────────────────────────────────┘ │
└──────────────────────────────┬──────────────────────────────┘
                               │ Encrypted Payload
                               │ + Device ID + Timestamp
                               ▼
                ┌──────────────────────────────────┐
                │   Cloudflare Workers Edge        │
                │                                  │
                │  ┌───────────────────────────┐  │
                │  │   Sync API                │  │
                │  │   - Auth via JWT tokens   │  │
                │  │   - Store encrypted blob  │  │
                │  │   - Return metadata only  │  │
                │  └───────────┬───────────────┘  │
                └──────────────┼───────────────────┘
                               │
                               ▼
                ┌──────────────────────────────────┐
                │   Cloudflare KV Store            │
                │   - Key: userId                  │
                │   - Value: {                     │
                │       encryptedData: "...",      │
                │       deviceId: "...",           │
                │       timestamp: 123456,         │
                │       version: 1                 │
                │     }                            │
                └──────────────────────────────────┘
```

### Component Architecture

#### 1. Sync Manager (UserScript)

**Responsibilities**:
- Encrypt/decrypt config data
- Upload/download from Workers API
- Handle sync conflicts
- Manage sync state

**Size Impact**: ~8KB additional code in UserScript

**Key Features**:
- Automatic background sync (configurable interval)
- Manual sync trigger
- Conflict resolution UI
- Sync status indicator
- Error handling and retry logic

#### 2. Cloudflare Workers API

**Responsibilities**:
- Authenticate requests
- Store/retrieve encrypted blobs
- Return metadata (timestamp, device ID)
- Rate limiting

**Resource Requirements**:
- Workers: Free tier (100k req/day)
- KV: Free tier (100k read/day, 1k write/day, 1GB storage)
- Cost: $0/month for typical usage

#### 3. Web Crypto API (Built-in)

**Responsibilities**:
- AES-GCM encryption/decryption
- PBKDF2 key derivation
- Secure random generation

**Browser Support**: All modern browsers (Chrome 37+, Firefox 34+, Safari 11+)

---

## Repository Structure

### Current Structure
```
goal-portfolio-viewer/
├── .github/
│   ├── agents/
│   └── workflows/
├── tampermonkey/__tests__/
├── demo/
├── docs/
├── tampermonkey/
│   ├── goal_portfolio_viewer.user.js
│   └── README.md
├── package.json
├── README.md
├── TECHNICAL_DESIGN.md
└── TESTING.md
```

### New Structure (Post-Sync)
```
goal-portfolio-viewer/
├── .github/
│   ├── agents/
│   └── workflows/
│       └── deploy-workers.yml          # NEW: Auto-deploy Workers
├── tampermonkey/__tests__/
│   ├── sync.test.js                    # NEW: Sync manager tests
│   └── encryption.test.js              # NEW: Crypto tests
├── demo/
├── docs/
│   └── sync-setup.md                   # NEW: User guide
├── tampermonkey/
│   ├── goal_portfolio_viewer.user.js   # MODIFIED: Add sync
│   └── README.md                        # MODIFIED: Sync docs
├── workers/                             # NEW: Backend code
│   ├── src/
│   │   ├── index.js                    # API routes
│   │   ├── auth.js                     # Password + token auth
│   │   ├── storage.js                  # KV operations
│   │   └── ratelimit.js                # Rate limiting
│   ├── test/
│   │   ├── api.test.js
│   │   └── auth.test.js
│   ├── wrangler.toml                   # Workers config
│   ├── package.json
│   └── README.md                        # Self-hosting guide
├── SYNC_ARCHITECTURE.md                # NEW: This document
├── package.json                         # MODIFIED: Add workers scripts
├── README.md                            # MODIFIED: Mention sync
├── TECHNICAL_DESIGN.md                 # MODIFIED: Sync section
└── TESTING.md                           # MODIFIED: Sync tests
```

### Key New Files

#### `/workers/src/index.js`
Main Workers entry point with API routes

#### `/workers/wrangler.toml`
Workers configuration for deployment

#### `/workers/README.md`
Self-hosting guide for users

#### `/docs/sync-setup.md`
End-user setup instructions

---

## API Design

### Base URL
```
https://sync.your-domain.workers.dev
```

### Authentication
Access tokens are issued via password login. Send `Authorization: Bearer <accessToken>`.

### Endpoints

#### 1. Upload Config
```
POST /sync

Headers:
  Authorization: Bearer <accessToken>
  Content-Type: application/json

Request Body:
{
  "userId": "uuid-v4",
  "deviceId": "uuid-v4",
  "encryptedData": "base64-encoded-encrypted-blob",
  "timestamp": 1234567890000,
  "version": 1,
  "force": false
}

Response (200 OK):
{
  "success": true,
  "timestamp": 1234567890000,
  "conflictDetected": false
}

When `force` is `true`, the server accepts the upload even if the incoming timestamp is older and stores a fresh server timestamp.

Response (409 Conflict):
{
  "success": false,
  "error": "CONFLICT",
  "serverData": {
    "encryptedData": "...",
    "deviceId": "...",
    "timestamp": 1234567891000,
    "version": 1
  }
}

Response (401 Unauthorized):
{
  "success": false,
  "error": "UNAUTHORIZED"
}

Response (429 Too Many Requests):
{
  "success": false,
  "error": "RATE_LIMIT_EXCEEDED",
  "retryAfter": 60
}
```

#### 2. Download Config
```
GET /sync/:userId

Headers:
  Authorization: Bearer <accessToken>

Response (200 OK):
{
  "success": true,
  "data": {
    "encryptedData": "base64-encoded-encrypted-blob",
    "deviceId": "uuid-v4",
    "timestamp": 1234567890000,
    "version": 1
  }
}

Response (404 Not Found):
{
  "success": false,
  "error": "NOT_FOUND"
}

Response (401 Unauthorized):
{
  "success": false,
  "error": "UNAUTHORIZED"
}
```

#### 3. Delete Config
```
DELETE /sync/:userId

Headers:
  Authorization: Bearer <accessToken>

Response (200 OK):
{
  "success": true
}

Response (401 Unauthorized):
{
  "success": false,
  "error": "UNAUTHORIZED"
}
```

#### 4. Health Check
```
GET /health

Response (200 OK):
{
  "status": "ok",
  "version": "1.2.0",
  "timestamp": 1234567890000
}
```

### Rate Limits

- **Upload**: 10 requests per minute per user/IP
- **Download**: 60 requests per minute per user/IP
- **Delete**: 5 requests per minute per user/IP

### Data Size Limits

- **Maximum payload**: 10KB (plenty for ~1KB config)
- **KV value limit**: 25MB (not a concern)

### Error Codes

| Code | Meaning | Action |
|------|---------|--------|
| 400 | Bad Request | Invalid payload format |
| 401 | Unauthorized | Invalid credentials |
| 404 | Not Found | No config stored for user |
| 409 | Conflict | Server has newer data |
| 413 | Payload Too Large | Data exceeds 10KB |
| 429 | Rate Limit | Retry after delay |
| 500 | Internal Error | Retry with backoff |

---

## Encryption Implementation

### Encryption Strategy: AES-GCM with PBKDF2 Key Derivation

**Algorithm**: AES-GCM (Galois/Counter Mode)  
**Key Size**: 256 bits  
**IV Size**: 96 bits (12 bytes) - recommended for GCM  
**Tag Size**: 128 bits (16 bytes) - authentication tag  
**Key Derivation**: PBKDF2 with SHA-256

### Data Flow

```
1. User provides passphrase
   └─► PBKDF2(passphrase + salt, 100k iterations)
       └─► 256-bit encryption key

2. Config data (plaintext JSON)
   └─► JSON.stringify()
       └─► TextEncoder.encode()
           └─► AES-GCM encrypt(key, iv, data)
               └─► Encrypted buffer + auth tag

3. Package for transmission
   └─► {
       encryptedData: base64(iv + ciphertext + tag),
       timestamp: Date.now(),
       deviceId: "uuid",
       version: 1
     }
```

### Security Properties

✅ **Authenticated Encryption**: GCM provides both confidentiality and authenticity  
✅ **Random IV**: New IV for every encryption prevents pattern analysis  
✅ **Key Stretching**: PBKDF2 makes brute-force attacks expensive  
✅ **Salt**: Per-user salt prevents rainbow table attacks  
✅ **No Key Storage**: Key derived on-demand from passphrase  
✅ **Server Blind**: Server never sees plaintext or encryption key

### Implementation (UserScript)

```javascript
// ====================================================================
// ENCRYPTION MODULE
// ====================================================================

const SyncEncryption = (() => {
    const PBKDF2_ITERATIONS = 100000;
    const KEY_LENGTH = 256;
    const IV_LENGTH = 12; // 96 bits for GCM
    const SALT_LENGTH = 16; // 128 bits

    /**
     * Generate a cryptographically secure random buffer
     */
    function generateRandomBuffer(length) {
        return window.crypto.getRandomValues(new Uint8Array(length));
    }

    /**
     * Derive encryption key from passphrase using PBKDF2
     */
    async function deriveKey(passphrase, salt) {
        const encoder = new TextEncoder();
        const passphraseKey = await window.crypto.subtle.importKey(
            'raw',
            encoder.encode(passphrase),
            'PBKDF2',
            false,
            ['deriveBits', 'deriveKey']
        );

        return window.crypto.subtle.deriveKey(
            {
                name: 'PBKDF2',
                salt: salt,
                iterations: PBKDF2_ITERATIONS,
                hash: 'SHA-256'
            },
            passphraseKey,
            { name: 'AES-GCM', length: KEY_LENGTH },
            false,
            ['encrypt', 'decrypt']
        );
    }

    /**
     * Encrypt data with AES-GCM
     * Returns: base64(salt + iv + ciphertext + auth_tag)
     */
    async function encrypt(plaintext, passphrase) {
        try {
            const encoder = new TextEncoder();
            const salt = generateRandomBuffer(SALT_LENGTH);
            const iv = generateRandomBuffer(IV_LENGTH);
            const key = await deriveKey(passphrase, salt);

            const ciphertext = await window.crypto.subtle.encrypt(
                { name: 'AES-GCM', iv: iv },
                key,
                encoder.encode(plaintext)
            );

            // Concatenate: salt + iv + ciphertext (includes auth tag)
            const combined = new Uint8Array(
                salt.length + iv.length + ciphertext.byteLength
            );
            combined.set(salt, 0);
            combined.set(iv, salt.length);
            combined.set(new Uint8Array(ciphertext), salt.length + iv.length);

            // Convert to base64 for transmission
            return btoa(String.fromCharCode(...combined));
        } catch (error) {
            console.error('[Sync] Encryption failed:', error);
            throw new Error('Encryption failed');
        }
    }

    /**
     * Decrypt data encrypted with encrypt()
     */
    async function decrypt(encryptedBase64, passphrase) {
        try {
            // Decode from base64
            const combined = new Uint8Array(
                atob(encryptedBase64).split('').map(c => c.charCodeAt(0))
            );

            // Extract components
            const salt = combined.slice(0, SALT_LENGTH);
            const iv = combined.slice(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
            const ciphertext = combined.slice(SALT_LENGTH + IV_LENGTH);

            const key = await deriveKey(passphrase, salt);

            const plaintext = await window.crypto.subtle.decrypt(
                { name: 'AES-GCM', iv: iv },
                key,
                ciphertext
            );

            const decoder = new TextDecoder();
            return decoder.decode(plaintext);
        } catch (error) {
            console.error('[Sync] Decryption failed:', error);
            throw new Error('Decryption failed - incorrect passphrase?');
        }
    }

    /**
     * Generate a device ID (stored locally)
     */
    function generateDeviceId() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    /**
     * Generate a user ID (stored locally or derived from email hash)
     */
    async function generateUserId(email) {
        if (!email) {
            // Generate random UUID
            return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
                const r = Math.random() * 16 | 0;
                const v = c === 'x' ? r : (r & 0x3 | 0x8);
                return v.toString(16);
            });
        }

        // Hash email for deterministic user ID
        const encoder = new TextEncoder();
        const data = encoder.encode(email.toLowerCase().trim());
        const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }

    return {
        encrypt,
        decrypt,
        generateDeviceId,
        generateUserId
    };
})();
```

### Storage Keys

UserScript will add these new storage keys:

| Key | Purpose | Example |
|-----|---------|---------|
| `sync_enabled` | Whether sync is enabled | `true` / `false` |
| `sync_server_url` | Custom server URL | `https://sync.example.com` |
| `sync_access_token` | JWT access token | `eyJhbGci...` |
| `sync_refresh_token` | JWT refresh token | `eyJhbGci...` |
| `sync_access_token_expiry` | Access token expiry timestamp | `1710000000000` |
| `sync_refresh_token_expiry` | Refresh token expiry timestamp | `1712592000000` |
| `sync_user_id` | User identifier | `uuid-v4` or `sha256(email)` |
| `sync_device_id` | Device identifier | `uuid-v4` |
| `sync_last_sync` | Last sync timestamp | `1234567890000` |
| `sync_master_key` | Remembered master key (encrypted) | `base64(...)` |
| `sync_remember_key` | Remember-key toggle | `true` |

**Note**: The actual encryption passphrase is NEVER stored. Only the derived key may be remembered when explicitly enabled.

### What Gets Synced

**Included** (Critical user settings):
- All `goal_target_pct_*` keys
- All `goal_fixed_*` keys

**Excluded** (Cached data, regenerable):
- `api_performance`
- `api_investible`
- `api_summary`
- `gpv_performance_*`
- Projected investments (session-only)

### Sync Payload Format

```json
{
  "version": 1,
  "goals": {
    "goal-uuid-1": {
      "targetPct": 25.5,
      "fixed": true
    },
    "goal-uuid-2": {
      "targetPct": 15.0,
      "fixed": false
    }
  },
  "metadata": {
    "totalGoals": 2,
    "lastModified": 1234567890000
  }
}
```

After encryption, this becomes:
```
base64(salt(16) + iv(12) + ciphertext + auth_tag(16))
```

**Size Estimate**:
- Plaintext: ~500 bytes (10 goals with settings)
- Encrypted: ~600 bytes (overhead: salt + iv + tag = 44 bytes)
- Base64: ~800 bytes
- **Total payload**: ~1KB

---

## UserScript Integration

### UI Changes

#### 1. Settings Modal

Add new "Sync" tab in settings:

```
┌─────────────────────────────────────────────────┐
│  Settings                                  [X]  │
├─────────────────────────────────────────────────┤
│  [General] [Sync] [About]                       │
├─────────────────────────────────────────────────┤
│                                                  │
│  ⚡ Automatic Sync                               │
│  ┌────────────────────────────────────────┐    │
│  │ Enable automatic sync across devices   │    │
│  └────────────────────────────────────────┘    │
│                                                  │
│  🔑 Sync Passphrase                             │
│  ┌────────────────────────────────────────┐    │
│  │ ●●●●●●●●●●●●                           │    │
│  └────────────────────────────────────────┘    │
│  ⚠️  Keep this safe! Cannot be recovered       │
│                                                  │
│  🌐 Sync Server (Optional)                      │
│  ┌────────────────────────────────────────┐    │
│  │ https://sync.example.com               │    │
│  └────────────────────────────────────────┘    │
│  ℹ️  Leave blank for default server             │
│                                                  │
│  🔐 Password Login                               │
│  ┌────────────────────────────────────────┐    │
│  │ ●●●●●●●●●●●●●●●●●●●●●●●●             │    │
│  └────────────────────────────────────────┘    │
│                                                  │
│  📊 Sync Status                                  │
│  Last sync: 2 minutes ago                       │
│  Device: Chrome on MacOS                        │
│                                                  │
│  [🔄 Sync Now]  [🗑️ Disable Sync]              │
│                                                  │
└─────────────────────────────────────────────────┘
```

#### 2. Sync Status Indicator

Add subtle indicator in main UI:

```
┌─────────────────────────────────────────────────┐
│  Goal Portfolio Viewer         [?] [⚙️]  [🔄] [X] │  
│                                         ↑          │
│                                    Sync indicator │
└─────────────────────────────────────────────────┘

States:
🔄  - Syncing...
✅  - Synced
⚠️  - Sync error
🔒  - Sync disabled
```

#### 3. Conflict Resolution Modal

```
┌─────────────────────────────────────────────────┐
│  Sync Conflict Detected                    [X]  │
├─────────────────────────────────────────────────┤
│                                                  │
│  Your settings differ from the server.          │
│  Which version do you want to keep?             │
│                                                  │
│  ┌────────────────┐  ┌────────────────┐        │
│  │ This Device     │  │ Server          │        │
│  ├────────────────┤  ├────────────────┤        │
│  │ Modified:       │  │ Modified:       │        │
│  │ 2 mins ago      │  │ 5 mins ago      │        │
│  │                 │  │                 │        │
│  │ Goals: 12       │  │ Goals: 11       │        │
│  │ Device: Chrome  │  │ Device: Firefox │        │
│  │                 │  │                 │        │
│  │ [Keep This]     │  │ [Use Server]    │        │
│  └────────────────┘  └────────────────┘        │
│                                                  │
│  Changed goals preview (local vs remote)         │
│                [Cancel]                          │
│                                                  │
└─────────────────────────────────────────────────┘
```

### Code Integration Points

#### 1. Initialize Sync Manager (On Load)

```javascript
// Add to existing initialization code
if (Storage.get('sync_enabled', false)) {
    SyncManager.init({
        serverUrl: Storage.get('sync_server_url', SYNC_DEFAULTS.serverUrl),
        accessToken: Storage.get('sync_access_token'),
        userId: Storage.get('sync_user_id'),
        deviceId: Storage.get('sync_device_id'),
        autoSync: Storage.get('sync_auto_sync', false),
        syncInterval: Storage.get('sync_interval_minutes', 30) * 60 * 1000
    });
}
```

#### 2. Hook into Storage Changes

```javascript
// Wrap existing Storage.set to trigger sync
const originalSet = Storage.set;
Storage.set = function(key, value, context) {
    const result = originalSet.call(this, key, value, context);
    
    // Trigger sync if key is a synced setting
    if (key.startsWith('goal_target_pct_') || key.startsWith('goal_fixed_')) {
        SyncManager.scheduleSyncDebounced(); // Debounced, waits 2s
    }
    
    return result;
};
```

#### 3. Manual Sync Trigger

```javascript
// In settings modal
document.querySelector('#sync-now-btn').addEventListener('click', async () => {
    const btn = event.target;
    btn.disabled = true;
    btn.textContent = '🔄 Syncing...';
    
    try {
        await SyncManager.syncNow();
        btn.textContent = '✅ Synced!';
        setTimeout(() => {
            btn.textContent = '🔄 Sync Now';
            btn.disabled = false;
        }, 2000);
    } catch (error) {
        btn.textContent = '❌ Sync Failed';
        showError('Sync failed: ' + error.message);
        setTimeout(() => {
            btn.textContent = '🔄 Sync Now';
            btn.disabled = false;
        }, 3000);
    }
});
```

### Sync Manager Module

```javascript
// ====================================================================
// SYNC MANAGER
// ====================================================================

const SyncManager = (() => {
    let config = null;
    let syncTimer = null;
    let syncInProgress = false;

    /**
     * Initialize sync manager
     */
    function init(options) {
        config = {
            serverUrl: options.serverUrl,
            accessToken: options.accessToken,
            userId: options.userId,
            deviceId: options.deviceId,
            autoSync: options.autoSync || false,
            syncInterval: options.syncInterval || 30 * 60 * 1000
        };

        // Start auto-sync if enabled
        if (config.autoSync) {
            startAutoSync();
        }

        // Initial sync on load
        syncNow().catch(error => {
            console.warn('[Sync] Initial sync failed:', error);
        });
    }

    /**
     * Start automatic sync timer
     */
    function startAutoSync() {
        if (syncTimer) {
            clearInterval(syncTimer);
        }
        syncTimer = setInterval(() => {
            syncNow().catch(error => {
                console.warn('[Sync] Auto-sync failed:', error);
            });
        }, config.syncInterval);
    }

    /**
     * Stop automatic sync
     */
    function stopAutoSync() {
        if (syncTimer) {
            clearInterval(syncTimer);
            syncTimer = null;
        }
    }

    /**
     * Collect config data to sync
     */
    function collectSyncData() {
        const data = {
            version: 1,
            goals: {},
            metadata: {
                totalGoals: 0,
                lastModified: Date.now()
            }
        };

        // Collect all goal_target_pct_* keys
        const allKeys = GM_listValues();
        allKeys.forEach(key => {
            if (key.startsWith('goal_target_pct_')) {
                const goalId = key.substring('goal_target_pct_'.length);
                if (!data.goals[goalId]) {
                    data.goals[goalId] = {};
                }
                data.goals[goalId].targetPct = Storage.get(key, null);
            } else if (key.startsWith('goal_fixed_')) {
                const goalId = key.substring('goal_fixed_'.length);
                if (!data.goals[goalId]) {
                    data.goals[goalId] = {};
                }
                data.goals[goalId].fixed = Storage.get(key, false);
            }
        });

        data.metadata.totalGoals = Object.keys(data.goals).length;
        return data;
    }

    /**
     * Apply synced data to local storage
     */
    function applySyncData(data) {
        Object.entries(data.goals).forEach(([goalId, settings]) => {
            if (settings.targetPct !== undefined) {
                Storage.set(`goal_target_pct_${goalId}`, settings.targetPct);
            }
            if (settings.fixed !== undefined) {
                Storage.set(`goal_fixed_${goalId}`, settings.fixed);
            }
        });
    }

    /**
     * Perform sync operation
     */
    async function syncNow() {
        if (syncInProgress) {
            console.log('[Sync] Sync already in progress, skipping');
            return;
        }

        if (!config) {
            throw new Error('Sync not initialized');
        }

        syncInProgress = true;
        updateSyncStatus('syncing');

        try {
            // 1. Collect local data
            const localData = collectSyncData();
    const masterKey = getSessionMasterKey();

            // 2. Encrypt local data
    const encrypted = await SyncEncryption.encryptWithMasterKey(
        JSON.stringify(localData),
        masterKey
    );

            // 3. Upload to server
            const response = await fetch(`${config.serverUrl}/sync`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${config.accessToken}`
                },
                body: JSON.stringify({
                    userId: config.userId,
                    deviceId: config.deviceId,
                    encryptedData: encrypted,
                    timestamp: Date.now(),
                    version: 1
                })
            });

            if (!response.ok) {
                if (response.status === 409) {
                    // Conflict detected
                    const conflict = await response.json();
    await handleConflict(localData, conflict.serverData, masterKey);
                    return;
                }
                throw new Error(`Sync failed: ${response.status}`);
            }

            const result = await response.json();
            Storage.set('sync_last_sync', Date.now());
            updateSyncStatus('synced');
            console.log('[Sync] Sync completed successfully');

        } catch (error) {
            console.error('[Sync] Sync failed:', error);
            updateSyncStatus('error');
            throw error;
        } finally {
            syncInProgress = false;
        }
    }

    /**
     * Download and apply remote config
     */
    async function downloadConfig() {
        const response = await fetch(`${config.serverUrl}/sync/${config.userId}`, {
            headers: {
                'Authorization': `Bearer ${config.accessToken}`
            }
        });

        if (!response.ok) {
            if (response.status === 404) {
                // No remote config yet
                return null;
            }
            throw new Error(`Download failed: ${response.status}`);
        }

        const result = await response.json();
    const masterKey = getSessionMasterKey();
    const decrypted = await SyncEncryption.decryptWithMasterKey(
        result.data.encryptedData,
        masterKey
    );
        return JSON.parse(decrypted);
    }

    /**
     * Handle sync conflict
     */
    async function handleConflict(localData, serverEncryptedData, masterKey) {
        // Decrypt server data
        const serverData = JSON.parse(
            await SyncEncryption.decryptWithMasterKey(serverEncryptedData.encryptedData, masterKey)
        );

        // Show conflict resolution UI
        const resolution = await showConflictDialog(localData, serverData);

        if (resolution === 'local') {
            // Force upload local data
            await forceUpload(localData, masterKey);
        } else if (resolution === 'server') {
            // Apply server data locally
            applySyncData(serverData);
        } else if (resolution === 'merge') {
            // Merge both (last-write-wins per goal)
            const merged = mergeConfigs(localData, serverData);
            applySyncData(merged);
            await forceUpload(merged, masterKey);
        }
    }

    /**
     * Merge two configs (last-write-wins)
     */
    function mergeConfigs(local, server) {
        const merged = {
            version: 1,
            goals: {},
            metadata: {
                totalGoals: 0,
                lastModified: Math.max(
                    local.metadata.lastModified,
                    server.metadata.lastModified
                )
            }
        };

        // Merge goals (union of both)
        const allGoalIds = new Set([
            ...Object.keys(local.goals),
            ...Object.keys(server.goals)
        ]);

        allGoalIds.forEach(goalId => {
            merged.goals[goalId] = {
                ...server.goals[goalId],
                ...local.goals[goalId]
            };
        });

        merged.metadata.totalGoals = allGoalIds.size;
        return merged;
    }

    /**
     * Update sync status indicator
     */
    function updateSyncStatus(status) {
        const indicator = document.querySelector('.gpv-sync-indicator');
        if (!indicator) return;

        const icons = {
            syncing: '🔄',
            synced: '✅',
            error: '⚠️',
            disabled: '🔒'
        };

        indicator.textContent = icons[status] || icons.disabled;
        indicator.title = `Sync status: ${status}`;
    }

    // Debounced sync for storage changes
    let debounceTimer = null;
    function scheduleSyncDebounced() {
        if (debounceTimer) {
            clearTimeout(debounceTimer);
        }
        debounceTimer = setTimeout(() => {
            syncNow().catch(error => {
                console.warn('[Sync] Debounced sync failed:', error);
            });
        }, 2000);
    }

    return {
        init,
        syncNow,
        downloadConfig,
        scheduleSyncDebounced,
        startAutoSync,
        stopAutoSync
    };
})();
```

---

## Migration Strategy

### Phase 1: New Users (Opt-In Setup)

**User Flow**:
1. Install UserScript
2. Open settings modal
3. Navigate to "Sync" tab
4. See promotional message: "Activate sync to access your settings on all devices"
5. Click "Activate Sync"
6. Enter passphrase (with strength meter)
7. Optionally enter custom server URL
8. Register/login to obtain access token
9. Auto-sync starts by default after activation

**Required**:
- Sync setup wizard
- Documentation for self-hosting

### Phase 2: Existing Users (Optional Upgrade)

**Communication**:
- Add changelog entry in README
- Show non-intrusive banner on first load after update
- Link to setup guide

**Banner**:
```
┌─────────────────────────────────────────────────┐
│  🎉 New Feature: Cross-Device Sync               │
│  Keep your settings in sync across all devices   │
│  [Learn More]  [Enable Now]  [Dismiss]           │
└─────────────────────────────────────────────────┘
```

**No Breaking Changes**:
- Existing users continue to work offline
- No data loss
- No forced migrations
- Sync is 100% opt-in

### Phase 3: Self-Hosters

**Documentation**:
1. Cloudflare account setup
2. Workers deployment (via Wrangler CLI)
3. KV namespace creation
4. JWT secret management
5. Custom domain setup (optional)

**Tools Provided**:
- Deployment script
- Health check dashboard
- Migration script (import existing keys)

---

## Security Analysis

### Threat Model

#### What We Protect Against

✅ **Server Compromise**: Server cannot read config data (encrypted)  
✅ **Network Eavesdropping**: HTTPS + encrypted payload  
✅ **Malicious Server Operator**: Cannot decrypt data without passphrase  
✅ **Data Breach**: Leaked database contains only encrypted blobs  
✅ **Replay Attacks**: Timestamp + device ID validation  
✅ **MITM Attacks**: HTTPS + authentication  

#### What We Don't Protect Against

❌ **Compromised Client**: If UserScript is modified, all bets are off  
❌ **Weak Passphrase**: Users can choose weak passphrases (we mitigate with strength meter)  
❌ **Passphrase Theft**: If user's passphrase is stolen, data can be decrypted  
❌ **Browser Compromise**: Malicious browser extensions could steal data  
❌ **Quantum Computers**: AES-256 is quantum-resistant, but PBKDF2 is not

### Security Best Practices Implemented

1. **Key Derivation**: PBKDF2 with 100k iterations (industry standard)
2. **Random IV**: New IV for every encryption
3. **Authenticated Encryption**: AES-GCM provides authenticity
4. **Secure Random**: Web Crypto API (not Math.random)
5. **No Key Storage**: Passphrase never stored; derived key only remembered when enabled
6. **Rate Limiting**: Prevents brute force attacks on API
7. **Token Rotation**: Refresh tokens to obtain new access tokens
8. **Minimal Data**: Only sync critical settings, not cached data

### Privacy Analysis

| Data Type | Stored Where | Encrypted | Visible to Server |
|-----------|--------------|-----------|-------------------|
| Goal settings | KV Store | ✅ Yes | ❌ No |
| Device ID | KV Store | ❌ No (metadata) | ✅ Yes |
| User ID | KV Store | ❌ No (key) | ✅ Yes |
| Timestamp | KV Store | ❌ No (metadata) | ✅ Yes |
| Access/Refresh Tokens | UserScript | ❌ No | ✅ Yes (auth) |
| Passphrase | UserScript (memory only) | N/A | ❌ Never transmitted |

**Server Visibility**:
- Cannot see goal names, amounts, or settings
- Can see: user ID, device ID, timestamp, encrypted blob size
- Can infer: number of devices, sync frequency

**Metadata Leakage**:
- Device fingerprinting: Not implemented (user can set custom device name)
- Timing analysis: Possible (server sees sync times)
- Size analysis: Possible (blob size reveals approximate number of goals)

**Mitigation**:
- Use random UUID for user ID (not email-derived) for anonymity
- Pad encrypted data to fixed size (optional, adds overhead)
- Random sync jitter (optional, adds delay)

### Compliance Considerations

**GDPR Compliance** (if hosting for others):
- ✅ User consent required (opt-in)
- ✅ Right to be forgotten (DELETE endpoint)
- ✅ Data minimization (only settings synced)
- ✅ Encryption at rest (KV encrypted by default)
- ✅ Encryption in transit (HTTPS)
- ⚠️ Data processing agreement needed if providing hosted service

**CCPA Compliance**:
- ✅ User can delete data anytime
- ✅ No sale of personal data
- ✅ Transparent about data collection

---

## Risks and Tradeoffs

### Technical Risks

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| UserScript size bloat | High | High | Minify code, lazy load sync module |
| Passphrase forgotten | High | Medium | Cannot recover, document clearly |
| Sync conflicts | Medium | Low | Good conflict resolution UI |
| API rate limits hit | Medium | Low | Smart retry with backoff |
| Cloudflare KV limits | Low | Low | 1GB free, monitor usage |
| Encryption performance | Low | Low | Web Crypto API is fast |

### User Experience Risks

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Confusing setup | High | Medium | Wizard-style onboarding |
| Passphrase complexity | Medium | High | Strength meter + suggestions |
| Sync conflicts scary | Medium | Low | Clear, friendly UI |
| Server downtime | Medium | Low | Graceful degradation, offline mode |
| Perceived insecurity | High | Low | Transparent security docs |

### Maintenance Risks

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Workers API changes | High | Low | Pin to stable API, monitor changelog |
| Web Crypto API deprecation | High | Very Low | Standard API, unlikely to change |
| Increased support burden | Medium | Medium | Good documentation, FAQ |
| Self-hosting complexity | Low | Medium | One-click deploy script |

### Tradeoffs Made

#### ✅ Chose: Client-Side Encryption
**Benefit**: Privacy-first, server can't read data  
**Cost**: Cannot recover forgotten passphrase, no server-side features (search, analytics)

#### ✅ Chose: Cloudflare Workers
**Benefit**: Free tier, global edge network, simple deployment  
**Cost**: Vendor lock-in (mitigated by simple API, easy to port)

#### ✅ Chose: Opt-In Sync
**Benefit**: No disruption to existing users  
**Cost**: Lower adoption rate, dual code paths (sync + no-sync)

#### ✅ Chose: Single-File UserScript
**Benefit**: Easy installation, no build process  
**Cost**: Larger file size, harder to maintain as it grows

#### ✅ Chose: Manual Conflict Resolution
**Benefit**: User control, no data loss  
**Cost**: Extra UI complexity, requires user decision

---

## Implementation Plan

### Phase 0: Planning & Design (1 week)
**Owner**: Staff Engineer  
**Deliverables**:
- [x] Technical architecture document (this doc)
- [ ] Security review by Code Reviewer
- [ ] API design review
- [ ] UI mockups

**Definition of Done**:
- Architecture approved by team
- Security review passed
- API contract finalized

### Phase 1: Backend Implementation (1 week)
**Owner**: Staff Engineer  
**Tasks**:
1. Setup Cloudflare Workers project structure
2. Implement API routes (POST/GET/DELETE /sync)
3. Add authentication middleware (JWT access/refresh tokens)
4. Add rate limiting
5. Add KV storage operations
6. Write unit tests
7. Setup CI/CD (GitHub Actions → Workers)
8. Deploy to staging environment

**Deliverables**:
- `/workers` directory with complete backend
- Passing test suite
- Deployed staging API
- Self-hosting documentation

**Definition of Done**:
- All tests passing
- API responds to requests
- Rate limiting works
- Documentation complete

### Phase 2: Encryption Module (3 days)
**Owner**: Staff Engineer  
**Tasks**:
1. Implement Web Crypto API wrapper
2. Add PBKDF2 key derivation
3. Add AES-GCM encryption/decryption
4. Write unit tests (test vectors from NIST)
5. Security review

**Deliverables**:
- `SyncEncryption` module in UserScript
- Comprehensive test suite
- Security audit report

**Definition of Done**:
- Encryption/decryption works
- Tests pass (including NIST test vectors)
- Security review passed

### Phase 3: Sync Manager (1 week)
**Owner**: Staff Engineer  
**Tasks**:
1. Implement `SyncManager` module
2. Add data collection logic
3. Add upload/download logic
4. Add conflict detection
5. Add automatic sync scheduling
6. Hook into Storage wrapper
7. Write unit tests
8. Integration tests with backend

**Deliverables**:
- `SyncManager` module in UserScript
- Integration with existing Storage
- Test suite

**Definition of Done**:
- Sync works end-to-end
- Conflicts handled correctly
- Tests passing

### Phase 4: UI Implementation (1 week)
**Owner**: Staff Engineer  
**Tasks**:
1. Add Settings modal with Sync tab
2. Add sync setup wizard
3. Add passphrase input with strength meter
4. Add sync status indicator
5. Add conflict resolution dialog
6. Add sync logs/history view
7. Style to match existing UI
8. Accessibility review

**Deliverables**:
- Complete sync UI
- Onboarding wizard
- Conflict resolution flow
- A11y compliant

**Definition of Done**:
- UI matches designs
- Wizard completes successfully
- Conflicts can be resolved
- Accessibility review passed

### Phase 5: Testing & QA (1 week)
**Owner**: QA Engineer  
**Tasks**:
1. End-to-end testing (happy path)
2. Error scenario testing (network failures, etc.)
3. Conflict testing (multiple devices)
4. Performance testing (large configs)
5. Security testing (penetration test)
6. Browser compatibility testing
7. Mobile browser testing
8. Documentation review

**Test Scenarios**:
- ✅ Fresh install, enable sync
- ✅ Sync between 2 devices
- ✅ Sync between 3+ devices
- ✅ Conflict resolution (all strategies)
- ✅ Network failure during sync
- ✅ Server returns 500 error
- ✅ Rate limit exceeded
- ✅ Incorrect passphrase
- ✅ Forgotten passphrase
- ✅ Disable sync, re-enable
- ✅ Custom server URL
- ✅ Token rotation
- ✅ Large config (100+ goals)
- ✅ Encrypted data integrity

**Deliverables**:
- Test report
- Bug list
- Performance metrics
- Security audit

**Definition of Done**:
- All tests passing
- No critical bugs
- Performance acceptable (<1s sync time)
- Security audit clean

### Phase 6: Documentation (3 days)
**Owner**: Staff Engineer + Product Manager  
**Tasks**:
1. Write user guide (setup, usage)
2. Write self-hosting guide
3. Update README.md
4. Update TECHNICAL_DESIGN.md
5. Write FAQ
6. Create video tutorial (optional)
7. Write changelog entry
8. Update version numbers

**Deliverables**:
- `/docs/sync-setup.md` (user guide)
- `/workers/README.md` (self-hosting guide)
- Updated project docs
- Changelog entry

**Definition of Done**:
- Documentation complete and reviewed
- Self-hosting guide tested
- Changelog published

### Phase 7: Release (1 day)
**Owner**: Staff Engineer  
**Tasks**:
1. Bump version (2.7.7 → 2.8.0)
2. Create release branch
3. Final testing on production API
4. Merge to main
5. Tag release (v2.8.0)
6. Deploy Workers to production
7. Update Tampermonkey script on GitHub
8. Announce in README
9. Monitor for issues

**Deliverables**:
- Released version 2.8.0
- Production Workers API live
- UserScript updated
- Announcement

**Definition of Done**:
- Version deployed
- No critical issues reported
- Monitoring shows healthy metrics

### Timeline Summary

| Phase | Duration | Dependencies |
|-------|----------|--------------|
| Phase 0: Planning | 1 week | None |
| Phase 1: Backend | 1 week | Phase 0 |
| Phase 2: Encryption | 3 days | Phase 0 |
| Phase 3: Sync Manager | 1 week | Phase 1, 2 |
| Phase 4: UI | 1 week | Phase 3 |
| Phase 5: Testing | 1 week | Phase 4 |
| Phase 6: Documentation | 3 days | Phase 5 |
| Phase 7: Release | 1 day | Phase 6 |
| **Total** | **~6 weeks** | |

### Resource Requirements

- **Staff Engineer**: Full-time for 6 weeks
- **QA Engineer**: 1 week (Phase 5)
- **Code Reviewer**: 2 days (reviews during development)
- **Product Manager**: 3 days (documentation + release)

### Success Metrics

**Technical Metrics**:
- ✅ Sync success rate > 99%
- ✅ Average sync time < 1 second
- ✅ Zero data loss incidents
- ✅ Zero security incidents
- ✅ API uptime > 99.9%

**User Metrics**:
- 🎯 Sync adoption rate > 20% (after 3 months)
- 🎯 User satisfaction score > 4/5
- 🎯 Support tickets < 5 per week
- 🎯 Self-hosting adoption > 10 users

**Business Metrics** (if applicable):
- Infrastructure cost: $0/month (free tier)
- Support cost: < 2 hours/week
- Community engagement: +20% GitHub stars

---

## Appendix

### A. Alternative Architectures Considered

#### Option 1: WebDAV Sync
**Pros**: Users control storage (Dropbox, etc.)  
**Cons**: Complex setup, auth flow complicated  
**Verdict**: Too much friction for users

#### Option 2: Firebase/Supabase
**Pros**: Managed backend, real-time sync  
**Cons**: Vendor lock-in, costs scale, privacy concerns  
**Verdict**: Against privacy-first principle

#### Option 3: Browser Sync APIs (Chrome Sync, Firefox Sync)
**Pros**: Native, automatic  
**Cons**: Browser-specific, limited storage, no cross-browser  
**Verdict**: Too limited

#### Option 4: IPFS/Blockchain
**Pros**: Decentralized, no central server  
**Cons**: Complex, slow, overkill for simple config  
**Verdict**: Too complex for users

#### Option 5: Peer-to-Peer (WebRTC)
**Pros**: No server needed, true P2P  
**Cons**: Requires discovery service, complex NAT traversal  
**Verdict**: Too complex to implement

**Chosen**: Cloudflare Workers - Best balance of simplicity, privacy, and self-hosting

### B. Encryption Algorithm Comparison

| Algorithm | Key Size | IV Size | Auth | Speed | Security |
|-----------|----------|---------|------|-------|----------|
| AES-GCM | 256-bit | 96-bit | Yes | Fast | Excellent |
| AES-CBC | 256-bit | 128-bit | No | Fast | Good (needs HMAC) |
| ChaCha20-Poly1305 | 256-bit | 96-bit | Yes | Very Fast | Excellent |
| AES-CTR + HMAC | 256-bit | 128-bit | Yes | Fast | Excellent |

**Chosen**: AES-GCM - Native browser support, authenticated, standard

### C. Key Derivation Function Comparison

| KDF | Iterations | Memory | Parallel | Resistance |
|-----|------------|--------|----------|------------|
| PBKDF2 | 100k | Low | Easy | Good |
| bcrypt | Work factor 10 | Medium | Hard | Better |
| scrypt | N=16384 | High | Hard | Best |
| Argon2 | Configurable | High | Hard | Best |

**Chosen**: PBKDF2 - Native browser support, sufficient for our use case

### D. Conflict Resolution Strategies

#### Last-Write-Wins (LWW)
**How**: Use timestamp to pick winner  
**Pros**: Simple, automatic  
**Cons**: Can lose recent changes

#### Operational Transform (OT)
**How**: Apply operations in order  
**Pros**: No data loss  
**Cons**: Complex, requires operation log

#### Conflict-Free Replicated Data Types (CRDT)
**How**: Mathematically proven convergence  
**Pros**: No conflicts ever  
**Cons**: Complex, larger payloads

#### Manual Resolution (Chosen)
**How**: User picks winning version  
**Pros**: User control, transparent  
**Cons**: Requires user action

### E. Sample Wrangler Configuration

```toml
# workers/wrangler.toml
name = "goal-portfolio-sync"
main = "src/index.js"
compatibility_date = "2024-01-01"

# KV Namespace for production
[[kv_namespaces]]
binding = "SYNC_KV_PROD"
id = "your-kv-namespace-id"

# Environment variables
[env.production]
vars = { ENVIRONMENT = "production", SYNC_KV_BINDING = "SYNC_KV_PROD", CORS_ORIGINS = "https://app.your-domain.com" }

[env.staging]
vars = { ENVIRONMENT = "staging", SYNC_KV_BINDING = "SYNC_KV_STAGING", CORS_ORIGINS = "https://staging.your-domain.com" }
kv_namespaces = [
  { binding = "SYNC_KV_STAGING", id = "staging-kv-namespace-id" }
]

# Build configuration
[build]
command = "npm run build"

# Route configuration
routes = [
  { pattern = "sync.your-domain.com/*", zone_name = "your-domain.com" }
]
```

### F. Sample Token Flow

```javascript
// Login to obtain tokens
const response = await fetch(`${serverUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, passwordHash })
});
const { tokens } = await response.json();
```

### G. Monitoring & Observability

**CloudflareWorkers built-in metrics**:
- Request count
- Error rate
- Response time (P50, P95, P99)
- Data transfer

**Custom metrics to track**:
- Sync success rate per user
- Conflict rate
- Average payload size
- Token usage
- Rate limit hits

**Instrumentation coverage contract**:
- Keep the worker route inventory centralized in `workers/src/metrics.js`.
- Treat `GET /health`, `POST /auth/register`, `POST /auth/login`, `POST /auth/refresh`, `POST /sync`, `GET /sync/:userId`, and `DELETE /sync/:userId` as the canonical backend surface for observability coverage.
- Require request count, route outcome totals, and latency for every documented route.
- Require explicit instrumentation for high-value outcomes: `BAD_REQUEST`, `UNAUTHORIZED`, `FORBIDDEN`, `PAYLOAD_TOO_LARGE`, `CONFLICT`, `RATE_LIMIT_EXCEEDED`, `NOT_FOUND`, and `INTERNAL_ERROR` where applicable.
- Require privacy-safe feature instrumentation for sync upload payload sizing, token issuance/verification, and rate-limit hits.

**Coverage enforcement**:
- Run `pnpm --filter ./workers analyze:metrics-coverage` locally or in CI to compare the metrics contract against the runtime instrumentation manifest.
- The analyzer reports covered routes, missing route metrics, missing outcomes/features, and the overall coverage percentage.
- A green analyzer result means the required worker instrumentation points are present and unit-testable; it does not replace live Cloudflare dashboard validation.

**Alerts to configure**:
- Error rate > 5%
- Response time > 2s
- Rate limit hits > 100/hour
- KV storage > 80% capacity

### H. Cost Analysis

**Cloudflare Workers Free Tier**:
- 100,000 requests/day
- 10ms CPU time per request
- 1GB KV storage
- 100,000 KV reads/day
- 1,000 KV writes/day

**Estimated Usage** (1000 active users):
- Syncs per user per day: 12 (every 2 hours)
- Total syncs: 12,000/day
- KV writes: 12,000/day (exceeds free tier)
- KV reads: 12,000/day (well within)
- Storage: ~1MB (1000 users × 1KB)

**Cost Estimate**:
- Workers: $0 (within free tier)
- KV writes: $0.50/million writes = $0.006/day = **$2/month**
- KV reads: $0.50/million reads = $0 (within free tier)
- Storage: $0 (within free tier)

**Total cost for 1000 users**: **~$2/month**

**Self-hosting cost**: $0 (users pay their own Cloudflare bills)

---

## Conclusion

This architecture provides a robust, privacy-first sync solution that:

✅ Maintains privacy with end-to-end encryption  
✅ Supports self-hosting for full user control  
✅ Costs nearly nothing to run (~$2/month for 1000 users)  
✅ Degrades gracefully when offline  
✅ Integrates cleanly with existing UserScript  
✅ Scales to thousands of users on free tier  

**Recommendation**: Proceed with implementation following the phased plan outlined above.

**Next Steps**:
1. Security review of this architecture
2. Approval from Product Manager
3. Risk assessment from Devil's Advocate
4. Begin Phase 1 (Backend Implementation)

---

**Document Version**: 1.0  
**Last Updated**: December 2024  
**Reviewed By**: Pending  
**Approved By**: Pending
