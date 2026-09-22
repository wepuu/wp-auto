import assert from 'node:assert/strict';
import test from 'node:test';
import {
  Database,
  PostgresOidcAdapter,
  PostgresSecurityAuditSink,
  SecurityEventRepository,
  TenantRepository
} from '../src/index.js';

const connectionString = process.env['WEPUU_TEST_DATABASE_URL'];
const tenantA = '11111111-1111-4111-8111-111111111111';
const tenantB = '22222222-2222-4222-8222-222222222222';
const accountA = 'account_AAAA';
const accountB = 'account_BBBB';

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
     VALUES ($1, 'active', 'https://identity.example.test', $2), ($3, 'active', 'https://identity.example.test', $4)`,
    [accountA, 'a'.repeat(64), accountB, 'b'.repeat(64)]
  );
  await admin.query("INSERT INTO platform.tenants (id, status) VALUES ($1, 'active'), ($2, 'active')", [tenantA, tenantB]);
  await admin.query(
    `INSERT INTO platform.tenant_memberships (tenant_id, account_id, role, status)
     VALUES ($1, $2, 'owner', 'active'), ($3, $4, 'owner', 'active')`,
    [tenantA, accountA, tenantB, accountB]
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
});
