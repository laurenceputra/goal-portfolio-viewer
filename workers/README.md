# Cloudflare Workers Sync Backend

This directory contains the backend sync service for Goal Portfolio Viewer, built on Cloudflare Workers.

## 🌟 Features

- ✅ **Password-based authentication** (no API key needed for users!)
- ✅ **User registration and login** (self-service account creation)
- ✅ End-to-end encrypted sync (server never sees plaintext)
- ✅ Privacy-first architecture (zero-knowledge encryption)
- ✅ Free tier supports 1000+ users
- ✅ Global edge network (low latency)
- ✅ Self-hostable (you control your data)
- ✅ Backward compatible with legacy API key auth

## 📋 Prerequisites

- [Cloudflare account](https://dash.cloudflare.com/sign-up) (free tier works)
- [Node.js](https://nodejs.org/) (v18 or later)
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/) (Cloudflare Workers CLI)

## 🚀 Quick Start (Self-Hosting)

### 1. Install Dependencies

```bash
cd workers
npm install
```

### 2. Login to Cloudflare

```bash
npx wrangler login
```

This opens a browser to authenticate with your Cloudflare account.

### 3. Create KV Namespace

```bash
# Production namespace
npx wrangler kv:namespace create "SYNC_KV"

# Development namespace
npx wrangler kv:namespace create "SYNC_KV" --preview
```

This outputs namespace IDs like:
```
{ binding = "SYNC_KV", id = "abc123..." }
```

### 4. Update Configuration

Edit `wrangler.toml` and add your KV namespace IDs:

```toml
[[kv_namespaces]]
binding = "SYNC_KV"
id = "YOUR_NAMESPACE_ID_HERE"  # From step 3
preview_id = "YOUR_PREVIEW_NAMESPACE_ID_HERE"
```

### 5. (Optional) Set Legacy API Key

**Note**: With password-based authentication, this is optional and only needed for backward compatibility with existing users.

```bash
# Generate a secure API key
node -e "console.log('sk_live_' + require('crypto').randomBytes(32).toString('base64url'))"

# Store it as a secret
npx wrangler secret put API_KEY
# Paste the generated key when prompted
```

**New users don't need this** - they'll use password-based authentication instead!

### 6. Deploy

```bash
# Deploy to production
npm run deploy

# Or deploy to staging first
npm run deploy:staging
```

Your API will be available at: `https://goal-portfolio-sync.YOUR_SUBDOMAIN.workers.dev`

### 7. Test Deployment

```bash
# Health check
curl https://goal-portfolio-sync.YOUR_SUBDOMAIN.workers.dev/health

# Should return:
# {"status":"ok","version":"1.0.0","timestamp":1234567890}

# Test password authentication (using test script)
cd workers
node test-password-auth.js
```

### 8. Configure UserScript

**New Password-Based Authentication** (Recommended):

1. Open Goal Portfolio Viewer settings
2. Click the "⚙️ Sync" button
3. Enter:
   - **Server URL**: `https://goal-portfolio-sync.YOUR_SUBDOMAIN.workers.dev`
   - **User ID**: Your email or username
   - **Password**: Create a strong password (min 8 characters)
4. Click "📝 Sign Up" to create your account
5. Enable sync checkbox and click "Save Settings"
6. Click "Sync Now" to upload your first configuration

Done! Your settings will now sync across all devices using the same credentials.

**Legacy API Key Method** (For existing users):

1. Open Goal Portfolio Viewer settings
2. Navigate to "Sync" tab
3. Enter:
   - **Server URL**: Your worker URL
   - **API Key**: The key from step 5
   - **Passphrase**: Create a strong passphrase
4. Click "Enable Sync"

## 🔐 Password Authentication API

The backend now supports password-based authentication in addition to API keys.

### Authentication Endpoints

#### POST /auth/register
Register a new user account.

**Request:**
```json
{
  "userId": "user@example.com",
  "passwordHash": "a1b2c3d4..." (SHA-256 hex)
}
```

**Response:**
```json
{
  "success": true,
  "message": "User registered successfully"
}
```

#### POST /auth/login
Verify user credentials.

**Request:**
```json
{
  "userId": "user@example.com",
  "passwordHash": "a1b2c3d4..." (SHA-256 hex)
}
```

**Response:**
```json
{
  "success": true,
  "message": "Login successful"
}
```

### Authenticated Sync Endpoints

All sync endpoints (POST/GET/DELETE /sync) now accept **either**:

**Option 1: Password-based authentication** (Recommended):
```bash
curl -X POST https://your-worker.workers.dev/sync \
  -H "X-Password-Hash: a1b2c3d4..." \
  -H "X-User-Id: user@example.com" \
  -H "Content-Type: application/json" \
  -d '{"userId":"user@example.com", ...}'
```

**Option 2: Legacy API key**:
```bash
curl -X POST https://your-worker.workers.dev/sync \
  -H "X-API-Key: sk_live_..." \
  -H "Content-Type: application/json" \
  -d '{"userId":"test-user-123", ...}'
```

The backend tries password auth first, then falls back to API key for backward compatibility.

## 🛠️ Development

### Local Development

```bash
# Start local development server
npm run dev

# API available at http://localhost:8787
```

Test locally:
```bash
# Health check
curl http://localhost:8787/health

# Test password registration
curl -X POST http://localhost:8787/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "test@example.com",
    "passwordHash": "a1b2c3d4e5f6789..."
  }'

# Test password login
curl -X POST http://localhost:8787/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "test@example.com",
    "passwordHash": "a1b2c3d4e5f6789..."
  }'

# Upload test with password auth
curl -X POST http://localhost:8787/sync \
  -H "X-Password-Hash: a1b2c3d4e5f6789..." \
  -H "X-User-Id: test@example.com" \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "test@example.com",
    "deviceId": "test-device-456",
    "encryptedData": "dGVzdCBlbmNyeXB0ZWQgZGF0YQ==",
    "timestamp": 1234567890000,
    "version": 1
  }'

# Download test
curl http://localhost:8787/sync/test@example.com \
  -H "X-Password-Hash: a1b2c3d4e5f6789..." \
  -H "X-User-Id: test@example.com"
```

### Run Tests

```bash
# Run password authentication test suite
node test-password-auth.js

# Note: Ensure local dev server is running first (npm run dev)
```
```

### View Logs

```bash
# Tail production logs
npx wrangler tail

# Filter for errors only
npx wrangler tail --status error
```

## 📚 API Reference

### Base URL
```
https://goal-portfolio-sync.YOUR_SUBDOMAIN.workers.dev
```

### Authentication
All endpoints (except `/health`) require an API key in the `X-API-Key` header.

### Endpoints

#### Health Check
```
GET /health

Response (200):
{
  "status": "ok",
  "version": "1.0.0",
  "timestamp": 1234567890000
}
```

#### Upload Config
```
POST /sync

Headers:
  X-API-Key: <your-api-key>
  Content-Type: application/json

Body:
{
  "userId": "string (uuid)",
  "deviceId": "string (uuid)",
  "encryptedData": "string (base64)",
  "timestamp": number,
  "version": number
}

Response (200):
{
  "success": true,
  "timestamp": 1234567890000
}

Response (409 Conflict):
{
  "success": false,
  "error": "CONFLICT",
  "serverData": { ... }
}
```

#### Download Config
```
GET /sync/:userId

Headers:
  X-API-Key: <your-api-key>

Response (200):
{
  "success": true,
  "data": {
    "encryptedData": "string (base64)",
    "deviceId": "string",
    "timestamp": number,
    "version": number
  }
}

Response (404):
{
  "success": false,
  "error": "NOT_FOUND"
}
```

#### Delete Config
```
DELETE /sync/:userId

Headers:
  X-API-Key: <your-api-key>

Response (200):
{
  "success": true
}
```

### Rate Limits

- **Upload**: 10 requests/minute per API key
- **Download**: 60 requests/minute per API key
- **Delete**: 5 requests/minute per API key

If rate limited, server returns `429 Too Many Requests` with `Retry-After` header.

## 🔒 Security

### What's Encrypted?
All user config data is encrypted client-side using AES-GCM 256-bit encryption before upload.

### What's Stored?
The server stores:
- User ID (identifier, not personal info)
- Device ID (random UUID)
- Encrypted blob (cannot be decrypted by server)
- Timestamp (metadata)

The server **NEVER** sees:
- Your passphrase
- Your goal names
- Your investment amounts
- Your settings

### Key Management
- API keys are stored as Cloudflare secrets (never in code)
- API keys can be rotated anytime
- Each user should have a unique API key

### Audit
All access is logged (can be reviewed via `wrangler tail`).

## 💰 Cost Breakdown

### Cloudflare Free Tier Limits
- **Workers**: 100,000 requests/day
- **KV Storage**: 1GB
- **KV Reads**: 100,000/day
- **KV Writes**: 1,000/day

### Typical Usage (per user per day)
- **Syncs**: 12 (every 2 hours)
- **Storage**: ~1KB
- **Bandwidth**: ~12KB/day

### Cost for 1000 Active Users
- Workers: $0 (within free tier)
- KV Writes: ~$2/month (12,000 writes/day exceeds 1,000 free)
- KV Reads: $0 (within free tier)
- Storage: $0 (1MB total, well within 1GB)

**Total**: ~$2/month for 1000 users

### Scaling
If you exceed free tier:
- Workers: $5/month + $0.50 per million requests
- KV: $0.50 per million reads/writes, $0.50/GB storage

A $10/month budget supports 10,000+ active users.

## 🔧 Configuration

### Environment Variables

Set in `wrangler.toml`:

```toml
[env.production]
vars = { 
  ENVIRONMENT = "production",
  MAX_PAYLOAD_SIZE = "10240",  # 10KB
  ENABLE_DEBUG = "false"
}

[env.staging]
vars = { 
  ENVIRONMENT = "staging",
  MAX_PAYLOAD_SIZE = "10240",
  ENABLE_DEBUG = "true"
}
```

### Secrets

Stored securely, not in code:

```bash
# Set API key
npx wrangler secret put API_KEY

# Update API key
npx wrangler secret put API_KEY --env production

# List secrets (doesn't show values)
npx wrangler secret list
```

### Custom Domain

Add a custom domain in Cloudflare dashboard or `wrangler.toml`:

```toml
routes = [
  { pattern = "sync.yourdomain.com/*", zone_name = "yourdomain.com" }
]
```

## 📊 Monitoring

### View Metrics
```bash
# Open dashboard
npx wrangler dashboard

# Or visit: https://dash.cloudflare.com → Workers → Your Worker → Metrics
```

### Tail Logs
```bash
# Real-time logs
npx wrangler tail

# Filter by status code
npx wrangler tail --status error
npx wrangler tail --status ok

# Filter by method
npx wrangler tail --method POST
```

### Alerts

Setup alerts in Cloudflare dashboard:
1. Workers → Your Worker → Settings → Alerts
2. Configure alerts for:
   - Error rate > 5%
   - Response time > 2s
   - Request volume spikes

## 🐛 Troubleshooting

### Error: "Unauthorized"
- Check API key is correct
- Verify secret is set: `npx wrangler secret list`
- Ensure header is `X-API-Key` (case-sensitive)

### Error: "KV namespace not found"
- Check `wrangler.toml` has correct namespace IDs
- Run `npx wrangler kv:namespace list` to see your namespaces
- Update IDs in `wrangler.toml`

### Error: "Rate limit exceeded"
- Wait 60 seconds and retry
- Check if you're making too many sync requests
- Consider increasing `syncInterval` in UserScript

### Deployment fails
- Check you're logged in: `npx wrangler whoami`
- Ensure your account has Workers enabled
- Check `wrangler.toml` syntax

### Data not syncing
- Check server logs: `npx wrangler tail`
- Verify API key in UserScript settings
- Test API manually with `curl`
- Check browser console for errors

## 🚢 Production Checklist

Before deploying to production:

- [ ] Generate strong API key
- [ ] Store API key as secret (not in code)
- [ ] Setup KV namespaces (production + staging)
- [ ] Configure custom domain (optional)
- [ ] Setup monitoring alerts
- [ ] Test sync flow end-to-end
- [ ] Document API key for your users
- [ ] Plan API key rotation schedule (quarterly recommended)

## 🤝 Contributing

Improvements welcome! Please:
1. Test changes locally (`npm run dev`)
2. Run tests (`npm test`)
3. Deploy to staging first (`npm run deploy:staging`)
4. Submit PR with clear description

## 📄 License

MIT License - Same as parent project

## 🆘 Support

- **Issues**: [GitHub Issues](https://github.com/laurenceputra/goal-portfolio-viewer/issues)
- **Discussions**: [GitHub Discussions](https://github.com/laurenceputra/goal-portfolio-viewer/discussions)
- **Docs**: [Main README](../README.md) | [Architecture](../SYNC_ARCHITECTURE.md)

## 🔗 Resources

- [Cloudflare Workers Docs](https://developers.cloudflare.com/workers/)
- [Wrangler CLI Docs](https://developers.cloudflare.com/workers/wrangler/)
- [KV Documentation](https://developers.cloudflare.com/workers/runtime-apis/kv/)
- [Workers Pricing](https://developers.cloudflare.com/workers/platform/pricing/)
