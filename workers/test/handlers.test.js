import test from 'node:test';
import assert from 'node:assert/strict';

import { handleSync, handleGetSync, handleDeleteSync } from '../src/handlers.js';

function createKvMock(initialSyncData = null) {
  const store = new Map();
  if (initialSyncData) {
    store.set('sync_user:user-1', JSON.stringify(initialSyncData));
  }

  return {
    store,
    async get(key) {
      return store.has(key) ? JSON.parse(store.get(key)) : null;
    },
    async put(key, value) {
      store.set(key, value);
    },
    async delete(key) {
      store.delete(key);
    },
    async list({ prefix }) {
      const keys = [...store.keys()]
        .filter((name) => name.startsWith(prefix))
        .map((name) => ({ name }));
      return { keys };
    }
  };
}

async function parseResponse(response) {
  return {
    status: response.status,
    body: await response.json()
  };
}

test('handleSync rejects invalid request body', async () => {
  const env = { SYNC_KV: createKvMock() };

  const response = await handleSync(null, env);
  const parsed = await parseResponse(response);

  assert.equal(parsed.status, 400);
  assert.equal(parsed.body.error, 'BAD_REQUEST');
});

test('handleSync rejects invalid userId format', async () => {
  const env = { SYNC_KV: createKvMock() };

  const response = await handleSync(
    {
      userId: 'invalid user',
      deviceId: 'd1',
      encryptedData: 'ciphertext',
      timestamp: Date.now(),
      version: 1
    },
    env
  );

  const parsed = await parseResponse(response);
  assert.equal(parsed.status, 400);
  assert.equal(parsed.body.error, 'BAD_REQUEST');
  assert.match(parsed.body.message, /userId/i);
});

test('handleSync returns conflict when server data is newer', async () => {
  const env = { SYNC_KV: createKvMock({ timestamp: 200, encryptedData: 'v2', deviceId: 'd2', version: 1 }) };

  const response = await handleSync(
    {
      userId: 'user-1',
      deviceId: 'd1',
      encryptedData: 'v1',
      timestamp: 100,
      version: 1
    },
    env
  );

  const parsed = await parseResponse(response);
  assert.equal(parsed.status, 409);
  assert.equal(parsed.body.error, 'CONFLICT');
});

test('handleSync stores payload when validation succeeds', async () => {
  const env = { SYNC_KV: createKvMock() };

  const response = await handleSync(
    {
      userId: 'user-1',
      deviceId: 'd1',
      encryptedData: 'ciphertext',
      timestamp: Date.now(),
      version: 1
    },
    env
  );

  const parsed = await parseResponse(response);
  assert.equal(parsed.status, 200);
  assert.equal(parsed.body.success, true);
  assert.equal(env.SYNC_KV.store.has('sync_user:user-1'), true);
});

test('handleGetSync returns 404 when data is missing', async () => {
  const env = { SYNC_KV: createKvMock() };

  const response = await handleGetSync('user-1', env);
  const parsed = await parseResponse(response);

  assert.equal(parsed.status, 404);
  assert.equal(parsed.body.error, 'NOT_FOUND');
});

test('handleDeleteSync removes user config', async () => {
  const env = { SYNC_KV: createKvMock({ timestamp: 200, encryptedData: 'v2', deviceId: 'd2', version: 1 }) };

  const response = await handleDeleteSync('user-1', env);
  const parsed = await parseResponse(response);

  assert.equal(parsed.status, 200);
  assert.equal(parsed.body.success, true);
  assert.equal(env.SYNC_KV.store.has('sync_user:user-1'), false);
});
