import assert from 'node:assert/strict';
import test from 'node:test';
import { DataLifecycleService, Database } from '../src/index.js';

const connectionString = process.env['WEPUU_TEST_DATABASE_URL'];
const tenantId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ownerId = 'account_OWNER01';
const memberId = 'account_DELETE01';
const ownerOnlyId = 'account_OWNER02';
const replacementOwnerId = 'account_OWNER03';
const ownerOnlyTenantId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const siteId = 'site_DELETE01';
const grantId = 'grant_DELETE01';
const familyId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaab';
const resource = 'https://delete.example.test/wp-json/wp-auto/mcp';

test('deletion lifecycle revokes immediately and purges after the safety window', {
  skip: connectionString === undefined
}, async (t) => {
  assert.ok(connectionString);
  const database = new Database({ connectionString, applicationName: 'wepuu-deletion-test' });
  const admin = database.poolForMigrationsAndTests;
  t.after(async () => {
    await admin.query('DELETE FROM platform.deletion_tombstones WHERE job_id IN (SELECT id FROM platform.deletion_jobs WHERE scope_id IN ($1, $2))', [memberId, tenantId]);
    await admin.query('DELETE FROM platform.deletion_jobs WHERE scope_id IN ($1, $2)', [memberId, tenantId]);
    await admin.query('DELETE FROM oauth.secret_artifacts WHERE payload->>\'grantId\' = $1', [grantId]);
    await admin.query('DELETE FROM oauth.provider_artifacts WHERE payload->>\'grantId\' = $1', [grantId]);
    await admin.query('DELETE FROM oauth.refresh_families WHERE family_id = $1', [familyId]);
    await admin.query('DELETE FROM platform.grants WHERE id = $1', [grantId]);
    await admin.query('DELETE FROM platform.sites WHERE tenant_id = $1 AND id = $2', [tenantId, siteId]);
    await admin.query('DELETE FROM platform.tenant_memberships WHERE tenant_id = $1', [tenantId]);
    await admin.query('DELETE FROM platform.account_sessions WHERE account_id = $1', [memberId]);
    await admin.query('DELETE FROM platform.accounts WHERE id IN ($1, $2)', [ownerId, memberId]);
    await admin.query('DELETE FROM platform.tenants WHERE id = $1', [tenantId]);
    await database.close();
  });

  await database.migrate();
  await admin.query(
    `INSERT INTO platform.accounts (id, status, identity_issuer, identity_subject_hash)
     VALUES ($1, 'active', 'https://identity.example.test/', $3),
            ($2, 'active', 'https://identity.example.test/', $4)
     ON CONFLICT (id) DO UPDATE SET status = 'active'`,
    [ownerId, memberId, 'o'.repeat(64), 'm'.repeat(64)]
  );
  await admin.query(
    `INSERT INTO platform.tenants (id, status) VALUES ($1, 'active')
     ON CONFLICT (id) DO UPDATE SET status = 'active', deleted_at = NULL`, [tenantId]
  );
  await admin.query(
    `INSERT INTO platform.tenant_memberships (tenant_id, account_id, role, status)
     VALUES ($1, $2, 'owner', 'active'), ($1, $3, 'member', 'active')
     ON CONFLICT (tenant_id, account_id) DO UPDATE SET status = 'active', role = EXCLUDED.role`,
    [tenantId, ownerId, memberId]
  );
  await admin.query(
    `INSERT INTO platform.sites
      (tenant_id, id, resource_uri, display_hostname, status, protocol_version, site_public_jwk, site_key_thumbprint)
     VALUES ($1, $2, $3, 'delete.example.test', 'active', '1',
       '{"kty":"OKP","crv":"Ed25519","x":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"}'::jsonb,
       'thumb_delete_000000000000000000000000000000000000000000000000000000000000')
     ON CONFLICT (tenant_id, id) DO UPDATE SET status = 'active'`,
    [tenantId, siteId, resource]
  );
  await admin.query(
    `INSERT INTO platform.grants
      (tenant_id, id, site_id, subject_id, client_id, scopes, consent_challenge_hash,
       consent_expires_at, status, consent_version)
     VALUES ($1, $2, $3, $4, 'client_DELETE01', ARRAY['mcp:read'], decode(repeat('11', 32), 'hex'),
       now() + interval '5 minutes', 'active', '1')
     ON CONFLICT (tenant_id, id) DO UPDATE SET status = 'active'`,
    [tenantId, grantId, siteId, memberId]
  );
  await admin.query(
    `INSERT INTO oauth.refresh_families
      (family_id, tenant_id, site_id, grant_id, client_id, subject_id, status, last_used_at, absolute_expires_at)
     VALUES ($1, $2, $3, $4, 'client_DELETE01', $5, 'active', now(), now() + interval '30 days')
     ON CONFLICT (family_id) DO UPDATE SET status = 'active', revoked_at = NULL`,
    [familyId, tenantId, siteId, grantId, memberId]
  );
  await admin.query(
    `INSERT INTO oauth.secret_artifacts
      (model, lookup_version, artifact_hash, tenant_id, partition_kind, payload, expires_at)
     VALUES ('RefreshToken', 1, $1, $2, 'tenant', $3::jsonb, now() + interval '30 days')
     ON CONFLICT DO NOTHING`,
    [Buffer.alloc(32, 7), tenantId, JSON.stringify({ grantId })]
  );
  await admin.query(
    `INSERT INTO oauth.provider_artifacts
      (model, artifact_id, tenant_id, partition_kind, payload, expires_at)
     VALUES ('Grant', 'artifact_DELETE01', $1, 'tenant', $2::jsonb, now() + interval '30 days')
     ON CONFLICT (model, artifact_id) DO NOTHING`,
    [tenantId, JSON.stringify({ grantId })]
  );
  await admin.query(
    `INSERT INTO platform.account_sessions
      (session_hash, account_id, identity_issuer, authenticated_at, expires_at)
     VALUES ($1, $2, 'https://identity.example.test/', now(), now() + interval '12 hours')
     ON CONFLICT (session_hash) DO NOTHING`,
    [Buffer.alloc(32, 8), memberId]
  );

  const lifecycle = new DataLifecycleService({
    database,
    now: () => new Date('2026-09-29T00:00:00.000Z')
  });
  const job = await lifecycle.begin({ kind: 'account', accountId: memberId }, ownerId);
  const waiting = await lifecycle.advance(job.jobId, new Date('2026-09-29T00:00:00.000Z'));
  assert.equal(waiting.status, 'waiting');
  assert.equal(waiting.scopeKind, 'account');
  assert.ok(waiting.safeAfter);
  const accountState = await admin.query<{ status: string }>('SELECT status FROM platform.accounts WHERE id = $1', [memberId]);
  const grantState = await admin.query<{ status: string }>('SELECT status FROM platform.grants WHERE id = $1', [grantId]);
  assert.equal(accountState.rows[0]?.status, 'deleted');
  assert.equal(grantState.rows[0]?.status, 'revoked');

  const complete = await lifecycle.advance(job.jobId, new Date('2026-09-29T00:07:00.000Z'));
  assert.equal(complete.status, 'complete');
  assert.equal((await admin.query('SELECT 1 FROM platform.accounts WHERE id = $1', [memberId])).rowCount, 0);
  assert.equal((await admin.query('SELECT 1 FROM platform.grants WHERE id = $1', [grantId])).rowCount, 0);
  assert.equal((await admin.query('SELECT 1 FROM oauth.refresh_families WHERE family_id = $1', [familyId])).rowCount, 0);
  assert.equal((await admin.query('SELECT 1 FROM oauth.secret_artifacts WHERE payload->>\'grantId\' = $1', [grantId])).rowCount, 0);
  assert.equal((await admin.query('SELECT 1 FROM oauth.provider_artifacts WHERE payload->>\'grantId\' = $1', [grantId])).rowCount, 0);
  assert.equal((await admin.query('SELECT 1 FROM platform.tenants WHERE id = $1', [tenantId])).rowCount, 1);
});

test('deletion refuses a sole active owner and accepts an account with a replacement owner', { skip: connectionString === undefined }, async (t) => {
  assert.ok(connectionString);
  const database = new Database({ connectionString, applicationName: 'wepuu-deletion-owner-test' });
  const admin = database.poolForMigrationsAndTests;
  t.after(async () => {
    await admin.query('DELETE FROM platform.deletion_tombstones WHERE job_id IN (SELECT id FROM platform.deletion_jobs WHERE scope_id = $1)', [ownerOnlyId]);
    await admin.query('DELETE FROM platform.deletion_jobs WHERE scope_id = $1', [ownerOnlyId]);
    await admin.query('DELETE FROM platform.tenant_memberships WHERE account_id IN ($1, $2)', [ownerOnlyId, replacementOwnerId]);
    await admin.query('DELETE FROM platform.tenants WHERE id = $1', [ownerOnlyTenantId]);
    await admin.query('DELETE FROM platform.accounts WHERE id IN ($1, $2)', [ownerOnlyId, replacementOwnerId]);
    await database.close();
  });
  await database.migrate();
  await admin.query(
    `INSERT INTO platform.accounts (id, status, identity_issuer, identity_subject_hash)
     VALUES ($1, 'active', 'https://identity.example.test/', $2)
     ON CONFLICT (id) DO UPDATE SET status = 'active'`, [ownerOnlyId, 'o'.repeat(64)]
  );
  await admin.query(`INSERT INTO platform.tenants (id, status) VALUES ($1, 'active') ON CONFLICT DO NOTHING`, [ownerOnlyTenantId]);
  await admin.query(
    `INSERT INTO platform.tenant_memberships (tenant_id, account_id, role, status)
     VALUES ($1, $2, 'owner', 'active')
     ON CONFLICT (tenant_id, account_id) DO UPDATE SET role = 'owner', status = 'active'`, [ownerOnlyTenantId, ownerOnlyId]
  );
  const lifecycle = new DataLifecycleService({ database });
  await assert.rejects(
    lifecycle.begin({ kind: 'account', accountId: ownerOnlyId }, ownerOnlyId),
    /deletion_owner_transfer_required/u
  );
  await admin.query(
    `INSERT INTO platform.accounts (id, status, identity_issuer, identity_subject_hash)
     VALUES ($1, 'active', 'https://identity.example.test/', $2)
     ON CONFLICT (id) DO UPDATE SET status = 'active'`, [replacementOwnerId, 'r'.repeat(64)]
  );
  await admin.query(
    `INSERT INTO platform.tenant_memberships (tenant_id, account_id, role, status)
     VALUES ($1, $2, 'owner', 'active')
     ON CONFLICT (tenant_id, account_id) DO UPDATE SET role = 'owner', status = 'active'`,
    [ownerOnlyTenantId, replacementOwnerId]
  );
  assert.equal(
    (await lifecycle.begin({ kind: 'account', accountId: ownerOnlyId }, replacementOwnerId)).status,
    'pending'
  );
});

test('tenant deletion purges all tenant artifacts after the safety window', {
  skip: connectionString === undefined
}, async (t) => {
  assert.ok(connectionString);
  const tenant = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  const account = 'account_DELETE02';
  const site = 'site_DELETE02';
  const grant = 'grant_DELETE02';
  const database = new Database({ connectionString, applicationName: 'wepuu-deletion-tenant-test' });
  const admin = database.poolForMigrationsAndTests;
  t.after(async () => {
    await admin.query('DELETE FROM platform.deletion_tombstones WHERE job_id IN (SELECT id FROM platform.deletion_jobs WHERE scope_id = $1)', [tenant]);
    await admin.query('DELETE FROM platform.deletion_jobs WHERE scope_id = $1', [tenant]);
    await admin.query('DELETE FROM platform.accounts WHERE id = $1', [account]);
    await admin.query('DELETE FROM platform.tenants WHERE id = $1', [tenant]);
    await database.close();
  });
  await database.migrate();
  await admin.query(
    `INSERT INTO platform.accounts (id, status, identity_issuer, identity_subject_hash)
     VALUES ($1, 'active', 'https://identity.example.test/', $2)
     ON CONFLICT (id) DO UPDATE SET status = 'active'`, [account, 'd'.repeat(64)]
  );
  await admin.query(
    `INSERT INTO platform.tenants (id, status) VALUES ($1, 'active')
     ON CONFLICT (id) DO UPDATE SET status = 'active', deleted_at = NULL`, [tenant]
  );
  await admin.query(
    `INSERT INTO platform.tenant_memberships (tenant_id, account_id, role, status)
     VALUES ($1, $2, 'owner', 'active')
     ON CONFLICT (tenant_id, account_id) DO UPDATE SET status = 'active', role = 'owner'`, [tenant, account]
  );
  await admin.query(
    `INSERT INTO platform.sites
      (tenant_id, id, resource_uri, display_hostname, status, protocol_version, site_public_jwk, site_key_thumbprint)
     VALUES ($1, $2, 'https://delete02.example.test/wp-json/wp-auto/mcp',
       'delete02.example.test', 'active', '1',
       '{"kty":"OKP","crv":"Ed25519","x":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"}'::jsonb,
       'thumb_delete_02_000000000000000000000000000000000000000000000000000000')
     ON CONFLICT (tenant_id, id) DO UPDATE SET status = 'active'`, [tenant, site]
  );
  await admin.query(
    `INSERT INTO platform.grants
      (tenant_id, id, site_id, subject_id, client_id, scopes, consent_challenge_hash,
       consent_expires_at, status, consent_version)
     VALUES ($1, $2, $3, $4, 'client_DELETE02', ARRAY['mcp:read'], decode(repeat('33', 32), 'hex'),
       now() + interval '5 minutes', 'active', '1')
     ON CONFLICT (tenant_id, id) DO UPDATE SET status = 'active'`, [tenant, grant, site, account]
  );

  const lifecycle = new DataLifecycleService({ database });
  const job = await lifecycle.begin({ kind: 'tenant', tenantId: tenant }, account);
  assert.equal((await lifecycle.advance(job.jobId, new Date('2026-09-30T00:00:00.000Z'))).status, 'waiting');
  assert.equal((await lifecycle.advance(job.jobId, new Date('2026-09-30T00:07:00.000Z'))).status, 'complete');
  assert.equal((await admin.query('SELECT 1 FROM platform.tenants WHERE id = $1', [tenant])).rowCount, 0);
  assert.equal((await admin.query('SELECT 1 FROM platform.sites WHERE tenant_id = $1', [tenant])).rowCount, 0);
  assert.equal((await admin.query('SELECT 1 FROM platform.grants WHERE tenant_id = $1', [tenant])).rowCount, 0);
});

test('site deletion preserves the tenant and unrelated site', {
  skip: connectionString === undefined
}, async (t) => {
  assert.ok(connectionString);
  const tenant = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  const account = 'account_DELETE03';
  const deletedSite = 'site_DELETE03';
  const retainedSite = 'site_KEEP03';
  const deletedGrant = 'grant_DELETE03';
  const retainedGrant = 'grant_KEEP03';
  const database = new Database({ connectionString, applicationName: 'wepuu-deletion-site-test' });
  const admin = database.poolForMigrationsAndTests;
  t.after(async () => {
    await admin.query('DELETE FROM platform.deletion_tombstones WHERE job_id IN (SELECT id FROM platform.deletion_jobs WHERE tenant_id = $1)', [tenant]);
    await admin.query('DELETE FROM platform.deletion_jobs WHERE tenant_id = $1', [tenant]);
    await admin.query('DELETE FROM oauth.secret_artifacts WHERE payload->>\'grantId\' IN ($1, $2)', [deletedGrant, retainedGrant]);
    await admin.query('DELETE FROM oauth.provider_artifacts WHERE payload->>\'grantId\' IN ($1, $2)', [deletedGrant, retainedGrant]);
    await admin.query('DELETE FROM platform.idempotency_records WHERE tenant_id = $1', [tenant]);
    await admin.query('DELETE FROM platform.grants WHERE tenant_id = $1', [tenant]);
    await admin.query('DELETE FROM platform.tenant_memberships WHERE tenant_id = $1', [tenant]);
    await admin.query('DELETE FROM platform.sites WHERE tenant_id = $1', [tenant]);
    await admin.query('DELETE FROM platform.accounts WHERE id = $1', [account]);
    await admin.query('DELETE FROM platform.tenants WHERE id = $1', [tenant]);
    await database.close();
  });
  await database.migrate();
  await admin.query(
    `INSERT INTO platform.accounts (id, status, identity_issuer, identity_subject_hash)
     VALUES ($1, 'active', 'https://identity.example.test/', $2)
     ON CONFLICT (id) DO UPDATE SET status = 'active'`, [account, 'e'.repeat(64)]
  );
  await admin.query(
    `INSERT INTO platform.tenants (id, status) VALUES ($1, 'active')
     ON CONFLICT (id) DO UPDATE SET status = 'active', deleted_at = NULL`, [tenant]
  );
  await admin.query(
    `INSERT INTO platform.tenant_memberships (tenant_id, account_id, role, status)
     VALUES ($1, $2, 'owner', 'active')
     ON CONFLICT (tenant_id, account_id) DO UPDATE SET status = 'active', role = 'owner'`, [tenant, account]
  );
  for (const [site, host] of [[deletedSite, 'delete03.example.test'], [retainedSite, 'keep03.example.test']]) {
    await admin.query(
      `INSERT INTO platform.sites
        (tenant_id, id, resource_uri, display_hostname, status, protocol_version, site_public_jwk, site_key_thumbprint)
       VALUES ($1, $2, $3, $4, 'active', '1',
         '{"kty":"OKP","crv":"Ed25519","x":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"}'::jsonb,
         $5)
       ON CONFLICT (tenant_id, id) DO UPDATE SET status = 'active'`,
      [tenant, site, `https://${host}/wp-json/wp-auto/mcp`, host, `thumb_${site}_00000000000000000000000000000000000000000000000000000000`]
    );
  }
  for (const [grant, site] of [[deletedGrant, deletedSite], [retainedGrant, retainedSite]]) {
    await admin.query(
      `INSERT INTO platform.grants
        (tenant_id, id, site_id, subject_id, client_id, scopes, consent_challenge_hash,
         consent_expires_at, status, consent_version)
       VALUES ($1, $2, $3, $4, 'client_DELETE03', ARRAY['mcp:read'], decode(repeat('44', 32), 'hex'),
         now() + interval '5 minutes', 'active', '1')
       ON CONFLICT (tenant_id, id) DO UPDATE SET status = 'active'`,
      [tenant, grant, site, account]
    );
  }
  await admin.query(
    `INSERT INTO oauth.secret_artifacts
      (model, lookup_version, artifact_hash, tenant_id, partition_kind, payload, expires_at)
     VALUES ('RefreshToken', 1, $1, $3, 'tenant', $5::jsonb, now() + interval '30 days'),
            ('RefreshToken', 1, $2, $3, 'tenant', $4::jsonb, now() + interval '30 days')
     ON CONFLICT DO NOTHING`,
    [Buffer.alloc(32, 9), Buffer.alloc(32, 10), tenant,
      JSON.stringify({ grantId: retainedGrant }), JSON.stringify({ grantId: deletedGrant })]
  );
  await admin.query(
    `INSERT INTO oauth.provider_artifacts
      (model, artifact_id, tenant_id, partition_kind, payload, expires_at)
     VALUES ('Grant', 'artifact_DELETE03', $1, 'tenant', $2::jsonb, now() + interval '30 days'),
            ('Grant', 'artifact_KEEP03', $1, 'tenant', $3::jsonb, now() + interval '30 days')
     ON CONFLICT (model, artifact_id) DO NOTHING`,
    [tenant, JSON.stringify({ grantId: deletedGrant }), JSON.stringify({ grantId: retainedGrant })]
  );
  await admin.query(
    `INSERT INTO platform.idempotency_records
      (tenant_id, operation, idempotency_key, request_digest, result_reference, expires_at)
     VALUES ($1, 'site.disconnect', 'idempotency_DELETE03', decode(repeat('55', 32), 'hex'), $2, now() + interval '1 day'),
            ($1, 'site.disconnect', 'idempotency_KEEP0003', decode(repeat('66', 32), 'hex'), $3, now() + interval '1 day')
     ON CONFLICT DO NOTHING`,
    [tenant, deletedSite, retainedSite]
  );
  const lifecycle = new DataLifecycleService({ database });
  const job = await lifecycle.begin({ kind: 'site', tenantId: tenant, siteId: deletedSite }, account);
  await lifecycle.advance(job.jobId, new Date('2026-09-30T00:00:00.000Z'));
  assert.equal((await lifecycle.advance(job.jobId, new Date('2026-09-30T00:07:00.000Z'))).status, 'complete');
  assert.equal((await admin.query('SELECT 1 FROM platform.tenants WHERE id = $1', [tenant])).rowCount, 1);
  assert.equal((await admin.query('SELECT 1 FROM platform.sites WHERE tenant_id = $1 AND id = $2', [tenant, deletedSite])).rowCount, 0);
  assert.equal((await admin.query('SELECT 1 FROM platform.sites WHERE tenant_id = $1 AND id = $2', [tenant, retainedSite])).rowCount, 1);
  assert.equal((await admin.query('SELECT 1 FROM platform.grants WHERE tenant_id = $1 AND id = $2', [tenant, deletedGrant])).rowCount, 0);
  assert.equal((await admin.query('SELECT 1 FROM platform.grants WHERE tenant_id = $1 AND id = $2', [tenant, retainedGrant])).rowCount, 1);
  assert.equal((await admin.query('SELECT 1 FROM oauth.secret_artifacts WHERE payload->>\'grantId\' = $1', [deletedGrant])).rowCount, 0);
  assert.equal((await admin.query('SELECT 1 FROM oauth.secret_artifacts WHERE payload->>\'grantId\' = $1', [retainedGrant])).rowCount, 1);
  assert.equal((await admin.query('SELECT 1 FROM oauth.provider_artifacts WHERE payload->>\'grantId\' = $1', [deletedGrant])).rowCount, 0);
  assert.equal((await admin.query('SELECT 1 FROM oauth.provider_artifacts WHERE payload->>\'grantId\' = $1', [retainedGrant])).rowCount, 1);
  assert.equal((await admin.query('SELECT 1 FROM platform.idempotency_records WHERE tenant_id = $1 AND result_reference = $2', [tenant, deletedSite])).rowCount, 0);
  assert.equal((await admin.query('SELECT 1 FROM platform.idempotency_records WHERE tenant_id = $1 AND result_reference = $2', [tenant, retainedSite])).rowCount, 1);
});
