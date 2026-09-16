import test from 'node:test';
import assert from 'node:assert/strict';
import { createPostgresAdapter } from '../src/postgres-adapter.mjs';
import { listenProvider } from '../src/provider.mjs';

const connectionString = process.env.CONFORMANCE_DATABASE_URL;

test('PostgreSQL adapter persists, consumes, and revokes artifacts atomically', { skip: !connectionString }, async (t) => {
  const adapter = createPostgresAdapter(connectionString);
  await Promise.all(Array.from({ length: 4 }, () => adapter.prepare()));
  await adapter.pool.query("DELETE FROM oidc_artifacts WHERE jti LIKE 'adapter-%'");
  t.after(() => adapter.close());

  const code = adapter('AuthorizationCode');
  await code.upsert('adapter-code-1', { jti: 'adapter-code-1', grantId: 'adapter-grant-1', uid: 'adapter-session-1' }, 60);
  assert.deepEqual(await code.find('adapter-code-1'), { jti: 'adapter-code-1', grantId: 'adapter-grant-1', uid: 'adapter-session-1' });
  assert.deepEqual(await code.findByUid('adapter-session-1'), { jti: 'adapter-code-1', grantId: 'adapter-grant-1', uid: 'adapter-session-1' });
  await code.consume('adapter-code-1');
  assert.equal((await code.find('adapter-code-1')).consumed > 0, true);

  const token = adapter('RefreshToken');
  await token.upsert('adapter-refresh-1', { jti: 'adapter-refresh-1', grantId: 'adapter-grant-1', generation: 0 }, 60);
  assert.ok(await token.find('adapter-refresh-1'));
  await token.revokeByGrantId('adapter-grant-1');
  assert.equal(await code.find('adapter-code-1'), undefined);
  assert.equal(await token.find('adapter-refresh-1'), undefined);

  const provider = await listenProvider({ adapter });
  t.after(() => provider.close());
  const metadata = await (await fetch(`${provider.issuer}/.well-known/openid-configuration`)).json();
  assert.equal(metadata.issuer, provider.issuer);
});
