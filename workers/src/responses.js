import { applyCorsHeaders } from './cors.js';

const NO_STORE_HEADERS = {
	'Cache-Control': 'no-store',
	Pragma: 'no-cache'
};

export function jsonResponse(data, status = 200, additionalHeaders = {}, env = {}) {
	return new Response(JSON.stringify(data), {
		status,
		headers: applyCorsHeaders(env, {
			'Content-Type': 'application/json',
			...NO_STORE_HEADERS,
			...additionalHeaders
		})
	});
}
