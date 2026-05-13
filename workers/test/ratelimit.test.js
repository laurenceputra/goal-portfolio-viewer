import test from 'node:test';
import assert from 'node:assert/strict';

import { rateLimit } from '../src/ratelimit.js';

function createKvMock() {
  const store = new Map();
  const optionsByKey = new Map();
  return {
    store,
    optionsByKey,
    async get(key) {
      return store.has(key) ? JSON.parse(store.get(key)) : null;
    },
    async put(key, value, options) {
      store.set(key, value);
      if (options) {
        optionsByKey.set(key, options);
      }
    }
  };
}

function createRequest(method, headers = {}) {
  return new Request('https://example.workers.dev/sync', {
    method,
    headers
  });
}

test('rateLimit allows first request and stores counter', async () => {
  const kv = createKvMock();
  const env = { SYNC_KV: kv };
  const request = createRequest('POST', { 'CF-Connecting-IP': '1.2.3.4' });

  const result = await rateLimit(request, env, '/sync');

  assert.equal(result.allowed, true);
  assert.equal(kv.store.size, 1);
});

test('rateLimit blocks when limit is exceeded', async () => {
  const kv = createKvMock();
  const env = { SYNC_KV: kv };
  const now = Date.now();
  kv.store.set(
    'ratelimit:1.2.3.4:/sync:POST',
    JSON.stringify({ count: 10, resetAt: now + 30_000 })
  );

  const request = createRequest('POST', { 'CF-Connecting-IP': '1.2.3.4' });
  const result = await rateLimit(request, env, '/sync');

  assert.equal(result.allowed, false);
  assert.ok(result.retryAfter > 0);
});

test('rateLimit normalizes /sync/:userId path config', async () => {
  const kv = createKvMock();
  const env = { SYNC_KV: kv };
  const request = createRequest('GET', { 'CF-Connecting-IP': '1.2.3.4' });

  const result = await rateLimit(request, env, '/sync/alice');

  assert.equal(result.allowed, true);
  assert.equal(kv.store.size, 1);
  const [key] = [...kv.store.keys()];
  assert.ok(key.includes('/sync/:userId:GET'));
});

test('rateLimit uses minimum KV TTL when remaining window is short', async () => {
  const kv = createKvMock();
  const env = { SYNC_KV: kv };
  const now = Date.now();
  kv.store.set(
    'ratelimit:1.2.3.4:/sync:POST',
    JSON.stringify({ count: 1, resetAt: now + 30_000 })
  );

  const request = createRequest('POST', { 'CF-Connecting-IP': '1.2.3.4' });
  const result = await rateLimit(request, env, '/sync');

  assert.equal(result.allowed, true);
  const options = kv.optionsByKey.get('ratelimit:1.2.3.4:/sync:POST');
  assert.ok(options);
  assert.equal(options.expirationTtl, 60);
});
