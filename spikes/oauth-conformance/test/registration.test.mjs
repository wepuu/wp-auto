import test from 'node:test';
import assert from 'node:assert/strict';
import { RegistrationRateLimiter, validateDynamicRegistration } from '../src/registration.mjs';

test('DCR validates public clients and bounded redirect metadata', () => {
  assert.doesNotThrow(() => validateDynamicRegistration({
    client_name: 'Codex test',
    redirect_uris: ['http://127.0.0.1/callback'],
    token_endpoint_auth_method: 'none',
    grant_types: ['authorization_code', 'refresh_token']
  }));
  assert.throws(() => validateDynamicRegistration({ client_name: 'bad', redirect_uris: ['http://evil.example/callback'], token_endpoint_auth_method: 'none' }), /invalid_redirect_uri/);
  assert.throws(() => validateDynamicRegistration({ client_name: 'bad', redirect_uris: ['not a url'], token_endpoint_auth_method: 'none' }), /invalid_redirect_uri/);
  assert.throws(() => validateDynamicRegistration({ client_name: 'bad', redirect_uris: ['https://user:pass@client.example/callback'], token_endpoint_auth_method: 'none' }), /invalid_redirect_uri/);
  assert.throws(() => validateDynamicRegistration({ client_name: 'bad', redirect_uris: ['https://client.example/callback'], token_endpoint_auth_method: 'client_secret_post' }), /public_client_required/);
  assert.throws(() => validateDynamicRegistration({ client_name: 'bad', redirect_uris: ['https://client.example/callback'], token_endpoint_auth_method: 'none', grant_types: ['client_credentials'] }), /invalid_grant_type/);
});

test('DCR rate limiter is bounded per caller and resets after its window', () => {
  const limiter = new RegistrationRateLimiter({ limit: 2, windowMs: 100 });
  assert.equal(limiter.allow('tenant-a', 0), true);
  assert.equal(limiter.allow('tenant-a', 1), true);
  assert.equal(limiter.allow('tenant-a', 2), false);
  assert.equal(limiter.allow('tenant-b', 2), true);
  assert.equal(limiter.allow('tenant-a', 101), true);
});
