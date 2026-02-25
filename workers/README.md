# Cloudflare Workers Sync Backend

This directory contains the backend sync service for Goal Portfolio Viewer, built on Cloudflare Workers.

## 🌟 Features

- ✅ **Password login + JWT access/refresh tokens**
- ✅ **User registration and login** (self-service account creation)
- ✅ End-to-end encrypted sync (server never sees plaintext)
- ✅ Privacy-first architecture (zero-knowledge encryption)
- ✅ Free tier supports 1000+ users
- ✅ Global edge network (low latency)
- ✅ Self-hostable (you control your data)

## 📋 Prerequisites

- [Cloudflare account](https://dash.cloudflare.com/sign-up) (free tier works)
- [Node.js](https://nodejs.org/) (v18 or later)
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/) (Cloudflare Workers CLI)

## 🚀 Quick Start (Self-Hosting)

### 1. Install Dependencies

```bash
cd workers
pnpm install
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

For multiple instances, set a unique `SYNC_KV_BINDING` per environment and match the KV binding name in `kv_namespaces`.

Example:

```toml
[env.staging]
name = "goal-portfolio-sync-staging"
vars = { ENVIRONMENT = "staging", CORS_ORIGINS = "https://staging.yourdomain.com", SYNC_KV_BINDING = "SYNC_KV_STAGING" }
kv_namespaces = [{ binding = "SYNC_KV_STAGING", id = "staging-kv-id", preview_id = "staging-preview-id" }]

[env.production]
name = "goal-portfolio-sync"
vars = { ENVIRONMENT = "production", CORS_ORIGINS = "https://app.yourdomain.com", SYNC_KV_BINDING = "SYNC_KV_PROD" }
kv_namespaces = [{ binding = "SYNC_KV_PROD", id = "prod-kv-id", preview_id = "prod-preview-id" }]
```

### 5. Set JWT Secret

This backend signs access/refresh tokens with `JWT_SECRET`.

```bash
npx wrangler secret put JWT_SECRET
# Paste a strong random secret when prompted
```

### 6. Deploy

```bash
# Deploy to production
pnpm run deploy

# Or deploy to staging first
pnpm run deploy:staging
```

Your API will be available at: `https://goal-portfolio-sync.YOUR_SUBDOMAIN.workers.dev`

### 6b. Test Builds on Cloudflare (Staging/Preview)

Use a separate environment for test builds so you can validate changes without touching production.

1. **Create a staging KV namespace** (if you don’t already have one):

```bash
npx wrangler kv:namespace create "SYNC_KV" --env staging
```

2. **Add a staging environment** in `wrangler.toml` (unique name + KV binding + CORS):

```toml
[env.staging]
name = "goal-portfolio-sync-staging"
vars = { ENVIRONMENT = "staging", CORS_ORIGINS = "https://app.sg.endowus.com", SYNC_KV_BINDING = "SYNC_KV_STAGING" }
kv_namespaces = [{ binding = "SYNC_KV_STAGING", id = "staging-kv-id", preview_id = "staging-preview-id" }]
```

3. **Set a staging JWT secret**:

```bash
npx wrangler secret put JWT_SECRET --env staging
```

4. **Deploy the test build**:

```bash
pnpm run deploy:staging
# or: npx wrangler deploy --env staging
```

Your test build will be available at:
`https://goal-portfolio-sync-staging.YOUR_SUBDOMAIN.workers.dev`

### 6c. Branch Previews (GitHub Actions)

For per‑PR preview URLs that follow Cloudflare’s preview alias pattern:
`<alias>-goal-portfolio-sync.<your-subdomain>.workers.dev`, use the preview workflow.

1. **Template file** (already in repo):
   - `workers/wrangler.preview.toml.template` (placeholders are filled in CI)

2. **Workflow**:
   - `.github/workflows/preview-deploy.yml` uploads a **preview version** using
     `wrangler versions upload --preview-alias <alias>`.
   - The alias is derived from the PR number or branch name and is length‑safe.
   - The preview URL is posted to the PR.

**Note:** Preview versions require the base worker to exist. Run one normal deploy (e.g., `pnpm run deploy`) before the first preview if the script has never been created in your account.

After a PR is opened or updated, the workflow posts the preview URL in the PR comments.
Preview versions are managed by Cloudflare and clean up automatically, so no additional cleanup jobs are required.

### 6c.1 CI Secrets Setup (GitHub Actions)

Add the required repository secrets in:
**GitHub → Settings → Secrets and variables → Actions → New repository secret**.

Required secrets:
- `CLOUDFLARE_API_TOKEN` (Workers Scripts: Edit, KV Storage: Edit, Account Settings: Read)
- `CLOUDFLARE_ACCOUNT_ID`
- `SYNC_KV_ID` (shared KV namespace ID for production + previews)
- `CLOUDFLARE_WORKERS_SUBDOMAIN` (used to build the preview URL in PR comments)

Previews and production both use `SYNC_KV_ID`.

JWT secrets are managed via Wrangler (not GitHub Actions). Run:
`npx wrangler secret put JWT_SECRET --env production` or set per preview worker name as needed.

### 6d. Production Deploy on Main

Main-branch merges can deploy automatically via GitHub Actions:

1. **Workflow**: `.github/workflows/deploy-production.yml`
2. **Trigger**: Push to `main` that touches `workers/**`
3. **Secrets required**:
   - `CLOUDFLARE_API_TOKEN`
   - `CLOUDFLARE_ACCOUNT_ID`
   - `SYNC_KV_ID`

CI renders `workers/wrangler.production.toml.template` with secrets and deploys
using the rendered config.

Local deploys still use `workers/wrangler.toml` and `--env production`.

JWT secrets are managed via Wrangler (not GitHub Actions). Run:
`npx wrangler secret put JWT_SECRET --env production` as part of initial setup.

### 7. Test Deployment

```bash
# Health check
curl https://goal-portfolio-sync.YOUR_SUBDOMAIN.workers.dev/health

# Should return:
# {"status":"ok","version":"1.0.0","timestamp":1234567890}

# Test auth + token flow (using test script)
# See DEPLOYMENT.md for curl-based auth/sync examples.
```

### 8. Configure UserScript

**Password Login (Recommended)**:

1. Open Goal Portfolio Viewer settings
2. Click the "⚙️ Sync" button
3. Enter:
   - **Server URL**: `https://goal-portfolio-sync.YOUR_SUBDOMAIN.workers.dev`
   - **User ID**: Your email or username
   - **Password**: Create a strong password (min 8 characters)
4. Click "📝 Sign Up" to create your account
5. Click "🔑 Login" to generate session tokens
6. Enable sync checkbox and click "Save Settings"
7. Click "Sync Now" to upload your first configuration

Done! Your settings will now sync across all devices using the same credentials.
Your password is never stored locally; use a browser password manager to autofill each session.

## 🔐 Authentication API

The backend issues JWT access + refresh tokens after password-based login.

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
  "message": "Login successful",
  "tokens": {
    "accessToken": "eyJhbGciOi...",
    "refreshToken": "eyJhbGciOi...",
    "accessExpiresAt": 1710000000000,
    "refreshExpiresAt": 1712592000000
  }
}
```

#### POST /auth/refresh
Exchange a refresh token for new tokens.

**Request:**
```bash
curl -X POST https://your-worker.workers.dev/auth/refresh \
  -H "Authorization: Bearer <refreshToken>"
```

**Response:**
```json
{
  "success": true,
  "tokens": {
    "accessToken": "eyJhbGciOi...",
    "refreshToken": "eyJhbGciOi...",
    "accessExpiresAt": 1710000000000,
    "refreshExpiresAt": 1712592000000
  }
}
```

### Authenticated Sync Endpoints

All sync endpoints (POST/GET/DELETE /sync) require a valid **access token**:
```bash
curl -X POST https://your-worker.workers.dev/sync \
  -H "Authorization: Bearer <accessToken>" \
  -H "Content-Type: application/json" \
  -d '{"userId":"user@example.com", ...}'
```

## 🛠️ Development

### Local Development

```bash
# Start local development server
pnpm run dev

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

# Upload test with access token
curl -X POST http://localhost:8787/sync \
  -H "Authorization: Bearer <accessToken>" \
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
  -H "Authorization: Bearer <accessToken>"
```

### Run Tests

```bash
# Run unit test suite
node --test test/*.test.js
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
All endpoints (except `/health` and `/auth/*`) require a valid access token in the `Authorization` header.

### Endpoints

#### Health Check
```
GET /health

Response (200):
{
  "status": "ok",
  "version": "1.2.0",
  "timestamp": 1234567890000
}
```

#### Upload Config
```
POST /sync

Headers:
  Authorization: Bearer <accessToken>
  Content-Type: application/json

Body:
{
  "userId": "string (uuid)",
  "deviceId": "string (uuid)",
  "encryptedData": "string (base64)",
  "timestamp": number,
  "version": number,
  "force": boolean
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

When `force` is `true`, the upload overwrites server data even if the incoming timestamp is older, and the server returns a fresh timestamp.
```

#### Download Config
```
GET /sync/:userId

Headers:
  Authorization: Bearer <accessToken>

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
  Authorization: Bearer <accessToken>

Response (200):
{
  "success": true
}
```

### Rate Limits

- **Upload**: 10 requests/minute per user
- **Download**: 60 requests/minute per user
- **Delete**: 5 requests/minute per user

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
- JWT secrets are stored as Cloudflare secrets (never in code)
- Access tokens are short-lived; refresh tokens last 60 days
- Rotate `JWT_SECRET` to invalidate all sessions

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
  CORS_ORIGINS = "https://app.sg.endowus.com",
  SYNC_KV_BINDING = "SYNC_KV_PROD"
}

[env.staging]
vars = { 
  ENVIRONMENT = "staging",
  CORS_ORIGINS = "https://app.sg.endowus.com",
  SYNC_KV_BINDING = "SYNC_KV_STAGING"
}
```

### Secrets

Stored securely, not in code:

```bash
# Set JWT secret
npx wrangler secret put JWT_SECRET

# Update JWT secret
npx wrangler secret put JWT_SECRET --env production

# List secrets (doesn't show values)
npx wrangler secret list
```

Use unique secrets per environment:

```bash
npx wrangler secret put JWT_SECRET --env staging
npx wrangler secret put JWT_SECRET --env production
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
- Check access token is valid (login again if needed)
- Verify `JWT_SECRET` is set: `npx wrangler secret list`
- Ensure header is `Authorization: Bearer <accessToken>`

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
- Verify server URL + user ID in UserScript settings
- Login again to refresh tokens
- Test API manually with `curl`
- Check browser console for errors

## 🚢 Production Checklist

Before deploying to production:

- [ ] Generate strong JWT secret
- [ ] Store JWT secret as Cloudflare secret (not in code)
- [ ] Setup KV namespaces (production + staging)
- [ ] Configure custom domain (optional)
- [ ] Setup monitoring alerts
- [ ] Test sync flow end-to-end
- [ ] Document login + token flow for your users
- [ ] Plan JWT secret rotation schedule (quarterly recommended)

## 🤝 Contributing

Improvements welcome! Please:
1. Test changes locally (`pnpm run dev`)
2. Run tests (`pnpm test`)
3. Deploy to staging first (`pnpm run deploy:staging`)
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
