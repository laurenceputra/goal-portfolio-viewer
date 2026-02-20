import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';

import worker from '../src/index.js';
import { tokens } from '../src/auth.js';

if (!globalThis.crypto) {
  globalThis.crypto = webcrypto;
}

if (!globalThis.btoa) {
  globalThis.btoa = (input) => Buffer.from(input, 'binary').toString('base64');
}

if (!globalThis.atob) {
  globalThis.atob = (input) => Buffer.from(input, 'base64').toString('binary');
}

async function parseJsonResponse(response) {
  return {
    status: response.status,
    headers: Object.fromEntries(response.headers.entries()),
    body: response.headers.get('content-type')?.includes('application/json')
      ? await response.json()
      : null
  };
}

function createKv() {
  const store = new Map();
  return {
    async get(key, type) {
      if (!store.has(key)) {
        return null;
      }
      const value = store.get(key);
      if (type === 'json') {
        try {
          return JSON.parse(value);
        } catch (_error) {
          return null;
        }
      }
      return value;
    },
    async put(key, value) {
      store.set(key, value);
    },
    async delete(key) {
      store.delete(key);
    }
  };
}

function createEnv(kvOverrides = {}) {
  return {
    SYNC_KV: createKv(),
    JWT_SECRET: 'test-secret',
    ...kvOverrides
  };
}

test('OPTIONS request returns CORS preflight response for allowed origin', async () => {
  const request = new Request('https://worker.example/sync', {
    method: 'OPTIONS',
    headers: {
      Origin: 'https://secure.fundsupermart.com'
    }
  });
  const response = await worker.fetch(request, {}, {});

  assert.equal(response.status, 204);
  assert.equal(response.headers.get('access-control-max-age'), '86400');
  assert.equal(response.headers.get('access-control-allow-origin'), 'https://secure.fundsupermart.com');
});

test('OPTIONS request omits allow-origin header for disallowed origin', async () => {
  const request = new Request('https://worker.example/sync', {
    method: 'OPTIONS',
    headers: {
      Origin: 'https://evil.example'
    }
  });

  const response = await worker.fetch(request, {}, {});

  assert.equal(response.status, 204);
  assert.equal(response.headers.get('access-control-allow-origin'), null);
});

test('GET /health returns status payload', async () => {
  const request = new Request('https://worker.example/health', { method: 'GET', headers: { Origin: 'https://secure.fundsupermart.com' } });
  const response = await worker.fetch(request, {}, {});
  const parsed = await parseJsonResponse(response);

  assert.equal(parsed.status, 200);
  assert.equal(parsed.body.status, 'ok');
  assert.ok(typeof parsed.body.timestamp === 'number');
  assert.equal(parsed.headers['access-control-allow-origin'], 'https://secure.fundsupermart.com');
});

test('POST /auth/login with invalid json returns bad request', async () => {
  const request = new Request('https://worker.example/auth/login', {
    method: 'POST',
    body: '{not-json',
    headers: {
      'Content-Type': 'application/json'
    }
  });

  const response = await worker.fetch(request, { SYNC_KV: { get: async () => null, put: async () => {} } }, {});
  const parsed = await parseJsonResponse(response);

  assert.equal(parsed.status, 400);
  assert.equal(parsed.body.error, 'BAD_REQUEST');
});

test('POST /auth/register supports success and validation failures', async () => {
  const env = createEnv();
  const validRequest = new Request('https://worker.example/auth/register', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ userId: 'tester@example.com', passwordHash: 'hash' })
  });

  const validResponse = await worker.fetch(validRequest, env, {});
  const validParsed = await parseJsonResponse(validResponse);

  assert.equal(validParsed.status, 200);
  assert.equal(validParsed.body.success, true);

  const invalidRequest = new Request('https://worker.example/auth/register', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ userId: 'invalid user', passwordHash: '' })
  });

  const invalidResponse = await worker.fetch(invalidRequest, env, {});
  const invalidParsed = await parseJsonResponse(invalidResponse);

  assert.equal(invalidParsed.status, 400);
  assert.equal(invalidParsed.body.success, false);
});

test('POST /auth/login returns tokens on success', async () => {
  const env = createEnv();
  const registerRequest = new Request('https://worker.example/auth/register', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ userId: 'login-user', passwordHash: 'hash' })
  });
  await worker.fetch(registerRequest, env, {});

  const loginRequest = new Request('https://worker.example/auth/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ userId: 'login-user', passwordHash: 'hash' })
  });

  const loginResponse = await worker.fetch(loginRequest, env, {});
  const loginParsed = await parseJsonResponse(loginResponse);

  assert.equal(loginParsed.status, 200);
  assert.ok(loginParsed.body.tokens.accessToken);
  assert.ok(loginParsed.body.tokens.refreshToken);
});

test('POST /auth/refresh handles missing, invalid, and valid tokens', async () => {
  const env = createEnv();
  const missingRequest = new Request('https://worker.example/auth/refresh', {
    method: 'POST'
  });

  const missingResponse = await worker.fetch(missingRequest, env, {});
  const missingParsed = await parseJsonResponse(missingResponse);

  assert.equal(missingParsed.status, 401);
  assert.equal(missingParsed.body.error, 'UNAUTHORIZED');

  const invalidRequest = new Request('https://worker.example/auth/refresh', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer invalid.token.value'
    }
  });

  const invalidResponse = await worker.fetch(invalidRequest, env, {});
  const invalidParsed = await parseJsonResponse(invalidResponse);

  assert.equal(invalidParsed.status, 401);

  const issuedTokens = await tokens.issueTokens('refresh-user', env);
  const validRequest = new Request('https://worker.example/auth/refresh', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${issuedTokens.refreshToken}`
    }
  });

  const validResponse = await worker.fetch(validRequest, env, {});
  const validParsed = await parseJsonResponse(validResponse);

  assert.equal(validParsed.status, 200);
  assert.ok(validParsed.body.tokens.accessToken);
});

test('POST /sync rejects payloads larger than MAX_PAYLOAD_SIZE', async () => {
  const env = createEnv();
  const issuedTokens = await tokens.issueTokens('payload-user', env);
  const request = new Request('https://worker.example/sync', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${issuedTokens.accessToken}`,
      'Content-Type': 'application/json',
      'Content-Length': String(10 * 1024 + 1)
    },
    body: JSON.stringify({ userId: 'payload-user', data: 'ok' })
  });

  const response = await worker.fetch(request, env, {});
  const parsed = await parseJsonResponse(response);

  assert.equal(parsed.status, 413);
  assert.equal(parsed.body.error, 'PAYLOAD_TOO_LARGE');
});

test('GET/DELETE /sync/:userId blocks access for mismatched authenticated user', async () => {
  const env = createEnv();
  const issuedTokens = await tokens.issueTokens('owner-user', env);
  const headers = {
    Authorization: `Bearer ${issuedTokens.accessToken}`
  };

  const getRequest = new Request('https://worker.example/sync/other-user', {
    method: 'GET',
    headers
  });

  const getResponse = await worker.fetch(getRequest, env, {});
  const getParsed = await parseJsonResponse(getResponse);

  assert.equal(getParsed.status, 403);
  assert.equal(getParsed.body.error, 'FORBIDDEN');

  const deleteRequest = new Request('https://worker.example/sync/other-user', {
    method: 'DELETE',
    headers
  });

  const deleteResponse = await worker.fetch(deleteRequest, env, {});
  const deleteParsed = await parseJsonResponse(deleteResponse);

  assert.equal(deleteParsed.status, 403);
});

test('unknown authenticated route returns 404', async () => {
  const env = createEnv();
  const issuedTokens = await tokens.issueTokens('route-user', env);
  const request = new Request('https://worker.example/unknown', {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${issuedTokens.accessToken}`
    }
  });

  const response = await worker.fetch(request, env, {});
  const parsed = await parseJsonResponse(response);

  assert.equal(parsed.status, 404);
  assert.equal(parsed.body.error, 'NOT_FOUND');
});

test('rate limit is enforced for authenticated requests', async () => {
  const env = createEnv();
  const issuedTokens = await tokens.issueTokens('limit-user', env);
  const rateLimitKey = 'ratelimit:limit-user:/sync/:userId:GET';
  const resetAt = Date.now() + 60_000;
  await env.SYNC_KV.put(rateLimitKey, JSON.stringify({ count: 60, resetAt }));

  const request = new Request('https://worker.example/sync/limit-user', {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${issuedTokens.accessToken}`
    }
  });

  const response = await worker.fetch(request, env, {});
  const parsed = await parseJsonResponse(response);

  assert.equal(parsed.status, 429);
  assert.equal(parsed.body.error, 'RATE_LIMIT_EXCEEDED');
});

test('unauthenticated sync request returns unauthorized', async () => {
  const request = new Request('https://worker.example/sync', { method: 'POST', body: '{}' });
  const response = await worker.fetch(request, {}, {});
  const parsed = await parseJsonResponse(response);

  assert.equal(parsed.status, 401);
  assert.equal(parsed.body.error, 'UNAUTHORIZED');
});
