/**
 * Authentication middleware
 * Validates API keys for secure access
 */

/**
 * Validate API key
 * 
 * In production, this should compare against stored API keys.
 * For simplicity, this validates against a single API_KEY secret.
 * 
 * For multi-user scenarios, implement:
 * - Store API keys in KV with metadata (user, created_at, permissions)
 * - Hash API keys before storage (bcrypt/scrypt)
 * - Support key rotation
 * - Track key usage for auditing
 */
export function validateApiKey(apiKey, env) {
	if (!apiKey) {
		return false;
	}

	// Check against stored secret
	// Note: env.API_KEY is set via `wrangler secret put API_KEY`
	const validKey = env.API_KEY;
	if (!validKey) {
		console.error('API_KEY secret not configured');
		return false;
	}

	// Constant-time comparison to prevent timing attacks
	return timingSafeEqual(apiKey, validKey);
}

/**
 * Timing-safe string comparison
 * Prevents timing attacks by always comparing full strings
 */
function timingSafeEqual(a, b) {
	if (a.length !== b.length) {
		return false;
	}

	let result = 0;
	for (let i = 0; i < a.length; i++) {
		result |= a.charCodeAt(i) ^ b.charCodeAt(i);
	}

	return result === 0;
}

/**
 * Generate API key (utility function, not used in runtime)
 * 
 * Usage (in Node.js):
 * ```
 * node -e "console.log('sk_live_' + require('crypto').randomBytes(32).toString('base64url'))"
 * ```
 * 
 * Then store as secret:
 * ```
 * npx wrangler secret put API_KEY
 * ```
 */
export function generateApiKey() {
	// This is a reference implementation
	// In practice, generate keys server-side or via CLI
	const randomBytes = new Uint8Array(32);
	crypto.getRandomValues(randomBytes);
	const base64 = btoa(String.fromCharCode(...randomBytes));
	const urlSafe = base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
	return `sk_live_${urlSafe}`;
}

/**
 * Future: Multi-user API key management
 * 
 * For production deployments serving multiple users, implement:
 * 
 * 1. Store API keys in KV:
 *    Key: `api_key:${hashedKey}`
 *    Value: { userId, createdAt, permissions, usageCount }
 * 
 * 2. Hash keys before storage:
 *    Use subtle.crypto.digest('SHA-256', ...) for hashing
 * 
 * 3. Validate against KV:
 *    async function validateApiKey(apiKey, env) {
 *      const hash = await hashApiKey(apiKey);
 *      const keyData = await env.SYNC_KV.get(`api_key:${hash}`, 'json');
 *      if (!keyData) return false;
 *      
 *      // Update usage counter
 *      keyData.usageCount++;
 *      keyData.lastUsed = Date.now();
 *      await env.SYNC_KV.put(`api_key:${hash}`, JSON.stringify(keyData));
 *      
 *      return true;
 *    }
 * 
 * 4. Provide key management endpoints:
 *    - POST /keys - Generate new key
 *    - GET /keys - List user's keys (masked)
 *    - DELETE /keys/:id - Revoke key
 *    - POST /keys/:id/rotate - Rotate key
 */
