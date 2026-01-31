/**
 * Authentication middleware
 * Validates passwords for secure access
 */

/**
 * Validate password hash against stored user credentials
 * 
 * @param {string} userId - User identifier (email or username)
 * @param {string} passwordHash - SHA-256 hash of password
 * @param {Object} env - Cloudflare Workers environment (includes KV binding)
 * @returns {Promise<boolean>} - True if valid, false otherwise
 */
export async function validatePassword(userId, passwordHash, env) {
	if (!userId || !passwordHash) {
		return false;
	}

	// Retrieve user credentials from KV
	const userKey = `user:${userId}`;
	const userData = await env.SYNC_KV.get(userKey, 'json');
	
	if (!userData || !userData.passwordHash) {
		return false;
	}

	// Constant-time comparison to prevent timing attacks
	return timingSafeEqual(passwordHash, userData.passwordHash);
}

/**
 * Legacy: Validate API key (for backward compatibility)
 * 
 * This supports existing users with API keys.
 * New users should use password-based authentication.
 */
export function validateApiKey(apiKey, env) {
	if (!apiKey) {
		return false;
	}

	// Check against stored secret
	// Note: env.API_KEY is set via `wrangler secret put API_KEY`
	const validKey = env.API_KEY;
	if (!validKey) {
		return false; // No legacy API key configured
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
 * Register a new user
 * 
 * @param {string} userId - User identifier (email or username)
 * @param {string} passwordHash - SHA-256 hash of password
 * @param {Object} env - Cloudflare Workers environment
 * @returns {Promise<Object>} - { success: boolean, message: string }
 */
export async function registerUser(userId, passwordHash, env) {
	if (!userId || !passwordHash) {
		return { success: false, message: 'userId and passwordHash required' };
	}

	// Validate userId format (email or alphanumeric)
	if (!/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(userId) && 
	    !/^[a-zA-Z0-9_-]{3,50}$/.test(userId)) {
		return { success: false, message: 'Invalid userId format. Use email or alphanumeric (3-50 chars)' };
	}

	// Check if user already exists
	const userKey = `user:${userId}`;
	const existing = await env.SYNC_KV.get(userKey);
	
	if (existing) {
		return { success: false, message: 'User already exists' };
	}

	// Store user credentials
	const userData = {
		passwordHash,
		createdAt: Date.now(),
		lastLogin: null
	};

	await env.SYNC_KV.put(userKey, JSON.stringify(userData));

	return { success: true, message: 'User registered successfully' };
}

/**
 * Login (verify credentials)
 * 
 * @param {string} userId - User identifier
 * @param {string} passwordHash - SHA-256 hash of password
 * @param {Object} env - Cloudflare Workers environment
 * @returns {Promise<Object>} - { success: boolean, message: string }
 */
export async function loginUser(userId, passwordHash, env) {
	const isValid = await validatePassword(userId, passwordHash, env);
	
	if (!isValid) {
		return { success: false, message: 'Invalid credentials' };
	}

	// Update last login time
	const userKey = `user:${userId}`;
	const userData = await env.SYNC_KV.get(userKey, 'json');
	
	if (userData) {
		userData.lastLogin = Date.now();
		await env.SYNC_KV.put(userKey, JSON.stringify(userData));
	}

	return { success: true, message: 'Login successful' };
}
