/**
 * Rate limiting middleware
 * 
 * Prevents abuse by limiting request rates per API key
 * Uses Cloudflare KV for distributed rate limiting
 */

const RATE_LIMITS = {
	'/sync': {
		// POST /sync - Upload
		POST: { limit: 10, window: 60 }, // 10 requests per minute
	},
	'/sync/:userId': {
		// GET /sync/:userId - Download
		GET: { limit: 60, window: 60 }, // 60 requests per minute
		// DELETE /sync/:userId - Delete
		DELETE: { limit: 5, window: 60 } // 5 requests per minute
	}
};

/**
 * Rate limit check
 * @param {Request} request - Incoming request
 * @param {Object} env - Environment with KV binding
 * @param {string} pathname - Request pathname
 * @returns {Promise<Object>} { allowed: boolean, retryAfter?: number }
 */
export async function rateLimit(request, env, pathname) {
	const method = request.method;
	const apiKey = request.headers.get('X-API-Key');

	// Normalize pathname (replace dynamic segments)
	const normalizedPath = pathname.startsWith('/sync/') && pathname !== '/sync'
		? '/sync/:userId'
		: pathname;

	// Get rate limit config
	const limitConfig = RATE_LIMITS[normalizedPath]?.[method];
	if (!limitConfig) {
		// No rate limit configured for this endpoint
		return { allowed: true };
	}

	const { limit, window } = limitConfig;

	// Generate rate limit key
	const rateLimitKey = `ratelimit:${apiKey}:${normalizedPath}:${method}`;

	// Get current count
	const currentData = await env.SYNC_KV.get(rateLimitKey, 'json');
	const now = Date.now();

	if (!currentData) {
		// First request in window
		await env.SYNC_KV.put(
			rateLimitKey,
			JSON.stringify({ count: 1, resetAt: now + window * 1000 }),
			{ expirationTtl: window }
		);
		return { allowed: true };
	}

	// Check if window has expired
	if (now >= currentData.resetAt) {
		// Window expired, reset counter
		await env.SYNC_KV.put(
			rateLimitKey,
			JSON.stringify({ count: 1, resetAt: now + window * 1000 }),
			{ expirationTtl: window }
		);
		return { allowed: true };
	}

	// Check if limit exceeded
	if (currentData.count >= limit) {
		const retryAfter = Math.ceil((currentData.resetAt - now) / 1000);
		return { allowed: false, retryAfter };
	}

	// Increment counter
	await env.SYNC_KV.put(
		rateLimitKey,
		JSON.stringify({ count: currentData.count + 1, resetAt: currentData.resetAt }),
		{ expirationTtl: Math.ceil((currentData.resetAt - now) / 1000) }
	);

	return { allowed: true };
}

/**
 * Get rate limit status for an API key (admin endpoint)
 */
export async function getRateLimitStatus(env, apiKey, pathname, method) {
	const normalizedPath = pathname.startsWith('/sync/') && pathname !== '/sync'
		? '/sync/:userId'
		: pathname;

	const rateLimitKey = `ratelimit:${apiKey}:${normalizedPath}:${method}`;
	const data = await env.SYNC_KV.get(rateLimitKey, 'json');

	if (!data) {
		return {
			requests: 0,
			limit: RATE_LIMITS[normalizedPath]?.[method]?.limit || 'unlimited',
			resetAt: null
		};
	}

	return {
		requests: data.count,
		limit: RATE_LIMITS[normalizedPath]?.[method]?.limit || 'unlimited',
		resetAt: data.resetAt
	};
}

/**
 * Reset rate limit for an API key (admin endpoint)
 */
export async function resetRateLimit(env, apiKey, pathname, method) {
	const normalizedPath = pathname.startsWith('/sync/') && pathname !== '/sync'
		? '/sync/:userId'
		: pathname;

	const rateLimitKey = `ratelimit:${apiKey}:${normalizedPath}:${method}`;
	await env.SYNC_KV.delete(rateLimitKey);
}
