import assert from 'node:assert/strict';
import { mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  Database,
  P3B1_CODEX_BASELINE_METADATA_DIGEST,
  P3B1_CODEX_CLIENT_ID,
  P3B1_CODEX_STABLE_REDIRECT_URI,
  PostgresOAuthClientRepository,
  readP3b1CodexDesktopCallbackFile,
  validateP3b1CodexDesktopCallbackUri
} from '../src/index.js';

const callbackUri = 'http://127.0.0.1/callback/Abcd_1234-xy';
const connectionString = process.env['WEPUU_TEST_DATABASE_URL'];
interface GrantSnapshot {
  readonly id: string;
  readonly status: string;
  readonly scopes: string[];
  readonly updated_at: Date;
  readonly revocation_reason: string | null;
}

test('P3-B1 callback validation requires one exact callback-specific loopback path', () => {
  assert.equal(validateP3b1CodexDesktopCallbackUri(callbackUri), callbackUri);
  for (const invalid of [
    P3B1_CODEX_STABLE_REDIRECT_URI,
    'http://localhost/callback/Abcd_1234-xy',
    'http://127.0.0.1:53123/callback/Abcd_1234-xy',
    'http://127.0.0.1/callback/Abcd_1234-xy/extra',
    'http://127.0.0.1/callback/short',
    'http://127.0.0.1/callback/Abcd_1234-xy?next=1',
    'http://user@127.0.0.1/callback/Abcd_1234-xy',
    'https://127.0.0.1/callback/Abcd_1234-xy'
  ]) assert.throws(() => validateP3b1CodexDesktopCallbackUri(invalid), /p3b1_codex_callback_invalid/u);
});

test('P3-B1 callback file must be a bounded regular single-line file', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'wepuu-p3b1-database-callback-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const callbackFile = path.join(root, 'callback');
  const callbackLink = path.join(root, 'callback-link');
  await writeFile(callbackFile, `${callbackUri}\n`, { encoding: 'utf8', mode: 0o600 });
  assert.equal(await readP3b1CodexDesktopCallbackFile(callbackFile, false), callbackUri);
  if (process.platform !== 'win32') {
    await symlink(callbackFile, callbackLink);
    await assert.rejects(
      readP3b1CodexDesktopCallbackFile(callbackLink, false),
      /p3b1_codex_callback_file_invalid/u
    );
  }
  await writeFile(callbackFile, `${callbackUri}\n${callbackUri}\n`, 'utf8');
  await assert.rejects(
    readP3b1CodexDesktopCallbackFile(callbackFile, false),
    /p3b1_codex_callback_file_invalid/u
  );
});

test('P3-B1 callback registration is atomic, idempotent and leaves the existing Grant unchanged', {
  skip: connectionString === undefined
}, async (t) => {
  assert.ok(connectionString);
  const database = new Database({ connectionString, applicationName: 'wepuu-p3b1-callback-test' });
  t.after(() => database.close());
  await database.migrate();
  const admin = database.poolForMigrationsAndTests;
  await admin.query('TRUNCATE platform.accounts, platform.tenants CASCADE');
  await admin.query('DELETE FROM oauth.clients WHERE client_id = $1', [P3B1_CODEX_CLIENT_ID]);
  await admin.query(
    `INSERT INTO oauth.clients (client_id, registration_mode, redirect_uris, metadata_digest, status)
     VALUES ($1, 'pre-registered', $2::jsonb, $3, 'active')`,
    [P3B1_CODEX_CLIENT_ID, JSON.stringify([P3B1_CODEX_STABLE_REDIRECT_URI]), P3B1_CODEX_BASELINE_METADATA_DIGEST]
  );

  const tenantId = '44444444-4444-4444-8444-444444444444';
  const accountId = 'account_P3B1CALLBACK';
  const siteId = 'site_P3B1CALLBACK';
  const grantId = 'grant_P3B1CALLBACK';
  await admin.query(
    `INSERT INTO platform.accounts (id, status, identity_issuer, identity_subject_hash)
     VALUES ($1, 'active', 'https://identity.example.test', $2)`,
    [accountId, 'e'.repeat(64)]
  );
  await admin.query("INSERT INTO platform.tenants (id, status) VALUES ($1, 'active')", [tenantId]);
  await admin.query(
    `INSERT INTO platform.sites
      (tenant_id, id, resource_uri, display_hostname, status, protocol_version,
       site_public_jwk, site_key_thumbprint)
     VALUES ($1, $2, 'https://p3b1.example.test/wp-json/wp-auto/mcp',
       'p3b1.example.test', 'active', '1',
       '{"kty":"OKP","crv":"Ed25519","x":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"}'::jsonb,
       'thumbprint_P3B1CALLBACK000000000000000000000000000000000000000000000')`,
    [tenantId, siteId]
  );
  await admin.query(
    `INSERT INTO platform.grants
      (tenant_id, id, site_id, subject_id, client_id, scopes, consent_challenge_hash,
       consent_expires_at, status, consent_version)
     VALUES ($1, $2, $3, $4, $5, ARRAY['mcp:read'], $6, now() + interval '1 hour', 'active', '1')`,
    [tenantId, grantId, siteId, accountId, P3B1_CODEX_CLIENT_ID, Buffer.alloc(32, 7)]
  );
  const grantBefore = (await admin.query<GrantSnapshot>(
    `SELECT id, status, scopes, updated_at, revocation_reason
     FROM platform.grants WHERE tenant_id = $1 AND id = $2`,
    [tenantId, grantId]
  )).rows[0];

  const repository = new PostgresOAuthClientRepository(database);
  const concurrent = await Promise.all([
    repository.registerP3b1CodexDesktopCallback(callbackUri),
    repository.registerP3b1CodexDesktopCallback(callbackUri)
  ]);
  assert.deepEqual(concurrent.map((result) => result.changed).sort(), [false, true]);
  assert.ok(concurrent.every((result) => result.clientId === P3B1_CODEX_CLIENT_ID
    && result.redirectCount === 2 && /^[a-f0-9]{64}$/u.test(result.metadataDigest)
    && /^[a-f0-9]{64}$/u.test(result.callbackDigest)));
  assert.deepEqual(
    (await repository.loadActivePublicClients()).find((client) => client.clientId === P3B1_CODEX_CLIENT_ID),
    { clientId: P3B1_CODEX_CLIENT_ID, redirectUris: [P3B1_CODEX_STABLE_REDIRECT_URI, callbackUri] }
  );
  assert.deepEqual((await admin.query<GrantSnapshot>(
    `SELECT id, status, scopes, updated_at, revocation_reason
     FROM platform.grants WHERE tenant_id = $1 AND id = $2`,
    [tenantId, grantId]
  )).rows[0], grantBefore);

  assert.equal((await repository.removeP3b1CodexDesktopCallback(callbackUri)).changed, true);
  assert.equal((await repository.removeP3b1CodexDesktopCallback(callbackUri)).changed, false);
  const restored = (await admin.query<{
    redirect_uris: string[];
    metadata_digest: string;
    status: string;
  }>(
    'SELECT redirect_uris, metadata_digest, status FROM oauth.clients WHERE client_id = $1',
    [P3B1_CODEX_CLIENT_ID]
  )).rows[0];
  assert.deepEqual(restored, {
    redirect_uris: [P3B1_CODEX_STABLE_REDIRECT_URI],
    metadata_digest: P3B1_CODEX_BASELINE_METADATA_DIGEST,
    status: 'active'
  });

  await admin.query(
    `UPDATE oauth.clients SET redirect_uris = $2::jsonb WHERE client_id = $1`,
    [P3B1_CODEX_CLIENT_ID, JSON.stringify([P3B1_CODEX_STABLE_REDIRECT_URI, 'http://127.0.0.1/callback/Other_123456'])]
  );
  await assert.rejects(
    repository.registerP3b1CodexDesktopCallback(callbackUri),
    /p3b1_codex_client_conflict/u
  );

  await admin.query(
    `UPDATE oauth.clients
     SET redirect_uris = $2::jsonb, metadata_digest = 'unexpected', status = 'active'
     WHERE client_id = $1`,
    [P3B1_CODEX_CLIENT_ID, JSON.stringify([P3B1_CODEX_STABLE_REDIRECT_URI])]
  );
  await assert.rejects(
    repository.registerP3b1CodexDesktopCallback(callbackUri),
    /p3b1_codex_client_conflict/u
  );

  await admin.query(
    `UPDATE oauth.clients
     SET metadata_digest = $2, status = 'suspended'
     WHERE client_id = $1`,
    [P3B1_CODEX_CLIENT_ID, P3B1_CODEX_BASELINE_METADATA_DIGEST]
  );
  await assert.rejects(
    repository.registerP3b1CodexDesktopCallback(callbackUri),
    /p3b1_codex_client_conflict/u
  );
});
