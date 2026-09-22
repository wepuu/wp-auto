import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { generateKeyPairSync, sign } from 'node:crypto';
import test from 'node:test';
import type { KeyCustody, SigningKeyDescriptor } from '@wepuu/key-custody';
import {
  DenyAllGrantClaimsResolver,
  DenyAllResourceRegistry,
  createAuthorizationProvider,
  type OidcAdapterShape
} from '../src/index.js';

function memoryAdapter(): new (model: string) => OidcAdapterShape {
  return class MemoryAdapter implements OidcAdapterShape {
    static readonly values = new Map<string, Record<string, unknown>>();
    readonly #model: string;
    constructor(model: string) { this.#model = model; }
    #key(id: string): string { return `${this.#model}:${id}`; }
    async upsert(id: string, payload: Record<string, unknown>): Promise<void> { MemoryAdapter.values.set(this.#key(id), payload); }
    async find(id: string): Promise<Record<string, unknown> | undefined> { return MemoryAdapter.values.get(this.#key(id)); }
    async destroy(id: string): Promise<void> { MemoryAdapter.values.delete(this.#key(id)); }
    async consume(id: string): Promise<void> {
      const value = await this.find(id);
      if (value !== undefined) await this.upsert(id, { ...value, consumed: Math.floor(Date.now() / 1_000) });
    }
    async findByUid(): Promise<undefined> { return undefined; }
    async findByUserCode(): Promise<undefined> { return undefined; }
    async revokeByGrantId(): Promise<void> {}
  };
}

function fakeCustody(): KeyCustody {
  const pair = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const descriptor: SigningKeyDescriptor = {
    kid: 'kms-key-0001',
    algorithm: 'RS256',
    publicKey: pair.publicKey,
    publicJwk: { ...pair.publicKey.export({ format: 'jwk' }), kid: 'kms-key-0001', alg: 'RS256', use: 'sig' }
  };
  return {
    async describeSigningKey() { return descriptor; },
    async sign(input) { return sign('RSA-SHA256', input, pair.privateKey); }
  };
}

test('authorization provider publishes metadata and public-only JWKS through external signing', async (t) => {
  const provider = await createAuthorizationProvider({
    issuer: 'https://auth.example.test',
    cookieKeys: ['a'.repeat(32), 'b'.repeat(32)],
    keyCustody: fakeCustody(),
    adapter: memoryAdapter(),
    resourceRegistry: new DenyAllResourceRegistry(),
    grantClaimsResolver: new DenyAllGrantClaimsResolver()
  });
  const server = createServer(provider.callback());
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise<void>((resolve, reject) => server.close((error) => error === undefined ? resolve() : reject(error))));
  const address = server.address();
  assert.ok(address !== null && typeof address === 'object');
  const base = `http://127.0.0.1:${address.port}`;
  const metadata = await (await fetch(`${base}/.well-known/openid-configuration`)).json() as Record<string, unknown>;
  assert.equal(metadata['issuer'], 'https://auth.example.test');
  assert.deepEqual(metadata['code_challenge_methods_supported'], ['S256']);
  const jwks = await (await fetch(`${base}/jwks`)).json() as { keys: Array<Record<string, unknown>> };
  assert.equal(jwks.keys[0]?.['kid'], 'kms-key-0001');
  assert.equal(jwks.keys[0]?.['d'], undefined);
});
