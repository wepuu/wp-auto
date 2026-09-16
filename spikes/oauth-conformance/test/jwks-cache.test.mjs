import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPair } from 'node:crypto';
import { exportJWK, importJWK, SignJWT } from 'jose';
import { BoundedJwksCache } from '../src/jwks-cache.mjs';

function generate(type, options) {
  return new Promise((resolve, reject) => generateKeyPair(type, options, (error, publicKey, privateKey) => error ? reject(error) : resolve({ publicKey, privateKey })));
}

test('JWKS cache verifies overlap keys and bounds unknown-kid refreshes', async () => {
  const first = await generate('rsa', { modulusLength: 2048 });
  const second = await generate('rsa', { modulusLength: 2048 });
  const firstPrivate = await exportJWK(first.privateKey);
  const firstPublic = { ...(await exportJWK(first.publicKey)), kid: 'old', alg: 'RS256', use: 'sig' };
  const secondPrivate = await exportJWK(second.privateKey);
  const secondPublic = { ...(await exportJWK(second.publicKey)), kid: 'new', alg: 'RS256', use: 'sig' };
  let fetches = 0;
  const fetcher = async () => {
    fetches += 1;
    return new Response(JSON.stringify({ keys: [firstPublic, secondPublic] }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const cache = new BoundedJwksCache('https://auth.example.test/jwks', { fetcher });
  const claims = { iss: 'https://auth.example.test', aud: 'https://site.example.test/wp-json/wp-auto/mcp', sub: 'opaque', site_id: 'site', grant_id: 'grant', scope: 'mcp:read' };
  const oldToken = await new SignJWT(claims).setProtectedHeader({ alg: 'RS256', kid: 'old', typ: 'at+jwt' }).setIssuedAt().setExpirationTime('5m').setJti('old-jti').sign(await importJWK(firstPrivate, 'RS256'));
  const newToken = await new SignJWT(claims).setProtectedHeader({ alg: 'RS256', kid: 'new', typ: 'at+jwt' }).setIssuedAt().setExpirationTime('5m').setJti('new-jti').sign(await importJWK(secondPrivate, 'RS256'));
  await assert.doesNotReject(() => cache.verify(oldToken, { issuer: claims.iss, audience: claims.aud }));
  await assert.doesNotReject(() => cache.verify(newToken, { issuer: claims.iss, audience: claims.aud }));
  assert.equal(fetches, 1);

  cache.revokeKid('old');
  await assert.rejects(() => cache.verify(oldToken), /unknown_or_revoked_kid/);

  const unknownToken = await new SignJWT(claims).setProtectedHeader({ alg: 'RS256', kid: 'unknown', typ: 'at+jwt' }).setIssuedAt().setExpirationTime('5m').setJti('unknown-jti').sign(await importJWK(firstPrivate, 'RS256'));
  await assert.rejects(() => cache.verify(unknownToken), /unknown_or_revoked_kid/);
  assert.equal(fetches, 2, 'unknown kid triggers only one bounded refresh');
});

test('JWKS cache fails closed on non-RS256 or malformed key responses', async () => {
  const cache = new BoundedJwksCache('https://auth.example.test/jwks', {
    fetcher: async () => new Response(JSON.stringify({ keys: [{ kty: 'oct', kid: 'bad', k: 'secret' }] }), { status: 200 })
  });
  await assert.rejects(() => cache.keyFor('bad'), /Invalid|invalid/);
});

test('JWKS/provider outage fails closed instead of serving a stale or unverified key', async () => {
  const cache = new BoundedJwksCache('https://auth.example.test/jwks', {
    fetcher: async () => { throw new Error('network_unavailable'); }
  });
  await assert.rejects(() => cache.refresh(), /network_unavailable/);
  await assert.rejects(() => cache.keyFor('unknown'), /network_unavailable|unknown_or_revoked_kid/);
});
