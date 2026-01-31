/**
 * Request handlers for sync endpoints
 */

import { getFromKV, putToKV, deleteFromKV } from './storage';

/**
 * Handle POST /sync - Upload encrypted config
 */
export async function handleSync(body, env) {
	// Validate request body
	const validation = validateSyncRequest(body);
	if (!validation.valid) {
		return jsonResponse({
			success: false,
			error: 'BAD_REQUEST',
			message: validation.error
		}, 400);
	}

	const { userId, deviceId, encryptedData, timestamp, version } = body;

	// Check for existing data (conflict detection)
	const existing = await getFromKV(env, userId);
	if (existing) {
		// Check if server has newer data
		if (existing.timestamp > timestamp) {
			// Server data is newer - conflict!
			return jsonResponse({
				success: false,
				error: 'CONFLICT',
				message: 'Server has newer data',
				serverData: existing
			}, 409);
		}
	}

	// Store new data
	const data = {
		encryptedData,
		deviceId,
		timestamp,
		version
	};

	await putToKV(env, userId, data);

	return jsonResponse({
		success: true,
		timestamp: timestamp
	});
}

/**
 * Handle GET /sync/:userId - Download encrypted config
 */
export async function handleGetSync(userId, env) {
	const data = await getFromKV(env, userId);

	if (!data) {
		return jsonResponse({
			success: false,
			error: 'NOT_FOUND',
			message: 'No config found for user'
		}, 404);
	}

	return jsonResponse({
		success: true,
		data: data
	});
}

/**
 * Handle DELETE /sync/:userId - Delete config
 */
export async function handleDeleteSync(userId, env) {
	await deleteFromKV(env, userId);

	return jsonResponse({
		success: true,
		message: 'Config deleted'
	});
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

	// Validate timestamp is not too far in the future (prevent clock skew attacks)
	const now = Date.now();
	const maxSkew = 5 * 60 * 1000; // 5 minutes
	if (body.timestamp > now + maxSkew) {
		return { valid: false, error: 'timestamp too far in the future' };
	}

	return { valid: true };
}

/**
 * Helper to create JSON responses
 */
function jsonResponse(data, status = 200) {
	return new Response(JSON.stringify(data), {
		status,
		headers: {
			'Content-Type': 'application/json'
		}
	});
}
