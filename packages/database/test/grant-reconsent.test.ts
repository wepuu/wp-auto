import assert from 'node:assert/strict';
import test from 'node:test';
import { GrantService } from '@wepuu/pairing';
import {
  Database,
  P3A_LIFECYCLE_TEST_CLIENT_ID,
  P3A_LIFECYCLE_TEST_REDIRECT_URI,
  PostgresGrantClaimsResolver,
  PostgresGrantRepository,
  PostgresOAuthClientRepository,
  PostgresOidcAdapter,
  RateLimitSubjectCodec,
  SecretArtifactCodec
} from '../src/index.js';

const connectionString = process.env['WEPUU_TEST_DATABASE_URL'];
const tenantId = '33333333-3333-4333-8333-333333333333';
const accountId = 'account_RECONSENT';
const siteId = 'site_RECONSENT01';
const resource = 'https://reconsent.example.test/wp-json/wp-auto/v1/mcp';

test('revoked Grant permits same-tuple re-consent without reviving old tokens', { skip: connectionString === undefined }, async (t) => {
  assert.ok(connectionString);
  const database = new Database({ connectionString, applicationName: 'wepuu-grant-reconsent-test' });
  t.after(() => database.close());
  await database.migrate();
  const admin = database.poolForMigrationsAndTests;
  await admin.query('TRUNCATE platform.accounts, platform.tenants CASCADE');
  await admin.query('DELETE FROM oauth.clients WHERE client_id = $1', [P3A_LIFECYCLE_TEST_CLIENT_ID]);

  const clients = new PostgresOAuthClientRepository(database);
  const firstProvision = await clients.provisionP3aLifecycleTestClient();
  assert.deepEqual(firstProvision, {
    created: true,
    clientId: P3A_LIFECYCLE_TEST_CLIENT_ID,
    redirectUri: P3A_LIFECYCLE_TEST_REDIRECT_URI
  });
  assert.equal((await clients.provisionP3aLifecycleTestClient()).created, false);
  assert.deepEqual(
    (await clients.loadActivePublicClients()).find((client) => client.clientId === P3A_LIFECYCLE_TEST_CLIENT_ID),
    { clientId: P3A_LIFECYCLE_TEST_CLIENT_ID, redirectUris: [P3A_LIFECYCLE_TEST_REDIRECT_URI] }
  );

  await admin.query(
    `INSERT INTO platform.accounts (id, status, identity_issuer, identity_subject_hash)
     VALUES ($1, 'active', 'https://identity.example.test', $2)`,
    [accountId, 'd'.repeat(64)]
  );
  await admin.query("INSERT INTO platform.tenants (id, status) VALUES ($1, 'active')", [tenantId]);
  await admin.query(
    `INSERT INTO platform.tenant_memberships (tenant_id, account_id, role, status)
     VALUES ($1, $2, 'owner', 'active')`,
    [tenantId, accountId]
  );
  await admin.query(
    `INSERT INTO platform.sites
      (tenant_id, id, resource_uri, display_hostname, status, protocol_version,
       site_public_jwk, site_key_thumbprint)
     VALUES ($1, $2, $3, 'reconsent.example.test', 'active', '1',
       '{"kty":"OKP","crv":"Ed25519","x":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"}'::jsonb,
       'thumbprint_RECONSENT000000000000000000000000000000000000000000000000')`,
    [tenantId, siteId, resource]
  );

  const context = { tenantId, accountId, correlationId: 'correlation_RECONSENT' };
  const grants = new PostgresGrantRepository(database, context);
  const service = new GrantService({
    repository: grants,
    signer: { sign: () => Promise.resolve('signed-consent-request') },
    platformIssuer: 'https://auth.example.test',
    challengeFactory: () => 'A'.repeat(43)
  });
  const first = await service.begin({
    tenantId,
    grantId: 'grant_RECONSENT01',
    siteId,
    subjectId: accountId,
    clientId: P3A_LIFECYCLE_TEST_CLIENT_ID,
    scopes: ['mcp:read'],
    resource,
    consentVersion: '1',
    idempotencyKey: 'idempotency_RECONSENT_CREATE_01'
  });
  await grants.activate(tenantId, first.grantId, 'idempotency_RECONSENT_APPROVE_01', 'proof_RECONSENT01');

  const artifactCodec = new SecretArtifactCodec([Buffer.alloc(32, 12)]);
  const refresh = new PostgresOidcAdapter(
    'RefreshToken', database, artifactCodec, new RateLimitSubjectCodec(Buffer.alloc(32, 13))
  );
  const r0 = 'refresh-reconsent-r0-value';
  const r1 = 'refresh-reconsent-r1-value';
  const tokenPayload = {
    kind: 'RefreshToken',
    grantId: first.grantId,
    accountId,
    clientId: P3A_LIFECYCLE_TEST_CLIENT_ID
  };
  await refresh.upsert(r0, { ...tokenPayload, rotations: 0 }, 3_600);
  await refresh.consume(r0);
  await refresh.upsert(r1, { ...tokenPayload, rotations: 1 }, 3_600);
  await assert.rejects(
    refresh.consume(r0),
    (error: unknown) => error instanceof Error && error.message === 'invalid_grant'
  );

  const firstState = await admin.query<{ status: string; revocation_reason: string | null }>(
    'SELECT status, revocation_reason FROM platform.grants WHERE tenant_id = $1 AND id = $2',
    [tenantId, first.grantId]
  );
  assert.deepEqual(firstState.rows[0], { status: 'revoked', revocation_reason: 'refresh_replay' });
  assert.equal(await refresh.find(r1), undefined);
  await assert.rejects(refresh.consume(r1));
  const claims = new PostgresGrantClaimsResolver(database);
  assert.equal(await claims.resolve(accountId, {
    grantId: first.grantId,
    clientId: P3A_LIFECYCLE_TEST_CLIENT_ID,
    resource
  }), undefined);

  const second = await service.begin({
    tenantId,
    grantId: 'grant_RECONSENT02',
    siteId,
    subjectId: accountId,
    clientId: P3A_LIFECYCLE_TEST_CLIENT_ID,
    scopes: ['mcp:read'],
    resource,
    consentVersion: '1',
    idempotencyKey: 'idempotency_RECONSENT_CREATE_02'
  });
  await grants.activate(tenantId, second.grantId, 'idempotency_RECONSENT_APPROVE_02', 'proof_RECONSENT02');
  assert.deepEqual(await claims.resolve(accountId, {
    grantId: second.grantId,
    clientId: P3A_LIFECYCLE_TEST_CLIENT_ID,
    resource
  }), { tenantId, siteId, grantId: second.grantId });
  assert.equal(await claims.resolve(accountId, {
    grantId: first.grantId,
    clientId: P3A_LIFECYCLE_TEST_CLIENT_ID,
    resource
  }), undefined);
  assert.equal(await refresh.find(r0), undefined);
  assert.equal(await refresh.find(r1), undefined);

  const history = await admin.query<{ id: string; status: string }>(
    `SELECT id, status FROM platform.grants
     WHERE tenant_id = $1 AND site_id = $2 AND subject_id = $3 AND client_id = $4
     ORDER BY id`,
    [tenantId, siteId, accountId, P3A_LIFECYCLE_TEST_CLIENT_ID]
  );
  assert.deepEqual(history.rows, [
    { id: first.grantId, status: 'revoked' },
    { id: second.grantId, status: 'active' }
  ]);

  await refresh.revokeByGrantId(second.grantId);
  const secondState = await admin.query<{ status: string; revocation_reason: string | null }>(
    'SELECT status, revocation_reason FROM platform.grants WHERE tenant_id = $1 AND id = $2',
    [tenantId, second.grantId]
  );
  assert.deepEqual(secondState.rows[0], { status: 'revoked', revocation_reason: 'token_revoked' });
  assert.equal(await claims.resolve(accountId, {
    grantId: second.grantId,
    clientId: P3A_LIFECYCLE_TEST_CLIENT_ID,
    resource
  }), undefined);

  assert.deepEqual(await clients.suspendP3aLifecycleTestClient(), {
    changed: true,
    clientId: P3A_LIFECYCLE_TEST_CLIENT_ID
  });
  assert.deepEqual(await clients.suspendP3aLifecycleTestClient(), {
    changed: false,
    clientId: P3A_LIFECYCLE_TEST_CLIENT_ID
  });
  assert.equal(
    (await clients.loadActivePublicClients()).some((client) => client.clientId === P3A_LIFECYCLE_TEST_CLIENT_ID),
    false
  );

  await admin.query(
    "UPDATE oauth.clients SET redirect_uris = '[\"http://127.0.0.1/wrong\"]'::jsonb WHERE client_id = $1",
    [P3A_LIFECYCLE_TEST_CLIENT_ID]
  );
  await assert.rejects(
    clients.provisionP3aLifecycleTestClient(),
    /p3a_lifecycle_client_conflict/u
  );
  await admin.query('DELETE FROM oauth.clients WHERE client_id = $1', [P3A_LIFECYCLE_TEST_CLIENT_ID]);
  assert.equal((await clients.provisionP3aLifecycleTestClient()).created, true);
});
