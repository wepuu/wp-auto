import assert from 'node:assert/strict';
import test from 'node:test';
import { validateJwks, validateMetadata } from './check-production-public.mjs';

const origin = 'https://auth.wpauto.cc';
const metadata = {
  issuer: origin,
  jwks_uri: `${origin}/jwks`,
  authorization_endpoint: `${origin}/auth`,
  token_endpoint: `${origin}/token`
};
const publicKey = { kty: 'RSA', alg: 'RS256', use: 'sig', kid: 'thumbprint', n: 'modulus', e: 'AQAB' };

test('accepts same-origin HTTPS metadata and public RS256 JWKS', () => {
  assert.equal(validateMetadata(metadata, origin).href, `${origin}/jwks`);
  assert.doesNotThrow(() => validateJwks({ keys: [publicKey] }));
});

test('rejects issuer and cross-origin JWKS changes', () => {
  assert.throws(() => validateMetadata({ ...metadata, issuer: 'https://other.example' }, origin), /issuer_mismatch/);
  assert.throws(() => validateMetadata({ ...metadata, jwks_uri: 'https://other.example/jwks' }, origin), /jwks_origin_mismatch/);
});

test('rejects private, symmetric, unsigned, or unidentified keys', () => {
  assert.throws(() => validateJwks({ keys: [{ ...publicKey, d: 'private' }] }), /jwks_private_member/);
  assert.throws(() => validateJwks({ keys: [{ ...publicKey, kty: 'oct', alg: 'HS256' }] }), /jwks_profile_mismatch/);
  assert.throws(() => validateJwks({ keys: [{ ...publicKey, alg: 'none' }] }), /jwks_profile_mismatch/);
  assert.throws(() => validateJwks({ keys: [{ ...publicKey, kid: '' }] }), /jwks_kid_missing/);
});
