import test from 'node:test';
import assert from 'node:assert/strict';

import { buildCorsHeaders, applyCorsHeaders } from '../src/cors.js';

test('buildCorsHeaders handles defaults and request origin allowlist', () => {
  const cases = [
    {
      name: 'default without origin header falls back to first allowed origin',
      env: undefined,
      expectedOrigin: 'https://app.sg.endowus.com'
    },
    {
      name: 'allows request origin in default allowlist',
      env: { REQUEST_ORIGIN: 'https://secure.fundsupermart.com' },
      expectedOrigin: 'https://secure.fundsupermart.com'
    },
    {
      name: 'allows request origin in custom allowlist',
      env: {
        CORS_ORIGINS: 'https://a.example, https://b.example',
        REQUEST_ORIGIN: 'https://b.example'
      },
      expectedOrigin: 'https://b.example'
    },
    {
      name: 'disallowed request origin does not emit allow-origin header',
      env: {
        CORS_ORIGINS: 'https://a.example, https://b.example',
        REQUEST_ORIGIN: 'https://c.example'
      },
      expectedOrigin: undefined
    }
  ];

  cases.forEach(({ env, expectedOrigin }) => {
    const headers = buildCorsHeaders(env);
    assert.equal(headers['Access-Control-Allow-Origin'], expectedOrigin);
    assert.equal(headers['Access-Control-Allow-Methods'], 'GET, POST, DELETE, OPTIONS');
    assert.equal(headers.Vary, 'Origin');
  });
});

test('applyCorsHeaders merges headers and honors null overrides', () => {
  const cases = [
    {
      name: 'merge',
      env: { REQUEST_ORIGIN: 'https://secure.fundsupermart.com' },
      extra: { 'Content-Type': 'application/json' },
      expectedOrigin: 'https://secure.fundsupermart.com',
      expectedContentType: 'application/json'
    },
    {
      name: 'null override',
      env: { REQUEST_ORIGIN: 'https://secure.fundsupermart.com' },
      extra: { 'Access-Control-Allow-Origin': null },
      expectedOrigin: undefined
    }
  ];

  cases.forEach(({ env, extra, expectedOrigin, expectedContentType }) => {
    const headers = applyCorsHeaders(env, extra);
    assert.equal(headers['Access-Control-Allow-Origin'], expectedOrigin);
    if (expectedContentType) {
      assert.equal(headers['Content-Type'], expectedContentType);
    }
  });
});
