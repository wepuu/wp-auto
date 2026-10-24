import assert from 'node:assert/strict';
import test from 'node:test';
import { GrantService } from '@wepuu/pairing';
import { reconsentDiagnostic } from './reconsent-diagnostic.mjs';
import { recordTargetLedger, closeAfterLedger } from './r19-target-ledger.mjs';
import { nativeFixturePayload, fixtureParent } from './reconsent-native-fixture.mjs';
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
  const diagnostic = reconsentDiagnostic();
  return diagnostic.main(async () => {
  assert.ok(connectionString);
  const database = new Database({ connectionString, applicationName: 'wepuu-grant-reconsent-test', migrationProfile: 'authorization' });
  t.after(() => diagnostic.cleanup(() => closeAfterLedger(database.poolForMigrationsAndTests, () => database.close())));
  diagnostic.checkpoint('MIGRATION');
  await database.migrate();
  await recordTargetLedger(database.poolForMigrationsAndTests, 'before');
  diagnostic.checkpoint('FIXTURE_RESET');
  const admin = database.poolForMigrationsAndTests;
  await admin.query('TRUNCATE platform.accounts, platform.tenants CASCADE');
  await admin.query('DELETE FROM oauth.clients WHERE client_id = $1', [P3A_LIFECYCLE_TEST_CLIENT_ID]);

  const clients = new PostgresOAuthClientRepository(database);
  diagnostic.checkpoint('CLIENT_PROVISION');
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

  diagnostic.checkpoint('IDENTITY_BINDING');
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
  diagnostic.checkpoint('FIRST_GRANT_BEGIN');
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
  diagnostic.checkpoint('FIRST_GRANT_ACTIVATE');
  await grants.activate(tenantId, first.grantId, 'idempotency_RECONSENT_APPROVE_01', 'proof_RECONSENT01');

  const artifactCodec = new SecretArtifactCodec([Buffer.alloc(32, 12)]);
  diagnostic.checkpoint('REFRESH_SETUP');
  const refresh = new PostgresOidcAdapter(
    'RefreshToken', database, artifactCodec, new RateLimitSubjectCodec(Buffer.alloc(32, 13))
  );
  const r0 = 'refresh-reconsent-r0-value';
  const r1 = 'refresh-reconsent-r1-value';
  // BEGIN R20 fixture preparation
  const codeAdapter = new PostgresOidcAdapter('AuthorizationCode', database, artifactCodec);
  const firstCode = 'code_RECONSENT01';
  const secondCode = 'code_RECONSENT02';
  async function expectRejectedIssue(id: string, payload: Record<string, unknown>, parent: {
    model: 'AuthorizationCode' | 'RefreshToken'; keys: readonly string[];
  }, code: 'P0001' | '23505') {
    const counts = () => admin.query<{ artifacts: string; classifications: string }>(
      `SELECT (SELECT count(*)::text FROM oauth.secret_artifacts WHERE model='RefreshToken' AND tenant_id=$1) AS artifacts,
              (SELECT count(*)::text FROM oauth.artifact_classifications WHERE model='RefreshToken' AND tenant_id=$1) AS classifications`, [tenantId]);
    const before = await counts();
    await assert.rejects(refresh.upsertNativeRefresh(id, payload, 3_600, parent), { code });
    assert.deepEqual((await counts()).rows, before.rows);
    assert.equal(await refresh.find(id), undefined);
  }
  // END R20 fixture preparation
  const tokenPayload = nativeFixturePayload({
    grantId: first.grantId,
    accountId,
    clientId: P3A_LIFECYCLE_TEST_CLIENT_ID,
    resource,
    sessionUid: 'session_RECONSENT01'
  });
  diagnostic.checkpoint('R0_ISSUE');
  // BEGIN R20 first issuance
  await codeAdapter.upsert(firstCode, { ...tokenPayload, kind: 'AuthorizationCode' }, 90);
  const codeParent = fixtureParent(artifactCodec, 'AuthorizationCode', firstCode);
  await expectRejectedIssue('refresh_unconsumed_parent', { ...tokenPayload, rotations: 0 }, codeParent, 'P0001');
  await codeAdapter.consume(firstCode);
  await expectRejectedIssue('refresh_missing_parent', { ...tokenPayload, rotations: 0 },
    fixtureParent(artifactCodec, 'AuthorizationCode', 'code_RECONSENT_MISSING'), 'P0001');
  await expectRejectedIssue('refresh_wrong_binding', { ...tokenPayload, rotations: 0, resource: 'https://wrong.example.test/wp-json/wp-auto/mcp' }, codeParent, 'P0001');
  await refresh.upsertNativeRefresh(r0, { ...tokenPayload, rotations: 0 }, 3_600, codeParent);
  await expectRejectedIssue('refresh_duplicate_successor', { ...tokenPayload, rotations: 0 }, codeParent, '23505');
  // END R20 first issuance
  diagnostic.checkpoint('R0_CONSUME');
  await refresh.consume(r0);
  diagnostic.checkpoint('R1_ISSUE');
  await refresh.upsertNativeRefresh(r1, { ...tokenPayload, rotations: 1 }, 3_600,
    fixtureParent(artifactCodec, 'RefreshToken', r0));
  diagnostic.checkpoint('REPLAY_AND_REVOCATION');
  const replayAdapter = new PostgresOidcAdapter(
    'RefreshToken', database, artifactCodec, new RateLimitSubjectCodec(Buffer.alloc(32, 13)),
    () => 'refresh_replay'
  );
  assert.equal(typeof (await replayAdapter.find(r0))?.['consumed'], 'number');
  await replayAdapter.destroy(r0);
  await replayAdapter.revokeByGrantId(first.grantId);

  diagnostic.checkpoint('FIRST_GRANT_ASSERTIONS');
  const firstState = await admin.query<{ status: string; revocation_reason: string | null }>(
    'SELECT status, revocation_reason FROM platform.grants WHERE tenant_id = $1 AND id = $2',
    [tenantId, first.grantId]
  );
  assert.deepEqual(firstState.rows[0], { status: 'revoked', revocation_reason: 'refresh_replay' });
  assert.equal(await refresh.find(r1), undefined);
  await assert.rejects(refresh.consume(r1));
  const firstEvents = await admin.query<{ reason: string }>(
    'SELECT reason FROM oauth.revocation_outbox WHERE grant_id = $1 ORDER BY id',
    [first.grantId]
  );
  assert.deepEqual(firstEvents.rows, [{ reason: 'refresh_replay' }]);
  const claims = new PostgresGrantClaimsResolver(database);
  assert.equal(await claims.resolve(accountId, {
    grantId: first.grantId,
    clientId: P3A_LIFECYCLE_TEST_CLIENT_ID,
    resource
  }), undefined);

  diagnostic.checkpoint('SECOND_GRANT_BEGIN');
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
  diagnostic.checkpoint('SECOND_GRANT_ACTIVATE');
  await grants.activate(tenantId, second.grantId, 'idempotency_RECONSENT_APPROVE_02', 'proof_RECONSENT02');
  diagnostic.checkpoint('SECOND_GRANT_ASSERTIONS');
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

  const explicitRevocationToken = 'refresh-reconsent-explicit-revocation';
  diagnostic.checkpoint('SECOND_REFRESH_ISSUE');
  // BEGIN R20 independent second issuance
  const secondPayload = nativeFixturePayload({ grantId: second.grantId, accountId,
    clientId: P3A_LIFECYCLE_TEST_CLIENT_ID, resource, sessionUid: 'session_RECONSENT02' });
  await codeAdapter.upsert(secondCode, { ...secondPayload, kind: 'AuthorizationCode' }, 90);
  await codeAdapter.consume(secondCode);
  await refresh.upsertNativeRefresh(explicitRevocationToken, { ...secondPayload, rotations: 0 }, 3_600,
    fixtureParent(artifactCodec, 'AuthorizationCode', secondCode));
  // END R20 independent second issuance
  diagnostic.checkpoint('SECOND_REFRESH_CONSUME');
  await refresh.consume(explicitRevocationToken);
  diagnostic.checkpoint('EXPLICIT_REVOCATION');
  await refresh.revokeByGrantId(second.grantId);
  diagnostic.checkpoint('SECOND_REVOCATION_ASSERTIONS');
  const secondState = await admin.query<{ status: string; revocation_reason: string | null }>(
    'SELECT status, revocation_reason FROM platform.grants WHERE tenant_id = $1 AND id = $2',
    [tenantId, second.grantId]
  );
  assert.deepEqual(secondState.rows[0], { status: 'revoked', revocation_reason: 'token_revoked' });
  const secondEvents = await admin.query<{ reason: string }>(
    'SELECT reason FROM oauth.revocation_outbox WHERE grant_id = $1 ORDER BY id',
    [second.grantId]
  );
  assert.deepEqual(secondEvents.rows, [{ reason: 'token_revoked' }]);
  assert.equal(await claims.resolve(accountId, {
    grantId: second.grantId,
    clientId: P3A_LIFECYCLE_TEST_CLIENT_ID,
    resource
  }), undefined);

  diagnostic.checkpoint('CLIENT_SUSPEND');
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

  diagnostic.checkpoint('CLIENT_CONFLICT');
  await admin.query(
    "UPDATE oauth.clients SET redirect_uris = '[\"http://127.0.0.1/wrong\"]'::jsonb WHERE client_id = $1",
    [P3A_LIFECYCLE_TEST_CLIENT_ID]
  );
  await assert.rejects(
    clients.provisionP3aLifecycleTestClient(),
    /p3a_lifecycle_client_conflict/u
  );
  diagnostic.checkpoint('CLIENT_REPROVISION');
  await admin.query('DELETE FROM oauth.clients WHERE client_id = $1', [P3A_LIFECYCLE_TEST_CLIENT_ID]);
  assert.equal((await clients.provisionP3aLifecycleTestClient()).created, true);
  });
});
