import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createHash, verify } from 'node:crypto';
import test from 'node:test';
import {
  Database,
  PostgresSigningKeyRepository
} from '@wepuu/database';
import { AwsKmsKeyCustody, type KeyCustody } from '@wepuu/key-custody';
import {
  createAuthorizationProvider,
  DenyAllAccountRegistry,
  DenyAllGrantClaimsResolver,
  DenyAllResourceRegistry,
  type OidcAdapterShape
} from '@wepuu/oauth-provider';

function memoryAdapter(): new (model: string) => OidcAdapterShape {
  return class MemoryAdapter implements OidcAdapterShape {
    static readonly values = new Map<string, Record<string, unknown>>();
    readonly #model: string;
    constructor(model: string) { this.#model = model; }
    #key(id: string): string { return `${this.#model}:${id}`; }
    async upsert(id: string, payload: Record<string, unknown>): Promise<void> {
      MemoryAdapter.values.set(this.#key(id), payload);
    }
    async find(id: string): Promise<Record<string, unknown> | undefined> {
      return MemoryAdapter.values.get(this.#key(id));
    }
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

function rsaJwkThumbprint(jwk: Readonly<Record<string, unknown>>): string {
  assert.equal(typeof jwk['e'], 'string');
  assert.equal(typeof jwk['n'], 'string');
  return createHash('sha256').update(JSON.stringify({ e: jwk['e'], kty: 'RSA', n: jwk['n'] }), 'utf8')
    .digest('base64url');
}

async function publishedKids(active: KeyCustody, verification: readonly KeyCustody[]): Promise<readonly string[]> {
  const provider = await createAuthorizationProvider({
    issuer: 'https://auth.example.test',
    cookieKeys: ['a'.repeat(32), 'b'.repeat(32)],
    keyCustody: active,
    verificationKeys: verification.map((custody) => ({ custody, status: 'retiring' as const })),
    adapter: memoryAdapter(),
    resourceRegistry: new DenyAllResourceRegistry(),
    grantClaimsResolver: new DenyAllGrantClaimsResolver(),
    accountRegistry: new DenyAllAccountRegistry()
  });
  const server = createServer(provider.callback());
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address();
    assert.ok(address !== null && typeof address === 'object');
    const response = await fetch(`http://127.0.0.1:${address.port}/jwks`);
    assert.equal(response.status, 200);
    const body = await response.json() as { keys: Array<Record<string, unknown>> };
    assert.ok(body.keys.every((key) => key['d'] === undefined && key['alg'] === 'RS256'));
    return body.keys.map((key) => String(key['kid']));
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error === undefined ? resolve() : reject(error)));
  }
}

test('live two-key AWS KMS lifecycle publishes, activates, overlaps and removes safely', {
  skip: process.env['WEPUU_LIVE_KMS_ROTATION'] !== '1'
}, async () => {
  const region = process.env['AWS_REGION'];
  const firstId = process.env['WEPUU_KMS_KEY_ID'];
  const firstKid = process.env['WEPUU_KMS_KID'];
  const secondId = process.env['WEPUU_KMS_SECOND_KEY_ID'];
  const secondKid = process.env['WEPUU_KMS_SECOND_KID'];
  const databaseUrl = process.env['WEPUU_KMS_ROTATION_DATABASE_URL'];
  assert.ok(region && firstId && firstKid && secondId && secondKid && databaseUrl);
  assert.notEqual(firstId, secondId);
  assert.notEqual(firstKid, secondKid);
  const parsedDatabase = new URL(databaseUrl);
  assert.ok(
    ['127.0.0.1', 'localhost'].includes(parsedDatabase.hostname)
      || /^wepuu-kms-rotation-postgres-\d+$/u.test(parsedDatabase.hostname)
  );
  assert.match(parsedDatabase.pathname, /\/(?:wepuu_test|conformance)$/u);

  const first = new AwsKmsKeyCustody({ region, keyId: firstId, kid: firstKid });
  const second = new AwsKmsKeyCustody({ region, keyId: secondId, kid: secondKid });
  const [firstDescriptor, secondDescriptor] = await Promise.all([
    first.describeSigningKey(), second.describeSigningKey()
  ]);
  assert.notEqual(firstDescriptor.publicJwk.n, secondDescriptor.publicJwk.n);
  assert.equal(firstDescriptor.publicJwk.d, undefined);
  assert.equal(secondDescriptor.publicJwk.d, undefined);

  const database = new Database({ connectionString: databaseUrl, applicationName: 'wepuu-live-kms-rotation' });
  const repository = new PostgresSigningKeyRepository(database);
  const observedAt = new Date();
  try {
    await database.migrate();
    await database.withAuthorizationService(async (client) => {
      await client.query('DELETE FROM oauth.signing_key_metadata');
      await client.query(
        `INSERT INTO oauth.signing_key_metadata
          (kid, algorithm, custody_provider, custody_reference, public_jwk, status, publish_at, activate_at)
         VALUES ($1, 'RS256', 'aws-kms', $2, $3::jsonb, 'active', $4, $4)`,
        [firstKid, firstId, JSON.stringify(firstDescriptor.publicJwk), new Date(observedAt.getTime() - 40 * 60_000)]
      );
    });
    await repository.publish({
      kid: secondKid,
      custodyReference: secondId,
      publicJwk: secondDescriptor.publicJwk,
      publishedAt: new Date(observedAt.getTime() - 21 * 60_000)
    });

    const before = await repository.loadUsable();
    assert.equal(before.active.kid, firstKid);
    assert.deepEqual(before.verification.map((record) => record.kid), [secondKid]);
    assert.deepEqual(await publishedKids(first, [second]), [firstKid, secondKid]);

    const input = Buffer.from('wepuu-live-kms-lifecycle-before-activation');
    assert.equal(verify('RSA-SHA256', input, firstDescriptor.publicKey, await first.sign(input)), true);
    assert.equal(await repository.activate(secondKid, observedAt), true);

    const overlap = await repository.loadUsable();
    assert.equal(overlap.active.kid, secondKid);
    assert.deepEqual(overlap.verification.map((record) => record.kid), [firstKid]);
    assert.deepEqual(await publishedKids(second, [first]), [secondKid, firstKid]);
    const rotatedInput = Buffer.from('wepuu-live-kms-lifecycle-after-activation');
    assert.equal(verify('RSA-SHA256', rotatedInput, secondDescriptor.publicKey, await second.sign(rotatedInput)), true);

    assert.equal(await repository.revoke(firstKid, new Date(observedAt.getTime() + 1_000)), true);
    const afterRemoval = await repository.loadUsable();
    assert.equal(afterRemoval.active.kid, secondKid);
    assert.deepEqual(afterRemoval.verification, []);
    assert.deepEqual(await publishedKids(second, []), [secondKid]);
    process.stdout.write(`${JSON.stringify({
      gate: 'live-two-key-kms-lifecycle',
      status: 'pass',
      keys: [
        { kid: firstKid, thumbprint: rsaJwkThumbprint(firstDescriptor.publicJwk) },
        { kid: secondKid, thumbprint: rsaJwkThumbprint(secondDescriptor.publicJwk) }
      ]
    })}\n`);
  } finally {
    await database.close();
  }
});
