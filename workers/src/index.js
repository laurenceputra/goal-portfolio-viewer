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
import {
METRIC_POINTS,
WORKER_ROUTE_DEFINITIONS,
completeRequestMetrics,
createRequestMetricsContext,
matchWorkerRoute,
recordFeatureMetric,
recordOutcomeMetric,
recordRequestMetric,
setRequestOutcome
} from './metrics.js';

const CONFIG = {
MAX_PAYLOAD_SIZE: 10 * 1024,
CORS_ORIGINS: 'https://app.sg.endowus.com,https://secure.fundsupermart.com',
SYNC_KV_BINDING: 'SYNC_KV',
VERSION: '1.2.0'
};

const CORS_MAX_AGE = {
'Access-Control-Max-Age': '86400'
};
const NO_STORE_HEADERS = {
'Cache-Control': 'no-store',
Pragma: 'no-cache'
};

function jsonResponseWithCors(data, status = 200, additionalHeaders = {}, env = {}) {
return jsonResponse(data, status, { ...CORS_MAX_AGE, ...additionalHeaders }, env);
}

async function handleHealth(_request, env) {
return jsonResponseWithCors({
status: 'ok',
version: CONFIG.VERSION,
timestamp: Date.now()
}, 200, {}, env);
}

const ROUTE_HANDLERS = Object.freeze({
health: handleHealth,
'auth-register': handleRegister,
'auth-login': handleLogin,
'auth-refresh': handleRefresh,
'sync-upload': handleSyncUpload,
'sync-download': handleSyncDownload,
'sync-delete': handleSyncDelete
});

export const ROUTES = Object.freeze(WORKER_ROUTE_DEFINITIONS.map(route => Object.freeze({
...route,
handler: ROUTE_HANDLERS[route.id]
})));

export const INDEX_METRICS_INSTRUMENTATION = Object.freeze([
METRIC_POINTS.routeRequestCount,
METRIC_POINTS.routeLatency,
METRIC_POINTS.routeOutcomeTotal,
METRIC_POINTS.successOutcome,
METRIC_POINTS.badRequestOutcome,
METRIC_POINTS.unauthorizedOutcome,
METRIC_POINTS.forbiddenOutcome,
METRIC_POINTS.payloadTooLargeOutcome,
METRIC_POINTS.internalErrorOutcome,
METRIC_POINTS.payloadSizeFeature,
METRIC_POINTS.tokenVerifyFeature,
METRIC_POINTS.tokenIssueFeature
]);

const ROUTE_BY_ID = new Map(ROUTES.map(route => [route.id, route]));

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
const matched = matchWorkerRoute(method, pathname);
if (!matched) {
return null;
}
return {
...matched,
route: ROUTE_BY_ID.get(matched.route.id)
};
}

async function readJsonBody(request, env, route, metricsContext) {
try {
const contentLengthHeader = request.headers.get('Content-Length');
		if (contentLengthHeader) {
			const contentLength = Number(contentLengthHeader);
			if (Number.isFinite(contentLength)) {
				metricsContext.requestBytes = contentLength;
				if (contentLength > CONFIG.MAX_PAYLOAD_SIZE) {
					if (route.id === 'sync-upload') {
						recordFeatureMetric(env, METRIC_POINTS.payloadSizeFeature, route, { bytes: contentLength });
					}
					setRequestOutcome(metricsContext, 'payload_too_large');
					recordOutcomeMetric(env, METRIC_POINTS.payloadTooLargeOutcome, route, 413, {
						bytes: contentLength,
maxSize: CONFIG.MAX_PAYLOAD_SIZE
});
return {
ok: false,
response: jsonResponseWithCors({
success: false,
error: 'PAYLOAD_TOO_LARGE',
maxSize: CONFIG.MAX_PAYLOAD_SIZE
}, 413, {}, env)
};
}
}
}

if (!request.body) {
return { ok: true, data: {}, sizeBytes: 0 };
}

const reader = request.body.getReader();
const decoder = new TextDecoder();
const chunks = [];
let received = 0;

while (true) {
const { done, value } = await reader.read();
if (done) {
break;
}
if (value) {
received += value.byteLength;
if (received > CONFIG.MAX_PAYLOAD_SIZE) {
try {
reader.cancel();
} catch (_error) {
// Best-effort cancel
}
metricsContext.requestBytes = received;
if (route.id === 'sync-upload') {
recordFeatureMetric(env, METRIC_POINTS.payloadSizeFeature, route, { bytes: received });
}
setRequestOutcome(metricsContext, 'payload_too_large');
recordOutcomeMetric(env, METRIC_POINTS.payloadTooLargeOutcome, route, 413, {
bytes: received,
maxSize: CONFIG.MAX_PAYLOAD_SIZE
});
return {
ok: false,
response: jsonResponseWithCors({
success: false,
error: 'PAYLOAD_TOO_LARGE',
maxSize: CONFIG.MAX_PAYLOAD_SIZE
}, 413, {}, env)
};
}
chunks.push(value);
}
}

if (chunks.length === 0) {
metricsContext.requestBytes = metricsContext.requestBytes || 0;
return { ok: true, data: {}, sizeBytes: 0 };
}

let text = '';
for (const chunk of chunks) {
text += decoder.decode(chunk, { stream: true });
}
text += decoder.decode();
metricsContext.requestBytes = received;
if (route.id === 'sync-upload') {
recordFeatureMetric(env, METRIC_POINTS.payloadSizeFeature, route, { bytes: received });
}

if (!text) {
return { ok: true, data: {}, sizeBytes: received };
}
return { ok: true, data: JSON.parse(text), sizeBytes: received };
} catch (_error) {
setRequestOutcome(metricsContext, 'bad_request');
recordOutcomeMetric(env, METRIC_POINTS.badRequestOutcome, route, 400, {
reason: 'invalid_json'
});
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

export default {
async fetch(request, env) {
const resolvedEnv = {
...resolveEnv(env),
REQUEST_ORIGIN: request.headers.get('Origin')
};
const url = new URL(request.url);
const method = request.method;

if (method === 'OPTIONS') {
return new Response(null, {
status: 204,
headers: applyCorsHeaders(resolvedEnv, { ...CORS_MAX_AGE, ...NO_STORE_HEADERS })
});
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
const metricsContext = createRequestMetricsContext(request, route);
recordRequestMetric(resolvedEnv, metricsContext);

let authenticatedUserId = null;
if (route.authRequired) {
const authResult = await authenticateRequest(request, resolvedEnv);
if (!authResult.authenticated) {
setRequestOutcome(metricsContext, 'unauthorized');
recordOutcomeMetric(resolvedEnv, METRIC_POINTS.unauthorizedOutcome, route, 401, {
reason: 'invalid_access_token'
});
return completeRequestMetrics(resolvedEnv, metricsContext, jsonResponseWithCors({
success: false,
error: 'UNAUTHORIZED',
message: 'Invalid credentials'
}, 401, {}, resolvedEnv));
}
authenticatedUserId = authResult.userId;
recordFeatureMetric(resolvedEnv, METRIC_POINTS.tokenVerifyFeature, route, {
tokenType: 'access'
});
}

const rateLimitResult = await rateLimit(request, resolvedEnv, route, authenticatedUserId, metricsContext);
if (!rateLimitResult.allowed) {
return completeRequestMetrics(resolvedEnv, metricsContext, jsonResponseWithCors({
success: false,
error: 'RATE_LIMIT_EXCEEDED',
retryAfter: rateLimitResult.retryAfter
}, 429, {
'Retry-After': String(rateLimitResult.retryAfter)
}, resolvedEnv));
}

try {
const response = await route.handler(request, resolvedEnv, {
...params,
authenticatedUserId,
route,
metricsContext
});
return completeRequestMetrics(resolvedEnv, metricsContext, response);
} catch (error) {
console.error('Request error:', error);
setRequestOutcome(metricsContext, 'internal_error');
recordOutcomeMetric(resolvedEnv, METRIC_POINTS.internalErrorOutcome, route, 500, {
reason: 'uncaught_exception'
});
return completeRequestMetrics(resolvedEnv, metricsContext, jsonResponseWithCors({
success: false,
error: 'INTERNAL_ERROR',
message: resolvedEnv.ENVIRONMENT === 'production' ? 'Internal server error' : error.message
}, 500, {}, resolvedEnv));
}
}
};

async function handleRegister(request, env, { route, metricsContext }) {
const parsed = await readJsonBody(request, env, route, metricsContext);
if (!parsed.ok) {
return parsed.response;
}

const { userId, passwordHash } = parsed.data;
const result = await credentials.registerUser(userId, passwordHash, env);
if (!result.success) {
setRequestOutcome(metricsContext, 'bad_request');
recordOutcomeMetric(env, METRIC_POINTS.badRequestOutcome, route, 400, {
reason: result.message
});
}
return jsonResponseWithCors(result, result.success ? 200 : 400, {}, env);
}

async function handleLogin(request, env, { route, metricsContext }) {
const parsed = await readJsonBody(request, env, route, metricsContext);
if (!parsed.ok) {
return parsed.response;
}

try {
const { userId, passwordHash } = parsed.data;
const result = await credentials.loginUser(userId, passwordHash, env);
if (!result.success) {
setRequestOutcome(metricsContext, 'unauthorized');
recordOutcomeMetric(env, METRIC_POINTS.unauthorizedOutcome, route, 401, {
reason: 'invalid_credentials'
});
return jsonResponseWithCors(result, 401, {}, env);
}
const issuedTokens = await tokens.issueTokens(userId, env);
recordFeatureMetric(env, METRIC_POINTS.tokenIssueFeature, route, {
tokenType: 'access_refresh',
reason: 'login'
});
return jsonResponseWithCors({
...result,
tokens: issuedTokens
}, 200, {}, env);
} catch (error) {
setRequestOutcome(metricsContext, 'internal_error');
recordOutcomeMetric(env, METRIC_POINTS.internalErrorOutcome, route, 500, {
reason: 'login_exception'
});
return jsonResponseWithCors({
success: false,
error: 'INTERNAL_ERROR',
message: env.ENVIRONMENT === 'production' ? 'Internal server error' : error.message
}, 500, {}, env);
}
}

async function handleRefresh(request, env, { route, metricsContext }) {
try {
const refreshToken = getBearerToken(request);
if (!refreshToken) {
setRequestOutcome(metricsContext, 'unauthorized');
recordOutcomeMetric(env, METRIC_POINTS.unauthorizedOutcome, route, 401, {
reason: 'missing_refresh_token'
});
return jsonResponseWithCors({
success: false,
error: 'UNAUTHORIZED',
message: 'Missing refresh token'
}, 401, {}, env);
}

const payload = await tokens.verifyRefreshToken(refreshToken, env);
if (!payload) {
setRequestOutcome(metricsContext, 'unauthorized');
recordOutcomeMetric(env, METRIC_POINTS.unauthorizedOutcome, route, 401, {
reason: 'invalid_refresh_token'
});
return jsonResponseWithCors({
success: false,
error: 'UNAUTHORIZED',
message: 'Invalid refresh token'
}, 401, {}, env);
}

const issuedTokens = await tokens.issueTokens(payload.sub, env);
recordFeatureMetric(env, METRIC_POINTS.tokenIssueFeature, route, {
tokenType: 'access_refresh',
reason: 'refresh'
});
return jsonResponseWithCors({
success: true,
tokens: issuedTokens
}, 200, {}, env);
} catch (error) {
setRequestOutcome(metricsContext, 'internal_error');
recordOutcomeMetric(env, METRIC_POINTS.internalErrorOutcome, route, 500, {
reason: 'refresh_exception'
});
return jsonResponseWithCors({
success: false,
error: 'INTERNAL_ERROR',
message: env.ENVIRONMENT === 'production' ? 'Internal server error' : error.message
}, 500, {}, env);
}
}

async function handleSyncUpload(request, env, { authenticatedUserId, route, metricsContext }) {
const parsed = await readJsonBody(request, env, route, metricsContext);
if (!parsed.ok) {
return parsed.response;
}

const body = parsed.data;
if (authenticatedUserId && body.userId && body.userId !== authenticatedUserId) {
setRequestOutcome(metricsContext, 'forbidden');
recordOutcomeMetric(env, METRIC_POINTS.forbiddenOutcome, route, 403, {
reason: 'user_mismatch'
});
return jsonResponseWithCors({
success: false,
error: 'FORBIDDEN',
message: 'Cannot upload data for another user'
}, 403, {}, env);
}

return handleSync(body, env, { route, metricsContext });
}

async function handleSyncDownload(_request, env, { userId, authenticatedUserId, route, metricsContext }) {
if (!userId) {
setRequestOutcome(metricsContext, 'bad_request');
recordOutcomeMetric(env, METRIC_POINTS.badRequestOutcome, route, 400, {
reason: 'userId_required'
});
return jsonResponseWithCors({
success: false,
error: 'BAD_REQUEST',
message: 'userId required'
}, 400, {}, env);
}
if (authenticatedUserId && userId !== authenticatedUserId) {
setRequestOutcome(metricsContext, 'forbidden');
recordOutcomeMetric(env, METRIC_POINTS.forbiddenOutcome, route, 403, {
reason: 'user_mismatch'
});
return jsonResponseWithCors({
success: false,
error: 'FORBIDDEN',
message: 'Cannot access another user\'s data'
}, 403, {}, env);
}

return handleGetSync(userId, env, { route, metricsContext });
}

async function handleSyncDelete(_request, env, { userId, authenticatedUserId, route, metricsContext }) {
if (!userId) {
setRequestOutcome(metricsContext, 'bad_request');
recordOutcomeMetric(env, METRIC_POINTS.badRequestOutcome, route, 400, {
reason: 'userId_required'
});
return jsonResponseWithCors({
success: false,
error: 'BAD_REQUEST',
message: 'userId required'
}, 400, {}, env);
}
if (authenticatedUserId && userId !== authenticatedUserId) {
setRequestOutcome(metricsContext, 'forbidden');
recordOutcomeMetric(env, METRIC_POINTS.forbiddenOutcome, route, 403, {
reason: 'user_mismatch'
});
return jsonResponseWithCors({
success: false,
error: 'FORBIDDEN',
message: 'Cannot delete another user\'s data'
}, 403, {}, env);
}

return handleDeleteSync(userId, env, { route, metricsContext });
}
