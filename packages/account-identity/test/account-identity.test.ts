import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import test from 'node:test';
import {
  AccountLoginError,
  AccountLoginService,
  IdentitySubjectHasher,
  OidcTransactionCodec,
  loadAccountOidcConfig,
  validateReturnPath,
  type AccountSessionRepository,
  type OidcRelyingParty,
  type OidcTransaction
} from '../src/index.js';

function key(): Uint8Array {
  return randomBytes(32);
}

function encoded(value: Uint8Array): string {
  return Buffer.from(value).toString('base64url');
}

function environment(): NodeJS.ProcessEnv {
  return {
    WEPUU_ACCOUNT_OIDC_ISSUER: 'https://identity.example.test/',
    WEPUU_ACCOUNT_OIDC_CLIENT_ID: 'client_00000001',
    WEPUU_ACCOUNT_OIDC_CLIENT_SECRET: 's'.repeat(32),
    WEPUU_ACCOUNT_OIDC_REDIRECT_URI: 'https://platform.example.test/v1/account/oidc/callback',
    WEPUU_ACCOUNT_OIDC_SCOPES: 'openid',
    WEPUU_ACCOUNT_OIDC_CLIENT_AUTH_METHOD: 'client_secret_basic',
    WEPUU_CONTROL_PUBLIC_ORIGIN: 'https://platform.example.test',
    WEPUU_OIDC_TRANSACTION_KEYS_JSON: JSON.stringify([encoded(key()), encoded(key())]),
    WEPUU_IDENTITY_SUBJECT_HMAC_KEY: encoded(key())
  };
}

test('configuration accepts the frozen profile and rejects unsafe variants', () => {
  const config = loadAccountOidcConfig(environment());
  assert.equal(config.issuer.href, 'https://identity.example.test/');
  assert.equal(config.redirectUri.href, 'https://platform.example.test/v1/account/oidc/callback');
  assert.equal(config.transactionKeys.length, 2);

  assert.throws(() => loadAccountOidcConfig({ ...environment(), WEPUU_ACCOUNT_OIDC_SCOPES: 'openid email' }));
  assert.throws(() => loadAccountOidcConfig({
    ...environment(),
    WEPUU_ACCOUNT_OIDC_REDIRECT_URI: 'https://attacker.example/v1/account/oidc/callback'
  }));
  const duplicate = encoded(key());
  assert.throws(() => loadAccountOidcConfig({
    ...environment(),
    WEPUU_OIDC_TRANSACTION_KEYS_JSON: JSON.stringify([duplicate, duplicate])
  }));
});

test('return path is restricted to a bounded local path', () => {
  assert.equal(validateReturnPath('/v1/account/session?from=login'), '/v1/account/session?from=login');
  assert.equal(validateReturnPath(undefined), '/');
  for (const unsafe of ['https://attacker.example/', '//attacker.example/', '/\\attacker', 'x']) {
    assert.throws(() => validateReturnPath(unsafe), AccountLoginError);
  }
});

test('transaction cookie encrypts state and supports one previous key', async () => {
  const active = key();
  const previous = key();
  const replacement = key();
  const issuer = 'https://platform.example.test/';
  const audience = 'https://platform.example.test/v1/account/oidc/callback';
  const transaction: OidcTransaction = {
    codeVerifier: 'v'.repeat(43),
    state: 's'.repeat(43),
    nonce: 'n'.repeat(43),
    returnTo: '/v1/account/session'
  };
  const oldCodec = new OidcTransactionCodec({ keys: [previous, key()], issuer, audience });
  const encrypted = await oldCodec.encode(transaction);
  assert.equal(encrypted.includes(transaction.codeVerifier), false);
  const rotatedCodec = new OidcTransactionCodec({ keys: [replacement, previous], issuer, audience });
  assert.deepEqual(await rotatedCodec.decode(encrypted), transaction);
  const tamperOffset = Math.floor(encrypted.length / 2);
  const replacementCharacter = encrypted[tamperOffset] === 'x' ? 'y' : 'x';
  const tampered = `${encrypted.slice(0, tamperOffset)}${replacementCharacter}${encrypted.slice(tamperOffset + 1)}`;
  await assert.rejects(rotatedCodec.decode(tampered), AccountLoginError);

  const expiredCodec = new OidcTransactionCodec({
    keys: [active, previous], issuer, audience, now: () => Math.floor(Date.now() / 1_000) - 600
  });
  await assert.rejects(rotatedCodec.decode(await expiredCodec.encode(transaction)), AccountLoginError);
});

test('subject hashing is stable, issuer-bound, and does not expose subject', () => {
  const hasher = new IdentitySubjectHasher(key());
  const subject = 'provider-user-123';
  const first = hasher.hash('https://identity.example.test/', subject);
  assert.equal(first, hasher.hash('https://identity.example.test/', subject));
  assert.notEqual(first, hasher.hash('https://other.example.test/', subject));
  assert.equal(first.includes(subject), false);
  assert.match(first, /^[A-Za-z0-9_-]{43}$/u);
});

class FakeProvider implements OidcRelyingParty {
  readonly transaction: OidcTransaction = {
    codeVerifier: 'v'.repeat(43), state: 's'.repeat(43), nonce: 'n'.repeat(43), returnTo: '/v1/account/session'
  };
  start(returnTo: string) {
    return Promise.resolve({
      authorizationUrl: new URL('https://identity.example.test/authorize?redacted=1'),
      transaction: { ...this.transaction, returnTo }
    });
  }
  complete() {
    return Promise.resolve({ issuer: 'https://identity.example.test/', subject: 'provider-user-123' });
  }
}

class MemorySessions implements AccountSessionRepository {
  created: Parameters<AccountSessionRepository['createSession']>[0] | undefined;
  revoked: Uint8Array | undefined;
  active = true;
  createSession(input: Parameters<AccountSessionRepository['createSession']>[0]) {
    this.created = input;
    return Promise.resolve(this.active ? { accountId: 'account_00000001' } : undefined);
  }
  revoke(sessionHash: Uint8Array) { this.revoked = sessionHash; return Promise.resolve(); }
}

test('login service persists only pseudonymous identity and session digests', async () => {
  const provider = new FakeProvider();
  const sessions = new MemorySessions();
  const codec = new OidcTransactionCodec({
    keys: [key(), key()],
    issuer: 'https://platform.example.test/',
    audience: 'https://platform.example.test/v1/account/oidc/callback'
  });
  const service = new AccountLoginService({
    provider,
    codec,
    hasher: new IdentitySubjectHasher(key()),
    sessions,
    now: () => new Date('2026-09-22T00:00:00.000Z')
  });
  const start = await service.start('/v1/account/session');
  const completion = await service.complete(
    new URL('https://platform.example.test/v1/account/oidc/callback?code=redacted&state=redacted'),
    start.transactionCookie
  );
  assert.equal(completion.accountId, 'account_00000001');
  assert.match(completion.sessionToken, /^[A-Za-z0-9_-]{43}$/u);
  assert.equal(sessions.created?.sessionHash.byteLength, 32);
  assert.match(sessions.created?.identitySubjectHash ?? '', /^[A-Za-z0-9_-]{43}$/u);
  assert.equal(JSON.stringify(sessions.created).includes('provider-user-123'), false);

  await service.logout(completion.sessionToken);
  assert.deepEqual(Buffer.from(sessions.revoked ?? []), Buffer.from(sessions.created?.sessionHash ?? []));
  sessions.active = false;
  await assert.rejects(service.complete(
    new URL('https://platform.example.test/v1/account/oidc/callback?code=redacted&state=redacted'),
    start.transactionCookie
  ), (error: unknown) => error instanceof AccountLoginError && error.code === 'unauthenticated');
});

test('login service preserves fail-closed provider outage classification', async () => {
  const provider: OidcRelyingParty = {
    start: () => Promise.reject(new AccountLoginError('temporarily_unavailable')),
    complete: () => Promise.reject(new AccountLoginError('temporarily_unavailable'))
  };
  const service = new AccountLoginService({
    provider,
    codec: new OidcTransactionCodec({
      keys: [key(), key()],
      issuer: 'https://platform.example.test/',
      audience: 'https://platform.example.test/v1/account/oidc/callback'
    }),
    hasher: new IdentitySubjectHasher(key()),
    sessions: new MemorySessions()
  });
  await assert.rejects(
    service.start('/'),
    (error: unknown) => error instanceof AccountLoginError && error.code === 'temporarily_unavailable'
  );
});
