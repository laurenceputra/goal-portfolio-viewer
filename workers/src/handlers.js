/**
 * Request handlers for sync endpoints
 */

import { getFromKV, putToKV, deleteFromKV } from './storage.js';
import { jsonResponse } from './responses.js';
import {
	METRIC_POINTS,
	getRouteDefinitionById,
	recordOutcomeMetric,
	setRequestOutcome
} from './metrics.js';

export const HANDLERS_METRICS_INSTRUMENTATION = Object.freeze([
	METRIC_POINTS.conflictOutcome,
	METRIC_POINTS.notFoundOutcome
]);

/**
 * Handle POST /sync - Upload encrypted config
 */
export async function handleSync(body, env, context = {}) {
const route = context.route || getRouteDefinitionById('sync-upload');
const metricsContext = context.metricsContext || null;
const validation = validateSyncRequest(body);
if (!validation.valid) {
setRequestOutcome(metricsContext, 'bad_request');
recordOutcomeMetric(env, METRIC_POINTS.badRequestOutcome, route, 400, {
reason: validation.error
});
return jsonResponse({
success: false,
error: 'BAD_REQUEST',
message: validation.error
}, 400, {}, env);
}

const { userId, deviceId, encryptedData, timestamp, version } = body;
const force = body.force === true;
const existing = await getFromKV(env, userId);
if (existing && existing.timestamp > timestamp && !force) {
setRequestOutcome(metricsContext, 'conflict');
recordOutcomeMetric(env, METRIC_POINTS.conflictOutcome, route, 409, {
conflictDetected: true,
forceUsed: false
});
return jsonResponse({
success: false,
error: 'CONFLICT',
message: 'Server has newer data',
serverData: existing
}, 409, {}, env);
}

const storedTimestamp = force ? Date.now() : timestamp;
const data = {
encryptedData,
deviceId,
timestamp: storedTimestamp,
version
};

await putToKV(env, userId, data);

return jsonResponse({
success: true,
timestamp: storedTimestamp
}, 200, {}, env);
}

/**
 * Handle GET /sync/:userId - Download encrypted config
 */
export async function handleGetSync(userId, env, context = {}) {
const route = context.route || getRouteDefinitionById('sync-download');
const metricsContext = context.metricsContext || null;
const data = await getFromKV(env, userId);

if (!data) {
setRequestOutcome(metricsContext, 'not_found');
recordOutcomeMetric(env, METRIC_POINTS.notFoundOutcome, route, 404);
return jsonResponse({
success: false,
error: 'NOT_FOUND',
message: 'No config found for user'
}, 404, {}, env);
}

return jsonResponse({
success: true,
data
}, 200, {}, env);
}

/**
 * Handle DELETE /sync/:userId - Delete config
 */
export async function handleDeleteSync(userId, env) {
await deleteFromKV(env, userId);

return jsonResponse({
success: true,
message: 'Config deleted'
}, 200, {}, env);
}

/**
 * Validate sync request body
 */
function validateSyncRequest(body) {
if (!body || typeof body !== 'object') {
return { valid: false, error: 'Request body must be JSON object' };
}

if (!body.userId || typeof body.userId !== 'string') {
return { valid: false, error: 'userId must be a non-empty string' };
}
if (!isValidUserId(body.userId)) {
return { valid: false, error: 'Invalid userId format. Use email or alphanumeric with underscores/hyphens (3-50 chars)' };
}

if (!body.deviceId || typeof body.deviceId !== 'string') {
return { valid: false, error: 'deviceId must be a non-empty string' };
}

if (!body.encryptedData || typeof body.encryptedData !== 'string') {
return { valid: false, error: 'encryptedData must be a non-empty string' };
}

if (!body.timestamp || typeof body.timestamp !== 'number' || body.timestamp <= 0) {
return { valid: false, error: 'timestamp must be a positive number' };
}

if (!body.version || typeof body.version !== 'number' || body.version < 1) {
return { valid: false, error: 'version must be a number >= 1' };
}

if (body.force !== undefined && typeof body.force !== 'boolean') {
return { valid: false, error: 'force must be a boolean when provided' };
}

const now = Date.now();
const maxSkew = 5 * 60 * 1000;
if (body.timestamp > now + maxSkew) {
return { valid: false, error: 'timestamp too far in the future' };
}

return { valid: true };
}

function isValidUserId(userId) {
return (/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(userId)
|| /^[a-zA-Z0-9_-]{3,50}$/.test(userId));
}
