import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { Database, PostgresSigningKeyRepository } from '../src/index.js';
import { localPkcs8KeyCustodyFromEnvironment, signingKeyDescriptorFromPublicJwk } from '@wepuu/key-custody';

const databaseUrl = process.env['WEPUU_TEST_DATABASE_URL'];

async function writeKey(directory: string, slot: string): Promise<Readonly<{
  privateKeyFile: string;
  passphraseFile: string;
}>> {
  const privateKeyFile = join(directory, `${slot}.pem`);
  const passphraseFile = join(directory, `${slot}.passphrase`);
  const passphrase = `test-${slot}-passphrase-${'x'.repeat(24)}`;
  const pair = generateKeyPairSync('rsa', { modulusLength: 3072, publicExponent: 0x10001 });
  await writeFile(privateKeyFile, pair.privateKey.export({
    format: 'pem', type: 'pkcs8', cipher: 'aes-256-cbc', passphrase
  }), { mode: 0o600 });
  await writeFile(passphraseFile, passphrase, { mode: 0o600 });
  return { privateKeyFile, passphraseFile };
}

test('local signing lifecycle activates, overlaps and retires real RSA keys without storing secrets', {
  skip: databaseUrl === undefined
}, async () => {
  assert.ok(databaseUrl);
  const directory = await mkdtemp(join(tmpdir(), 'wepuu-signing-lifecycle-'));
  const database = new Database({ connectionString: databaseUrl, applicationName: 'wepuu-local-signing-lifecycle-test' });
  try {
    await database.migrate();
    const [firstFiles, secondFiles] = await Promise.all([
      writeKey(directory, 'first'), writeKey(directory, 'second')
    ]);
    const keyringFile = join(directory, 'keyring.json');
    await writeFile(keyringFile, JSON.stringify({ keys: [
      { slot: 'first', ...firstFiles }, { slot: 'second', ...secondFiles }
    ] }), { mode: 0o600 });
    const environment = { WEPUU_SIGNING_KEYRING_FILE: keyringFile };
    const [first, second] = await Promise.all([
      localPkcs8KeyCustodyFromEnvironment(environment, 'first'),
      localPkcs8KeyCustodyFromEnvironment(environment, 'second')
    ]);
    const [firstDescriptor, secondDescriptor] = await Promise.all([
      first.describeSigningKey(), second.describeSigningKey()
    ]);
    const repository = new PostgresSigningKeyRepository(database);
    const now = new Date();
    await database.poolForMigrationsAndTests.query('DELETE FROM oauth.signing_key_metadata');
    await repository.publish({
      kid: firstDescriptor.kid, custodyReference: 'first', publicJwk: firstDescriptor.publicJwk,
      publishedAt: new Date(now.getTime() - 21 * 60_000)
    });
    assert.equal(await repository.activate(firstDescriptor.kid, now), true);
    assert.equal((await repository.loadUsable()).active.kid, firstDescriptor.kid);

    await repository.publish({
      kid: secondDescriptor.kid, custodyReference: 'second', publicJwk: secondDescriptor.publicJwk,
      publishedAt: now
    });
    assert.equal(await repository.activate(secondDescriptor.kid, now), false);
    await database.poolForMigrationsAndTests.query(
      `UPDATE oauth.signing_key_metadata SET publish_at = $2 WHERE kid = $1`,
      [secondDescriptor.kid, new Date(now.getTime() - 21 * 60_000)]
    );
    assert.equal(await repository.activate(secondDescriptor.kid, now), true);
    const overlap = await repository.loadUsable();
    assert.equal(overlap.active.kid, secondDescriptor.kid);
    assert.deepEqual(overlap.verification.map((record) => record.kid), [firstDescriptor.kid]);
    assert.equal((await signingKeyDescriptorFromPublicJwk(overlap.active.publicJwk)).kid, secondDescriptor.kid);

    const stored = await database.poolForMigrationsAndTests.query<{
      custody_provider: string; custody_reference: string; public_jwk: Record<string, unknown>;
    }>('SELECT custody_provider, custody_reference, public_jwk FROM oauth.signing_key_metadata ORDER BY kid');
    assert.ok(stored.rows.every((row) => row.custody_provider === 'local-pkcs8'));
    assert.deepEqual(new Set(stored.rows.map((row) => row.custody_reference)), new Set(['first', 'second']));
    assert.ok(stored.rows.every((row) => ['d', 'p', 'q', 'dp', 'dq', 'qi', 'oth']
      .every((member) => row.public_jwk[member] === undefined)));
    assert.equal(JSON.stringify(stored.rows).includes(directory), false);

    assert.equal(await repository.retire(firstDescriptor.kid, new Date(now.getTime() + 21 * 60_000)), true);
    assert.deepEqual((await repository.loadUsable()).verification, []);
  } finally {
    await database.poolForMigrationsAndTests.query('DELETE FROM oauth.signing_key_metadata').catch(() => undefined);
    await database.close();
    await rm(directory, { recursive: true, force: true });
  }
});
