import test from 'node:test';
import assert from 'node:assert/strict';

import {
  deleteFromKV,
  getFromKV,
  putToKV
} from '../src/storage.js';
import { SyncContracts } from './helpers/contracts.js';

const PRIMARY_USER_ID = SyncContracts.userIds.primary;
const PRIMARY_SYNC_KEY = SyncContracts.kvKeys.syncUser(PRIMARY_USER_ID);

function createKvMock(initial = {}) {
  const store = new Map(Object.entries(initial));

  return {
    store,
    async get(key, type) {
      if (!store.has(key)) {
        return null;
      }
      const value = store.get(key);
      if (type === 'json') {
        return JSON.parse(value);
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

test('putToKV adds serverTimestamp metadata', async () => {
  const env = { SYNC_KV: createKvMock() };
  const originalNow = Date.now;
  Date.now = () => 1234567890;

  try {
    await putToKV(env, PRIMARY_USER_ID, { encryptedData: 'cipher', timestamp: 100, version: 1 });
  } finally {
    Date.now = originalNow;
  }

  const stored = JSON.parse(env.SYNC_KV.store.get(PRIMARY_SYNC_KEY));
  assert.equal(stored.encryptedData, 'cipher');
  assert.equal(stored.serverTimestamp, 1234567890);
});

test('getFromKV returns parsed JSON data', async () => {
  const env = {
    SYNC_KV: createKvMock({
      [PRIMARY_SYNC_KEY]: JSON.stringify({ encryptedData: 'value', timestamp: 50 })
    })
  };

  const result = await getFromKV(env, PRIMARY_USER_ID);
  assert.deepEqual(result, { encryptedData: 'value', timestamp: 50 });
});

test('deleteFromKV removes stored keys', async () => {
  const env = {
    SYNC_KV: createKvMock({
      [PRIMARY_SYNC_KEY]: JSON.stringify({ encryptedData: 'value' })
    })
  };

  await deleteFromKV(env, PRIMARY_USER_ID);
  assert.equal(env.SYNC_KV.store.has(PRIMARY_SYNC_KEY), false);
});
