import assert from 'node:assert/strict';
import test from 'node:test';
import { RateLimitSubjectCodec, SecretArtifactCodec, secretArtifactCodecFromEnvironment } from '../src/index.js';

test('secret artifact codec is deterministic, versioned and never returns the secret', () => {
  const previous = Buffer.alloc(32, 1);
  const current = Buffer.alloc(32, 2);
  const codec = new SecretArtifactCodec([current, previous]);
  const secret = 'opaque-refresh-value-0000000000000000000000000000';
  const candidates = codec.candidates(secret);
  assert.equal(candidates.length, 2);
  const currentLookup = candidates[0];
  const previousLookup = candidates[1];
  assert.ok(currentLookup);
  assert.ok(previousLookup);
  assert.equal(currentLookup.version, 2);
  assert.equal(previousLookup.version, 1);
  assert.equal(Buffer.from(currentLookup.digest).toString('utf8').includes(secret), false);
  assert.equal(codec.matches(secret, previousLookup), true);
  assert.equal(codec.matches(`${secret}x`, previousLookup), false);
});

test('rate-limit subjects are policy-separated pseudonyms', () => {
  const codec = new RateLimitSubjectCodec(Buffer.alloc(32, 9));
  const one = codec.digest('oauth.token', '203.0.113.10');
  const two = codec.digest('oauth.authorize', '203.0.113.10');
  assert.equal(one.byteLength, 32);
  assert.notDeepEqual(one, two);
  assert.equal(Buffer.from(one).toString('utf8').includes('203.0.113.10'), false);
});

test('artifact key environment parser requires one or two 256-bit base64url keys', () => {
  const key = Buffer.alloc(32, 7).toString('base64url');
  assert.doesNotThrow(() => secretArtifactCodecFromEnvironment({ WEPUU_OAUTH_ARTIFACT_KEYS_JSON: JSON.stringify([key]) }));
  assert.throws(() => secretArtifactCodecFromEnvironment({ WEPUU_OAUTH_ARTIFACT_KEYS_JSON: '[]' }));
  assert.throws(() => secretArtifactCodecFromEnvironment({ WEPUU_OAUTH_ARTIFACT_KEYS_JSON: JSON.stringify(['short']) }));
});
