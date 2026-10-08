import assert from 'node:assert/strict';
import test from 'node:test';
import {
  Database,
  PostgresAccountRegistry,
  PostgresAuthorizationGrantRepository,
  PostgresGrantClaimsResolver,
  PostgresGrantRepository,
  PostgresAccountSessionStore,
  PostgresOidcAdapter,
  PostgresPairingRepository,
  PostgresResourceRegistry,
  PostgresSecurityAuditSink,
  PostgresSigningKeyRepository,
  SecurityEventRepository,
  SecretArtifactCodec,
  RateLimitSubjectCodec,
  SiteRepository,
  TenantRepository
} from '../src/index.js';
import { canonicalizeResource, secretHash, type VerifiedSiteProof } from '@wepuu/pairing';

const connectionString = process.env['WEPUU_TEST_DATABASE_URL'];
const tenantA = '11111111-1111-4111-8111-111111111111';
const tenantB = '22222222-2222-4222-8222-222222222222';
const accountA = 'account_AAAA';
const accountB = 'account_BBBB';
const accountC = 'account_CCCC';

test('PostgreSQL RLS denies cross-tenant and missing-membership access', { skip: connectionString === undefined }, async (t) => {
  assert.ok(connectionString);
  const database = new Database({ connectionString, applicationName: 'wepuu-tenant-test' });
  t.after(() => database.close());
  await database.migrate();
  await database.migrate();
  const admin = database.poolForMigrationsAndTests;
  const maximumClientId = 'c'.repeat(256);
  await admin.query(
    `INSERT INTO oauth.clients (client_id, registration_mode, redirect_uris, metadata_digest, status)
     VALUES ($1, 'pre-registered', '[]'::jsonb, 'boundary-client', 'active')`,
    [maximumClientId]
  );
  await admin.query('DELETE FROM oauth.clients WHERE client_id = $1', [maximumClientId]);
  await assert.rejects(
    admin.query(
      `INSERT INTO oauth.clients (client_id, registration_mode, redirect_uris, metadata_digest, status)
       VALUES ($1, 'pre-registered', '[]'::jsonb, 'too-long-client', 'active')`,
      ['c'.repeat(257)]
    ),
    (error: unknown) => typeof error === 'object' && error !== null && 'code' in error && error.code === '23514'
  );
  await assert.rejects(
    admin.query(
      `INSERT INTO oauth.clients (client_id, registration_mode, redirect_uris, metadata_digest, status)
       VALUES ('invalid/client', 'pre-registered', '[]'::jsonb, 'invalid-character-client', 'active')`
    ),
    (error: unknown) => typeof error === 'object' && error !== null && 'code' in error && error.code === '23514'
  );
  await admin.query('TRUNCATE audit.security_events, platform.tenant_memberships, platform.tenants, platform.accounts CASCADE');
  await admin.query(
    `INSERT INTO platform.accounts (id, status, identity_issuer, identity_subject_hash)
     VALUES ($1, 'active', 'https://identity.example.test', $2),
            ($3, 'active', 'https://identity.example.test', $4),
            ($5, 'active', 'https://identity.example.test', $6)`,
    [accountA, 'a'.repeat(64), accountB, 'b'.repeat(64), accountC, 'c'.repeat(64)]
  );

  const sessions = new PostgresAccountSessionStore(database);
  const sessionHash = Buffer.alloc(32, 7);
  const createdSession = await sessions.createSession({
    candidateAccountId: 'account_LOGIN0001',
    identityIssuer: 'https://login.example.test/',
    identitySubjectHash: 'h'.repeat(43),
    sessionHash,
    authenticatedAt: new Date('2026-09-22T00:00:00.000Z'),
    expiresAt: new Date('2099-09-22T12:00:00.000Z')
  });
  assert.equal(createdSession?.accountId, 'account_LOGIN0001');
  assert.equal((await sessions.createSession({
    candidateAccountId: 'account_OTHER0001',
    identityIssuer: 'https://login.example.test/',
    identitySubjectHash: 'h'.repeat(43),
    sessionHash: Buffer.alloc(32, 8),
    authenticatedAt: new Date('2026-09-22T00:00:01.000Z'),
    expiresAt: new Date('2099-09-22T12:00:01.000Z')
  }))?.accountId, 'account_LOGIN0001');
  assert.equal((await sessions.resolve(sessionHash))?.accountId, 'account_LOGIN0001');
  await sessions.revoke(sessionHash);
  assert.equal(await sessions.resolve(sessionHash), undefined);
  const expiredHash = Buffer.alloc(32, 10);
  await sessions.createSession({
    candidateAccountId: 'account_EXPIRED01',
    identityIssuer: 'https://login.example.test/',
    identitySubjectHash: 'i'.repeat(43),
    sessionHash: expiredHash,
    authenticatedAt: new Date('2020-01-01T00:00:00.000Z'),
    expiresAt: new Date('2020-01-01T12:00:00.000Z')
  });
  assert.equal(await sessions.resolve(expiredHash), undefined);
  await admin.query("UPDATE platform.accounts SET status = 'suspended' WHERE id = 'account_LOGIN0001'");
  assert.equal(await sessions.createSession({
    candidateAccountId: 'account_OTHER0002',
    identityIssuer: 'https://login.example.test/',
    identitySubjectHash: 'h'.repeat(43),
    sessionHash: Buffer.alloc(32, 9),
    authenticatedAt: new Date('2026-09-22T00:00:02.000Z'),
    expiresAt: new Date('2099-09-22T12:00:02.000Z')
  }), undefined);
  await assert.rejects(
    database.withIdentityWriter((client) => client.query('SELECT 1 FROM platform.tenants')),
    (error: unknown) => typeof error === 'object' && error !== null && 'code' in error && error.code === '42501'
  );
  await admin.query("INSERT INTO platform.tenants (id, status) VALUES ($1, 'active'), ($2, 'active')", [tenantA, tenantB]);
  await admin.query(
    `INSERT INTO platform.tenant_memberships (tenant_id, account_id, role, status)
     VALUES ($1, $2, 'owner', 'active'), ($3, $4, 'owner', 'active'), ($1, $5, 'member', 'active')`,
    [tenantA, accountA, tenantB, accountB, accountC]
  );

  const repository = new TenantRepository();
  const own = await database.withTenant(
    { tenantId: tenantA, accountId: accountA, correlationId: 'correlation_AAAA' },
    (client) => repository.findById(client, tenantA)
  );
  assert.equal(own?.id, tenantA);

  const crossTenant = await database.withTenant(
    { tenantId: tenantA, accountId: accountA, correlationId: 'correlation_BBBB' },
    (client) => repository.findById(client, tenantB)
  );
  assert.equal(crossTenant, undefined);

  const wrongAccount = await database.withTenant(
    { tenantId: tenantA, accountId: accountB, correlationId: 'correlation_CCCC' },
    (client) => repository.findById(client, tenantA)
  );
  assert.equal(wrongAccount, undefined);

  await assert.rejects(
    database.withTenant(
      { tenantId: tenantA, accountId: accountA, correlationId: 'correlation_DDDD' },
      (client) => client.query('SELECT 1 FROM oauth.provider_artifacts')
    ),
    (error: unknown) => typeof error === 'object' && error !== null && 'code' in error && error.code === '42501'
  );

  await assert.rejects(
    admin.query(
      `INSERT INTO oauth.signing_key_metadata
        (kid, algorithm, custody_provider, custody_reference, public_jwk, status, publish_at)
       VALUES ($1, 'RS256', 'aws-kms', $2, $3::jsonb, 'published', now())`,
      ['unsafe_key_0001', 'kms-reference', JSON.stringify({ kty: 'RSA', alg: 'RS256', use: 'sig', n: 'public', e: 'AQAB', d: 'private' })]
    ),
    (error: unknown) => typeof error === 'object' && error !== null && 'code' in error && error.code === '23514'
  );

  await assert.rejects(
    admin.query(
      `INSERT INTO audit.security_events
        (tenant_id, occurred_at, event_name, outcome, reason, correlation_id, service, service_version)
       VALUES ($1, now(), 'unbounded.event', 'denied', 'none', 'correlation_BAD1', 'control-api', '0.2.0')`,
      [tenantA]
    ),
    (error: unknown) => typeof error === 'object' && error !== null && 'code' in error && error.code === '23514'
  );

  const audit = new PostgresSecurityAuditSink(database);
  await audit.write({
    occurredAt: '2026-09-17T00:00:00.000Z',
    eventName: 'tenant.access_denied',
    outcome: 'denied',
    reason: 'membership_missing',
    correlationId: 'correlation_EEEE',
    tenantId: tenantA,
    actorId: accountA,
    service: 'control-api',
    serviceVersion: '0.2.0'
  });
  const events = new SecurityEventRepository();
  const ownEvents = await database.withTenant(
    { tenantId: tenantA, accountId: accountA, correlationId: 'correlation_FFFF' },
    (client) => events.list(client)
  );
  assert.equal(ownEvents.length, 1);
  const otherEvents = await database.withTenant(
    { tenantId: tenantB, accountId: accountB, correlationId: 'correlation_GGGG' },
    (client) => events.list(client)
  );
  assert.equal(otherEvents.length, 0);

  const artifactCodec = new SecretArtifactCodec([Buffer.alloc(32, 31)]);
  const adapter = new PostgresOidcAdapter('Grant', database, artifactCodec);
  await adapter.upsert('persistent_grant_0001', { tenantId: tenantA, grantId: 'grant_00000001' }, 300);
  const secondConnection = new Database({ connectionString, applicationName: 'wepuu-restart-test' });
  try {
    const restored = await new PostgresOidcAdapter('Grant', secondConnection, artifactCodec).find('persistent_grant_0001');
    assert.equal(restored?.['grantId'], 'grant_00000001');
  } finally {
    await secondConnection.close();
  }

  const resource = canonicalizeResource('https://site-a.example.test/wp-json/wp-auto/mcp');
  const ownerContext = { tenantId: tenantA, accountId: accountA, correlationId: 'correlation_PAIR1' };
  const pairing = new PostgresPairingRepository(database, ownerContext);
  const attempt = {
    tenantId: tenantA,
    id: 'attempt_00000001',
    initiatorAccountId: accountA,
    correlationId: 'correlation_PAIR2',
    resource,
    verifierHash: secretHash('v'.repeat(43)),
    status: 'pending' as const,
    expiresAt: new Date(Date.now() + 60_000)
  };
  await pairing.createAttempt(attempt);
  assert.equal(await pairing.markVerifying(tenantA, attempt.id), true);
  const proof = {
    claims: {},
    publicJwk: { kty: 'OKP', crv: 'Ed25519', x: 'x'.repeat(43), alg: 'EdDSA', use: 'sig' },
    thumbprint: 'site-thumbprint-0001'
  } as unknown as VerifiedSiteProof;
  await pairing.complete(attempt, proof, 'site_00000001', 'idempotency_PAIR0001');
  await pairing.complete(attempt, proof, 'site_00000001', 'idempotency_PAIR0001');
  assert.equal(await new PostgresResourceRegistry(database).resolve(resource).then((value) => value?.resource), resource);

  const memberPairing = new PostgresPairingRepository(database, {
    tenantId: tenantA, accountId: accountC, correlationId: 'correlation_PAIR3'
  });
  await assert.rejects(memberPairing.createAttempt({ ...attempt, id: 'attempt_00000002', initiatorAccountId: accountC }));
  const memberContext = { tenantId: tenantA, accountId: accountC, correlationId: 'correlation_PAIR4' };
  assert.equal(await database.withTenant(memberContext, (client) => new SiteRepository().list(client)).then((rows) => rows.length), 1);
  assert.equal(await database.withTenant(memberContext, (client) => new SiteRepository().disconnect(client, tenantA, 'site_00000001')), false);

  const grants = new PostgresGrantRepository(database, ownerContext);
  const grantCreatedAt = new Date();
  const grantExpiresAt = new Date(grantCreatedAt.getTime() + 60_000);
  const grantRequestDigest = secretHash('grant-create-request-0001');
  const createdGrant = await grants.createPending({
    tenantId: tenantA,
    id: 'grant_00000001',
    siteId: 'site_00000001',
    subjectId: accountA,
    clientId: 'client_00000001',
    scopes: ['mcp:read'],
    resource,
    challengeHash: secretHash('challenge_00000000000000000000000'),
    expiresAt: grantExpiresAt,
    consentVersion: '1',
    idempotencyKey: 'idempotency_CREATE001',
    requestDigest: grantRequestDigest,
    createdAt: grantCreatedAt
  });
  assert.equal(createdGrant.id, 'grant_00000001');
  const replayedGrant = await grants.createPending({
    tenantId: tenantA, id: 'grant_ignored0001', siteId: 'site_00000001', subjectId: accountA,
    clientId: 'client_00000001', scopes: ['mcp:read'], resource,
    challengeHash: secretHash('challenge_00000000000000000000000'), expiresAt: new Date(grantExpiresAt.getTime() + 10_000),
    consentVersion: '1', idempotencyKey: 'idempotency_CREATE001', requestDigest: grantRequestDigest,
    createdAt: new Date(grantCreatedAt.getTime() + 10_000)
  });
  assert.equal(replayedGrant.id, 'grant_00000001');
  await grants.activate(tenantA, 'grant_00000001', 'idempotency_GRANT001', proof.thumbprint);
  assert.equal(await new PostgresAccountRegistry(database).isActive(accountA), true);
  assert.deepEqual(await new PostgresAuthorizationGrantRepository(database).resolveExact({
    subjectId: accountA,
    clientId: 'client_00000001',
    resource,
    scopes: ['mcp:read']
  }).then((binding) => binding?.grantId), 'grant_00000001');
  assert.equal(await new PostgresAuthorizationGrantRepository(database).resolveExact({
    subjectId: accountA,
    clientId: 'client_wrong0001',
    resource,
    scopes: ['mcp:read']
  }), undefined);
  assert.deepEqual(await new PostgresGrantClaimsResolver(database).resolve(accountA), {
    tenantId: tenantA,
    siteId: 'site_00000001',
    grantId: 'grant_00000001'
  });
  const sites = new SiteRepository();
  assert.equal(await database.withTenant(ownerContext, (client) => sites.disconnect(client, tenantA, 'site_00000001')), true);
  assert.equal(await new PostgresResourceRegistry(database).resolve(resource), undefined);
  assert.equal(await new PostgresGrantClaimsResolver(database).resolve(accountA), undefined);

  const reparingAttempt = { ...attempt, id: 'attempt_00000003', correlationId: 'correlation_PAIR5' };
  await pairing.createAttempt(reparingAttempt);
  assert.equal(await pairing.markVerifying(tenantA, reparingAttempt.id), true);
  await pairing.complete(reparingAttempt, proof, 'site_00000002', 'idempotency_PAIR0002');
  assert.equal(await new PostgresResourceRegistry(database).resolve(resource).then((value) => value?.resource), resource);
});

test('refresh CAS has one winner and replay revokes the exact grant with one outbox event', {
  skip: connectionString === undefined
}, async (t) => {
  assert.ok(connectionString);
  const database = new Database({ connectionString, applicationName: 'wepuu-refresh-replay-test' });
  t.after(() => database.close());
  await database.migrate();
  const admin = database.poolForMigrationsAndTests;
  const tenant = '33333333-3333-4333-8333-333333333333';
  const resource = 'https://refresh.example.test/wp-json/wp-auto/mcp';
  await admin.query(
    `INSERT INTO platform.accounts (id, status, identity_issuer, identity_subject_hash)
     VALUES ('account_REFRESH', 'active', 'https://identity.example.test/', $1)
     ON CONFLICT DO NOTHING`,
    ['c'.repeat(64)]
  );
  await admin.query(
    `INSERT INTO platform.tenants (id, status) VALUES ($1, 'active') ON CONFLICT DO NOTHING`,
    [tenant]
  );
  await admin.query("DELETE FROM oauth.signing_key_metadata WHERE kid IN ('kms_active_test', 'kms_retiring_test', 'kms_revoked_test', 'kms_published_test')");
  const publicJwk = JSON.stringify({ kty: 'RSA', n: 'abc', e: 'AQAB', alg: 'RS256', use: 'sig', kid: 'placeholder' });
  await admin.query(
    `INSERT INTO oauth.signing_key_metadata
       (kid, algorithm, custody_provider, custody_reference, public_jwk, status, publish_at, activate_at, retire_at, revoke_at)
     VALUES
       ('kms_active_test', 'RS256', 'aws-kms', 'arn:aws:kms:us-east-1:111111111111:key/11111111-1111-4111-8111-111111111111',
        ($1::jsonb || '{"kid":"kms_active_test"}'::jsonb), 'active', now() - interval '30 minutes', now() - interval '10 minutes', NULL, NULL),
       ('kms_retiring_test', 'RS256', 'aws-kms', 'arn:aws:kms:us-east-1:111111111111:key/22222222-2222-4222-8222-222222222222',
        ($1::jsonb || '{"kid":"kms_retiring_test"}'::jsonb), 'retiring', now() - interval '1 hour', now() - interval '40 minutes', now() + interval '20 minutes', NULL),
       ('kms_revoked_test', 'RS256', 'aws-kms', 'arn:aws:kms:us-east-1:111111111111:key/33333333-3333-4333-8333-333333333333',
        ($1::jsonb || '{"kid":"kms_revoked_test"}'::jsonb), 'revoked', now() - interval '1 hour', now() - interval '40 minutes', now(), now())`,
    [publicJwk]
  );
  const lifecycle = await new PostgresSigningKeyRepository(database).loadUsable();
  assert.equal(lifecycle.active.kid, 'kms_active_test');
  assert.deepEqual(lifecycle.verification.map((key) => key.kid), ['kms_retiring_test']);
  const keyRepository = new PostgresSigningKeyRepository(database);
  await keyRepository.publish({
    kid: 'kms_published_test',
    custodyReference: 'next-local-slot',
    publicJwk: { ...JSON.parse(publicJwk) as Record<string, unknown>, kid: 'kms_published_test' },
    publishedAt: new Date(Date.now() - 21 * 60 * 1_000)
  });
  assert.equal(await keyRepository.activate('kms_published_test'), true);
  assert.equal(await keyRepository.isActive('kms_published_test'), true);
  await admin.query(
    `INSERT INTO platform.sites
       (tenant_id, id, resource_uri, display_hostname, status, protocol_version, site_public_jwk, site_key_thumbprint)
     VALUES ($1, 'site_REFRESH01', $2, 'refresh.example.test', 'active', '1',
       '{"kty":"OKP","crv":"Ed25519","x":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"}'::jsonb,
       'thumbprint_REFRESH000000000000000000000000000000000000000000000000000000')
     ON CONFLICT DO NOTHING`,
    [tenant, resource]
  );
  await admin.query(
    `INSERT INTO platform.grants
       (tenant_id, id, site_id, subject_id, client_id, scopes, consent_challenge_hash,
        consent_expires_at, status, consent_version)
     VALUES ($1, 'grant_REFRESH01', 'site_REFRESH01', 'account_REFRESH', 'client_REFRESH01',
       ARRAY['mcp:read'], decode(repeat('11', 32), 'hex'), now() + interval '5 minutes', 'active', '1')
     ON CONFLICT DO NOTHING`,
    [tenant]
  );
  const adapter = new PostgresOidcAdapter(
    'RefreshToken', database, new SecretArtifactCodec([Buffer.alloc(32, 4)]),
    new RateLimitSubjectCodec(Buffer.alloc(32, 5))
  );
  const token = 'refresh-token-value-00000000000000000000000000000001';
  await adapter.upsert(token, {
    kind: 'RefreshToken', grantId: 'grant_REFRESH01', accountId: 'account_REFRESH',
    clientId: 'client_REFRESH01', rotations: 0
  }, 3600);
  const attempts = await Promise.allSettled([adapter.consume(token), adapter.consume(token)]);
  assert.equal(attempts.filter((attempt) => attempt.status === 'fulfilled').length, 1);
  assert.equal(attempts.filter((attempt) => attempt.status === 'rejected').length, 1);
  const grant = await admin.query<{ status: string }>(
    'SELECT status FROM platform.grants WHERE tenant_id = $1 AND id = $2',
    [tenant, 'grant_REFRESH01']
  );
  assert.equal(grant.rows[0]?.status, 'revoked');
  const events = await admin.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM oauth.revocation_outbox
     WHERE tenant_id = $1 AND grant_id = $2 AND reason = 'refresh_replay'`,
    [tenant, 'grant_REFRESH01']
  );
  assert.equal(events.rows[0]?.count, '1');
  await assert.rejects(adapter.consume(token));
  const repeatEvents = await admin.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM oauth.revocation_outbox
     WHERE tenant_id = $1 AND grant_id = $2 AND reason = 'refresh_replay'`,
    [tenant, 'grant_REFRESH01']
  );
  assert.equal(repeatEvents.rows[0]?.count, '1');
  assert.equal(await keyRepository.revoke('kms_published_test'), true);
  assert.equal(await keyRepository.isActive('kms_published_test'), false);
  const keyEvents = await admin.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM oauth.revocation_outbox
     WHERE tenant_id = $1 AND key_id = 'kms_published_test' AND reason = 'key_revoked'`,
    [tenant]
  );
  assert.equal(keyEvents.rows[0]?.count, '1');
});
