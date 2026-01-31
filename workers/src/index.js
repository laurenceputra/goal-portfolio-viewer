/**
 * Cloudflare Workers Sync API
 * 
 * Privacy-first sync backend for Goal Portfolio Viewer
 * Server never sees plaintext data - all encryption happens client-side
 */

import { handleSync, handleGetSync, handleDeleteSync } from './handlers';
import { validateApiKey, validatePassword, registerUser, loginUser } from './auth';
import { rateLimit } from './ratelimit';

// Configuration
const CONFIG = {
	MAX_PAYLOAD_SIZE: 10 * 1024, // 10KB
	CORS_ORIGINS: '*', // In production, restrict to your domain
	VERSION: '1.0.0'
};

// CORS headers
const CORS_HEADERS = {
	'Access-Control-Allow-Origin': CONFIG.CORS_ORIGINS,
	'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
	'Access-Control-Allow-Headers': 'Content-Type, X-API-Key, X-Password-Hash, X-User-Id',
	'Access-Control-Max-Age': '86400' // 24 hours
};

/**
 * Main request handler
 */
export default {
	async fetch(request, env, ctx) {
		const url = new URL(request.url);
		const method = request.method;

		// Handle CORS preflight
		if (method === 'OPTIONS') {
			return new Response(null, {
				status: 204,
				headers: CORS_HEADERS
			});
		}

		// Health check endpoint (no auth required)
		if (url.pathname === '/health') {
			return jsonResponse({
				status: 'ok',
				version: CONFIG.VERSION,
				timestamp: Date.now()
			});
		}

		// Auth endpoints (rate limited but no auth required)
		if (method === 'POST' && url.pathname === '/auth/register') {
			// Rate limit registration attempts
			const rateLimitResult = await rateLimit(request, env, url.pathname);
			if (!rateLimitResult.allowed) {
				return jsonResponse({
					success: false,
					error: 'RATE_LIMIT_EXCEEDED',
					retryAfter: rateLimitResult.retryAfter
				}, 429, {
					'Retry-After': String(rateLimitResult.retryAfter)
				});
			}

			try {
				const body = await request.json();
				const { userId, passwordHash } = body;
				const result = await registerUser(userId, passwordHash, env);
				return jsonResponse(result, result.success ? 200 : 400);
			} catch (error) {
				return jsonResponse({
					success: false,
					error: 'BAD_REQUEST',
					message: 'Invalid JSON in request body'
				}, 400);
			}
		}

		if (method === 'POST' && url.pathname === '/auth/login') {
			// Rate limit login attempts
			const rateLimitResult = await rateLimit(request, env, url.pathname);
			if (!rateLimitResult.allowed) {
				return jsonResponse({
					success: false,
					error: 'RATE_LIMIT_EXCEEDED',
					retryAfter: rateLimitResult.retryAfter
				}, 429, {
					'Retry-After': String(rateLimitResult.retryAfter)
				});
			}

			try {
				const body = await request.json();
				const { userId, passwordHash } = body;
				const result = await loginUser(userId, passwordHash, env);
				return jsonResponse(result, result.success ? 200 : 401);
			} catch (error) {
				return jsonResponse({
					success: false,
					error: 'BAD_REQUEST',
					message: 'Invalid JSON in request body'
				}, 400);
			}
		}

		// All other endpoints require authentication
		// Support both password-based and legacy API key auth
		let authenticated = false;
		let authenticatedUserId = null; // Track which user is authenticated
		
		// Try password-based auth first
		const passwordHash = request.headers.get('X-Password-Hash');
		const headerUserId = request.headers.get('X-User-Id');
		if (passwordHash && headerUserId) {
			authenticated = await validatePassword(headerUserId, passwordHash, env);
			if (authenticated) {
				authenticatedUserId = headerUserId;
			}
		}
		
		// Fall back to legacy API key auth
		if (!authenticated) {
			const apiKey = request.headers.get('X-API-Key');
			authenticated = validateApiKey(apiKey, env);
			// Legacy API key has access to all users (backward compatibility)
		}
		
		if (!authenticated) {
			return jsonResponse({
				success: false,
				error: 'UNAUTHORIZED',
				message: 'Invalid credentials'
			}, 401);
		}

		// Rate limiting
		const rateLimitResult = await rateLimit(request, env, url.pathname);
		if (!rateLimitResult.allowed) {
			return jsonResponse({
				success: false,
				error: 'RATE_LIMIT_EXCEEDED',
				retryAfter: rateLimitResult.retryAfter
			}, 429, {
				'Retry-After': String(rateLimitResult.retryAfter)
			});
		}

		// Route handling
		try {
			// POST /sync - Upload config
			if (method === 'POST' && url.pathname === '/sync') {
				// Check payload size
				const contentLength = request.headers.get('Content-Length');
				if (contentLength && parseInt(contentLength) > CONFIG.MAX_PAYLOAD_SIZE) {
					return jsonResponse({
						success: false,
						error: 'PAYLOAD_TOO_LARGE',
						maxSize: CONFIG.MAX_PAYLOAD_SIZE
					}, 413);
				}

				const body = await request.json();
				
				// Authorization check: ensure authenticated user matches body.userId
				if (authenticatedUserId && body.userId && body.userId !== authenticatedUserId) {
					return jsonResponse({
						success: false,
						error: 'FORBIDDEN',
						message: 'Cannot upload data for another user'
					}, 403);
				}
				
				return await handleSync(body, env);
			}

			// GET /sync/:userId - Download config
			if (method === 'GET' && url.pathname.startsWith('/sync/')) {
				const userId = url.pathname.substring('/sync/'.length);
				if (!userId) {
					return jsonResponse({
						success: false,
						error: 'BAD_REQUEST',
						message: 'userId required'
					}, 400);
				}
				
				// Authorization check: ensure authenticated user matches requested userId
				if (authenticatedUserId && userId !== authenticatedUserId) {
					return jsonResponse({
						success: false,
						error: 'FORBIDDEN',
						message: 'Cannot access another user\'s data'
					}, 403);
				}
				
				return await handleGetSync(userId, env);
			}

			// DELETE /sync/:userId - Delete config
			if (method === 'DELETE' && url.pathname.startsWith('/sync/')) {
				const userId = url.pathname.substring('/sync/'.length);
				if (!userId) {
					return jsonResponse({
						success: false,
						error: 'BAD_REQUEST',
						message: 'userId required'
					}, 400);
				}
				
				// Authorization check: ensure authenticated user matches requested userId
				if (authenticatedUserId && userId !== authenticatedUserId) {
					return jsonResponse({
						success: false,
						error: 'FORBIDDEN',
						message: 'Cannot delete another user\'s data'
					}, 403);
				}
				
				return await handleDeleteSync(userId, env);
			}

			// Route not found
			return jsonResponse({
				success: false,
				error: 'NOT_FOUND',
				message: 'Endpoint not found'
			}, 404);

		} catch (error) {
			console.error('Request error:', error);
			return jsonResponse({
				success: false,
				error: 'INTERNAL_ERROR',
				message: env.ENVIRONMENT === 'production' ? 'Internal server error' : error.message
			}, 500);
		}
	}
};

/**
 * Helper to create JSON responses with CORS headers
 */
function jsonResponse(data, status = 200, additionalHeaders = {}) {
	return new Response(JSON.stringify(data), {
		status,
		headers: {
			'Content-Type': 'application/json',
			...CORS_HEADERS,
			...additionalHeaders
		}
	});
}
