/**
 * Authentication middleware
 * Validates passwords for secure access
 */

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
	if (!userId || !passwordHash) {
		return false;
	}

	// Retrieve user credentials from KV
	const userKey = `user:${userId}`;
	const userData = await env.SYNC_KV.get(userKey, 'json');
	
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

/**
 * Register a new user
 * 
 * @param {string} userId - User identifier (email or username)
 * @param {string} passwordHash - SHA-256 hash of password from client
 * @param {Object} env - Cloudflare Workers environment
 * @returns {Promise<Object>} - { success: boolean, message: string }
 */
export async function registerUser(userId, passwordHash, env) {
	if (!userId || !passwordHash) {
		return { success: false, message: 'userId and passwordHash required' };
	}

	// Validate userId format (email or alphanumeric)
	if (!/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(userId) && 
	    !/^[a-zA-Z0-9_-]{3,50}$/.test(userId)) {
		return { success: false, message: 'Invalid userId format. Use email or alphanumeric (3-50 chars)' };
	}

	// Check if user already exists
	const userKey = `user:${userId}`;
	const existing = await env.SYNC_KV.get(userKey);
	
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

	await env.SYNC_KV.put(userKey, JSON.stringify(userData));

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
	const isValid = await validatePassword(userId, passwordHash, env);
	
	if (!isValid) {
		return { success: false, message: 'Invalid credentials' };
	}

	// Update last login time
	const userKey = `user:${userId}`;
	const userData = await env.SYNC_KV.get(userKey, 'json');
	
	if (userData) {
		userData.lastLogin = Date.now();
		await env.SYNC_KV.put(userKey, JSON.stringify(userData));
	}

	return { success: true, message: 'Login successful' };
}
