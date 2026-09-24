import assert from 'node:assert/strict';
import test from 'node:test';
import {
  Database,
  PostgresGrantClaimsResolver,
  PostgresGrantRepository,
  PostgresAccountSessionStore,
  PostgresOidcAdapter,
  PostgresPairingRepository,
  PostgresResourceRegistry,
  PostgresSecurityAuditSink,
  SecurityEventRepository,
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

  const adapter = new PostgresOidcAdapter('Grant', database);
  await adapter.upsert('persistent_grant_0001', { tenantId: tenantA, grantId: 'grant_00000001' }, 300);
  const secondConnection = new Database({ connectionString, applicationName: 'wepuu-restart-test' });
  try {
    const restored = await new PostgresOidcAdapter('Grant', secondConnection).find('persistent_grant_0001');
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
