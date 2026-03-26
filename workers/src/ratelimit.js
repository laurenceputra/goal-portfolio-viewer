/**
 * Rate limiting middleware
 * 
 * Prevents abuse by limiting request rates per user or IP
 * Uses Cloudflare KV for distributed rate limiting
 */

import { getKvBinding } from './kv.js';
import {
	METRIC_POINTS,
	getRouteDefinition,
	normalizeRoutePath,
	recordFeatureMetric,
	recordOutcomeMetric,
	setRequestOutcome
} from './metrics.js';

const RATE_LIMITS = {
'/auth/register': {
POST: { limit: 5, window: 300 }
},
'/auth/login': {
POST: { limit: 10, window: 60 }
},
'/auth/refresh': {
POST: { limit: 30, window: 60 }
},
'/sync': {
POST: { limit: 10, window: 60 }
},
'/sync/:userId': {
GET: { limit: 60, window: 60 },
DELETE: { limit: 5, window: 60 }
}
};

const MIN_KV_TTL_SECONDS = 60;

export const RATELIMIT_METRICS_INSTRUMENTATION = Object.freeze([
	METRIC_POINTS.rateLimitOutcome,
	METRIC_POINTS.rateLimitHitFeature
]);

function resolveRoute(method, routeOrPathname) {
if (routeOrPathname && typeof routeOrPathname === 'object' && routeOrPathname.id) {
return routeOrPathname;
}
const normalizedPath = normalizeRoutePath(routeOrPathname);
return getRouteDefinition(method, normalizedPath);
}

/**
 * Rate limit check
 */
export async function rateLimit(request, env, routeOrPathname, identifierOverride = null, metricsContext = null) {
const method = request.method;
const connectingIP = request.headers.get('CF-Connecting-IP');
const identifier = identifierOverride || connectingIP || 'unknown';
const route = resolveRoute(method, routeOrPathname);
const normalizedPath = route?.path || normalizeRoutePath(routeOrPathname);
const limitConfig = RATE_LIMITS[normalizedPath]?.[method];
if (!limitConfig) {
return { allowed: true };
}

const { limit, window } = limitConfig;
const rateLimitKey = `ratelimit:${identifier}:${normalizedPath}:${method}`;
const kv = getKvBinding(env);
const currentData = await kv.get(rateLimitKey, 'json');
const now = Date.now();

if (!currentData) {
await kv.put(
rateLimitKey,
JSON.stringify({ count: 1, resetAt: now + window * 1000 }),
{ expirationTtl: window }
);
return { allowed: true };
}

if (now >= currentData.resetAt) {
await kv.put(
rateLimitKey,
JSON.stringify({ count: 1, resetAt: now + window * 1000 }),
{ expirationTtl: window }
);
return { allowed: true };
}

if (currentData.count >= limit) {
const retryAfter = Math.ceil((currentData.resetAt - now) / 1000);
if (route) {
setRequestOutcome(metricsContext, 'rate_limit_exceeded');
recordOutcomeMetric(env, METRIC_POINTS.rateLimitOutcome, route, 429, { retryAfter });
recordFeatureMetric(env, METRIC_POINTS.rateLimitHitFeature, route, { retryAfter });
}
return { allowed: false, retryAfter };
}

const remainingSeconds = Math.ceil((currentData.resetAt - now) / 1000);
await kv.put(
rateLimitKey,
JSON.stringify({ count: currentData.count + 1, resetAt: currentData.resetAt }),
{ expirationTtl: Math.max(MIN_KV_TTL_SECONDS, remainingSeconds) }
);

return { allowed: true };
}

/**
 * Get rate limit status for an identifier (admin endpoint)
 */
export async function getRateLimitStatus(env, apiKey, pathname, method) {
const normalizedPath = normalizeRoutePath(pathname);
const rateLimitKey = `ratelimit:${apiKey}:${normalizedPath}:${method}`;
const kv = getKvBinding(env);
const data = await kv.get(rateLimitKey, 'json');

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
 * Reset rate limit for an identifier (admin endpoint)
 */
export async function resetRateLimit(env, apiKey, pathname, method) {
const normalizedPath = normalizeRoutePath(pathname);
const rateLimitKey = `ratelimit:${apiKey}:${normalizedPath}:${method}`;
const kv = getKvBinding(env);
await kv.delete(rateLimitKey);
}
