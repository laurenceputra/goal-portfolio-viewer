/**
 * Rate limiting middleware
 * 
 * Prevents abuse by limiting request rates per user or IP
 * Uses Cloudflare KV for distributed rate limiting
 */

import { getKvBinding } from './kv.js';

const RATE_LIMITS = {
	'/auth/register': {
		// POST /auth/register - Registration
		POST: { limit: 5, window: 300 }, // 5 registrations per 5 minutes
	},
	'/auth/login': {
		// POST /auth/login - Login
		POST: { limit: 10, window: 60 }, // 10 login attempts per minute
	},
	'/auth/refresh': {
		// POST /auth/refresh - Token refresh
		POST: { limit: 30, window: 60 }, // 30 refresh requests per minute
	},
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

const MIN_KV_TTL_SECONDS = 60;

/**
 * Rate limit check
 * @param {Request} request - Incoming request
 * @param {Object} env - Environment with KV binding
 * @param {string} pathname - Request pathname
 * @param {string|null} identifierOverride - Optional identifier to use for rate limiting
 * @returns {Promise<Object>} { allowed: boolean, retryAfter?: number }
 */
export async function rateLimit(request, env, pathname, identifierOverride = null) {
	const method = request.method;
	const connectingIP = request.headers.get('CF-Connecting-IP');

	// Prefer authenticated user identifier, fallback to IP for unauthenticated requests
	const identifier = identifierOverride || connectingIP || 'unknown';

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
	const rateLimitKey = `ratelimit:${identifier}:${normalizedPath}:${method}`;

	// Get current count
	const kv = getKvBinding(env);
	const currentData = await kv.get(rateLimitKey, 'json');
	const now = Date.now();

	if (!currentData) {
		// First request in window
		await kv.put(
			rateLimitKey,
			JSON.stringify({ count: 1, resetAt: now + window * 1000 }),
			{ expirationTtl: window }
		);
		return { allowed: true };
	}

	// Check if window has expired
	if (now >= currentData.resetAt) {
		// Window expired, reset counter
		await kv.put(
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
	const remainingSeconds = Math.ceil((currentData.resetAt - now) / 1000);
	await kv.put(
		rateLimitKey,
		JSON.stringify({ count: currentData.count + 1, resetAt: currentData.resetAt }),
		{ expirationTtl: Math.max(MIN_KV_TTL_SECONDS, remainingSeconds) }
	);

	return { allowed: true };
}
