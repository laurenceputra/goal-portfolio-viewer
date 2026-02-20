const DEFAULT_ORIGINS = [
	'https://app.sg.endowus.com',
	'https://secure.fundsupermart.com'
];
const ALLOWED_METHODS = 'GET, POST, DELETE, OPTIONS';
const ALLOWED_HEADERS = 'Content-Type, Authorization';

function parseAllowedOrigins(originsValue) {
	if (typeof originsValue !== 'string') {
		return [...DEFAULT_ORIGINS];
	}

	const parsed = originsValue
		.split(',')
		.map((origin) => origin.trim())
		.filter(Boolean);

	return parsed.length > 0 ? parsed : [...DEFAULT_ORIGINS];
}

function resolveAllowedOrigin(requestOrigin, allowedOrigins) {
	if (!requestOrigin) {
		return allowedOrigins[0] || null;
	}

	return allowedOrigins.includes(requestOrigin) ? requestOrigin : null;
}

export function buildCorsHeaders(env) {
	const allowedOrigins = parseAllowedOrigins(env?.CORS_ORIGINS);
	const allowedOrigin = resolveAllowedOrigin(env?.REQUEST_ORIGIN, allowedOrigins);
	const headers = {
		'Access-Control-Allow-Methods': ALLOWED_METHODS,
		'Access-Control-Allow-Headers': ALLOWED_HEADERS,
		Vary: 'Origin'
	};

	if (allowedOrigin) {
		headers['Access-Control-Allow-Origin'] = allowedOrigin;
	}

	return headers;
}

export function applyCorsHeaders(env, headers = {}) {
	const corsHeaders = buildCorsHeaders(env);
	const merged = {
		...corsHeaders,
		...headers
	};
	if (Object.prototype.hasOwnProperty.call(headers, 'Access-Control-Allow-Origin') && headers['Access-Control-Allow-Origin'] == null) {
		delete merged['Access-Control-Allow-Origin'];
	}
	return merged;
}
