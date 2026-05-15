/**
 * KV Storage operations
 * 
 * Wrapper around Cloudflare KV for sync data persistence
 */

import { getKvBinding } from './kv.js';

const KEY_PREFIX = 'sync_user:';

/**
 * Get user config from KV
 * @param {Object} env - Environment with KV binding
 * @param {string} userId - User identifier
 * @returns {Promise<Object|null>} Config data or null if not found
 */
export async function getFromKV(env, userId) {
	const key = KEY_PREFIX + userId;
	const kv = getKvBinding(env);
	const value = await kv.get(key, 'json');
	return value;
}

/**
 * Store user config in KV
 * @param {Object} env - Environment with KV binding
 * @param {string} userId - User identifier
 * @param {Object} data - Config data to store
 */
export async function putToKV(env, userId, data) {
	const key = KEY_PREFIX + userId;
	
	// Add server-side metadata
	const valueWithMetadata = {
		...data,
		serverTimestamp: Date.now()
	};

	// Store in KV (no expiration - data persists until deleted)
	const kv = getKvBinding(env);
	await kv.put(key, JSON.stringify(valueWithMetadata));
}

/**
 * Delete user config from KV
 * @param {Object} env - Environment with KV binding
 * @param {string} userId - User identifier
 */
export async function deleteFromKV(env, userId) {
	const key = KEY_PREFIX + userId;
	const kv = getKvBinding(env);
	await kv.delete(key);
}
