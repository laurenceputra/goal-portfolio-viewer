# Password-Based Authentication Guide

## Overview

Goal Portfolio Viewer now uses **password-based authentication** where your password serves a dual purpose:
1. **Authentication** - Proves your identity to the sync server
2. **Encryption** - Protects your data with zero-knowledge encryption

This eliminates the need for separate API keys and passphrases, providing a simpler and more intuitive user experience.

## How It Works

### 🔐 Dual-Purpose Password

Your password is used in two different ways:

#### 1. For Authentication (Server Access)
```
Password + User ID → SHA-256 Hash → X-Password-Hash Header
```
- The hash is sent to the server with each request
- Server validates the hash against stored credentials
- Server NEVER sees your plaintext password

#### 2. For Encryption (Data Protection)
```
Password → PBKDF2 (100k iterations) → AES-GCM-256 Key
```
- Used to encrypt/decrypt your portfolio data
- Happens entirely in your browser
- Server NEVER sees the encryption key
- **Zero-knowledge architecture**: Server cannot decrypt your data

### 🎯 Key Benefits

- **Simpler**: One password instead of two credentials (API key + passphrase)
- **Standard**: Register/login flow like any web application
- **Secure**: Password hashed before transmission (SHA-256)
- **Private**: Server cannot decrypt your data (PBKDF2 → AES-GCM)
- **Self-service**: Create your own account, no admin needed
- **Per-user**: Each user has their own secure account

## User Flows

### 1️⃣ First-Time Setup (Registration)

**Step 1: Open Sync Settings**
1. Click the Portfolio Viewer trigger button
2. Click the "⚙️ Sync" button in the modal header

**Step 2: Configure**
1. Keep default Server URL or enter your self-hosted URL
2. Enter your User ID (email address or username)
3. Create a strong password (minimum 8 characters)

**Step 3: Sign Up**
1. Click the "📝 Sign Up" button
2. Wait for confirmation message
3. Enable sync checkbox
4. Click "Save Settings"
5. Click "Sync Now" to upload your first configuration

### 2️⃣ Syncing to Another Device

**On Second Device:**
1. Install the userscript
2. Open Sync Settings
3. Enter the SAME:
   - Server URL
   - User ID  
   - Password
4. Click "🔑 Login" to verify credentials
5. Enable sync and save
6. Your configuration will download automatically!

### 3️⃣ Changing Your Password

**Important**: Changing your password requires re-uploading your data!

1. Open Sync Settings
2. Disable sync temporarily
3. Enter your NEW password
4. Click "📝 Sign Up" (will update password on server)
5. Re-enable sync
6. Click "Save Settings"
7. Click "Sync Now" to upload with new encryption

## Security Model

### What's Sent to the Server

**Registration/Login:**
```json
{
  "userId": "user@example.com",
  "passwordHash": "a1b2c3d4..." (SHA-256 hex, 64 chars)
}
```

**Sync Upload:**
```json
{
  "userId": "user@example.com",
  "encryptedData": "base64_encrypted_blob",
  "deviceId": "device-uuid",
  "timestamp": 1234567890,
  "version": 1
}
Headers: {
  "X-Password-Hash": "a1b2c3d4...",
  "X-User-Id": "user@example.com"
}
```

### What Server Knows

✅ **Server CAN see**:
- Your User ID
- Password hash (for authentication)
- Encrypted data blob (unreadable)
- Sync timestamps
- Device IDs

❌ **Server CANNOT see**:
- Your plaintext password
- Your encryption key
- Your portfolio data
- Goal names, amounts, or any content

### Password Hashing Details

**For Authentication (SHA-256)**:
```javascript
// Purpose: Authenticate with server
// Input: password + userId
// Process: SHA-256(password + "|" + userId)
// Output: 64-character hex string
// Example: "a1b2c3d4e5f6..." (sent in X-Password-Hash header)
```

**For Encryption (PBKDF2 → AES-GCM)**:
```javascript
// Purpose: Encrypt/decrypt portfolio data
// Input: password
// Process: PBKDF2(password, random_salt, 100000 iterations, SHA-256)
// Output: 256-bit AES key
// Used for: AES-GCM-256 encryption with random IV
```

**Why two different methods?**
- Authentication hash: Fast, deterministic (same hash every time)
- Encryption key: Slow, random salt (different key for each encryption)
- This provides both speed and security where needed

## API Endpoints

### POST /auth/register
Register a new user account.

**Request:**
```json
{
  "userId": "user@example.com",
  "passwordHash": "a1b2c3d4e5f6..." (SHA-256 hex)
}
```

**Response (Success):**
```json
{
  "success": true,
  "message": "User registered successfully"
}
```

**Response (Error):**
```json
{
  "success": false,
  "message": "User already exists"
}
```

### POST /auth/login
Verify user credentials.

**Request:**
```json
{
  "userId": "user@example.com",
  "passwordHash": "a1b2c3d4e5f6..." (SHA-256 hex)
}
```

**Response (Success):**
```json
{
  "success": true,
  "message": "Login successful"
}
```

**Response (Error):**
```json
{
  "success": false,
  "message": "Invalid credentials"
}
```

### POST /sync
Upload encrypted configuration (requires auth headers).

**Headers:**
```
X-Password-Hash: a1b2c3d4e5f6...
X-User-Id: user@example.com
```

**Request:**
```json
{
  "userId": "user@example.com",
  "deviceId": "device-uuid",
  "encryptedData": "base64...",
  "timestamp": 1234567890,
  "version": 1
}
```

### GET /sync/:userId
Download encrypted configuration (requires auth headers).

**Headers:**
```
X-Password-Hash: a1b2c3d4e5f6...
X-User-Id: user@example.com
```

**Response:**
```json
{
  "success": true,
  "data": {
    "encryptedData": "base64...",
    "deviceId": "device-uuid",
    "timestamp": 1234567890,
    "version": 1
  }
}
```

## Backend Setup

### 1. Deploy Cloudflare Worker

```bash
cd workers
npx wrangler deploy
```

### 2. Create KV Namespace

```bash
npx wrangler kv:namespace create "SYNC_KV"
npx wrangler kv:namespace create "SYNC_KV" --preview
```

Update `wrangler.toml` with the namespace IDs.

### 3. (Optional) Set Legacy API Key

For backward compatibility with existing users:

```bash
npx wrangler secret put API_KEY
# Enter your legacy API key
```

New users don't need this - they'll use password-based auth.

### 4. Test Deployment

```bash
curl https://your-worker.workers.dev/health
```

Should return: `{"status":"ok","version":"1.0.0","timestamp":...}`

## Password Best Practices

### For Users

✅ **DO**:
- Use a unique password (don't reuse from other sites)
- Use at least 12-16 characters
- Include mix of letters, numbers, symbols
- Store password in a password manager
- Test sync on a second device before relying on it

❌ **DON'T**:
- Share your password with anyone
- Use common passwords (password123, qwerty, etc.)
- Write password in plain text files
- Forget your password (no recovery possible!)

### Password Strength Guide

| Strength | Example | Time to Crack |
|----------|---------|---------------|
| ❌ Weak | `password` | Instant |
| ❌ Weak | `password123` | Seconds |
| ⚠️ Medium | `MyPortfolio2024!` | Hours |
| ✅ Strong | `Tr0p1c@l-P4rr0t-$ings` | Years |
| ✅ Strong | `correct horse battery staple` | Centuries |

**Recommended**: Use a password manager to generate and store a 16+ character random password.

## Troubleshooting

### "User already exists"
**Problem**: Trying to register with a userId that's already taken.
**Solution**: Use the "Login" button instead, or choose a different userId.

### "Invalid credentials"
**Problem**: Wrong userId or password during login/sync.
**Solution**: Double-check your userId and password. They're case-sensitive!

### "Sync not configured"
**Problem**: Trying to sync without completing setup.
**Solution**: Follow the registration flow, enable sync, and save settings.

### "Password must be at least 8 characters"
**Problem**: Password too short.
**Solution**: Use a longer, stronger password (recommended: 12+ characters).

### Cannot decrypt data after password change
**Problem**: Changed password but old data still encrypted with old password.
**Solution**: 
1. Change back to old password temporarily
2. Download/sync data
3. Change to new password
4. Upload/sync again

### Lost password - can I recover my data?
**Problem**: Forgot password, cannot decrypt data.
**Solution**: Unfortunately, no. This is a feature, not a bug! Zero-knowledge encryption means even we cannot recover your data. 

**Prevention**: 
- Store password in a password manager
- Test sync on multiple devices
- Keep local backups

## Migration from API Key

If you're an existing user with API key authentication:

### Option 1: Continue with API Key
No action needed! The backend supports both auth methods.

### Option 2: Migrate to Password
1. Open Sync Settings
2. Note your current configuration
3. Disable sync
4. Clear old configuration
5. Follow new user registration flow
6. Enable sync and upload fresh configuration

## FAQs

**Q: Is my data safe?**
A: Yes! Your data is encrypted before leaving your device. The server only sees encrypted blobs.

**Q: Can the server admin see my portfolio?**
A: No. The server stores only encrypted data. Without your password, the data is unreadable.

**Q: What if I lose my password?**
A: Your data cannot be recovered. This is by design (zero-knowledge). Use a password manager!

**Q: Can I use the same password across devices?**
A: Yes, that's the whole point! Use the same userId and password on all your devices.

**Q: How is this different from the old API key system?**
A: Old system: Shared API key (one key for everyone) + separate passphrase.
    New system: Individual user accounts + single password for both auth and encryption.

**Q: Is the password sent to the server?**
A: No! Only a SHA-256 hash is sent. The plaintext password stays in your browser.

**Q: Can I self-host?**
A: Yes! Deploy the Cloudflare Worker code to your own account. Full instructions in `workers/README.md`.

**Q: What happens if someone guesses my password?**
A: They could access your encrypted data on the server, but more importantly, they'd have your password to decrypt it. Use a strong, unique password!

## Advanced: Self-Hosting

### Custom Backend URL

1. Deploy worker to your Cloudflare account
2. In Sync Settings, enter your worker URL: `https://your-sync.workers.dev`
3. Register your account on your private backend
4. Your data stays on your infrastructure

### Rate Limits

Default limits (per endpoint):
- POST /auth/register: 5 requests/hour
- POST /auth/login: 10 requests/hour  
- POST /sync: 10 requests/minute
- GET /sync: 60 requests/minute
- DELETE /sync: 5 requests/minute

Modify in `workers/src/ratelimit.js` if needed.

### Storage Limits

- Cloudflare KV free tier: 100,000 read operations/day, 1,000 write operations/day
- Each user's data: ~1-5 KB (very small!)
- You can support thousands of users on the free tier

## Support

- **Documentation**: See `docs/sync-setup.md` for user guide
- **Technical Details**: See `SYNC_ARCHITECTURE.md` for complete spec
- **Backend Code**: See `workers/` directory
- **Issues**: Open GitHub issue with [Sync] prefix

## Changelog

### v2.8.0 - Password-Based Authentication
- ✅ Replaced API key with password-based auth
- ✅ Added register/login endpoints
- ✅ Simplified UI (one password field)
- ✅ Per-user account system
- ✅ Zero-knowledge encryption maintained
- ✅ Backward compatible with API key (optional)

---

**Remember**: Your password is the key to your encrypted data. Keep it safe and don't lose it!
