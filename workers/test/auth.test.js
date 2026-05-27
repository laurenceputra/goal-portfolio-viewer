import test from 'node:test';
import assert from 'node:assert/strict';

let auth;

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function ensureBase64Globals() {
  if (!globalThis.btoa) {
    globalThis.btoa = (input) => Buffer.from(input, 'binary').toString('base64');
  }
  if (!globalThis.atob) {
    globalThis.atob = (input) => Buffer.from(input, 'base64').toString('binary');
  }
}

function pseudoHashBytes(input, length = 32) {
  let seed = 0;
  for (let i = 0; i < input.length; i += 1) {
    seed = (seed + input.charCodeAt(i) * (i + 1)) % 256;
  }
  const bytes = new Uint8Array(length);
  for (let i = 0; i < length; i += 1) {
    seed = (seed * 31 + i) % 256;
    bytes[i] = seed;
  }
  return bytes;
}

function bytesToHex(bytes) {
  return Array.from(bytes)
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
}

function deriveBytes(passwordHash, saltBytes) {
  const saltString = Array.from(saltBytes).join(',');
  return pseudoHashBytes(`${passwordHash}:${saltString}`, 32);
}

function signBytes(data, secret) {
  return pseudoHashBytes(`${data}:${secret}`, 32);
}

function base64UrlEncode(input) {
  const bytes = typeof input === 'string' ? textEncoder.encode(input) : input;
  const binary = Array.from(bytes).map(byte => String.fromCharCode(byte)).join('');
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function buildToken(payload, secret, encodedPayloadOverride) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = encodedPayloadOverride ?? base64UrlEncode(JSON.stringify(payload));
  const data = `${encodedHeader}.${encodedPayload}`;
  const signature = base64UrlEncode(signBytes(data, secret));
  return `${data}.${signature}`;
}

function createKvStore(initial = {}) {
  const store = new Map(Object.entries(initial));
  return {
    get: async (key, type) => {
      if (!store.has(key)) {
        return null;
      }
      const value = store.get(key);
      if (type === 'json') {
        return JSON.parse(value);
      }
      return value;
    },
    put: async (key, value) => {
      store.set(key, value);
    },
    _dump: () => store
  };
}

function mockCrypto() {
  return {
    subtle: {
      importKey: async (_format, keyData, algorithm) => ({
        keyString: textDecoder.decode(keyData),
        algorithm: algorithm?.name
      }),
      deriveBits: async (params, keyMaterial, length) => {
        const saltBytes = params.salt;
        const derived = deriveBytes(keyMaterial.keyString, saltBytes);
        return derived.slice(0, length / 8).buffer;
      },
      sign: async (_algo, keyMaterial, data) => {
        const dataString = textDecoder.decode(data);
        const signature = signBytes(dataString, keyMaterial.keyString);
        return signature.buffer;
      }
    },
    getRandomValues: (array) => {
      for (let i = 0; i < array.length; i += 1) {
        array[i] = (i + 1) & 0xff;
      }
      return array;
    }
  };
}

const realDateNow = Date.now;
let cryptoDescriptor;

ensureBase64Globals();

test.before(async () => {
  auth = await import('../src/auth.js');
});

test.beforeEach(() => {
  cryptoDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  Object.defineProperty(globalThis, 'crypto', {
    value: mockCrypto(),
    configurable: true
  });
});

test.afterEach(() => {
  if (cryptoDescriptor) {
    Object.defineProperty(globalThis, 'crypto', cryptoDescriptor);
  } else {
    delete globalThis.crypto;
  }
  Date.now = realDateNow;
});

test('registerUser rejects invalid userId format', async () => {
  const kv = createKvStore();
  const env = { SYNC_KV: kv };

  const result = await auth.credentials.registerUser('not an email', 'hashed', env);

  assert.equal(result.success, false);
  assert.equal(result.error, 'BAD_REQUEST');
  assert.match(result.message, /Invalid userId/i);
});

test('loginUser rejects invalid userId format', async () => {
  const kv = createKvStore();
  const env = { SYNC_KV: kv };

  const result = await auth.credentials.loginUser('not an email', 'hashed', env);

  assert.equal(result.success, false);
  assert.equal(result.error, 'BAD_REQUEST');
  assert.match(result.message, /Invalid userId/i);
});

test('registerUser rejects existing user', async () => {
  const kv = createKvStore({ 'user:existing': JSON.stringify({ salt: '00', derivedHash: '11' }) });
  const env = { SYNC_KV: kv };

  const result = await auth.credentials.registerUser('existing', 'hashed', env);

  assert.equal(result.success, false);
  assert.equal(result.message, 'User already exists');
});

test('registerUser stores salt and derived hash', async () => {
  const kv = createKvStore();
  const env = { SYNC_KV: kv };

  const result = await auth.credentials.registerUser('user-123', 'hashed-value', env);

  assert.equal(result.success, true);
  const stored = kv._dump().get('user:user-123');
  assert.ok(stored);
  const storedData = JSON.parse(stored);
  assert.equal(storedData.salt, '0102030405060708090a0b0c0d0e0f10');
  const expectedHash = bytesToHex(deriveBytes('hashed-value', Uint8Array.from({ length: 16 }, (_, i) => i + 1)));
  assert.equal(storedData.derivedHash, expectedHash);
  assert.equal(storedData.lastLogin, null);
  assert.ok(typeof storedData.createdAt === 'number');
});

test('validatePassword returns false for missing user', async () => {
  const kv = createKvStore();
  const env = { SYNC_KV: kv };

  const result = await auth.credentials.validatePassword('missing', 'hash', env);

  assert.equal(result, false);
});

test('validatePassword returns false when salt or derivedHash missing', async () => {
  const kv = createKvStore({
    'user:missing-salt': JSON.stringify({ derivedHash: 'aa' }),
    'user:missing-hash': JSON.stringify({ salt: 'bb' })
  });
  const env = { SYNC_KV: kv };

  const missingSalt = await auth.credentials.validatePassword('missing-salt', 'hash', env);
  const missingHash = await auth.credentials.validatePassword('missing-hash', 'hash', env);

  assert.equal(missingSalt, false);
  assert.equal(missingHash, false);
});

test('validatePassword returns false on timing-safe mismatch', async () => {
  const kv = createKvStore({
    'user:mismatch': JSON.stringify({
      salt: '0102',
      derivedHash: 'ffffffff'
    })
  });
  const env = { SYNC_KV: kv };

  const result = await auth.credentials.validatePassword('mismatch', 'hash', env);

  assert.equal(result, false);
});

test('issueTokens and verify token types', async () => {
  Date.now = () => 1_700_000_000_000;
  const env = { JWT_SECRET: 'topsecret' };

  const tokens = await auth.issueTokens('user-1', env);

  const accessPayload = await auth.verifyAccessToken(tokens.accessToken, env);
  const refreshPayload = await auth.verifyRefreshToken(tokens.refreshToken, env);

  assert.equal(accessPayload.sub, 'user-1');
  assert.equal(accessPayload.type, 'access');
  assert.equal(refreshPayload.sub, 'user-1');
  assert.equal(refreshPayload.type, 'refresh');
  assert.equal(tokens.accessExpiresAt, accessPayload.exp * 1000);
  assert.equal(tokens.refreshExpiresAt, refreshPayload.exp * 1000);
});

test('verifyAccessToken returns null for invalid signature', async () => {
  const env = { JWT_SECRET: 'topsecret' };
  const token = buildToken({ sub: 'user', type: 'access', exp: 9999999999 }, 'wrongsecret');

  const payload = await auth.verifyAccessToken(token, env);

  assert.equal(payload, null);
});

test('verifyAccessToken returns null for wrong token type', async () => {
  const env = { JWT_SECRET: 'topsecret' };
  const token = buildToken({ sub: 'user', type: 'refresh', exp: 9999999999 }, env.JWT_SECRET);

  const payload = await auth.verifyAccessToken(token, env);

  assert.equal(payload, null);
});

test('verifyAccessToken returns null for expired token', async () => {
  Date.now = () => 1_700_000_000_000;
  const env = { JWT_SECRET: 'topsecret' };
  const exp = Math.floor(Date.now() / 1000) - 10;
  const token = buildToken({ sub: 'user', type: 'access', exp }, env.JWT_SECRET);

  const payload = await auth.verifyAccessToken(token, env);

  assert.equal(payload, null);
});

test('verifyAccessToken returns null for malformed token parts', async () => {
  const env = { JWT_SECRET: 'topsecret' };
  const tokens = ['one.two', 'one.two.three.four'];

  for (const token of tokens) {
    const payload = await auth.verifyAccessToken(token, env);
    assert.equal(payload, null);
  }
});

test('verifyAccessToken returns null for invalid base64 payload', async () => {
  const env = { JWT_SECRET: 'topsecret' };
  const token = buildToken({ sub: 'user', type: 'access' }, env.JWT_SECRET, '***');

  const payload = await auth.verifyAccessToken(token, env);

  assert.equal(payload, null);
});

test('verifyAccessToken returns null for non-JSON payload', async () => {
  const env = { JWT_SECRET: 'topsecret' };
  const encodedPayload = base64UrlEncode('not-json');
  const token = buildToken({ sub: 'user', type: 'access' }, env.JWT_SECRET, encodedPayload);

  const payload = await auth.verifyAccessToken(token, env);

  assert.equal(payload, null);
});
