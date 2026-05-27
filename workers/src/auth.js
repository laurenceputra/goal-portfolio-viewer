/**
 * Authentication middleware
 * Validates passwords for secure access
 */

import { getKvBinding } from './kv.js';

const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
const REFRESH_TOKEN_TTL_SECONDS = 60 * 24 * 60 * 60;
const USER_ID_PATTERNS = Object.freeze([
	/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
	/^[a-zA-Z0-9_-]{3,50}$/
]);
const USER_ID_VALIDATION_MESSAGE = 'Invalid userId format. Use email or alphanumeric with underscores/hyphens (3-50 chars)';

function isValidUserId(userId) {
	return typeof userId === 'string' && USER_ID_PATTERNS.some(pattern => pattern.test(userId));
}

function validateAuthRequest(userId, passwordHash) {
	if (!userId || !passwordHash) {
		return {
			valid: false,
			error: 'BAD_REQUEST',
			message: 'userId and passwordHash required'
		};
	}

	if (!isValidUserId(userId)) {
		return {
			valid: false,
			error: 'BAD_REQUEST',
			message: USER_ID_VALIDATION_MESSAGE
		};
	}

	return { valid: true };
}

/**
 * Derive a slow hash from the incoming password hash for storage
 * Uses PBKDF2 with high iterations and per-user salt
 * 
 * @param {string} passwordHash - SHA-256 hash from client
 * @param {string} salt - Hex-encoded random salt (per-user)
 * @returns {Promise<string>} - Hex-encoded PBKDF2 hash
 */
async function deriveStorageHash(passwordHash, salt) {
	const encoder = new TextEncoder();
	const keyMaterial = await crypto.subtle.importKey(
		'raw',
		encoder.encode(passwordHash),
		{ name: 'PBKDF2' },
		false,
		['deriveBits']
	);

	const saltBytes = hexToBytes(salt);
	const derivedBits = await crypto.subtle.deriveBits(
		{
			name: 'PBKDF2',
			salt: saltBytes,
			iterations: 100000, // High iteration count for slow hashing
			hash: 'SHA-256'
		},
		keyMaterial,
		256 // 32 bytes
	);

	return bytesToHex(new Uint8Array(derivedBits));
}

/**
 * Convert hex string to Uint8Array
 */
function hexToBytes(hex) {
	const bytes = new Uint8Array(hex.length / 2);
	for (let i = 0; i < hex.length; i += 2) {
		bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
	}
	return bytes;
}

/**
 * Convert Uint8Array to hex string
 */
function bytesToHex(bytes) {
	return Array.from(bytes)
		.map(b => b.toString(16).padStart(2, '0'))
		.join('');
}

/**
 * Generate a random salt (hex-encoded)
 */
function generateSalt() {
	const saltBytes = new Uint8Array(16); // 128 bits
	crypto.getRandomValues(saltBytes);
	return bytesToHex(saltBytes);
}

/**
 * Validate password hash against stored user credentials
 * 
 * @param {string} userId - User identifier (email or username)
 * @param {string} passwordHash - SHA-256 hash of password from client
 * @param {Object} env - Cloudflare Workers environment (includes KV binding)
 * @returns {Promise<boolean>} - True if valid, false otherwise
 */
export async function validatePassword(userId, passwordHash, env) {
	if (!userId || !passwordHash || !isValidUserId(userId)) {
		return false;
	}

	// Retrieve user credentials from KV
	const userKey = `user:${userId}`;
	const userData = await getKvBinding(env).get(userKey, 'json');
	
	if (!userData) {
		return false;
	}

	// Verify hardened password storage
	if (!userData.salt || !userData.derivedHash) {
		// Missing required fields
		return false;
	}

	// Derive storage hash from incoming hash and compare
	const derivedHash = await deriveStorageHash(passwordHash, userData.salt);
	return timingSafeEqual(derivedHash, userData.derivedHash);
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

function base64UrlEncode(input) {
	const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input;
	const binary = Array.from(bytes).map(b => String.fromCharCode(b)).join('');
	return btoa(binary)
		.replace(/\+/g, '-')
		.replace(/\//g, '_')
		.replace(/=+$/g, '');
}

function base64UrlDecodeToString(input) {
	if (!input || typeof input !== 'string') {
		return null;
	}
	const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
	const padding = '='.repeat((4 - (normalized.length % 4)) % 4);
	try {
		return atob(normalized + padding);
	} catch (_error) {
		return null;
	}
}

async function signJwt(data, secret) {
	const key = await crypto.subtle.importKey(
		'raw',
		new TextEncoder().encode(secret),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign']
	);
	const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
	return base64UrlEncode(new Uint8Array(signature));
}

async function createJwt(payload, secret) {
	const header = { alg: 'HS256', typ: 'JWT' };
	const encodedHeader = base64UrlEncode(JSON.stringify(header));
	const encodedPayload = base64UrlEncode(JSON.stringify(payload));
	const data = `${encodedHeader}.${encodedPayload}`;
	const signature = await signJwt(data, secret);
	return `${data}.${signature}`;
}

async function verifyJwt(token, secret) {
	if (!token || typeof token !== 'string') {
		return null;
	}
	const parts = token.split('.');
	if (parts.length !== 3) {
		return null;
	}
	const [encodedHeader, encodedPayload, signature] = parts;
	const data = `${encodedHeader}.${encodedPayload}`;
	const expectedSignature = await signJwt(data, secret);
	if (!timingSafeEqual(signature, expectedSignature)) {
		return null;
	}
	const decodedPayload = base64UrlDecodeToString(encodedPayload);
	if (!decodedPayload) {
		return null;
	}
	let payload;
	try {
		payload = JSON.parse(decodedPayload);
	} catch (_error) {
		return null;
	}
	if (payload.exp && typeof payload.exp === 'number') {
		const now = Math.floor(Date.now() / 1000);
		if (now >= payload.exp) {
			return null;
		}
	}
	return payload;
}

function getJwtSecret(env) {
	const secret = env.JWT_SECRET;
	if (!secret) {
		throw new Error('JWT_SECRET is not configured');
	}
	return secret;
}

async function verifyJwtWithType(token, expectedType, env) {
	const secret = getJwtSecret(env);
	const payload = await verifyJwt(token, secret);
	if (!payload || payload.type !== expectedType || !payload.sub) {
		return null;
	}
	return payload;
}

export async function issueTokens(userId, env) {
	const secret = getJwtSecret(env);
	const now = Math.floor(Date.now() / 1000);
	const accessExp = now + ACCESS_TOKEN_TTL_SECONDS;
	const refreshExp = now + REFRESH_TOKEN_TTL_SECONDS;

	const accessToken = await createJwt({
		sub: userId,
		type: 'access',
		iat: now,
		exp: accessExp
	}, secret);

	const refreshToken = await createJwt({
		sub: userId,
		type: 'refresh',
		iat: now,
		exp: refreshExp
	}, secret);

	return {
		accessToken,
		refreshToken,
		accessExpiresAt: accessExp * 1000,
		refreshExpiresAt: refreshExp * 1000
	};
}

export async function verifyAccessToken(token, env) {
	return verifyJwtWithType(token, 'access', env);
}

export async function verifyRefreshToken(token, env) {
	return verifyJwtWithType(token, 'refresh', env);
}

/**
 * Register a new user
 * 
 * @param {string} userId - User identifier (email or username)
 * @param {string} passwordHash - SHA-256 hash of password from client
 * @param {Object} env - Cloudflare Workers environment
 * @returns {Promise<Object>} - { success: boolean, message: string }
 */
export async function registerUser(userId, passwordHash, env) {
	const validation = validateAuthRequest(userId, passwordHash);
	if (!validation.valid) {
		return {
			success: false,
			error: validation.error,
			message: validation.message
		};
	}

	// Check if user already exists
	const userKey = `user:${userId}`;
	const kv = getKvBinding(env);
	const existing = await kv.get(userKey);
	
	if (existing) {
		return { success: false, message: 'User already exists' };
	}

	// Generate per-user salt
	const salt = generateSalt();

	// Derive storage hash using PBKDF2 (slow hash)
	// This protects against offline brute-force if KV is leaked
	const derivedHash = await deriveStorageHash(passwordHash, salt);

	// Store user credentials with salt and derived hash
	const userData = {
		salt, // Per-user random salt
		derivedHash, // PBKDF2(passwordHash, salt, 100k iterations)
		createdAt: Date.now(),
		lastLogin: null
	};

	await kv.put(userKey, JSON.stringify(userData));

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
	const validation = validateAuthRequest(userId, passwordHash);
	if (!validation.valid) {
		return {
			success: false,
			error: validation.error,
			message: validation.message
		};
	}

	const isValid = await validatePassword(userId, passwordHash, env);
	
	if (!isValid) {
		return { success: false, error: 'UNAUTHORIZED', message: 'Invalid credentials' };
	}

	// Update last login time
	const userKey = `user:${userId}`;
	const kv = getKvBinding(env);
	const userData = await kv.get(userKey, 'json');
	
	if (userData) {
		userData.lastLogin = Date.now();
		await kv.put(userKey, JSON.stringify(userData));
	}

	return { success: true, message: 'Login successful' };
}

export const credentials = {
	registerUser,
	loginUser,
	validatePassword
};

export const tokens = {
	issueTokens,
	verifyAccessToken,
	verifyRefreshToken
};
