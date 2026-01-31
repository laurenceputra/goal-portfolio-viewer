# Deployment Guide: Cloudflare Workers Sync Backend

## Overview

This guide covers deploying the sync backend to Cloudflare Workers for production use.

## Prerequisites

- Cloudflare account (free tier sufficient for testing)
- Node.js 16+ installed
- Wrangler CLI (`npm install -g wrangler`)
- GitHub account (for secrets management)

## Quick Deploy (5 Minutes)

### Step 1: Install Dependencies

```bash
cd workers
npm install
```

### Step 2: Login to Cloudflare

```bash
npx wrangler login
```

This opens a browser window for Cloudflare authentication.

### Step 3: Create KV Namespace

```bash
# Create KV namespace for sync data
npx wrangler kv:namespace create "SYNC_KV"
```

Copy the `id` from the output and update `wrangler.toml`:

```toml
[[kv_namespaces]]
binding = "SYNC_KV"
id = "your-namespace-id-here"  # ← Paste the ID here
```

### Step 4: Deploy to Staging

```bash
npx wrangler deploy --env staging
```

This deploys to: `https://goal-sync-staging.your-subdomain.workers.dev`

### Step 5: Configure Secrets (Optional for Demo)

For production with API key authentication:

```bash
npx wrangler secret put API_KEY --env staging
# Enter a secure random string when prompted
```

### Step 6: Test Deployment

```bash
# Test health endpoint
curl https://your-worker.workers.dev/health

# Expected response:
# {"status":"ok","version":"1.0.0","timestamp":1738368000000}
```

## Production Deployment

### Step 1: Create Production KV Namespace

```bash
npx wrangler kv:namespace create "SYNC_KV" --env production
```

Update `wrangler.toml` with the production ID.

### Step 2: Deploy to Production

```bash
npx wrangler deploy --env production
```

### Step 3: Configure Production Secrets

```bash
# Set production API key
npx wrangler secret put API_KEY --env production

# Verify secrets
npx wrangler secret list --env production
```

### Step 4: Configure Custom Domain (Optional)

In Cloudflare dashboard:
1. Go to Workers & Pages
2. Select your worker
3. Settings → Triggers
4. Add Custom Domain: `sync.yourdomain.com`

### Step 5: Update UserScript

Update the default server URL in the UserScript:

```javascript
const SYNC_DEFAULTS = {
    serverUrl: 'https://sync.yourdomain.com',  // ← Update this
    autoSync: false,
    syncInterval: 30
};
```

## Testing Deployment

### Manual Testing

```bash
# Test POST (upload config)
curl -X POST https://your-worker.workers.dev/sync \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "test-user-123",
    "deviceId": "device-1",
    "encryptedData": "encrypted-test-data",
    "timestamp": 1738368000000,
    "version": 1
  }'

# Expected response:
# {"success":true,"timestamp":1738368000000}

# Test GET (download config)
curl https://your-worker.workers.dev/sync/test-user-123

# Expected response:
# {"success":true,"data":{...}}

# Test DELETE
curl -X DELETE https://your-worker.workers.dev/sync/test-user-123

# Expected response:
# {"success":true,"message":"Config deleted"}
```

### Load Testing (Optional)

```bash
# Install Apache Bench
sudo apt-get install apache2-utils

# Test 1000 requests with 10 concurrent connections
ab -n 1000 -c 10 \
  -H "Content-Type: application/json" \
  -p payload.json \
  https://your-worker.workers.dev/sync
```

## Monitoring

### View Logs

```bash
# Tail live logs
npx wrangler tail --env production

# View recent errors
npx wrangler tail --env production --format json | grep error
```

### Metrics Dashboard

1. Go to Cloudflare dashboard
2. Workers & Pages → Your Worker
3. View metrics:
   - Requests per second
   - Success rate
   - CPU time
   - Errors

### Set Up Alerts

In Cloudflare dashboard:
1. Notifications → Add
2. Select "Worker Exceptions Rate"
3. Set threshold (e.g., > 10 errors/minute)
4. Add email/webhook notification

## Maintenance

### View Stored Data

```bash
# List all user IDs
npx wrangler kv:key list --binding=SYNC_KV --env production

# Get specific user's data
npx wrangler kv:key get sync_user:USER_ID --binding=SYNC_KV --env production
```

### Clear Old Data

```bash
# Delete specific user
npx wrangler kv:key delete sync_user:USER_ID --binding=SYNC_KV --env production

# Bulk delete (requires script)
npx wrangler kv:key list --binding=SYNC_KV --env production | \
  jq -r '.[] | .name' | \
  xargs -I {} npx wrangler kv:key delete {} --binding=SYNC_KV --env production
```

### Update Worker Code

```bash
# Pull latest code
git pull origin main

# Install dependencies
cd workers && npm install

# Deploy update
npx wrangler deploy --env production

# Verify deployment
curl https://your-worker.workers.dev/health
```

## Rollback Procedure

```bash
# List recent deployments
npx wrangler deployments list --env production

# Rollback to previous version
npx wrangler rollback --deployment-id DEPLOYMENT_ID --env production
```

## Cost Estimation

### Cloudflare Workers Free Tier
- **Requests**: 100,000/day
- **Duration**: 10ms CPU time per request
- **Storage**: 1 GB KV storage

### Estimated Usage (1000 Users)
- **Sync frequency**: Every 30 minutes
- **Requests/day**: 1000 users × 48 syncs/day = 48,000 requests
- **Storage**: 1000 users × 1 KB = 1 MB
- **Cost**: $0/month (within free tier)

### Paid Tier (if needed)
- **$5/month** for 10M requests
- **$0.50/GB/month** for KV storage

## Troubleshooting

### Worker Not Responding

```bash
# Check worker status
npx wrangler deployments list

# View recent errors
npx wrangler tail --env production | grep -i error

# Redeploy
npx wrangler deploy --env production
```

### Rate Limiting Issues

Check rate limit configuration in `src/ratelimit.js`:

```javascript
const RATE_LIMITS = {
    '/sync': {
        POST: { limit: 10, window: 60 }  // ← Adjust if needed
    }
};
```

### KV Storage Issues

```bash
# Verify KV namespace exists
npx wrangler kv:namespace list

# Check KV binding in wrangler.toml
cat wrangler.toml | grep -A 5 kv_namespaces
```

### CORS Errors

Update `src/index.js`:

```javascript
const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',  // ← Change to specific domain in production
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-API-Key'
};
```

## Security Checklist

- [ ] API key configured (if using authentication)
- [ ] CORS restricted to specific domain (production only)
- [ ] Rate limiting enabled
- [ ] HTTPS enforced
- [ ] Monitoring alerts configured
- [ ] Secrets not in source code
- [ ] KV namespace ID not hardcoded
- [ ] Error messages don't leak sensitive info

## Self-Hosting Guide

Users can deploy their own backend:

1. **Fork repository**
2. **Clone fork**: `git clone https://github.com/your-username/goal-portfolio-viewer.git`
3. **Follow Quick Deploy** above
4. **Update UserScript** with your worker URL
5. **Generate your own API key** (optional)

Share your worker URL with your other devices only.

## Support

### Common Issues

**Q: Worker deployed but getting 404**  
A: Check the URL matches wrangler.toml route configuration.

**Q: "Exceeded daily request quota"**  
A: You hit the 100k/day limit. Upgrade to paid plan or optimize sync frequency.

**Q: KV namespace not found**  
A: Verify namespace ID in wrangler.toml matches `wrangler kv:namespace list` output.

**Q: Can't delete old workers**  
A: Use Cloudflare dashboard → Workers & Pages → Delete.

### Getting Help

- **Documentation**: [Cloudflare Workers Docs](https://developers.cloudflare.com/workers/)
- **Community**: [Cloudflare Discord](https://discord.gg/cloudflaredev)
- **Issues**: [GitHub Issues](https://github.com/laurenceputra/goal-portfolio-viewer/issues)

## Next Steps

After deployment:
1. Test with UserScript (see TESTING.md)
2. Configure user settings
3. Enable auto-sync
4. Monitor for 24 hours
5. Share with other devices

---

**Status**: ✅ Ready for deployment  
**Estimated Time**: 5-10 minutes for staging, 15 minutes for production  
**Cost**: $0/month for <100k requests/day
