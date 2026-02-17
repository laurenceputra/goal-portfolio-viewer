/**
 * Cloudflare Workers Sync API
 * 
 * Privacy-first sync backend for Goal Portfolio Viewer
 * Server never sees plaintext data - all encryption happens client-side
 */

import { handleSync, handleGetSync, handleDeleteSync } from './handlers.js';
import { credentials, tokens } from './auth.js';
import { rateLimit } from './ratelimit.js';
import { applyCorsHeaders } from './cors.js';
import { jsonResponse } from './responses.js';

// Configuration
const CONFIG = {
	MAX_PAYLOAD_SIZE: 10 * 1024, // 10KB
	CORS_ORIGINS: 'https://app.sg.endowus.com,https://secure.fundsupermart.com',
	SYNC_KV_BINDING: 'SYNC_KV',
		VERSION: '1.1.1'
};

// CORS headers
const CORS_MAX_AGE = {
	'Access-Control-Max-Age': '86400' // 24 hours
};

function jsonResponseWithCors(data, status = 200, additionalHeaders = {}, env = {}) {
	return jsonResponse(data, status, { ...CORS_MAX_AGE, ...additionalHeaders }, env);
}

const ROUTES = [
	{ method: 'POST', path: '/auth/register', handler: handleRegister },
	{ method: 'POST', path: '/auth/login', handler: handleLogin },
	{ method: 'POST', path: '/auth/refresh', handler: handleRefresh },
	{ method: 'POST', path: '/sync', authRequired: true, handler: handleSyncUpload },
	{ method: 'GET', path: /^\/sync\/(.+)$/, authRequired: true, handler: handleSyncDownload },
	{ method: 'DELETE', path: /^\/sync\/(.+)$/, authRequired: true, handler: handleSyncDelete }
];

function resolveEnv(env = {}) {
	return {
		...env,
		CORS_ORIGINS: env.CORS_ORIGINS || CONFIG.CORS_ORIGINS,
		SYNC_KV_BINDING: env.SYNC_KV_BINDING || CONFIG.SYNC_KV_BINDING
	};
}

function getBearerToken(request) {
	const authHeader = request.headers.get('Authorization');
	if (!authHeader) {
		return null;
	}
	const match = authHeader.match(/^Bearer\s+(.+)$/i);
	return match ? match[1] : null;
}

function matchRoute(method, pathname) {
	for (const route of ROUTES) {
		if (route.method !== method) {
			continue;
		}
		if (route.path instanceof RegExp) {
			const match = pathname.match(route.path);
			if (match) {
				return { route, params: { userId: match[1] } };
			}
			continue;
		}
		if (route.path === pathname) {
			return { route, params: {} };
		}
	}
	return null;
}

async function readJsonBody(request, env) {
	try {
		return { ok: true, data: await request.json() };
	} catch (_error) {
		return {
			ok: false,
			response: jsonResponseWithCors({
				success: false,
				error: 'BAD_REQUEST',
				message: 'Invalid JSON in request body'
			}, 400, {}, env)
		};
	}
}

async function authenticateRequest(request, env) {
	const accessToken = getBearerToken(request);
	if (!accessToken) {
		return { authenticated: false, userId: null };
	}
	const payload = await tokens.verifyAccessToken(accessToken, env);
	if (!payload) {
		return { authenticated: false, userId: null };
	}
	return { authenticated: true, userId: payload.sub };
}

/**
 * Main request handler
 */
export default {
	async fetch(request, env, ctx) {
		const resolvedEnv = {
			...resolveEnv(env),
			REQUEST_ORIGIN: request.headers.get('Origin')
		};
		const url = new URL(request.url);
		const method = request.method;

		// Handle CORS preflight
		if (method === 'OPTIONS') {
			return new Response(null, {
				status: 204,
				headers: applyCorsHeaders(resolvedEnv, CORS_MAX_AGE)
			});
		}

		// Health check endpoint (no auth required)
		if (url.pathname === '/health') {
			return jsonResponseWithCors({
				status: 'ok',
				version: CONFIG.VERSION,
				timestamp: Date.now()
			}, 200, {}, resolvedEnv);
		}

		const matched = matchRoute(method, url.pathname);
		if (!matched) {
			return jsonResponseWithCors({
				success: false,
				error: 'NOT_FOUND',
				message: 'Endpoint not found'
			}, 404, {}, resolvedEnv);
		}

		const { route, params } = matched;

		let authenticatedUserId = null;
		if (route.authRequired) {
			const authResult = await authenticateRequest(request, resolvedEnv);
			if (!authResult.authenticated) {
				return jsonResponseWithCors({
					success: false,
					error: 'UNAUTHORIZED',
					message: 'Invalid credentials'
				}, 401, {}, resolvedEnv);
			}
			authenticatedUserId = authResult.userId;
		}

		const rateLimitResult = await rateLimit(request, resolvedEnv, url.pathname, authenticatedUserId);
		if (!rateLimitResult.allowed) {
			return jsonResponseWithCors({
				success: false,
				error: 'RATE_LIMIT_EXCEEDED',
				retryAfter: rateLimitResult.retryAfter
			}, 429, {
				'Retry-After': String(rateLimitResult.retryAfter)
			}, resolvedEnv);
		}

		try {
			return await route.handler(request, resolvedEnv, { ...params, authenticatedUserId });
		} catch (error) {
			console.error('Request error:', error);
			return jsonResponseWithCors({
				success: false,
				error: 'INTERNAL_ERROR',
				message: resolvedEnv.ENVIRONMENT === 'production' ? 'Internal server error' : error.message
			}, 500, {}, resolvedEnv);
		}
	}
};

async function handleRegister(request, env) {
	const parsed = await readJsonBody(request, env);
	if (!parsed.ok) {
		return parsed.response;
	}

	const { userId, passwordHash } = parsed.data;
	const result = await credentials.registerUser(userId, passwordHash, env);
	return jsonResponseWithCors(result, result.success ? 200 : 400, {}, env);
}

async function handleLogin(request, env) {
	const parsed = await readJsonBody(request, env);
	if (!parsed.ok) {
		return parsed.response;
	}

	try {
		const { userId, passwordHash } = parsed.data;
		const result = await credentials.loginUser(userId, passwordHash, env);
		if (!result.success) {
			return jsonResponseWithCors(result, 401, {}, env);
		}
		const issuedTokens = await tokens.issueTokens(userId, env);
		return jsonResponseWithCors({
			...result,
			tokens: issuedTokens
		}, 200, {}, env);
	} catch (error) {
		return jsonResponseWithCors({
			success: false,
			error: 'INTERNAL_ERROR',
			message: env.ENVIRONMENT === 'production' ? 'Internal server error' : error.message
		}, 500, {}, env);
	}
}

async function handleRefresh(request, env) {
	try {
		const refreshToken = getBearerToken(request);
		if (!refreshToken) {
			return jsonResponseWithCors({
				success: false,
				error: 'UNAUTHORIZED',
				message: 'Missing refresh token'
			}, 401, {}, env);
		}

		const payload = await tokens.verifyRefreshToken(refreshToken, env);
		if (!payload) {
			return jsonResponseWithCors({
				success: false,
				error: 'UNAUTHORIZED',
				message: 'Invalid refresh token'
			}, 401, {}, env);
		}

		const issuedTokens = await tokens.issueTokens(payload.sub, env);
		return jsonResponseWithCors({
			success: true,
			tokens: issuedTokens
		}, 200, {}, env);
	} catch (error) {
		return jsonResponseWithCors({
			success: false,
			error: 'INTERNAL_ERROR',
			message: env.ENVIRONMENT === 'production' ? 'Internal server error' : error.message
		}, 500, {}, env);
	}
}

async function handleSyncUpload(request, env, { authenticatedUserId }) {
	const contentLength = request.headers.get('Content-Length');
	if (contentLength && parseInt(contentLength, 10) > CONFIG.MAX_PAYLOAD_SIZE) {
		return jsonResponseWithCors({
			success: false,
			error: 'PAYLOAD_TOO_LARGE',
			maxSize: CONFIG.MAX_PAYLOAD_SIZE
		}, 413, {}, env);
	}

	const parsed = await readJsonBody(request, env);
	if (!parsed.ok) {
		return parsed.response;
	}

	const body = parsed.data;
	if (authenticatedUserId && body.userId && body.userId !== authenticatedUserId) {
		return jsonResponseWithCors({
			success: false,
			error: 'FORBIDDEN',
			message: 'Cannot upload data for another user'
		}, 403, {}, env);
	}

	return handleSync(body, env);
}

async function handleSyncDownload(_request, env, { userId, authenticatedUserId }) {
	if (!userId) {
		return jsonResponseWithCors({
			success: false,
			error: 'BAD_REQUEST',
			message: 'userId required'
		}, 400, {}, env);
	}
	if (authenticatedUserId && userId !== authenticatedUserId) {
		return jsonResponseWithCors({
			success: false,
			error: 'FORBIDDEN',
			message: 'Cannot access another user\'s data'
		}, 403, {}, env);
	}

	return handleGetSync(userId, env);
}

async function handleSyncDelete(_request, env, { userId, authenticatedUserId }) {
	if (!userId) {
		return jsonResponseWithCors({
			success: false,
			error: 'BAD_REQUEST',
			message: 'userId required'
		}, 400, {}, env);
	}
	if (authenticatedUserId && userId !== authenticatedUserId) {
		return jsonResponseWithCors({
			success: false,
			error: 'FORBIDDEN',
			message: 'Cannot delete another user\'s data'
		}, 403, {}, env);
	}

	return handleDeleteSync(userId, env);
}

/**
 * Helper to create JSON responses with CORS headers
 */
