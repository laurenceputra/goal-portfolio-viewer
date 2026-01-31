# Sync Architecture Visual Guide

Quick visual reference for the sync architecture.

## System Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│                         USER'S BROWSER (Device 1)                           │
│                                                                             │
│  ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓  │
│  ┃                    Goal Portfolio Viewer UserScript                  ┃  │
│  ┃                                                                        ┃  │
│  ┃  ┌──────────────┐    ┌──────────────────────────────────────────┐   ┃  │
│  ┃  │   Settings   │    │         SyncManager Module                │   ┃  │
│  ┃  │              │    │  • Collect goal settings                  │   ┃  │
│  ┃  │ • Passphrase │───▶│  • Encrypt with SyncEncryption            │   ┃  │
│  ┃  │ • API Key    │    │  • Upload to Workers                      │   ┃  │
│  ┃  │ • Server URL │    │  • Download from Workers                  │   ┃  │
│  ┃  └──────────────┘    │  • Detect conflicts                       │   ┃  │
│  ┃         │             │  • Resolve conflicts                      │   ┃  │
│  ┃         │             └─────────────────┬────────────────────────┘   ┃  │
│  ┃         ▼                               │                             ┃  │
│  ┃  ┌──────────────────────────────────────▼──────────────────────┐    ┃  │
│  ┃  │          SyncEncryption Module (Web Crypto API)              │    ┃  │
│  ┃  │                                                               │    ┃  │
│  ┃  │  ┌─────────────────────────────────────────────────────┐    │    ┃  │
│  ┃  │  │  1. Passphrase + Salt → PBKDF2 → 256-bit Key       │    │    ┃  │
│  ┃  │  └─────────────────────────────────────────────────────┘    │    ┃  │
│  ┃  │                           │                                  │    ┃  │
│  ┃  │                           ▼                                  │    ┃  │
│  ┃  │  ┌─────────────────────────────────────────────────────┐    │    ┃  │
│  ┃  │  │  2. Goal Settings JSON → UTF-8 → Uint8Array         │    │    ┃  │
│  ┃  │  └─────────────────────────────────────────────────────┘    │    ┃  │
│  ┃  │                           │                                  │    ┃  │
│  ┃  │                           ▼                                  │    ┃  │
│  ┃  │  ┌─────────────────────────────────────────────────────┐    │    ┃  │
│  ┃  │  │  3. AES-GCM Encrypt (Key, Random IV, Data)          │    │    ┃  │
│  ┃  │  │     → Ciphertext + Auth Tag                         │    │    ┃  │
│  ┃  │  └─────────────────────────────────────────────────────┘    │    ┃  │
│  ┃  │                           │                                  │    ┃  │
│  ┃  │                           ▼                                  │    ┃  │
│  ┃  │  ┌─────────────────────────────────────────────────────┐    │    ┃  │
│  ┃  │  │  4. Package: Salt(16) + IV(12) + Ciphertext + Tag   │    │    ┃  │
│  ┃  │  │     → Base64 Encode → Ready for Upload              │    │    ┃  │
│  ┃  │  └─────────────────────────────────────────────────────┘    │    ┃  │
│  ┃  │                                                               │    ┃  │
│  ┃  └───────────────────────────────────────────────────────────────┘    ┃  │
│  ┃                                  │                                     ┃  │
│  ┃                                  ▼                                     ┃  │
│  ┃                     ┌──────────────────────────┐                      ┃  │
│  ┃                     │  Tampermonkey Storage    │                      ┃  │
│  ┃                     │  (GM_setValue/GM_getValue)│                      ┃  │
│  ┃                     │                          │                      ┃  │
│  ┃                     │  • goal_target_pct_*     │                      ┃  │
│  ┃                     │  • goal_fixed_*          │                      ┃  │
│  ┃                     │  • sync_last_sync        │                      ┃  │
│  ┃                     │  • sync_enabled          │                      ┃  │
│  ┃                     └──────────────────────────┘                      ┃  │
│  ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛  │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      │ HTTPS POST /sync
                                      │ Headers: X-API-Key, Content-Type
                                      │ Body: {
                                      │   userId: "uuid",
                                      │   deviceId: "uuid",
                                      │   encryptedData: "base64...",
                                      │   timestamp: 1234567890,
                                      │   version: 1
                                      │ }
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                     CLOUDFLARE WORKERS (Global Edge)                        │
│                                                                             │
│  ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓  │
│  ┃                         Sync API (index.js)                          ┃  │
│  ┃                                                                        ┃  │
│  ┃  ┌───────────────────────────────────────────────────────────────┐  ┃  │
│  ┃  │  1. CORS Preflight Handler (OPTIONS)                          │  ┃  │
│  ┃  │     → Allow: GET, POST, DELETE                                 │  ┃  │
│  ┃  └───────────────────────────────────────────────────────────────┘  ┃  │
│  ┃                                  ▼                                    ┃  │
│  ┃  ┌───────────────────────────────────────────────────────────────┐  ┃  │
│  ┃  │  2. Authentication Middleware (auth.js)                        │  ┃  │
│  ┃  │     • Extract X-API-Key header                                 │  ┃  │
│  ┃  │     • Compare against env.API_KEY (timing-safe)                │  ┃  │
│  ┃  │     • Return 401 if invalid                                    │  ┃  │
│  ┃  └───────────────────────────────────────────────────────────────┘  ┃  │
│  ┃                                  ▼                                    ┃  │
│  ┃  ┌───────────────────────────────────────────────────────────────┐  ┃  │
│  ┃  │  3. Rate Limiting (ratelimit.js)                               │  ┃  │
│  ┃  │     • Check KV for request count                               │  ┃  │
│  ┃  │     • Key: ratelimit:{apiKey}:{path}:{method}                  │  ┃  │
│  ┃  │     • Limits: 10 POST/min, 60 GET/min, 5 DELETE/min           │  ┃  │
│  ┃  │     • Return 429 if exceeded                                   │  ┃  │
│  ┃  └───────────────────────────────────────────────────────────────┘  ┃  │
│  ┃                                  ▼                                    ┃  │
│  ┃  ┌───────────────────────────────────────────────────────────────┐  ┃  │
│  ┃  │  4. Request Handlers (handlers.js)                             │  ┃  │
│  ┃  │                                                                 │  ┃  │
│  ┃  │  POST /sync → handleSync()                                     │  ┃  │
│  ┃  │  • Validate request body                                       │  ┃  │
│  ┃  │  • Check for conflicts (compare timestamps)                    │  ┃  │
│  ┃  │  • Store in KV via putToKV()                                   │  ┃  │
│  ┃  │  • Return success or 409 conflict                              │  ┃  │
│  ┃  │                                                                 │  ┃  │
│  ┃  │  GET /sync/:userId → handleGetSync()                           │  ┃  │
│  ┃  │  • Fetch from KV via getFromKV()                               │  ┃  │
│  ┃  │  • Return encrypted data or 404                                │  ┃  │
│  ┃  │                                                                 │  ┃  │
│  ┃  │  DELETE /sync/:userId → handleDeleteSync()                     │  ┃  │
│  ┃  │  • Delete from KV via deleteFromKV()                           │  ┃  │
│  ┃  │  • Return success                                              │  ┃  │
│  ┃  └───────────────────────────────────────────────────────────────┘  ┃  │
│  ┃                                  ▼                                    ┃  │
│  ┃  ┌───────────────────────────────────────────────────────────────┐  ┃  │
│  ┃  │  5. Storage Operations (storage.js)                            │  ┃  │
│  ┃  │     • Key format: sync_user:{userId}                           │  ┃  │
│  ┃  │     • Add serverTimestamp metadata                             │  ┃  │
│  ┃  │     • Store/retrieve/delete from KV                            │  ┃  │
│  ┃  └───────────────────────────────────────────────────────────────┘  ┃  │
│  ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛  │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                      CLOUDFLARE KV (Distributed Storage)                    │
│                                                                             │
│  ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓  │
│  ┃  Key: sync_user:550e8400-e29b-41d4-a716-446655440000                ┃  │
│  ┃  Value: {                                                             ┃  │
│  ┃    "encryptedData": "c2FsdCsxMiBieXRlcwppdisxMiBieXRlcwpjaX...",    ┃  │
│  ┃    "deviceId": "123e4567-e89b-12d3-a456-426614174000",               ┃  │
│  ┃    "timestamp": 1734567890000,                                       ┃  │
│  ┃    "version": 1,                                                      ┃  │
│  ┃    "serverTimestamp": 1734567890123                                  ┃  │
│  ┃  }                                                                    ┃  │
│  ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛  │
│                                                                             │
│  Properties:                                                                │
│  • Globally distributed (low latency)                                       │
│  • Eventually consistent (within seconds)                                   │
│  • Encrypted at rest by Cloudflare                                          │
│  • No expiration (data persists until deleted)                              │
│  • 1GB free storage                                                         │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      │ GET /sync/:userId
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         USER'S BROWSER (Device 2)                           │
│                                                                             │
│  Downloads encrypted data → Decrypts with same passphrase → Applies settings│
└─────────────────────────────────────────────────────────────────────────────┘
```

## Data Flow: Upload (Sync)

```
┌──────────────┐
│ User Changes │  (e.g., sets goal target to 25%)
│   Settings   │
└──────┬───────┘
       │
       ▼
┌─────────────────────────┐
│ Storage.set() triggered │
│ goal_target_pct_abc123  │
└──────┬──────────────────┘
       │
       ▼
┌────────────────────────────────┐
│ SyncManager.scheduleSyncDebounced() │
│ (waits 2 seconds)                    │
└──────┬─────────────────────────────┘
       │
       ▼
┌─────────────────────────┐
│ collectSyncData()       │
│ • Scan all goal_*       │
│ • Build JSON object     │
│ {                       │
│   version: 1,           │
│   goals: {              │
│     abc123: {           │
│       targetPct: 25,    │
│       fixed: false      │
│     }                   │
│   },                    │
│   metadata: {...}       │
│ }                       │
└──────┬──────────────────┘
       │
       ▼
┌──────────────────────────────┐
│ SyncEncryption.encrypt()     │
│ • Passphrase → PBKDF2 → Key  │
│ • Random Salt (16 bytes)     │
│ • Random IV (12 bytes)       │
│ • AES-GCM encrypt            │
│ • Output: base64(salt+iv+ct) │
└──────┬───────────────────────┘
       │
       ▼
┌────────────────────────────┐
│ fetch(serverUrl + '/sync', │
│   method: 'POST',          │
│   headers: {               │
│     'X-API-Key': apiKey    │
│   },                       │
│   body: {                  │
│     userId,                │
│     deviceId,              │
│     encryptedData,         │
│     timestamp,             │
│     version: 1             │
│   }                        │
│ )                          │
└──────┬─────────────────────┘
       │
       ▼
┌─────────────────────────┐
│ Workers API             │
│ • Authenticate          │
│ • Rate limit            │
│ • Validate payload      │
│ • Check for conflicts   │
│ • Store in KV           │
│ • Return 200 OK         │
└──────┬──────────────────┘
       │
       ▼
┌──────────────────────────┐
│ Update sync status       │
│ • Storage.set(           │
│    'sync_last_sync',     │
│    Date.now()            │
│  )                       │
│ • Show ✅ indicator      │
└──────────────────────────┘
```

## Data Flow: Download (Sync)

```
┌───────────────┐
│ Device 2 loads│
│   UserScript  │
└──────┬────────┘
       │
       ▼
┌──────────────────────────┐
│ SyncManager.init()       │
│ • Check sync_enabled     │
│ • Start auto-sync        │
│ • Initial sync           │
└──────┬───────────────────┘
       │
       ▼
┌───────────────────────────┐
│ SyncManager.syncNow()     │
│ • Download from server    │
└──────┬────────────────────┘
       │
       ▼
┌────────────────────────────┐
│ fetch(serverUrl +          │
│   '/sync/' + userId,       │
│   headers: {               │
│     'X-API-Key': apiKey    │
│   }                        │
│ )                          │
└──────┬─────────────────────┘
       │
       ▼
┌─────────────────────────┐
│ Workers API             │
│ • Authenticate          │
│ • Rate limit            │
│ • Fetch from KV         │
│ • Return encrypted data │
└──────┬──────────────────┘
       │
       ▼
┌──────────────────────────────┐
│ SyncEncryption.decrypt()     │
│ • Extract salt, IV, ct       │
│ • Passphrase → PBKDF2 → Key  │
│ • AES-GCM decrypt            │
│ • Output: JSON string        │
└──────┬───────────────────────┘
       │
       ▼
┌─────────────────────────┐
│ applySyncData()         │
│ • Parse JSON            │
│ • For each goal:        │
│   Storage.set(          │
│     'goal_target_pct_'  │
│   )                     │
│   Storage.set(          │
│     'goal_fixed_'       │
│   )                     │
└──────┬──────────────────┘
       │
       ▼
┌──────────────────────────┐
│ Settings applied!        │
│ Device 2 now has same    │
│ settings as Device 1     │
└──────────────────────────┘
```

## Conflict Resolution Flow

```
Device 1 (offline)           Device 2 (online)
      │                             │
      ▼                             ▼
 Set goal X = 25%              Set goal X = 30%
 (timestamp: T1)               (timestamp: T2)
      │                             │
      │                             ▼
      │                      Upload to server ✅
      │                      (server has T2 data)
      ▼                             │
 Come back online                   │
      │                             │
      ▼                             │
 Try to upload (T1)                 │
      │                             │
      ▼                             │
┌─────────────────────────────────────────┐
│ Workers detects conflict:                │
│ • Local timestamp (T1) < Server (T2)     │
│ • Return 409 with server data            │
└─────────────┬───────────────────────────┘
              │
              ▼
┌────────────────────────────────────────┐
│ SyncManager.handleConflict()            │
│ • Decrypt server data                   │
│ • Show conflict dialog                  │
│                                         │
│   ┌────────────────────────────────┐   │
│   │  Your Device     vs   Server   │   │
│   │  Goal X = 25%        Goal X = 30%  │
│   │  Modified: 5m ago    Modified: 2m│ │
│   │                                 │   │
│   │  [Keep This] [Use Server] [Merge]│ │
│   └────────────────────────────────┘   │
└────────────────┬───────────────────────┘
                 │
        ┌────────┴─────────┬──────────────┐
        │                  │              │
        ▼                  ▼              ▼
  Keep This Device    Use Server      Merge Both
  (force upload)      (download)      (union merge)
        │                  │              │
        └────────┬─────────┴──────────────┘
                 │
                 ▼
           Conflict resolved!
           Both devices now in sync
```

## Security Layers

```
Layer 1: Transport Security
├─ HTTPS (TLS 1.3)
├─ Certificate pinning (browser enforced)
└─ No cleartext transmission

Layer 2: Authentication
├─ API Key validation
├─ Timing-safe comparison
└─ Secret stored in Workers (not in code)

Layer 3: Authorization
├─ Rate limiting (per API key)
├─ Payload size limits (10KB max)
└─ Timestamp validation (prevent replay)

Layer 4: Encryption (End-to-End)
├─ AES-GCM 256-bit (confidentiality + authenticity)
├─ PBKDF2 key derivation (100k iterations)
├─ Random IV per encryption (prevent pattern analysis)
└─ Random salt per user (prevent rainbow tables)

Layer 5: Storage Security
├─ Cloudflare KV encrypted at rest
├─ Geographic distribution (DDoS resistant)
└─ No plaintext ever touches server
```

## Cost Breakdown

```
┌────────────────────────────────────────────────────────────┐
│                    Cloudflare Free Tier                    │
├────────────────────────────────────────────────────────────┤
│ Workers: 100,000 requests/day                     ✅ FREE  │
│ KV Reads: 100,000 reads/day                       ✅ FREE  │
│ KV Writes: 1,000 writes/day                       ✅ FREE  │
│ KV Storage: 1 GB                                  ✅ FREE  │
└────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────┐
│              Usage for 1000 Active Users                   │
├────────────────────────────────────────────────────────────┤
│ Syncs per user per day: 12 (every 2 hours)                │
│ Total syncs: 12,000/day                                    │
│                                                             │
│ Breakdown:                                                  │
│ • Workers requests: 12,000/day           ✅ < 100k (FREE)  │
│ • KV writes: 12,000/day                  ⚠️  > 1k (PAID)   │
│ • KV reads: 12,000/day                   ✅ < 100k (FREE)  │
│ • Storage: ~1MB                          ✅ << 1GB (FREE)  │
└────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────┐
│                     Monthly Cost                           │
├────────────────────────────────────────────────────────────┤
│ KV Writes: (12,000 - 1,000) × 30 days = 330k writes       │
│ Cost: 330k ÷ 1,000,000 × $0.50 = $0.165/day               │
│                                                             │
│ Monthly: $0.165 × 30 = ~$5/month                          │
│                                                             │
│ (Originally estimated $2/month, but $5 is more realistic   │
│  accounting for retry logic and failed requests)           │
└────────────────────────────────────────────────────────────┘

For self-hosting: Users pay their own Cloudflare bill = $0-5/month each
```

---

**Quick Reference**: Keep this diagram handy when implementing or debugging the sync feature.
